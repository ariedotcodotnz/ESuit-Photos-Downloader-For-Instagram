import { createLogger } from "@/shared/logger";
import { isDebug } from "../env";
import { GraphqlUnavailableError, isGraphqlQueryAvailable, type GraphqlQuery } from "../ig/graphql";

const log = createLogger("fetch", isDebug);

/**
 * Profile albums can be paged through two APIs. GraphQL (what Instagram's UI
 * uses, and what the original extension used) needs a persisted query id
 * that is only known once Instagram has loaded the query, so the stable v1
 * REST feeds are used as a fallback.
 */
export type FetchStrategy = "graphql" | "rest";

/** Saved resume cursors carry the strategy, since cursors are not interchangeable. */
export function encodeCursor(strategy: FetchStrategy, cursor: string): string {
  return `${strategy}:${cursor}`;
}

export function decodeCursor(saved: string | undefined): { strategy: FetchStrategy; cursor: string } | null {
  if (!saved) return null;
  const match = /^(graphql|rest):(.*)$/s.exec(saved);
  // Cursors without a prefix come from GraphQL.
  return match ? { strategy: match[1] as FetchStrategy, cursor: match[2]! } : { strategy: "graphql", cursor: saved };
}

export function pickStrategy(query: GraphqlQuery, resumed?: FetchStrategy): FetchStrategy {
  return resumed ?? (isGraphqlQueryAvailable(query) ? "graphql" : "rest");
}

/**
 * Runs the GraphQL implementation, falling back to REST when GraphQL is
 * unavailable, or when it fails on the first page (later pages cannot switch
 * because the cursor formats differ).
 */
export async function withRestFallback<T>(
  strategy: FetchStrategy,
  isFirstPage: boolean,
  graphql: () => Promise<T>,
  rest: () => Promise<T>,
): Promise<T> {
  if (strategy === "rest") return rest();
  try {
    return await graphql();
  } catch (error) {
    if (!(error instanceof GraphqlUnavailableError) && !isFirstPage) throw error;
    log.warn("GraphQL request failed, using the REST API instead", error);
    return rest();
  }
}
