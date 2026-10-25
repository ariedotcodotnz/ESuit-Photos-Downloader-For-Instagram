import dayjs from "dayjs";
import { describe, expect, it } from "vitest";
import { assertDownloadableUrl, buildDownloadPath } from "@/background/downloads";
import { buildRangeUrl, DataViewReader, parseByteRange } from "@/inject/app/download/dash";
import { applyQuantityLimit } from "@/inject/app/download/quantity-limit";
import { decodeCursor, encodeCursor } from "@/inject/app/fetchers/strategy";
import type { MediaItem } from "@/inject/app/media/types";
import {
  applySettingsPatch,
  DEFAULT_SETTINGS,
  DownloadType,
  FetchCountType,
  normalizeSettings,
} from "@/shared/settings";
import { getUrlBasename, getUrlExtension } from "@/shared/url";

describe("settings", () => {
  it("fills defaults and rejects values of the wrong type", () => {
    const settings = normalizeSettings({ isFullSpeed: true, downloadType: 5, fetchingDateRangeFrom: 100, unknown: 1 });
    expect(settings.isFullSpeed).toBe(true);
    expect(settings.downloadType).toBe(DownloadType.BOTH);
    expect(settings.fetchingDateRangeFrom).toBe(100);
    expect(settings).not.toHaveProperty("unknown");
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps folder options consistent", () => {
    expect(applySettingsPatch(DEFAULT_SETTINGS, { isSplitFolder: true })).toMatchObject({
      isSplitFolder: true,
      isGenFolder: true,
    });
    const both = { ...DEFAULT_SETTINGS, isGenFolder: true, isSplitFolder: true };
    expect(applySettingsPatch(both, { isGenFolder: false })).toMatchObject({
      isSplitFolder: false,
      isGenFolder: false,
    });
  });

  it("resets quantity values when the mode changes", () => {
    const custom = { ...DEFAULT_SETTINGS, fetchingCountByPhotosCountValue: 500 };
    const next = applySettingsPatch(custom, { fetchingCountType: FetchCountType.BY_DAYS_COUNT });
    expect(next.fetchingCountByPhotosCountValue).toBe(DEFAULT_SETTINGS.fetchingCountByPhotosCountValue);
  });
});

const item = (id: string, createdAt: number): MediaItem => ({
  id,
  createdAt,
  thumbnail: "",
  uri: "",
  authorName: "",
  isVideo: false,
  status: "waiting",
});

describe("applyQuantityLimit", () => {
  const now = dayjs("2024-06-15T12:00:00Z");
  const day = 86_400;
  const base = {
    fetchingCountType: FetchCountType.ALL,
    fetchingCountByPhotosCountValue: 5,
    fetchingCountByPhotosDaysValue: 3,
    fetchingDateRangeFrom: null,
    fetchingDateRangeTo: null,
  };
  const page = [0, 1, 2, 3].map((i) => item(String(i), now.unix() - i * day));

  it("passes everything through in ALL mode", () => {
    expect(applyQuantityLimit(page, base, 0, now)).toEqual({ items: page, reached: false });
  });

  it("caps the number of files", () => {
    const result = applyQuantityLimit(page, { ...base, fetchingCountType: FetchCountType.BY_PHOTOS_COUNT }, 3, now);
    expect(result.items.map((i) => i.id)).toEqual(["0", "1"]);
    expect(result.reached).toBe(true);
  });

  it("keeps the last N days and stops once a page is entirely older", () => {
    const settings = { ...base, fetchingCountType: FetchCountType.BY_DAYS_COUNT };
    expect(applyQuantityLimit(page, settings, 0, now)).toEqual({ items: page.slice(0, 3), reached: false });
    const old = [item("9", now.unix() - 10 * day)];
    expect(applyQuantityLimit(old, settings, 0, now)).toEqual({ items: [], reached: true });
  });

  it("filters a date range", () => {
    const settings = {
      ...base,
      fetchingCountType: FetchCountType.BY_DATE_RANGE,
      fetchingDateRangeFrom: now.unix() - 2 * day,
      fetchingDateRangeTo: now.unix() - day,
    };
    const result = applyQuantityLimit(page, settings, 0, now);
    expect(result.items.map((i) => i.id)).toEqual(["1", "2"]);
    expect(result.reached).toBe(false);
  });
});

