import { DownloadType, type UserSettings } from "@/shared/settings";
import { fetchMediaInfo } from "../ig/instapi";
import type { MediaItem } from "../media/types";
import { background } from "../messaging";
import { downloadMediaItem, resetFilenameCounter } from "./download-media";
import { hasDownloadDirectory } from "./filesystem";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface QuickDownloadOptions {
  /** Defaults to the stored settings. */
  settings?: UserSettings;
  /**
   * Defaults to the Downloads folder via `chrome.downloads`, unless a folder
   * was already picked during this page session.
   */
  viaBrowserDownloads?: boolean;
  isAudioOnly?: boolean;
  /** Skip videos when the download type is "Images". */
  respectDownloadType?: boolean;
}

/** Downloads a handful of items right away (single posts, stories), outside the bulk-download modal. */
export async function quickDownload(items: MediaItem[], options: QuickDownloadOptions = {}): Promise<void> {
  const settings = options.settings ?? (await background.getSettings());
  const viaBrowserDownloads = options.viaBrowserDownloads ?? !hasDownloadDirectory();
  resetFilenameCounter();

  let index = 0;
  for (const item of items) {
    if (options.respectDownloadType && settings.downloadType === DownloadType.IMAGES_ONLY && item.isVideo) continue;
    index++;
    await downloadMediaItem({
      item,
      index,
      filenameTemplate: settings.filenameFormats,
      imageFormat: settings.formatType,
      isGenFolder: settings.isGenFolder,
      isSplitFolder: settings.isSplitFolder,
      viaBrowserDownloads,
      isDownloadVideoThumbnail: settings.isDownloadVideoThumbnail,
      isMergingVideo: settings.isMergingVideo,
      isAudioOnly: options.isAudioOnly,
    });
    await sleep(250 * Math.random());
  }
}

/** Downloads a post (all slides, or only `slideIndex` of a carousel). */
export async function downloadPost(
  mediaId: string,
  slideIndex?: number,
  options?: QuickDownloadOptions,
): Promise<void> {
  const items = await fetchMediaInfo(mediaId);
  const selected = slideIndex === undefined ? items : items.slice(slideIndex, slideIndex + 1);
  await quickDownload(selected, options);
}
