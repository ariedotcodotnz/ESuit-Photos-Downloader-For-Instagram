import { useCallback, useEffect, useState } from "react";
import type { ResumeCursor } from "@/shared/messaging";
import { background } from "../messaging";

/** Saved progress of an interrupted bulk download of `collectionId`, and helpers to update it. */
export function useResumeCursor(collectionId: string | undefined) {
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

  /** Stores a cursor with the file index immediately before that cursor. */
  const saveProgress = useCallback(
    async (cursor: string, lastIndex: number) => {
      if (!collectionId) return;
      const checkpoint = {
        collectionToken: collectionId,
        lastCursor: cursor,
        lastIndex,
      };
      await background.setResumeCursor(checkpoint);
      setResumeCursor({ ...checkpoint, lastUpdateAt: Math.floor(Date.now() / 1000) });
    },
    [collectionId],
  );

  const clearProgress = useCallback(async () => {
    if (!collectionId) return;
    await background.removeResumeCursor(collectionId);
    setResumeCursor(null);
  }, [collectionId]);

  return { resumeCursor, saveProgress, clearProgress };
}
