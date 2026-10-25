import type { BackgroundApi } from "@/shared/messaging";
import { normalizeSettings } from "@/shared/settings";
import { getBucket, MAX_DOWNLOADED_FILE_IDS, setBucket, updateBucket } from "@/shared/storage";
import { downloadToFolder } from "./downloads";

const nowInSeconds = () => Math.floor(Date.now() / 1000);

/** Implementation of the RPC surface used by the in-page scripts. */
export const backgroundHandlers: BackgroundApi = {
  getSettings: () => getBucket("settings"),

  saveSettings: (settings) => setBucket("settings", normalizeSettings(settings)),

  downloadFile: (url, relativePath) => downloadToFolder(url, relativePath),

  getDownloadedFileIds: () => getBucket("downloadedFileIds"),

  async appendDownloadedFileIds(ids) {
    await updateBucket("downloadedFileIds", (current) => {
      // Start over instead of letting the history grow without bound.
      if (current.length > MAX_DOWNLOADED_FILE_IDS) return [...new Set(ids)];
      const known = new Set(current);
      return [...current, ...ids.filter((id) => !known.has(id))];
    });
  },

  clearDownloadedFileIds: () => setBucket("downloadedFileIds", []),

  async getResumeCursor(collectionToken) {
    const cursors = await getBucket("resumeCursors");
    return cursors.find((cursor) => cursor.collectionToken === collectionToken) ?? null;
  },

  async setResumeCursor(cursor) {
    if (!cursor.collectionToken) return;
    await updateBucket("resumeCursors", (cursors) => {
      const next = { ...cursor, lastUpdateAt: nowInSeconds() };
      const index = cursors.findIndex((c) => c.collectionToken === cursor.collectionToken);
      if (index === -1) return [...cursors, next];
      return cursors.map((c, i) => (i === index ? next : c));
    });
  },

  async removeResumeCursor(collectionToken) {
    await updateBucket("resumeCursors", (cursors) => cursors.filter((c) => c.collectionToken !== collectionToken));
  },

  async getPersistedValue(key) {
    return (await getBucket("persisted"))[key];
  },

  async setPersistedValue(key, value) {
    await updateBucket("persisted", (values) => ({ ...values, [key]: value }));
  },

  openOptionsPage: () => chrome.runtime.openOptionsPage(),
};
