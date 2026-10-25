import { APP_SLUG } from "@/shared/constants";

/**
 * Bulk downloads write straight into a folder the user picks once per
 * session (File System Access API), which avoids one browser download — and
 * possibly one prompt — per file.
 */
let rootDirectory: FileSystemDirectoryHandle | null = null;
const subdirectories = new Map<string, FileSystemDirectoryHandle>();

export async function pickDownloadDirectory(): Promise<void> {
  subdirectories.clear();
  // The picker id (≤ 32 chars) makes Chrome remember the last folder per extension.
  const handle = await window.showDirectoryPicker({
    id: APP_SLUG.slice(0, 32),
    mode: "readwrite",
    startIn: "downloads",
  });
  await handle.requestPermission({ mode: "readwrite" });
  rootDirectory = handle;
}

export function hasDownloadDirectory(): boolean {
  return rootDirectory !== null;
}

export function getDownloadDirectory(): FileSystemDirectoryHandle {
  if (!rootDirectory) throw new Error("No download folder selected");
  return rootDirectory;
}

/** Resolves (creating as needed) a nested folder below `root`. Handles are cached per path. */
export async function getSubdirectory(
  root: FileSystemDirectoryHandle,
  segments: string[],
): Promise<FileSystemDirectoryHandle> {
  const key = segments.join("/");
  const cached = subdirectories.get(key);
  if (cached) return cached;
  let directory = root;
  for (const segment of segments) directory = await directory.getDirectoryHandle(segment, { create: true });
  subdirectories.set(key, directory);
  return directory;
}

export async function writeUrlToDirectory(
  url: string,
  filename: string,
  directory: FileSystemDirectoryHandle,
): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);
  const blob = await response.blob();
  const file = await directory.getFileHandle(filename, { create: true });
  const writable = await file.createWritable();
  await writable.write(blob);
  await writable.close();
}
