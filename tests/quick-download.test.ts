import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadPost, quickDownload } from "@/inject/app/download/quick-download";
import type { MediaItem } from "@/inject/app/media/types";
import { DEFAULT_SETTINGS } from "@/shared/settings";

const { getSettings, downloadFile, fetchMediaInfo, flush } = vi.hoisted(() => ({
  getSettings: vi.fn(),
  downloadFile: vi.fn(),
  fetchMediaInfo: vi.fn(),
  flush: vi.fn(),
}));
vi.mock("@/inject/app/messaging", () => ({ background: { getSettings, downloadFile } }));
vi.mock("@/inject/app/ig/instapi", () => ({ fetchMediaInfo }));
vi.mock("@/inject/app/state/download-history", () => ({ downloadHistory: { add: vi.fn(), flush } }));
vi.mock("@/inject/app/download/filesystem", () => ({
  hasDownloadDirectory: () => false,
  getDownloadDirectory: vi.fn(),
  getSubdirectory: vi.fn(),
  writeUrlToDirectory: vi.fn(),
}));
vi.mock("@/inject/app/download/ffmpeg", () => ({ mergeVideoAndAudio: vi.fn() }));
vi.mock("@/inject/app/download/toast", () => ({ showProgressError: vi.fn() }));

const photo = (overrides: Partial<MediaItem> = {}): MediaItem => ({
  id: "123",
  uri: "https://scontent.cdninstagram.com/photo.jpg",
  thumbnail: "",
  authorName: "someone",
  fullName: "Some One",
  code: "CODE",
  createdAt: 1_700_000_000,
  isVideo: false,
  status: "waiting",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  getSettings.mockReset().mockResolvedValue({
    ...DEFAULT_SETTINGS,
    filenameFormats: "custom_-**username code**-_-**file id**-_-**file no**-",
  });
  fetchMediaInfo.mockReset();
  downloadFile.mockReset().mockResolvedValue(undefined);
  vi.spyOn(Math, "random").mockReturnValue(0);
});
afterEach(() => vi.restoreAllMocks());

describe("custom filenames for single downloads", () => {
  it("applies the saved rule to one post", async () => {
    fetchMediaInfo.mockResolvedValue([photo()]);
    await downloadPost("123", undefined, { viaBrowserDownloads: true });
    expect(downloadFile).toHaveBeenCalledExactlyOnceWith(photo().uri, "custom_someone_123_1.jpg");
  });

  it("keeps the selected carousel slide's file number", async () => {
    fetchMediaInfo.mockResolvedValue([photo({ carouselIndex: 1 }), photo({ id: "456", carouselIndex: 2 })]);
    await downloadPost("123", 1, { viaBrowserDownloads: true });
    expect(downloadFile).toHaveBeenCalledExactlyOnceWith(photo().uri, "custom_someone_456_2.jpg");
  });

  it("uses a story's media id when its shortcode is missing", async () => {
    getSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, filenameFormats: "story_-**short code**-_-**timestamp**-" });
    await quickDownload([photo({ code: undefined })], { viaBrowserDownloads: true });
    expect(downloadFile).toHaveBeenCalledExactlyOnceWith(photo().uri, "story_123_1700000000.jpg");
  });

  it("reads the latest saved rule for each download on the same page", async () => {
    getSettings
      .mockResolvedValueOnce({ ...DEFAULT_SETTINGS, filenameFormats: "first_-**file id**-" })
      .mockResolvedValueOnce({ ...DEFAULT_SETTINGS, filenameFormats: "changed_-**username code**-" });
    await quickDownload([photo()]);
    await quickDownload([photo()]);
    expect(downloadFile.mock.calls.map((call) => call[1])).toEqual(["first_123.jpg", "changed_someone.jpg"]);
    expect(getSettings).toHaveBeenCalledTimes(2);
  });

  it("keeps custom audio filenames and the m4a extension", async () => {
    getSettings.mockResolvedValue({
      ...DEFAULT_SETTINGS,
      filenameFormats: "sound_-**username code**-_-**audio title**-",
    });
    await quickDownload(
      [photo({ isVideo: true, audioUrl: "https://scontent.cdninstagram.com/music.m4a", audioTitle: "Song" })],
      { isAudioOnly: true, viaBrowserDownloads: true },
    );
    expect(downloadFile).toHaveBeenCalledExactlyOnceWith(
      "https://scontent.cdninstagram.com/music.m4a",
      "sound_someone_Song.m4a",
    );
  });

  it("uses the same naming rule for a profile picture and keeps its profile folder", async () => {
    await quickDownload([photo({ id: "42", code: undefined, saveFolderPath: ["Some One"] })], {
      viaBrowserDownloads: true,
    });
    expect(downloadFile).toHaveBeenCalledExactlyOnceWith(photo().uri, "Some One/custom_someone_42_1.jpg");
    expect(flush).toHaveBeenCalledOnce();
  });
});
