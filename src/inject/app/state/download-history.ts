import { throttle } from "lodash-es";
import { useEffect, useSyncExternalStore } from "react";
import { background } from "../messaging";

/**
 * Ids of every media item downloaded so far (persisted by the background), so
 * "Skip Downloaded" can avoid re-downloading. New ids are sent in batches.
 */
class DownloadHistory {
  private ids = new Set<string>();
  private pending: string[] = [];
  private loading: Promise<void> | undefined;
  private clearVersion = 0;
  private readonly listeners = new Set<() => void>();

  constructor() {
    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      window.addEventListener("pagehide", () => this.flush());
    }
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSize = (): number => this.ids.size;

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  load(): Promise<void> {
    if (!this.loading) {
      const versionAtStart = this.clearVersion;
      this.loading = background
        .getDownloadedFileIds()
        .then((ids) => {
          if (versionAtStart !== this.clearVersion) return;
          this.ids = new Set([...ids, ...this.pending]);
          this.emit();
        })
        .catch((error: unknown) => {
          console.error(error);
        })
        .finally(() => {
          this.loading = undefined;
        });
    }
    return this.loading;
  }

  has(id: string): boolean {
    return this.ids.has(id);
  }

  add(id: string): void {
    if (this.ids.has(id)) return;
    this.ids.add(id);
    this.pending.push(id);
    this.flushSoon();
    this.emit();
  }

  flush(): void {
    this.flushSoon.cancel();
    if (this.pending.length === 0) return;
    const batch = this.pending;
    this.pending = [];
    void background.appendDownloadedFileIds(batch);
  }

  private readonly flushSoon = throttle(() => {
    this.flush();
  }, 5_000);

  async clear(): Promise<void> {
    this.clearVersion++;
    this.loading = undefined;
    this.flushSoon.cancel();
    this.ids.clear();
    this.pending = [];
    await background.clearDownloadedFileIds();
    this.emit();
  }
}

export const downloadHistory = new DownloadHistory();

/** Number of remembered ids; loads the history on first use. */
export function useDownloadHistorySize(): number {
  useEffect(() => void downloadHistory.load(), []);
  return useSyncExternalStore(downloadHistory.subscribe, downloadHistory.getSize);
}
