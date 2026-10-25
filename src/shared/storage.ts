import type { ResumeCursor } from "./messaging";
import { DEFAULT_SETTINGS, normalizeSettings, type UserSettings } from "./settings";

/** Everything the extension keeps in `chrome.storage.local`, keyed by bucket name. */
export interface StorageSchema {
  settings: UserSettings;
  /** Ids of media that were already downloaded, for "Skip Downloaded". */
  downloadedFileIds: string[];
  resumeCursors: ResumeCursor[];
  persisted: Record<string, unknown>;
}

export type BucketName = keyof StorageSchema;

/** The downloaded-ids history is reset once it grows past this many entries. */
export const MAX_DOWNLOADED_FILE_IDS = 300_000;

const normalizers: { [K in BucketName]: (raw: unknown) => StorageSchema[K] } = {
  settings: normalizeSettings,
  downloadedFileIds: (raw) => (Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string") : []),
  resumeCursors: (raw) => (Array.isArray(raw) ? (raw as ResumeCursor[]).filter((c) => c && c.collectionToken) : []),
  persisted: (raw) => (raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}),
};

export const STORAGE_DEFAULTS: StorageSchema = {
  settings: { ...DEFAULT_SETTINGS },
  downloadedFileIds: [],
  resumeCursors: [],
  persisted: {},
};

// Web Locks serialise read-modify-write cycles across the service worker and
// every extension page, so concurrent updates never overwrite each other.
const lockName = (bucket: BucketName) => `storage.local.${bucket}`;

async function readRaw<K extends BucketName>(bucket: K): Promise<StorageSchema[K]> {
  const stored = await chrome.storage.local.get(bucket);
  return normalizers[bucket](stored[bucket]);
}

export async function getBucket<K extends BucketName>(bucket: K): Promise<StorageSchema[K]> {
  return navigator.locks.request(lockName(bucket), { mode: "shared" }, () => readRaw(bucket));
}

export async function setBucket<K extends BucketName>(bucket: K, value: StorageSchema[K]): Promise<void> {
  await navigator.locks.request(lockName(bucket), { mode: "exclusive" }, () =>
    chrome.storage.local.set({ [bucket]: value }),
  );
}

export async function updateBucket<K extends BucketName>(
  bucket: K,
  updater: (current: StorageSchema[K]) => StorageSchema[K] | Promise<StorageSchema[K]>,
): Promise<StorageSchema[K]> {
  return navigator.locks.request(lockName(bucket), { mode: "exclusive" }, async () => {
    const next = await updater(await readRaw(bucket));
    await chrome.storage.local.set({ [bucket]: next });
    return next;
  });
}

export async function removeBucket(bucket: BucketName): Promise<void> {
  await navigator.locks.request(lockName(bucket), { mode: "exclusive" }, () => chrome.storage.local.remove(bucket));
}

/** Subscribes to changes of one bucket made from any extension context. */
export function onBucketChanged<K extends BucketName>(
  bucket: K,
  listener: (value: StorageSchema[K]) => void,
): () => void {
  const handler = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === "local" && bucket in changes) listener(normalizers[bucket](changes[bucket]?.newValue));
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}
