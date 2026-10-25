import type { UserSettings } from "./settings";

/** Where an interrupted bulk download can pick up again. */
export interface ResumeCursor {
  /** Identifies the album/collection, e.g. `<userId>_posts`. */
  collectionToken: string;
  /** Pagination cursor of the last page that was fully downloaded. */
  lastCursor: string;
  /** Number of files downloaded before the cursor (used to continue numbering). */
  lastIndex: number;
  /** Unix seconds. */
  lastUpdateAt: number;
}

/**
 * RPC surface the background service worker exposes to the MAIN-world page
 * scripts on instagram.com (via `externally_connectable`).
 */
export interface BackgroundApi {
  getSettings(): Promise<UserSettings>;
  saveSettings(settings: UserSettings): Promise<void>;
  /** Saves `url` to `Downloads/<APP_NAME>/<relativePath>` with `chrome.downloads`. */
  downloadFile(url: string, relativePath: string): Promise<void>;
  getDownloadedFileIds(): Promise<string[]>;
  appendDownloadedFileIds(ids: string[]): Promise<void>;
  clearDownloadedFileIds(): Promise<void>;
  getResumeCursor(collectionToken: string): Promise<ResumeCursor | null>;
  setResumeCursor(cursor: Omit<ResumeCursor, "lastUpdateAt">): Promise<void>;
  removeResumeCursor(collectionToken: string): Promise<void>;
  /** Small key/value store for UI flags such as "don't show this again". */
  getPersistedValue(key: string): Promise<unknown>;
  setPersistedValue(key: string, value: unknown): Promise<void>;
  openOptionsPage(): Promise<void>;
}

export type BackgroundAction = keyof BackgroundApi;

export interface BackgroundRequest<A extends BackgroundAction = BackgroundAction> {
  action: A;
  payload: Parameters<BackgroundApi[A]>;
}

export type BackgroundResponse<T = unknown> =
  { status: "success"; result: T } | { status: "error"; errorMessage: string };

/** Events the background pushes to a tab; the content-script bridge relays them to the page. */
export interface PageEvents {
  contextMenuDownload: [];
}

export type PageEventName = keyof PageEvents;

export interface PageEventEnvelope<E extends PageEventName = PageEventName> {
  /** Always `APP_SLUG`; lets receivers ignore unrelated `postMessage` traffic. */
  from: string;
  event: E;
  payload: PageEvents[E];
}

/** Metadata the content-script bridge publishes for the MAIN-world scripts. */
export interface PageContext {
  extensionId: string;
  /** `chrome-extension://<id>/`, with a trailing slash. */
  extensionUrl: string;
  version: string;
  /** True for unpacked (development) installs; enables verbose logging. */
  isDevelopment: boolean;
}

export function isPageEventEnvelope(value: unknown, slug: string): value is PageEventEnvelope {
  return (
    !!value &&
    typeof value === "object" &&
    (value as PageEventEnvelope).from === slug &&
    typeof (value as PageEventEnvelope).event === "string" &&
    Array.isArray((value as PageEventEnvelope).payload)
  );
}
