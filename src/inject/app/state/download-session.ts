import { createContext, useContext, useSyncExternalStore } from "react";
import type { ResumeCursor } from "@/shared/messaging";
import type { MediaItem, MediaStatus } from "../media/types";

export enum DownloadStep {
  OPTIONS = "options",
  DOWNLOADING = "downloading",
  DONE = "done",
}

export interface DownloadSessionState {
  step: DownloadStep;
  items: MediaItem[];
  /** Set by the Stop button; the fetch loop checks it between operations. */
  stopRequested: boolean;
  /** Files actually downloaded (not skipped). */
  downloadCount: number;
  /** Items handled in any way (downloaded, skipped or failed). */
  processedCount: number;
  totalFound: number;
  scanComplete: boolean;
  isFetchingNextPage: boolean;
  /** Remaining anti-rate-limit pause, for display. */
  rateLimitWaitMs: number;
  /** Remaining user-configured request delay, for display. */
  requestDelayMs: number;
  /** The cursor this session resumed from, if any. */
  resumedFrom: ResumeCursor | null;
}

const initialState = (): DownloadSessionState => ({
  step: DownloadStep.OPTIONS,
  items: [],
  stopRequested: true,
  downloadCount: 0,
  processedCount: 0,
  totalFound: 0,
  scanComplete: false,
  isFetchingNextPage: false,
  rateLimitWaitMs: 0,
  requestDelayMs: 0,
  resumedFrom: null,
});

/** A media file can occur in several saved collections or highlight reels. */
export const mediaItemKey = (item: MediaItem): string =>
  JSON.stringify([item.id, item.saveFolderPath ?? [], item.highlight?.id ?? null]);

/**
 * Mutable state of one bulk-download session. The async download loop reads
 * `state` directly (always current); React components re-render through
 * {@link useDownloadSession} whenever it changes.
 */
export class DownloadSessionStore {
  state: DownloadSessionState = initialState();
  private readonly itemIds = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private version = 0;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getVersion = (): number => this.version;

  private emit(): void {
    this.version++;
    for (const listener of this.listeners) listener();
  }

  update(patch: Partial<DownloadSessionState>): void {
    Object.assign(this.state, patch);
    this.emit();
  }

  /** Adds items not seen before in this session and returns them. */
  appendItems(items: MediaItem[]): MediaItem[] {
    const fresh: MediaItem[] = [];
    for (const item of items) {
      const key = mediaItemKey(item);
      if (this.itemIds.has(key)) continue;
      this.itemIds.add(key);
      fresh.push(item);
    }
    this.state.items = [...this.state.items, ...fresh];
    this.state.totalFound += fresh.length;
    this.emit();
    return fresh;
  }

  /** Marks an item as handled. */
  finishItem(target: MediaItem, status: MediaStatus): void {
    const item = this.state.items.find((candidate) => mediaItemKey(candidate) === mediaItemKey(target));
    if (!item) return;
    item.status = status;
    this.state.processedCount++;
    this.emit();
  }

  reset(): void {
    this.state = initialState();
    this.itemIds.clear();
    this.emit();
  }
}

export const DownloadSessionContext = createContext<DownloadSessionStore | null>(null);

export function useDownloadSessionStore(): DownloadSessionStore {
  const store = useContext(DownloadSessionContext);
  if (!store) throw new Error("DownloadSessionContext is missing");
  return store;
}

/** The session state; re-renders on every change. */
export function useDownloadSession(): DownloadSessionState {
  const store = useDownloadSessionStore();
  useSyncExternalStore(store.subscribe, store.getVersion);
  return store.state;
}