describe("DASH helpers", () => {
  it("parses byte ranges and builds CDN range URLs", () => {
    expect(parseByteRange("831-1234")).toEqual({ byteOffset: 831, byteLength: 404 });
    expect(buildRangeUrl("https://cdn/x.mp4", { byteOffset: 0, byteLength: 10 })).toBe(
      "https://cdn/x.mp4?bytestart=0&byteend=9",
    );
    expect(buildRangeUrl("https://cdn/x.mp4?a=1", { byteOffset: 5 })).toBe("https://cdn/x.mp4?a=1&bytestart=5");
  });

  it("reads big-endian 64-bit values", () => {
    const view = new DataView(new ArrayBuffer(8));
    view.setUint32(0, 1);
    view.setUint32(4, 2);
    expect(new DataViewReader(view).readUint64()).toBe(2 ** 32 + 2);
  });
});

describe("resume cursors", () => {
  it("round-trips the fetch strategy", () => {
    expect(decodeCursor(encodeCursor("rest", "abc:def"))).toEqual({ strategy: "rest", cursor: "abc:def" });
    expect(decodeCursor("QVFEeHh4")).toEqual({ strategy: "graphql", cursor: "QVFEeHh4" });
    expect(decodeCursor(undefined)).toBeNull();
  });
});

describe("background downloads", () => {
  it("sanitises every path segment under the app folder", () => {
    expect(buildDownloadPath("some:user/posts/photo?.jpg")).toBe("IG Album Downloader/someuser/posts/photo.jpg");
    expect(buildDownloadPath("../../etc/passwd")).toBe("IG Album Downloader/etc/passwd");
    // A filename that sanitises to nothing is rejected.
    expect(() => buildDownloadPath("folder/...")).toThrow();
    expect(() => buildDownloadPath("")).toThrow();
  });

  it("only downloads Instagram media", () => {
    expect(() => assertDownloadableUrl("https://scontent-lga3-2.cdninstagram.com/v/a.jpg")).not.toThrow();
    expect(() => assertDownloadableUrl("https://instagram.fxyz1-1.fna.fbcdn.net/v/a.mp4")).not.toThrow();
    expect(() => assertDownloadableUrl("blob:https://www.instagram.com/1234")).not.toThrow();
    expect(() => assertDownloadableUrl("https://evil.example/a.exe")).toThrow();
    expect(() => assertDownloadableUrl("https://cdninstagram.com.evil.example/a.jpg")).toThrow();
    expect(() => assertDownloadableUrl("blob:https://evil.example/1234")).toThrow();
    expect(() => assertDownloadableUrl("http://scontent.cdninstagram.com/a.jpg")).toThrow();
  });
});

describe("URL helpers", () => {
  it("extracts extensions from the basename without matching directory dots", () => {
    expect(getUrlExtension("https://scontent.cdninstagram.com/v/t51.2885-15/12345_n.jpg?stp=dst-jpg")).toBe("jpg");
    expect(getUrlExtension("https://scontent.cdninstagram.com/v/t51.2885-15/12345")).toBe("");
    expect(getUrlExtension("https://scontent.cdninstagram.com/media/12345")).toBe("");
    expect(getUrlBasename("https://scontent.cdninstagram.com/v/t51.2885-15/12345_n.jpg?stp=dst-jpg")).toBe(
      "12345_n.jpg",
    );
    expect(getUrlBasename("photo.png?dl=1")).toBe("photo.png");
    expect(getUrlExtension("photo.png?dl=1")).toBe("png");
  });
});
