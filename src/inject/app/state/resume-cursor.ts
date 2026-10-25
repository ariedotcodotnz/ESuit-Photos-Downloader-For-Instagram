import { useCallback, useEffect, useState } from "react";
import type { ResumeCursor } from "@/shared/messaging";
import { background } from "../messaging";
import type { DownloadSessionStore } from "./download-session";

/** Saved progress of an interrupted bulk download of `collectionId`, and helpers to update it. */
export function useResumeCursor(collectionId: string | undefined, session: DownloadSessionStore) {
  const [resumeCursor, setResumeCursor] = useState<ResumeCursor | null>(null);

  useEffect(() => {
    if (!collectionId) return;
    let cancelled = false;
    void background.getResumeCursor(collectionId).then((cursor) => {
      if (!cancelled) setResumeCursor(cursor);
    });
    return () => {
      cancelled = true;
    };
  }, [collectionId]);

  /** Records that everything fetched with `cursor` has been downloaded. */
  const saveProgress = useCallback(
    (cursor: string) => {
      if (!collectionId) return;
      const { resumedFrom, downloadCount } = session.state;
      if (resumedFrom?.lastCursor === cursor) return;
      void background.setResumeCursor({
        collectionToken: collectionId,
        lastCursor: cursor,
        lastIndex: downloadCount + (resumedFrom?.lastIndex ?? 0),
      });
    },
    [collectionId, session],
  );

  const clearProgress = useCallback(() => {
    if (collectionId) void background.removeResumeCursor(collectionId);
  }, [collectionId]);

  return { resumeCursor, saveProgress, clearProgress };
}
