import { APP_NAME, CONTEXT_MENU_ID, HOST_MATCHES } from "@/shared/constants";
import { sendPageEvent } from "./page-api";

/** Adds "Download with …" to the right-click menu on Instagram; it downloads the open post/reel. */
export function setupContextMenu(): void {
  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: CONTEXT_MENU_ID,
        title: `Download with ${APP_NAME}`,
        contexts: ["page", "image", "video"],
        documentUrlPatterns: HOST_MATCHES,
      });
    });
  });

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== CONTEXT_MENU_ID || tab?.id === undefined) return;
    // The tab may not have the content script yet (e.g. it was opened before install).
    sendPageEvent(tab.id, "contextMenuDownload").catch(() => undefined);
  });
}
