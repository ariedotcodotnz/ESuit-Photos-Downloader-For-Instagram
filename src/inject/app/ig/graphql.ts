import { createLogger, errorMessage } from "@/shared/logger";
import { isDebug } from "../env";
import { recordError } from "../download/errors";
import { isModuleDefined, loadDefinedModule, requireIg, type IgGraphqlModule, type IgGraphqlPayload } from "./modules";

const log = createLogger("graphql", isDebug);

const REQUEST_TIMEOUT_MS = 30_000;
/** Streaming responses that stop sending chunks are resolved with what arrived. */
const STALLED_STREAM_MS = 15_000;
const RETRY = { maxRetries: 3, baseDelayMs: 1_000 };
const PROVIDED_VARIABLE_PREFIX = "__relay_internal";

export interface GraphqlQuery {
  /** Relay operation name, e.g. `PolarisProfilePostsTabContentQuery_connection`. */
  name: string;
  /** Default variables; request-specific variables are merged on top. */
  variables: Record<string, unknown>;
}

/** The persisted query id cannot be determined, so GraphQL cannot be used right now. */
export class GraphqlUnavailableError extends Error {}

/**
 * Instagram only accepts persisted queries. When Instagram's UI has loaded a
 * query, its `<name>.graphql` module carries the current document id (and the
 * provider functions for Relay's internal variables).
 */
function getQueryModule(query: GraphqlQuery): IgGraphqlModule {
  const moduleName = `${query.name}.graphql`;
  if (!isModuleDefined(moduleName)) throw new GraphqlUnavailableError(`${moduleName} is not loaded`);
  const module = loadDefinedModule<IgGraphqlModule>(moduleName);
  if (!module.params?.id) throw new GraphqlUnavailableError(`${moduleName} has no document id`);
  return module;
}

export function isGraphqlQueryAvailable(query: GraphqlQuery): boolean {
  try {
    getQueryModule(query);
    return true;
  } catch {
    return false;
  }
}

/** Replaces Relay's `__relay_internal__pv__*` variables with the values of the query's providers. */
function applyProvidedVariables(variables: Record<string, unknown>, module: IgGraphqlModule): Record<string, unknown> {
  const providers = module.params?.providedVariables;
  if (!providers) return variables;
  const result = Object.fromEntries(
    Object.entries(variables).filter(([key]) => !key.startsWith(PROVIDED_VARIABLE_PREFIX)),
  );
  for (const [key, provider] of Object.entries(providers)) {
    if (key.startsWith(PROVIDED_VARIABLE_PREFIX))
      result[key] = typeof provider?.get === "function" ? provider.get() : false;
  }
  return result;
}

function describeErrors(payload: IgGraphqlPayload): { message: string; critical: boolean } | undefined {
  const error = payload.errors?.find((e) => e.severity === "CRITICAL") ?? payload.errors?.[0];
  if (!error) return undefined;
  return {
    message: [error.code, error.message, error.description].filter(Boolean).join("  "),
    critical: error.severity === "CRITICAL",
  };
}

/**
 * Sends one persisted GraphQL query through Instagram's own XHR stack (which
 * adds the session's async params). Responses may be streamed in chunks;
 * every parsed chunk is returned, the first holding the main `data`.
 */
async function sendGraphqlRequest(
  query: GraphqlQuery,
  variables: Record<string, unknown>,
): Promise<IgGraphqlPayload[]> {
  const module = getQueryModule(query);
  let merged: Record<string, unknown> = { ...query.variables, ...variables };
  if (!merged.scale) merged.scale = requireIg("WebPixelRatio").get();
  merged = applyProvidedVariables(merged, module);

  const form = { fb_api_req_friendly_name: query.name, variables: JSON.stringify(merged), doc_id: module.params!.id! };

  return new Promise((resolve, reject) => {
    const payloads: IgGraphqlPayload[] = [];
    let chunkCount = 0;
    let settled = false;
    let stallTimer: ReturnType<typeof setTimeout> | undefined;

    const settle = (complete: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(stallTimer);
      complete();
    };
    const fail = (stage: string, message: string) => {
      recordError(`graphql ${stage}`, message, form);
      settle(() => reject(new Error(`graphql request ${stage} [${query.name}]: ${message}`)));
    };

    try {
      const XHRRequest = requireIg("XHRRequest");
      const asyncParams = requireIg("getAsyncParams")("POST");
      const { actorID } = requireIg("RelayAPIConfig");
      const createParser = requireIg("createRelayChunkedResponseParser");
      const { parsePayload } = requireIg("RelayGraphQLRequestUtils");
      const config = requireIg("PolarisConfig");

      const request = new XHRRequest("/graphql/query/")
        .setMethod("POST")
        .setData({ av: actorID, ...asyncParams, fb_api_caller_class: "RelayModern", server_timestamps: true, ...form })
        .setErrorHandler((error) =>
          fail("error", [error.errorCode, error.errorType, error.errorMsg].filter(Boolean).join(" ")),
        )
        .setResponseHandler(
          createParser((chunks) => {
            try {
              for (const chunk of chunks) {
                const payload = parsePayload(chunk.responseText);
                const problem = chunkCount === 0 ? describeErrors(payload) : undefined;
                if (problem?.critical) return fail("error", problem.message);
                if (problem) log.warn(`[${query.name}] ${problem.message}`);

                payloads.push(payload);
                if (chunk.isComplete) return settle(() => resolve(payloads));
                chunkCount++;
                clearTimeout(stallTimer);
                stallTimer = setTimeout(() => {
                  log.warn(`[${query.name}] stream stalled; using ${payloads.length} chunk(s)`);
                  settle(() => resolve(payloads));
                }, STALLED_STREAM_MS);
              }
            } catch (error) {
              fail("parser error", errorMessage(error));
            }
          }),
        )
        .setTimeout(REQUEST_TIMEOUT_MS)
        .setTimeoutHandler(() => fail("timeout", `no response after ${REQUEST_TIMEOUT_MS / 1000}s`));

      const headers: Record<string, string> = {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-FB-Friendly-Name": query.name,
        "X-BLOKS-VERSION-ID": requireIg("WebBloksVersioningID").versioningID,
        "X-CSRFToken": config.getCSRFToken(),
        "X-IG-App-ID": config.getIGAppID(),
      };
      for (const [name, value] of Object.entries(headers)) request.setRequestHeader(name, value);
      request.send();
    } catch (error) {
      fail("unknown error", errorMessage(error));
    }
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** {@link sendGraphqlRequest} with exponential-backoff retries. */
export async function graphqlRequest(
  query: GraphqlQuery,
  variables: Record<string, unknown>,
): Promise<IgGraphqlPayload[]> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY.maxRetries; attempt++) {
    if (attempt > 0) {
      log.warn(`retrying [${query.name}], attempt ${attempt} of ${RETRY.maxRetries}`);
      await sleep(RETRY.baseDelayMs * 2 ** (attempt - 1));
    }
    try {
      return await sendGraphqlRequest(query, variables);
    } catch (error) {
      if (error instanceof GraphqlUnavailableError) throw error;
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
