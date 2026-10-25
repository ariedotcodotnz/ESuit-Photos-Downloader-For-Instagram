import { APP_NAME, INSTAGRAM_ORIGIN } from "@/shared/constants";
import { sanitizeFilename, sanitizeFolderName } from "@/shared/filename";

/** Hosts media may be downloaded from (Instagram's CDNs). Extend if Instagram adds new ones. */
const ALLOWED_HOST_SUFFIXES = [".cdninstagram.com", ".fbcdn.net", ".instagram.com"];

/**
 * Rejects URLs that do not point at Instagram media. Blob URLs are allowed when
 * they were created by the Instagram page (merged videos, converted images).
 */
export function assertDownloadableUrl(url: string): void {
  const parsed = new URL(url);
  if (parsed.protocol === "blob:" && parsed.origin === INSTAGRAM_ORIGIN) return;
  if (parsed.protocol === "https:" && ALLOWED_HOST_SUFFIXES.some((suffix) => `.${parsed.hostname}`.endsWith(suffix))) {
    return;
  }
  throw new Error(`Refusing to download from ${parsed.origin}`);
}

/** Builds `<APP_NAME>/<folders...>/<file>` with every segment sanitised. */
export function buildDownloadPath(relativePath: string): string {
  const segments = relativePath.split("/").filter((segment) => segment.trim().length > 0);
  const file = sanitizeFilename(segments.pop() ?? "");
  if (!file) throw new Error("Download filename is empty");
  const folders = segments.map(sanitizeFolderName).filter(Boolean);
  return [sanitizeFolderName(APP_NAME), ...folders, file].join("/");
}

/** Saves a file under the user's Downloads directory without prompting. */
export async function downloadToFolder(url: string, relativePath: string): Promise<void> {
  assertDownloadableUrl(url);
  await chrome.downloads.download({
    url,
    filename: buildDownloadPath(relativePath),
    conflictAction: "overwrite",
    saveAs: false,
  });
}
