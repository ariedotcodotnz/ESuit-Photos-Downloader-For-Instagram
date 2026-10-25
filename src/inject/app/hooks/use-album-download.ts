import { useCallback, useEffect, useRef } from "react";
import { errorMessage } from "@/shared/logger";
import { DownloadType } from "@/shared/settings";
import { downloadMediaItem } from "../download/download-media";
import { applyQuantityLimit } from "../download/quantity-limit";
import type { FetchResult, MediaItem } from "../media/types";
import { downloadHistory } from "../state/download-history";
import { useDownloaderModal } from "../state/downloader-modal";
import { useDownloadSessionStore } from "../state/download-session";
import { useSettings } from "../state/settings";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface ResumeHandlers {
  saveProgress(cursor: string): void;
  clearProgress(): void;
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
  const step = session.state.step;

  useEffect(() => {
    pageCounter.current = 0;
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
      const skip = () => session.finishItem(item.id, "skip");

      if (item.status === "error") return session.finishItem(item.id, "error");
      if (settings.isSkipDownloadedFile && downloadHistory.has(item.id)) return skip();
      if (downloadType === DownloadType.IMAGES_ONLY && item.isVideo) return skip();
      if (downloadType === DownloadType.VIDEOS_ONLY && !item.isVideo) return skip();
      if (
        downloadType === DownloadType.AUDIO_ONLY &&
        (!item.isVideo || (!item.audioUrl && !item.highestSource?.audio))
      ) {
        return skip();
      }

      session.update({ downloadCount: session.state.downloadCount + 1 });
      const index = (session.state.resumedFrom?.lastIndex ?? 0) + session.state.downloadCount;
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
          return session.finishItem(item.id, "error");
        }
        throw error;
      }
      session.finishItem(item.id, "done");
      downloadHistory.add(item.id);
      await sleep(Math.ceil(200 * Math.random() + 50));
    },
    [folderName, session, settingsRef],
  );

  const downloadAll = useCallback(
    async (items: MediaItem[]) => {
      const running = new Set<Promise<void>>();
      for (const item of session.appendItems(items)) {
        if (session.state.stopRequested) break;
        const task: Promise<void> = downloadItem(item).finally(() => running.delete(task));
        running.add(task);
        if (running.size >= settingsRef.current.concurrentDownloads) await Promise.race(running);
      }
      await Promise.all(running);
    },
    [downloadItem, session, settingsRef],
  );

  const limitPage = useCallback(
    (result: FetchResult): FetchResult => {
      if (!isUseQuantityControl) return result;
      const { items, reached } = applyQuantityLimit(result.items, settingsRef.current, session.state.items.length);
      return { ...result, items, hasMore: result.hasMore && !reached };
    },
    [isUseQuantityControl, session, settingsRef],
  );

  /** Downloads the whole album, optionally continuing from a saved cursor. */
  const run = useCallback(
    async (resumeCursor?: string) => {
      if (!fetchQuery) return;
      await downloadHistory.load();
      let nextParams: unknown = null;
      let isFirstPage = true;

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

        await downloadAll(page.items);
        if (page.cursorToSave) saveProgress(page.cursorToSave);

        if (!page.hasMore) {
          session.update({ scanComplete: true });
          await sleep(2_000);
          clearProgress();
          return;
        }
        if (!page.skipWaiting) {
          await pauseToAvoidRestriction();
          await applyRequestDelay();
        }
        nextParams = page.nextParams;
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
