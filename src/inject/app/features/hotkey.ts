import { message } from "antd";
import { downloadPost } from "../download/quick-download";
import { shortcodeFromUrl, shortcodeToMediaId } from "../ig/shortcode";
import { onPageEvent } from "../messaging";

export const HOTKEY_LABEL = /mac/i.test(navigator.platform) ? "⌘+Shift+D" : "Ctrl+Shift+D";

const TOAST_KEY = "hotkey-download";
let isDownloading = false;

/** Downloads the post or reel open in the current URL. */
export async function downloadCurrentPost(): Promise<void> {
  const shortcode = shortcodeFromUrl(window.location.href);
  if (!shortcode) {
    void message.warning({ content: "Please open a post or reel first", key: TOAST_KEY });
    return;
  }
  if (isDownloading) return;
  isDownloading = true;
  try {
    void message.loading({ content: "Downloading...", key: TOAST_KEY, duration: 0 });
    await downloadPost(shortcodeToMediaId(shortcode));
    void message.success({ content: "Download Successful", key: TOAST_KEY });
  } catch (error) {
    console.error("Hotkey download failed:", error);
    void message.error({ content: "Download Failed", key: TOAST_KEY });
  } finally {
    isDownloading = false;
  }
}

function onKeyDown(event: KeyboardEvent): void {
  const isHotkey = event.key?.toLowerCase() === "d" && event.shiftKey && (event.ctrlKey || event.metaKey);
  if (!isHotkey || !shortcodeFromUrl(window.location.href)) return;
  event.preventDefault();
  event.stopPropagation();
  void downloadCurrentPost();
}

/** Ctrl/⌘+Shift+D and the context-menu entry both download the open post. */
export function installQuickDownloadTriggers(): void {
  document.addEventListener("keydown", onKeyDown);
  onPageEvent("contextMenuDownload", () => void downloadCurrentPost());
}
