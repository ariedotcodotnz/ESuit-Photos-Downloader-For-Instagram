import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  downloadMediaItem,
  resetFilenameCounter,
  type DownloadMediaOptions,
} from "@/inject/app/download/download-media";
import type { MediaItem } from "@/inject/app/media/types";
import { ImageFormat } from "@/shared/settings";

const { downloadFile, writeFile, addHistory } = vi.hoisted(() => ({
  downloadFile: vi.fn(),
  writeFile: vi.fn(),
  addHistory: vi.fn(),
}));
vi.mock("@/inject/app/messaging", () => ({ background: { downloadFile } }));
vi.mock("@/inject/app/state/download-history", () => ({ downloadHistory: { add: addHistory } }));
vi.mock("@/inject/app/download/filesystem", () => ({
  getDownloadDirectory: () => "root",
  getSubdirectory: vi.fn().mockResolvedValue("folder"),
  writeUrlToDirectory: writeFile,
}));
vi.mock("@/inject/app/download/ffmpeg", () => ({ mergeVideoAndAudio: vi.fn() }));
vi.mock("@/inject/app/download/toast", () => ({ showProgressError: vi.fn() }));

const item = (id: string, overrides: Partial<MediaItem> = {}): MediaItem => ({
  id,
  uri: `https://scontent.cdninstagram.com/${id}.jpg`,
  thumbnail: "",
  authorName: "someone",
  code: "CODE",
  isVideo: false,
  createdAt: 1_700_000_000,
  status: "waiting",
  ...overrides,
});
const options = (media: MediaItem, overrides: Partial<DownloadMediaOptions> = {}): DownloadMediaOptions => ({
  item: media,
  index: 1,
  filenameTemplate: "-**short code**-",
  imageFormat: ImageFormat.ORIGINAL,
  isGenFolder: false,
  isSplitFolder: false,
  viaBrowserDownloads: true,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  downloadFile.mockReset().mockResolvedValue(undefined);
  writeFile.mockReset().mockResolvedValue(undefined);
  resetFilenameCounter();
});

describe("download filenames and completion", () => {
  it.each(["-**short code**-", "-**date**-"])(
    "keeps all browser carousel slides for template %s",
    async (filenameTemplate) => {
      for (const id of ["1", "2", "3"]) await downloadMediaItem(options(item(id), { filenameTemplate }));
      const paths = downloadFile.mock.calls.map((call) => call[1] as string);
      expect(new Set(paths).size).toBe(3);
      expect(paths[1]).toBe(paths[0]!.replace(/\.jpg$/, ".1.jpg"));
      expect(paths[2]).toBe(paths[0]!.replace(/\.jpg$/, ".2.jpg"));
    },
  );

  it("reserves generated suffixes against literal filenames", async () => {
    for (const filenameTemplate of ["photo", "photo", "photo.1", "photo"]) {
      await downloadMediaItem(options(item("1"), { filenameTemplate }));
    }
    expect(downloadFile.mock.calls.map((call) => call[1])).toEqual([
      "photo.jpg",
      "photo.1.jpg",
      "photo.1.1.jpg",
      "photo.2.jpg",
    ]);
  });

  it.each([true, false])(
    "allocates names separately within each destination (browser=%s)",
    async (viaBrowserDownloads) => {
      for (const folder of ["A", "B", "A"]) {
        await downloadMediaItem(options(item("1", { saveFolderPath: ["Saved", folder] }), { viaBrowserDownloads }));
      }
      const paths = viaBrowserDownloads
        ? downloadFile.mock.calls.map((call) => call[1])
        : writeFile.mock.calls.map((call) => call[1]);
      expect(paths).toEqual(
        viaBrowserDownloads
          ? ["Saved/A/CODE.jpg", "Saved/B/CODE.jpg", "Saved/A/CODE.1.jpg"]
          : ["CODE.jpg", "CODE.jpg", "CODE.1.jpg"],
      );
    },
  );

  it("uniquifies both videos and their thumbnails", async () => {
    for (const id of ["1", "2"]) {
      await downloadMediaItem(
        options(
          item(id, {
            isVideo: true,
            uri: `https://scontent.cdninstagram.com/${id}.mp4`,
            thumbnail: "https://scontent.cdninstagram.com/thumb.jpg",
          }),
          { isDownloadVideoThumbnail: true },
        ),
      );
    }
    expect(downloadFile.mock.calls.map((call) => call[1])).toEqual([
      "CODE.thumbnail.jpg",
      "CODE.mp4",
      "CODE.1.thumbnail.jpg",
      "CODE.1.mp4",
    ]);
  });

  it.each([true, false])(
    "records history only after successful completion (browser=%s)",
    async (viaBrowserDownloads) => {
      const write = viaBrowserDownloads ? downloadFile : writeFile;
      write.mockRejectedValueOnce(new Error("Disk unavailable"));
      await expect(downloadMediaItem(options(item("failed"), { viaBrowserDownloads }))).rejects.toThrow(
        "Disk unavailable",
      );
      expect(addHistory).not.toHaveBeenCalled();
      await downloadMediaItem(options(item("done"), { viaBrowserDownloads }));
      expect(addHistory).toHaveBeenCalledExactlyOnceWith("done");
    },
  );
});
