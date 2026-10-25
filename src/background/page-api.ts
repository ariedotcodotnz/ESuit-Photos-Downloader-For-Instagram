import { APP_SLUG, INSTAGRAM_ORIGIN } from "@/shared/constants";
import { createLogger, errorMessage } from "@/shared/logger";
import type {
  BackgroundAction,
  BackgroundApi,
  BackgroundRequest,
  BackgroundResponse,
  PageEventEnvelope,
  PageEventName,
  PageEvents,
} from "@/shared/messaging";

const log = createLogger("page-api", () => !("update_url" in chrome.runtime.getManifest()));

function isTrustedSender(sender: chrome.runtime.MessageSender): boolean {
  return sender.origin === INSTAGRAM_ORIGIN && sender.tab?.id !== undefined;
}

function isRequest(message: unknown, api: BackgroundApi): message is BackgroundRequest {
  if (!message || typeof message !== "object") return false;
  const { action, payload } = message as Partial<BackgroundRequest>;
  return typeof action === "string" && Object.hasOwn(api, action) && Array.isArray(payload);
}

/**
 * Answers RPC calls from the MAIN-world scripts on instagram.com. They reach the
 * worker through `chrome.runtime.sendMessage(extensionId, ...)`, which the
 * manifest's `externally_connectable` entry allows for Instagram pages only.
 */
export function servePageApi(api: BackgroundApi): void {
  chrome.runtime.onMessageExternal.addListener((message: unknown, sender, sendResponse) => {
    if (!isTrustedSender(sender) || !isRequest(message, api)) return;

    const { action, payload } = message;
    log.debug("→", action, payload);
    const handler = api[action as BackgroundAction] as (...args: unknown[]) => Promise<unknown>;
    Promise.resolve()
      .then(() => handler.apply(api, payload))
      .then((result) => {
        log.debug("←", action, result);
        sendResponse({ status: "success", result } satisfies BackgroundResponse);
      })
      .catch((error: unknown) => {
        log.error(action, error);
        sendResponse({ status: "error", errorMessage: errorMessage(error) } satisfies BackgroundResponse);
      });
    // Keeps the message channel open until sendResponse is called asynchronously.
    return true;
  });
}

/** Pushes an event to the page in `tabId`; the content-script bridge relays it. */
export async function sendPageEvent<E extends PageEventName>(
  tabId: number,
  event: E,
  ...payload: PageEvents[E]
): Promise<void> {
  const envelope: PageEventEnvelope<E> = { from: APP_SLUG, event, payload };
  await chrome.tabs.sendMessage(tabId, envelope);
}
