import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchReelsMedia, type IgReel } from "@/inject/app/ig/instapi";

const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }));
vi.mock("@/inject/app/ig/modules", () => ({ requireIg: () => ({ apiGet }) }));

const reel: IgReel = {
  id: "1563074505",
  user: { username: "someone", full_name: "Some One" },
  items: [
    {
      pk: "story-photo",
      media_type: 1,
      taken_at: 1_700_000_000,
      image_versions2: { candidates: [{ url: "photo.jpg", width: 1080, height: 1920 }] },
    },
    {
      pk: "story-video",
      media_type: 2,
      taken_at: 1_700_000_001,
      image_versions2: { candidates: [{ url: "thumbnail.jpg", width: 1080, height: 1920 }] },
      video_versions: [{ url: "video.mp4", width: 1080, height: 1920 }],
    },
  ],
};

beforeEach(() => {
  apiGet.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("fetchReelsMedia", () => {
  it("loads the bulk story response and preserves author details for images and videos", async () => {
    apiGet.mockResolvedValue({ data: { reels: { [reel.id]: reel } } });

    const result = await fetchReelsMedia([reel.id]);
    expect(apiGet).toHaveBeenCalledExactlyOnceWith("/api/v1/feed/reels_media/", {
      query: { reel_ids: [reel.id] },
    });
    expect(result.reels).toEqual([reel]);
    expect(result.items).toMatchObject([
      { id: "story-photo", uri: "photo.jpg", authorName: "someone", fullName: "Some One", isVideo: false },
      { id: "story-video", uri: "video.mp4", authorName: "someone", fullName: "Some One", isVideo: true },
    ]);
  });

  it("also accepts the reels_media list response", async () => {
    apiGet.mockResolvedValue({ data: { reels_media: [reel] } });
    const result = await fetchReelsMedia([reel.id]);
    expect(result.reels).toEqual([reel]);
    expect(result.items).toHaveLength(2);
  });

  it("recovers from the reported AjaxError 500 using the user's story feed", async () => {
    apiGet
      .mockRejectedValueOnce({ name: "AjaxError", message: "We're sorry, but something went wrong.", statusCode: 500 })
      .mockResolvedValueOnce({ data: { reel } });

    const result = await fetchReelsMedia([reel.id]);
    expect(apiGet).toHaveBeenCalledTimes(2);
    expect(apiGet).toHaveBeenLastCalledWith(`/api/v1/feed/user/${reel.id}/story/`, undefined);
    expect(result.reels).toEqual([reel]);
    expect(result.items.map((item) => item.id)).toEqual(["story-photo", "story-video"]);
  });

  it("loads multiple fallback feeds in order and accepts an expired story", async () => {
    apiGet
      .mockRejectedValueOnce({ statusCode: 503 })
      .mockResolvedValueOnce({ data: { reel } })
      .mockResolvedValueOnce({ data: { reel: null } });

    const result = await fetchReelsMedia([reel.id, "42"]);
    expect(apiGet).toHaveBeenCalledTimes(3);
    expect(apiGet).toHaveBeenNthCalledWith(2, `/api/v1/feed/user/${reel.id}/story/`, undefined);
    expect(apiGet).toHaveBeenNthCalledWith(3, "/api/v1/feed/user/42/story/", undefined);
    expect(result.reels).toEqual([reel]);
    expect(result.items).toHaveLength(2);
  });

  it.each([400, 401, 403, 404, 429])("does not retry or bypass HTTP %i errors", async (statusCode) => {
    const error = { statusCode, message: "Request failed" };
    apiGet.mockRejectedValue(error);
    await expect(fetchReelsMedia([reel.id])).rejects.toBe(error);
    expect(apiGet).toHaveBeenCalledTimes(1);
  });

  it("does not treat highlight ids as user ids after a server error", async () => {
    const error = { statusCode: 500 };
    apiGet.mockRejectedValue(error);
    await expect(fetchReelsMedia(["highlight:123"])).rejects.toBe(error);
    expect(apiGet).toHaveBeenCalledTimes(1);
  });

  it("propagates fallback failures without looping or returning partial results", async () => {
    const error = { statusCode: 503, message: "Still unavailable" };
    apiGet.mockRejectedValueOnce({ statusCode: 500 }).mockRejectedValueOnce(error);
    await expect(fetchReelsMedia([reel.id])).rejects.toBe(error);
    expect(apiGet).toHaveBeenCalledTimes(2);
  });

  it("does not retry unknown failures", async () => {
    const error = new Error("Module unavailable");
    apiGet.mockRejectedValue(error);
    await expect(fetchReelsMedia([reel.id])).rejects.toBe(error);
    expect(apiGet).toHaveBeenCalledTimes(1);
  });

  it("returns no files for an empty reel or list of ids", async () => {
    expect(await fetchReelsMedia([])).toEqual({ reels: [], items: [] });
    expect(apiGet).not.toHaveBeenCalled();
    apiGet.mockResolvedValueOnce({ data: { reels: {} } });
    expect(await fetchReelsMedia([reel.id])).toEqual({ reels: [], items: [] });
  });
});
