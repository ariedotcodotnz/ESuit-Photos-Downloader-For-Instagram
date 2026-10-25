import { useCallback, useEffect, useRef } from "react";
import { errorMessage } from "@/shared/logger";
import { DownloadType, FetchCountType } from "@/shared/settings";
import { downloadMediaItem } from "../download/download-media";
import { applyQuantityLimit } from "../download/quantity-limit";
import type { FetchResult, MediaItem } from "../media/types";
import { downloadHistory } from "../state/download-history";
import { useDownloaderModal } from "../state/downloader-modal";
import { useDownloadSessionStore } from "../state/download-session";
import { useSettings } from "../state/settings";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface ResumeHandlers {
  saveProgress(cursor: string, lastIndex: number): Promise<void>;
  clearProgress(): Promise<void>;
}

/**
 * The bulk-download loop: fetch a page, download its items with limited
 * concurrency, save resume progress, pause to stay under Instagram's rate
 * limits, and continue until the album (or the quantity limit) ends or the
 * user presses Stop.
 */
export function useAlbumDownload({ saveProgress, clearProgress }: ResumeHandlers) {
  const session = useDownloadSessionStore();
  const { settingsRef } = useSettings();
  const { fetchQuery, isUseQuantityControl, folderName } = useDownloaderModal();
  const pageCounter = useRef(0);
  const allocatedCount = useRef(0);
  const step = session.state.step;

  useEffect(() => {
    pageCounter.current = 0;
    allocatedCount.current = 0;
  }, [step]);

  /**
   * Random pauses that grow with the number of pages fetched, so long
   * downloads look less like automated traffic. Skipped in Full Speed mode.
   */
  const pauseToAvoidRestriction = useCallback(async () => {
    if (settingsRef.current.isFullSpeed) return;
    pageCounter.current += 1;
    const waitMs = Math.ceil(Math.random() * 10 * pageCounter.current + 500);
    if (waitMs < 3_000 || waitMs > 5_000) {
      if (waitMs > 5_000) pageCounter.current = 0;
      session.update({ rateLimitWaitMs: 0 });
      return;
    }
    session.update({ rateLimitWaitMs: waitMs });
    await sleep(waitMs);
    session.update({ rateLimitWaitMs: 0 });
  }, [session, settingsRef]);

  const applyRequestDelay = useCallback(async () => {
    const { requestDelay, isFullSpeed } = settingsRef.current;
    if (requestDelay === 0 || isFullSpeed) return;
    const delayMs = requestDelay * 1_000;
    if (requestDelay > 1) session.update({ requestDelayMs: delayMs });
    await sleep(delayMs);
    session.update({ requestDelayMs: 0 });
  }, [session, settingsRef]);

  const downloadItem = useCallback(
    async (item: MediaItem) => {
      const settings = settingsRef.current;
      const { downloadType } = settings;
      const skip = () => session.finishItem(item, "skip");

      if (item.status === "error") return session.finishItem(item, "error");
      if (settings.isSkipDownloadedFile && downloadHistory.has(item.id)) return skip();
      if (downloadType === DownloadType.IMAGES_ONLY && item.isVideo) return skip();
      if (downloadType === DownloadType.VIDEOS_ONLY && !item.isVideo) return skip();
      if (
        downloadType === DownloadType.AUDIO_ONLY &&
        (!item.isVideo || (!item.audioUrl && !item.highestSource?.audio))
      ) {
        return skip();
      }

      const index = (session.state.resumedFrom?.lastIndex ?? 0) + ++allocatedCount.current;
      try {
        await downloadMediaItem({
          item,
          index,
          filenameTemplate: settings.filenameFormats,
          imageFormat: settings.formatType,
          isGenFolder: settings.isGenFolder,
          isSplitFolder: settings.isSplitFolder,
          folderName,
          viaBrowserDownloads: false,
          isDownloadVideoThumbnail: settings.isDownloadVideoThumbnail,
          isMergingVideo: settings.isMergingVideo,
          isAudioOnly: downloadType === DownloadType.AUDIO_ONLY,
        });
      } catch (error) {
        // A malformed DASH index only affects this file.
        if (errorMessage(error).includes("Offset is outside the bounds of the DataView")) {
          return session.finishItem(item, "error");
        }
        throw error;
      }
      session.update({ downloadCount: session.state.downloadCount + 1 });
      session.finishItem(item, "done");
      await sleep(Math.ceil(200 * Math.random() + 50));
    },
    [folderName, session, settingsRef],
  );

  const downloadAll = useCallback(
    async (items: MediaItem[]) => {
      const running = new Set<Promise<void>>();
      const tasks: Promise<void>[] = [];
      try {
        for (const item of session.appendItems(items)) {
          if (session.state.stopRequested) break;
          const task: Promise<void> = downloadItem(item).finally(() => running.delete(task));
          running.add(task);
          tasks.push(task);
          if (running.size >= settingsRef.current.concurrentDownloads) await Promise.race(running);
        }
        await Promise.all(tasks);
      } finally {
        // A failing task must not leave other writes running after the caller
        // returns to the restart controls.
        await Promise.allSettled(tasks);
      }
      return !session.state.stopRequested;
    },
    [downloadItem, session, settingsRef],
  );

  const limitPage = useCallback(
    (result: FetchResult): FetchResult => {
      if (!isUseQuantityControl) return result;
      const candidates =
        settingsRef.current.fetchingCountType === FetchCountType.BY_PHOTOS_COUNT
          ? result.items.filter((item) => !session.hasItem(item))
          : result.items;
      const { items, reached } = applyQuantityLimit(candidates, settingsRef.current, session.state.items.length);
      return { ...result, items, hasMore: result.hasMore && !reached };
    },
    [isUseQuantityControl, session, settingsRef],
  );

  /** Downloads the whole album, optionally continuing from a saved cursor. */
  const run = useCallback(
    async (resumeCursor?: string) => {
      if (!fetchQuery) return;
      allocatedCount.current = 0;
      await downloadHistory.load();
      let nextParams: unknown = null;
      let isFirstPage = true;
      let checkpointCursor = resumeCursor;
      const currentIndex = () => (session.state.resumedFrom?.lastIndex ?? 0) + session.state.downloadCount;

      try {
        while (!session.state.stopRequested) {
          session.update({ isFetchingNextPage: true });
          const settings = settingsRef.current;
          const page = limitPage(
            await fetchQuery({
              nextParams,
              resumeCursor: isFirstPage ? resumeCursor : undefined,
              isSkipDownloadedFile: settings.isSkipDownloadedFile,
              isFileIdDownloaded: (id) => downloadHistory.has(id),
            }).finally(() => session.update({ isFetchingNextPage: false })),
          );
          isFirstPage = false;

          // Several detail batches may replay the same listing. Keep its first
          // index until every batch has finished, rather than moving it forward.
          if (page.replayCursor !== undefined && page.replayCursor !== checkpointCursor) {
            await saveProgress(page.replayCursor, currentIndex());
            checkpointCursor = page.replayCursor;
          }
          if (session.state.stopRequested || !(await downloadAll(page.items))) return;
          if (page.cursorToSave != null) {
            await saveProgress(page.cursorToSave, currentIndex());
            checkpointCursor = page.cursorToSave;
          }
          if (session.state.stopRequested) return;

          if (!page.hasMore) {
            session.update({ scanComplete: true });
            await sleep(2_000);
            if (!session.state.stopRequested) await clearProgress();
            return;
          }
          if (!page.skipWaiting) {
            await pauseToAvoidRestriction();
            if (session.state.stopRequested) return;
            await applyRequestDelay();
          }
          nextParams = page.nextParams;
        }
      } finally {
        downloadHistory.flush?.();
      }
    },
    [
      applyRequestDelay,
      clearProgress,
      downloadAll,
      fetchQuery,
      limitPage,
      pauseToAvoidRestriction,
      saveProgress,
      session,
      settingsRef,
    ],
  );

  return { run };
}
