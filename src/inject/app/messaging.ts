import { APP_SLUG } from "@/shared/constants";
import { createLogger } from "@/shared/logger";
import {
  isPageEventEnvelope,
  type BackgroundAction,
  type BackgroundApi,
  type BackgroundRequest,
  type BackgroundResponse,
  type PageEventName,
  type PageEvents,
} from "@/shared/messaging";
import { getPageContext, isDebug } from "./env";

const log = createLogger("messaging", isDebug);

function call<A extends BackgroundAction>(
  action: A,
  ...payload: Parameters<BackgroundApi[A]>
): Promise<Awaited<ReturnType<BackgroundApi[A]>>> {
  const request: BackgroundRequest<A> = { action, payload };
  log.debug("→", action, payload);
  return new Promise((resolve, reject) => {
    // `chrome.runtime` exists in MAIN-world pages listed in `externally_connectable`.
    chrome.runtime.sendMessage(getPageContext().extensionId, request, (response?: BackgroundResponse) => {
      const lastError = chrome.runtime.lastError;
      if (response?.status === "success") {
        log.debug("←", action, response.result);
        resolve(response.result as Awaited<ReturnType<BackgroundApi[A]>>);
        return;
      }
      const message =
        response?.status === "error" ? response.errorMessage : (lastError?.message ?? "No response from extension");
      log.error(action, message);
      reject(new Error(message));
    });
  });
}

/** Typed proxy for the background service worker's RPC surface. */
export const background = new Proxy({} as BackgroundApi, {
  get:
    (_target, action: string) =>
    (...payload: unknown[]) =>
      call(action as BackgroundAction, ...(payload as Parameters<BackgroundApi[BackgroundAction]>)),
});

/** Listens for events the background pushes to this tab (relayed by the content script). */
export function onPageEvent<E extends PageEventName>(
  event: E,
  listener: (...payload: PageEvents[E]) => void,
): () => void {
  const handler = (message: MessageEvent<unknown>) => {
    if (message.source !== window || !isPageEventEnvelope(message.data, APP_SLUG)) return;
    if (message.data.event === event) listener(...(message.data.payload as PageEvents[E]));
  };
  window.addEventListener("message", handler);
  return () => window.removeEventListener("message", handler);
}
