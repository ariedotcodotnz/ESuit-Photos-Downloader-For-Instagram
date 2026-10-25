import type * as ReactModule from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as SessionModule from "@/inject/app/state/download-session";
import { useAlbumDownload } from "@/inject/app/hooks/use-album-download";
import type { FetchResult, MediaItem } from "@/inject/app/media/types";
import { DownloadSessionStore, DownloadStep } from "@/inject/app/state/download-session";
import { DEFAULT_SETTINGS } from "@/shared/settings";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  settings: vi.fn(),
  fetchQuery: vi.fn(),
  download: vi.fn(),
  loadHistory: vi.fn(),
  hasHistory: vi.fn(),
}));
// Exercise the real async hook logic with controllable state, I/O and timers.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof ReactModule>()),
  useCallback: <T>(callback: T) => callback,
  useEffect: () => {},
  useRef: <T>(current: T) => ({ current }),
}));
vi.mock("@/inject/app/state/download-session", async (importOriginal) => ({
  ...(await importOriginal<typeof SessionModule>()),
  useDownloadSessionStore: () => mocks.session(),
}));
vi.mock("@/inject/app/state/settings", () => ({ useSettings: () => ({ settingsRef: { current: mocks.settings() } }) }));
vi.mock("@/inject/app/state/downloader-modal", () => ({
  useDownloaderModal: () => ({ fetchQuery: mocks.fetchQuery, isUseQuantityControl: false }),
}));
vi.mock("@/inject/app/download/download-media", () => ({ downloadMediaItem: mocks.download }));
vi.mock("@/inject/app/state/download-history", () => ({
  downloadHistory: { load: mocks.loadHistory, has: mocks.hasHistory },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const item = (id: string): MediaItem => ({
  id,
  uri: `https://scontent.cdninstagram.com/${id}.jpg`,
  thumbnail: "",
  authorName: "someone",
  isVideo: false,
  createdAt: 0,
  status: "waiting",
});
const page = (ids: string[], overrides: Partial<FetchResult> = {}): FetchResult => ({
  items: ids.map(item),
  hasMore: false,
  nextParams: null,
  replayCursor: "rest:",
  ...overrides,
});
let session: DownloadSessionStore;
let saveProgress: ReturnType<typeof vi.fn<(cursor: string, index: number) => Promise<void>>>;
let clearProgress: ReturnType<typeof vi.fn<() => Promise<void>>>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  session = new DownloadSessionStore();
  session.update({ stopRequested: false, step: DownloadStep.DOWNLOADING });
  mocks.session.mockReturnValue(session);
  mocks.settings.mockReturnValue({ ...DEFAULT_SETTINGS, isFullSpeed: true });
  mocks.fetchQuery.mockReset();
  mocks.download.mockReset().mockResolvedValue(undefined);
  mocks.loadHistory.mockResolvedValue(undefined);
  mocks.hasHistory.mockReturnValue(false);
  saveProgress = vi.fn().mockResolvedValue(undefined);
  clearProgress = vi.fn().mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

describe("album cancellation and resume", () => {
  it("saves a completed page's next cursor and index, then resumes without replaying its files", async () => {
    const pending = deferred<FetchResult>();
    mocks.fetchQuery
      .mockResolvedValueOnce(
        page(["1", "2"], {
          hasMore: true,
          nextParams: { cursor: "next" },
          cursorToSave: "rest:next",
        }),
      )
      .mockReturnValueOnce(pending.promise);
    const work = useAlbumDownload({ saveProgress, clearProgress }).run();
    await vi.advanceTimersByTimeAsync(1000);
    expect(mocks.fetchQuery).toHaveBeenCalledTimes(2);
    expect(saveProgress.mock.calls).toEqual([
      ["rest:", 0],
      ["rest:next", 2],
    ]);
    session.update({ stopRequested: true });
    pending.resolve(page(["3"], { replayCursor: "rest:next" }));
    await work;
    expect(clearProgress).not.toHaveBeenCalled();
    expect(mocks.download).toHaveBeenCalledTimes(2);

    session = new DownloadSessionStore();
    session.update({
      stopRequested: false,
      resumedFrom: {
        collectionToken: "123_posts",
        lastCursor: "rest:next",
        lastIndex: 2,
        lastUpdateAt: 0,
      },
    });
    mocks.session.mockReturnValue(session);
    mocks.fetchQuery.mockResolvedValue(page(["3"], { replayCursor: "rest:next" }));
    const resumed = useAlbumDownload({ saveProgress, clearProgress }).run("rest:next");
    await vi.runAllTimersAsync();
    await resumed;
    expect(mocks.download.mock.calls.map((call) => [call[0].item.id, call[0].index])).toEqual([
      ["1", 1],
      ["2", 2],
      ["3", 3],
    ]);
    expect(clearProgress).toHaveBeenCalledTimes(1);
  });

  it("keeps a final-page checkpoint when stopped during a write", async () => {
    const write = deferred<void>();
    mocks.fetchQuery.mockResolvedValue(page(["1", "2"]));
    mocks.download.mockReturnValueOnce(write.promise);
    let settled = false;
    const work = useAlbumDownload({ saveProgress, clearProgress })
      .run()
      .then(() => {
        settled = true;
      });
    await vi.advanceTimersByTimeAsync(0);
    session.update({ stopRequested: true });
    expect(settled).toBe(false);
    write.resolve(undefined);
    await vi.runAllTimersAsync();
    await work;
    expect(saveProgress).toHaveBeenCalledExactlyOnceWith("rest:", 0);
    expect(mocks.download).toHaveBeenCalledTimes(1);
    expect(session.state.scanComplete).toBe(false);
    expect(session.state.items.map((entry) => entry.status)).toEqual(["done", "waiting"]);
    expect(clearProgress).not.toHaveBeenCalled();
  });

  it("saves a replay checkpoint if Stop is pressed during the final fetch", async () => {
    const fetch = deferred<FetchResult>();
    mocks.fetchQuery.mockReturnValue(fetch.promise);
    const work = useAlbumDownload({ saveProgress, clearProgress }).run();
    await vi.advanceTimersByTimeAsync(0);
    session.update({ stopRequested: true });
    fetch.resolve(page(["1"]));
    await work;
    expect(saveProgress).toHaveBeenCalledExactlyOnceWith("rest:", 0);
    expect(mocks.download).not.toHaveBeenCalled();
    expect(clearProgress).not.toHaveBeenCalled();
    expect(session.state.scanComplete).toBe(false);
  });

  it("does not move a replay listing's index between detail batches", async () => {
    mocks.fetchQuery
      .mockResolvedValueOnce(page(["1"], { hasMore: true, nextParams: { batch: 2 }, replayCursor: "graphql:listing" }))
      .mockResolvedValueOnce(page(["2"], { hasMore: true, nextParams: { batch: 3 }, replayCursor: "graphql:listing" }))
      .mockImplementationOnce(() => {
        session.update({ stopRequested: true });
        return Promise.resolve(page(["3"], { replayCursor: "graphql:listing" }));
      });
    const work = useAlbumDownload({ saveProgress, clearProgress }).run();
    await vi.runAllTimersAsync();
    await work;
    expect(saveProgress).toHaveBeenCalledExactlyOnceWith("graphql:listing", 0);
    expect(clearProgress).not.toHaveBeenCalled();
  });

  it("drains other in-flight writes before reporting a failure", async () => {
    mocks.settings.mockReturnValue({ ...DEFAULT_SETTINGS, concurrentDownloads: 2, isFullSpeed: true });
    const first = deferred<void>();
    const second = deferred<void>();
    mocks.fetchQuery.mockResolvedValue(page(["1", "2"]));
    mocks.download.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    let settled = false;
    const work = useAlbumDownload({ saveProgress, clearProgress })
      .run()
      .catch((error: unknown) => {
        settled = true;
        return error;
      });
    await vi.advanceTimersByTimeAsync(0);
    first.reject(new Error("write failed"));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    second.resolve(undefined);
    await vi.runAllTimersAsync();
    expect(await work).toEqual(new Error("write failed"));
    expect(clearProgress).not.toHaveBeenCalled();
  });

  it("waits for a stopped delay without fetching another page", async () => {
    mocks.settings.mockReturnValue({ ...DEFAULT_SETTINGS, requestDelay: 3, isFullSpeed: false });
    mocks.fetchQuery.mockResolvedValue(page([], { hasMore: true, nextParams: "next", cursorToSave: "rest:next" }));
    let settled = false;
    const work = useAlbumDownload({ saveProgress, clearProgress })
      .run()
      .then(() => {
        settled = true;
      });
    await vi.advanceTimersByTimeAsync(0);
    session.update({ stopRequested: true });
    expect(settled).toBe(false);
    await vi.runAllTimersAsync();
    await work;
    expect(mocks.fetchQuery).toHaveBeenCalledTimes(1);
    expect(clearProgress).not.toHaveBeenCalled();
  });

  it("assigns distinct sequential indices under concurrency without counting failed items as downloaded", async () => {
    mocks.settings.mockReturnValue({ ...DEFAULT_SETTINGS, concurrentDownloads: 2, isFullSpeed: true });
    mocks.fetchQuery.mockResolvedValue(page(["1", "2"], { cursorToSave: "rest:next" }));
    mocks.download
      .mockRejectedValueOnce(new Error("Offset is outside the bounds of the DataView"))
      .mockResolvedValueOnce(undefined);
    const work = useAlbumDownload({ saveProgress, clearProgress }).run();
    await vi.runAllTimersAsync();
    await work;
    expect(mocks.download.mock.calls.map((call) => [call[0].item.id, call[0].index])).toEqual([
      ["1", 1],
      ["2", 2],
    ]);
    expect(session.state.downloadCount).toBe(1);
    expect(saveProgress.mock.calls).toEqual([
      ["rest:", 0],
      ["rest:next", 1],
    ]);
  });
});
