import { sanitizeFilename, sanitizeFolderName } from "@/shared/filename";
import { renderFilenameTemplate } from "@/shared/filename-template";
import { ImageFormat } from "@/shared/settings";
import { getUrlExtension, stripExtension } from "@/shared/url";
import { getSplitFolderSegments } from "../ig/route";
import type { MediaItem } from "../media/types";
import { background } from "../messaging";
import { downloadHistory } from "../state/download-history";
import { downloadDashStream } from "./dash";
import { mergeVideoAndAudio } from "./ffmpeg";
import { getDownloadDirectory, getSubdirectory, writeUrlToDirectory } from "./filesystem";
import { convertImage, extensionForFormat, fetchContentType } from "./image";
import { showProgressError } from "./toast";

/** Blob URLs created here are revoked after this long (the download has started by then). */
const BLOB_URL_LIFETIME_MS = 60_000;

export interface DownloadMediaOptions {
  item: MediaItem;
  /** 1-based number of the file within the session (the template's `index` field). */
  index: number;
  filenameTemplate: string;
  imageFormat: ImageFormat;
  isGenFolder: boolean;
  isSplitFolder: boolean;
  /** Folder to use instead of the author name when `isGenFolder` is on. */
  folderName?: string;
  /**
   * Save through `chrome.downloads` into the Downloads folder. Otherwise the
   * file is written into the folder picked with {@link pickDownloadDirectory}.
   */
  viaBrowserDownloads: boolean;
  isDownloadVideoThumbnail?: boolean;
  isMergingVideo?: boolean;
  isAudioOnly?: boolean;
}

/** Same-named files within one session get a counter: `a.jpg`, `a.1.jpg`, `a.2.jpg`. */
const filenameCounts = new Map<string, number>();
const allocatedFilenames = new Set<string>();

export function resetFilenameCounter(): void {
  filenameCounts.clear();
  allocatedFilenames.clear();
}

function uniqueFilename(filename: string, folders: string[]): string {
  const key = (name: string) => JSON.stringify([...folders, name]);
  let count = filenameCounts.get(key(filename)) ?? 0;
  let candidate = filename;
  while (allocatedFilenames.has(key(candidate))) {
    count++;
    const extension = filename.slice(filename.lastIndexOf("."));
    candidate = `${stripExtension(filename)}.${count}${extension}`;
  }
  filenameCounts.set(key(filename), count);
  allocatedFilenames.add(key(candidate));
  return candidate;
}

function temporaryObjectUrl(blob: Blob): string {
  const url = URL.createObjectURL(blob);
  setTimeout(() => URL.revokeObjectURL(url), BLOB_URL_LIFETIME_MS);
  return url;
}

/** `[author, ...split folders]`, an explicit `saveFolderPath`, or nothing. */
export function folderSegments(
  item: MediaItem,
  isGenFolder: boolean,
  isSplitFolder: boolean,
  folderName?: string,
): string[] {
  if (item.saveFolderPath?.length) return item.saveFolderPath;
  const base = isGenFolder ? folderName || item.authorName : "";
  if (!base) return [];
  return isSplitFolder ? [base, ...getSplitFolderSegments(item.highlight)] : [base];
}

async function convertedImageUrl(url: string, format: Exclude<ImageFormat, ImageFormat.ORIGINAL>): Promise<string> {
  if ((await fetchContentType(url)) === format) return url;
  const blob = await (await fetch(url)).blob();
  return temporaryObjectUrl(await convertImage(blob, format));
}

async function dashAudioUrl(item: MediaItem): Promise<string | undefined> {
  const audio = item.highestSource?.audio;
  if (!audio) return undefined;
  const parts = await downloadDashStream(audio.uri, audio.segmentBase, "audio");
  return temporaryObjectUrl(new Blob(parts, { type: "audio/mp4" }));
}

async function mergedVideoUrl(item: MediaItem): Promise<string> {
  const { video, audio } = item.highestSource!;
  try {
    const [videoParts, audioParts] = await Promise.all([
      downloadDashStream(video.uri, video.segmentBase, "video"),
      downloadDashStream(audio.uri, audio.segmentBase, "audio"),
    ]);
    const merged = await mergeVideoAndAudio({
      video: new Blob(videoParts, { type: "video/mp4" }),
      audio: new Blob(audioParts, { type: "audio/mp4" }),
      codec: video.codec,
    });
    return temporaryObjectUrl(merged);
  } catch (error) {
    console.error(error);
    showProgressError("Failed to merge video, check the console for details");
    // Fall back to the progressive (lower quality) file.
    return item.uri;
  }
}

/** Downloads one media item according to the user's settings. */
export async function downloadMediaItem(options: DownloadMediaOptions): Promise<void> {
  const { item, index, imageFormat, isAudioOnly = false } = options;

  let filename = renderFilenameTemplate({
    rule: options.filenameTemplate,
    data: {
      index,
      carouselIndex: item.carouselIndex ?? 1,
      createdAt: item.createdAt,
      id: item.id,
      authorName: item.authorName,
      fullName: item.fullName,
      uri: item.uri,
      code: item.code,
      audioTitle: item.audioTitle,
    },
  });
  filename = isAudioOnly ? `${filename}.m4a` : `${filename}.${getUrlExtension(item.uri)}`;

  let sourceUrl = item.uri;
  if (!item.isVideo && imageFormat !== ImageFormat.ORIGINAL) {
    sourceUrl = await convertedImageUrl(item.uri, imageFormat);
    filename = `${stripExtension(filename)}.${extensionForFormat(imageFormat)}`;
  }
  filename = sanitizeFilename(filename);

  const folders = folderSegments(item, options.isGenFolder, options.isSplitFolder, options.folderName)
    .map(sanitizeFolderName)
    .filter(Boolean);
  filename = uniqueFilename(filename, folders);

  let url = sourceUrl;
  if (isAudioOnly) {
    url = item.audioUrl ?? (await dashAudioUrl(item)) ?? sourceUrl;
  } else if (options.isMergingVideo && item.isVideo && item.highestSource) {
    url = await mergedVideoUrl(item);
  }

  const withThumbnail = item.isVideo && options.isDownloadVideoThumbnail && !!item.thumbnail;
  const thumbnailName = withThumbnail
    ? uniqueFilename(`${stripExtension(filename)}.thumbnail.${getUrlExtension(item.thumbnail)}`, folders)
    : undefined;

  if (options.viaBrowserDownloads) {
    const path = [...folders, filename].join("/");
    if (thumbnailName) await background.downloadFile(item.thumbnail, [...folders, thumbnailName].join("/"));
    await background.downloadFile(url, path);
  } else {
    const root = getDownloadDirectory();
    const directory = folders.length > 0 ? await getSubdirectory(root, folders) : root;
    await writeUrlToDirectory(url, filename, directory);
    if (thumbnailName) await writeUrlToDirectory(item.thumbnail, thumbnailName, directory);
  }
  downloadHistory.add(item.id);
}
