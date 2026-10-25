import { updateBucket } from "@/shared/storage";
import { setupContextMenu } from "./context-menu";
import { backgroundHandlers } from "./handlers";
import { servePageApi } from "./page-api";

servePageApi(backgroundHandlers);
setupContextMenu();

chrome.runtime.onInstalled.addListener(() => {
  // Persist a complete settings object (defaults filled in) so every context
  // sees the same shape after an install or update.
  void updateBucket("settings", (settings) => settings);
});
