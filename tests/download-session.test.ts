import { describe, expect, it } from "vitest";
import { DownloadSessionStore } from "@/inject/app/state/download-session";
import type { MediaItem } from "@/inject/app/media/types";

const item = (folder: string): MediaItem => ({
  id: "same-post",
  uri: "photo.jpg",
  thumbnail: "",
  authorName: "someone",
  isVideo: false,
  createdAt: 0,
  status: "waiting",
  saveFolderPath: ["Saved", folder],
});

describe("collection destinations", () => {
  it("deduplicates within a destination but includes the post in every collection", () => {
    const session = new DownloadSessionStore();
    expect(session.appendItems([item("A"), item("A"), item("B")])).toHaveLength(2);
    expect(session.appendItems([item("A"), item("B")])).toEqual([]);
    expect(session.state.totalFound).toBe(2);
  });

  it("finishes the correct occurrence of an item", () => {
    const session = new DownloadSessionStore();
    const [a, b] = [item("A"), item("B")];
    session.appendItems([a!, b!]);
    session.finishItem(b!, "done");
    expect(a!.status).toBe("waiting");
    expect(b!.status).toBe("done");
    session.finishItem(a!, "skip");
    expect(session.state.processedCount).toBe(2);
    session.reset();
    expect(session.appendItems([item("A")])).toHaveLength(1);
  });
});
