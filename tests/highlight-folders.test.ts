import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadMediaItem, resetFilenameCounter } from "@/inject/app/download/download-media";
import { pickDownloadDirectory } from "@/inject/app/download/filesystem";
import { createHighlightsFetcher } from "@/inject/app/fetchers/stories";
import { fetchMediaInfo, fetchReelsMedia, type IgReel } from "@/inject/app/ig/instapi";
import { getSplitFolderSegments } from "@/inject/app/ig/route";
import type { MediaItem } from "@/inject/app/media/types";
import { DownloadSessionStore } from "@/inject/app/state/download-session";
import { ImageFormat } from "@/shared/settings";

const { apiGet, downloadFile } = vi.hoisted(() => ({ apiGet: vi.fn(), downloadFile: vi.fn() }));
vi.mock("@/inject/app/ig/modules", () => ({ requireIg: () => ({ apiGet }) }));
vi.mock("@/inject/app/messaging", () => ({ background: { downloadFile } }));
vi.mock("@/inject/app/state/download-history", () => ({ downloadHistory: { add: vi.fn() } }));
vi.mock("@/inject/app/download/ffmpeg", () => ({ mergeVideoAndAudio: vi.fn() }));
vi.mock("@/inject/app/download/toast", () => ({ showProgressError: vi.fn() }));

const written: string[] = [];
const directory = (path: string[] = []): FileSystemDirectoryHandle =>
  ({
    requestPermission: async () => "granted",
    getDirectoryHandle: async (name: string) => {
      // Match the File System Access API's refusal of invalid path components.
      if (!name || /[/:]/.test(name)) throw new TypeError(`Invalid folder name: ${JSON.stringify(name)}`);
      return directory([...path, name]);
    },
    getFileHandle: async (name: string) => ({
      createWritable: async () => ({
        write: async () => {},
        close: async () => {
          written.push([...path, name].join("/"));
        },
      }),
    }),
  }) as unknown as FileSystemDirectoryHandle;

const reel = (id = "highlight:777", title?: string): IgReel => ({
  id,
  title,
  user: { username: "someone" },
  items: [
    {
      pk: "story-1",
      media_type: 1,
      taken_at: 0,
      image_versions2: {
        candidates: [{ url: "https://scontent.cdninstagram.com/photo.jpg", width: 100, height: 100 }],
      },
    },
  ],
});

const save = (item: MediaItem, viaBrowserDownloads = false, isSplitFolder = true) =>
  downloadMediaItem({
    item,
    index: 1,
    filenameTemplate: "photo",
    imageFormat: ImageFormat.ORIGINAL,
    isGenFolder: true,
    isSplitFolder,
    viaBrowserDownloads,
  });

beforeEach(async () => {
  vi.clearAllMocks();
  apiGet.mockReset();
  written.length = 0;
  resetFilenameCounter();
  vi.stubGlobal("window", {
    location: new URL("https://www.instagram.com/stories/highlights/777/"),
    showDirectoryPicker: async () => directory(),
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("photo", { status: 200 })),
  );
  await pickDownloadDirectory();
});
afterEach(() => vi.unstubAllGlobals());

describe("highlights with separate folders by post type", () => {
  it("uses the URL's highlight id when no title has been captured", async () => {
    expect(getSplitFolderSegments()).toEqual(["highlights", "777"]);
    apiGet.mockResolvedValue({ data: { items: reel().items } });
    const items = await fetchMediaInfo("story-1");
    await save({ ...items[0]!, authorName: "someone" });
    expect(written).toEqual(["someone/highlights/777/photo.jpg"]);
  });

  it.each(["🌴", "", "CON", "...", "***"])("uses a valid id folder for title %j", async (title) => {
    apiGet.mockResolvedValue({ data: { reels: { "highlight:777": reel("highlight:777", title) } } });
    const { items } = await fetchReelsMedia(["highlight:777"]);
    await save(items[0]!);
    expect(written).toEqual(["someone/highlights/777/photo.jpg"]);
  });

  it.each([false, true])("keeps the fetched highlight title in the destination (browser=%s)", async (browser) => {
    apiGet.mockResolvedValue({ data: { reels: { "highlight:777": reel("highlight:777", "Summer / Trips") } } });
    const { items } = await fetchReelsMedia(["highlight:777"]);
    expect(items[0]?.highlight).toEqual({ id: "highlight:777", name: "Summer / Trips" });
    await save(items[0]!, browser);
    if (browser) expect(downloadFile).toHaveBeenCalledWith(items[0]!.uri, "someone/highlights/Summer Trips/photo.jpg");
    else expect(written).toEqual(["someone/highlights/Summer Trips/photo.jpg"]);
  });

  it("retains the original folder after the viewer navigates to another highlight", async () => {
    apiGet
      .mockResolvedValueOnce({ data: { reels: { "highlight:777": reel("highlight:777", "First") } } })
      .mockResolvedValueOnce({ data: { reels: { "highlight:888": reel("highlight:888", "Second") } } });
    const first = await fetchReelsMedia(["highlight:777"]);
    const second = await fetchReelsMedia(["highlight:888"]);
    window.location.href = "https://www.instagram.com/someone/";
    await save(first.items[0]!);
    await save(second.items[0]!);
    expect(written).toEqual(["someone/highlights/First/photo.jpg", "someone/highlights/Second/photo.jpg"]);
  });

  it("recognizes a highlight whose response contains only its numeric reel id", async () => {
    apiGet.mockResolvedValue({ data: { reels_media: [reel("777", "Trips")] } });
    const { items } = await fetchReelsMedia(["highlight:777"]);
    await save(items[0]!);
    expect(written).toEqual(["someone/highlights/Trips/photo.jpg"]);
  });

  it("includes a shared story in every highlight during a bulk download", async () => {
    apiGet
      .mockResolvedValueOnce({ data: { reels: { "highlight:777": reel("highlight:777", "Trips") } } })
      .mockResolvedValueOnce({ data: { reels: { "highlight:888": reel("highlight:888", "🌴") } } });
    const fetch = createHighlightsFetcher(["highlight:777", "highlight:888"]);
    const first = await fetch({ nextParams: null });
    const second = await fetch({ nextParams: first.nextParams });
    const session = new DownloadSessionStore();
    for (const item of session.appendItems([...first.items, ...second.items])) await save(item);
    expect(written).toEqual(["someone/highlights/Trips/photo.jpg", "someone/highlights/888/photo.jpg"]);
  });

  it("keeps the author folder without a type subfolder when splitting is off", async () => {
    apiGet.mockResolvedValue({ data: { reels: { "highlight:777": reel("highlight:777", "Trips") } } });
    const { items } = await fetchReelsMedia(["highlight:777"]);
    await save(items[0]!, false, false);
    expect(written).toEqual(["someone/photo.jpg"]);
  });

  it("uses a nonempty fallback even for an incomplete highlight route", () => {
    window.location.href = "https://www.instagram.com/stories/highlights/";
    expect(getSplitFolderSegments()).toEqual(["highlights", "untitled"]);
  });
});
