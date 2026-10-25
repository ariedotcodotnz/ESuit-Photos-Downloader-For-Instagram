/**
 * Isolated-world content script (document_start). It is the only in-page
 * script with access to the extension runtime, so it:
 *  1. publishes extension metadata to the MAIN-world scripts through an
 *     attribute on <html> (they cannot call chrome.runtime.getURL);
 *  2. relays events pushed by the background (e.g. the context-menu action)
 *     to the page with window.postMessage.
 */
import { APP_SLUG, PAGE_CONTEXT_ATTRIBUTE } from "@/shared/constants";
import { isPageEventEnvelope, type PageContext } from "@/shared/messaging";

const manifest = chrome.runtime.getManifest();
const context: PageContext = {
  extensionId: chrome.runtime.id,
  extensionUrl: chrome.runtime.getURL("/"),
  version: manifest.version,
  isDevelopment: !("update_url" in manifest),
};
document.documentElement.setAttribute(PAGE_CONTEXT_ATTRIBUTE, JSON.stringify(context));

chrome.runtime.onMessage.addListener((message: unknown) => {
  if (isPageEventEnvelope(message, APP_SLUG)) window.postMessage(message, window.location.origin);
});
