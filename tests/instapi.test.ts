import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchReelsMedia, type IgReel } from "@/inject/app/ig/instapi";
import { getCurrentStoryId, highlightState } from "@/inject/app/ig/route";
import { GraphqlUnavailableError } from "@/inject/app/ig/graphql";
import { HIGHLIGHTS_QUERY, STORIES_QUERY } from "@/inject/app/fetchers/queries";

const { apiGet, graphqlRequest, isGraphqlQueryAvailable, isDebug } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  graphqlRequest: vi.fn(),
  isGraphqlQueryAvailable: vi.fn(),
  isDebug: vi.fn(),
}));
vi.mock("@/inject/app/ig/modules", () => ({ requireIg: () => ({ apiGet }) }));
vi.mock("@/inject/app/env", () => ({ isDebug }));
vi.mock("@/inject/app/ig/graphql", () => ({
  graphqlRequest,
  isGraphqlQueryAvailable,
  GraphqlUnavailableError: class extends Error {},
}));

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
  graphqlRequest.mockReset();
  isGraphqlQueryAvailable.mockReset().mockReturnValue(false);
  isDebug.mockReset().mockReturnValue(false);
  delete highlightState.currentItemId;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const storyPayload = (reels: IgReel[]) => [
  {
    data: { xdt_api__v1__feed__reels_media__connection: { edges: reels.map((node) => ({ node })) } },
  },
];

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
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
  });

  it("keeps readable HTTP details in debug logs without reporting a retry as a warning", async () => {
    isDebug.mockReturnValue(true);
    apiGet
      .mockRejectedValueOnce({ statusCode: 500, message: "Server unavailable" })
      .mockResolvedValueOnce({ data: { reel } });
    await fetchReelsMedia([reel.id]);
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(
      "[ig-album-downloader:instapi]",
      "Story request failed (HTTP 500); trying individual story feeds: Server unavailable",
    );
  });

  it("loads photos and videos through the viewer's GraphQL query without calling the broken REST feeds", async () => {
    isGraphqlQueryAvailable.mockReturnValue(true);
    graphqlRequest.mockResolvedValue(storyPayload([reel]));
    const result = await fetchReelsMedia([reel.id]);
    expect(graphqlRequest).toHaveBeenCalledExactlyOnceWith(
      STORIES_QUERY,
      { initial_reel_id: reel.id, reel_ids: [reel.id] },
      { maxRetries: 0 },
    );
    expect(apiGet).not.toHaveBeenCalled();
    expect(result.items).toMatchObject([
      { id: "story-photo", uri: "photo.jpg", authorName: "someone", fullName: "Some One", createdAt: 1_700_000_000 },
      { id: "story-video", uri: "video.mp4", authorName: "someone", isVideo: true },
    ]);
  });

  it("excludes adjacent users and deduplicates requested reels in the gallery connection", async () => {
    isGraphqlQueryAvailable.mockReturnValue(true);
    graphqlRequest.mockResolvedValue(storyPayload([{ ...reel, id: "42" }, reel, reel]));
    const result = await fetchReelsMedia([reel.id]);
    expect(result.reels).toEqual([reel]);
    expect(result.items.map((item) => item.uri)).toEqual(["photo.jpg", "video.mp4"]);
  });

  it("loads every requested user and accepts the owner's id when a reel id is absent", async () => {
    isGraphqlQueryAvailable.mockReturnValue(true);
    graphqlRequest.mockResolvedValue(
      storyPayload([reel, { ...reel, id: undefined, user: { ...reel.user, pk: "42" } }] as IgReel[]),
    );
    const result = await fetchReelsMedia([reel.id, "42"]);
    expect(result.reels.map((reel) => reel.id)).toEqual([reel.id, "42"]);
    expect(result.items).toHaveLength(4);
  });

  it("uses the highlights query and preserves a numeric highlight id and title", async () => {
    isGraphqlQueryAvailable.mockReturnValue(true);
    graphqlRequest.mockResolvedValue(storyPayload([{ ...reel, id: "777", title: "Trips" }]));
    const result = await fetchReelsMedia(["highlight:777"]);
    expect(graphqlRequest).toHaveBeenCalledExactlyOnceWith(
      HIGHLIGHTS_QUERY,
      { initial_reel_id: "highlight:777", reel_ids: ["highlight:777"] },
      { maxRetries: 0 },
    );
    expect(result.items[0]?.highlight).toEqual({ id: "highlight:777", name: "Trips" });
    expect(apiGet).not.toHaveBeenCalled();
  });

  it("accepts a genuinely empty GraphQL connection without requesting another endpoint", async () => {
    isGraphqlQueryAvailable.mockReturnValue(true);
    graphqlRequest.mockResolvedValue(storyPayload([]));
    expect(await fetchReelsMedia([reel.id])).toEqual({ reels: [], items: [] });
    expect(apiGet).not.toHaveBeenCalled();
  });

  it("reports an unexpected GraphQL response instead of silently treating it as no files", async () => {
    isGraphqlQueryAvailable.mockReturnValue(true);
    graphqlRequest.mockResolvedValue([{ data: {} }]);
    await expect(fetchReelsMedia([reel.id])).rejects.toThrow("Instagram did not return the story media connection.");
    expect(apiGet).not.toHaveBeenCalled();
  });

  it.each([401, 403, 429, 500])(
    "propagates GraphQL HTTP %i failures without switching endpoints",
    async (statusCode) => {
      isGraphqlQueryAvailable.mockReturnValue(true);
      const error = new Error(`HTTP ${statusCode}`);
      graphqlRequest.mockRejectedValue(error);
      await expect(fetchReelsMedia([reel.id])).rejects.toBe(error);
      expect(graphqlRequest).toHaveBeenCalledTimes(1);
      expect(apiGet).not.toHaveBeenCalled();
    },
  );

  it("uses REST if the GraphQL module becomes unavailable during navigation", async () => {
    isGraphqlQueryAvailable.mockReturnValue(true);
    graphqlRequest.mockRejectedValue(new GraphqlUnavailableError("Query unloaded"));
    apiGet.mockResolvedValue({ data: { reels: { [reel.id]: reel } } });
    expect((await fetchReelsMedia([reel.id])).items).toHaveLength(2);
    expect(apiGet).toHaveBeenCalledTimes(1);
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
    expect(graphqlRequest).not.toHaveBeenCalled();
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
    apiGet.mockResolvedValueOnce({ data: { reels: {} } }).mockResolvedValueOnce({ data: { reel: null } });
    expect(await fetchReelsMedia([reel.id])).toEqual({ reels: [], items: [] });
    expect(apiGet).toHaveBeenCalledTimes(2);
  });

  it("reads the reels_media list when the reels map is empty", async () => {
    apiGet.mockResolvedValue({ data: { reels: {}, reels_media: [reel] } });
    const result = await fetchReelsMedia([reel.id]);
    expect(apiGet).toHaveBeenCalledTimes(1);
    expect(result.reels).toEqual([reel]);
    expect(result.items).toHaveLength(2);
  });

  it("does not duplicate a reel present in both the map and the list", async () => {
    apiGet.mockResolvedValue({ data: { reels: { [reel.id]: reel }, reels_media: [reel] } });
    const result = await fetchReelsMedia([reel.id]);
    expect(result.reels).toEqual([reel]);
    expect(result.items).toHaveLength(2);
  });

  it("uses the user's story feed when the bulk response has no stories for them", async () => {
    apiGet.mockResolvedValueOnce({ data: { reels: {}, reels_media: [] } }).mockResolvedValueOnce({ data: { reel } });
    const result = await fetchReelsMedia([reel.id]);
    expect(apiGet).toHaveBeenLastCalledWith(`/api/v1/feed/user/${reel.id}/story/`, undefined);
    expect(result.reels).toEqual([reel]);
    expect(result.items.map((item) => item.id)).toEqual(["story-photo", "story-video"]);
  });

  it("replaces a bulk reel without items by the user's story feed", async () => {
    apiGet
      .mockResolvedValueOnce({ data: { reels: { [reel.id]: { ...reel, items: [] } } } })
      .mockResolvedValueOnce({ data: { reel } });
    const result = await fetchReelsMedia([reel.id]);
    expect(apiGet).toHaveBeenCalledTimes(2);
    expect(result.reels).toEqual([reel]);
    expect(result.items).toHaveLength(2);
  });

  it("does not look up a story feed for an empty highlight", async () => {
    apiGet.mockResolvedValue({ data: { reels: {} } });
    expect(await fetchReelsMedia(["highlight:123"])).toEqual({ reels: [], items: [] });
    expect(apiGet).toHaveBeenCalledTimes(1);
  });
});

describe("getCurrentStoryId", () => {
  it("prefers the player's visible media over the URL", () => {
    vi.stubGlobal("window", { location: new URL("https://www.instagram.com/stories/someone/123/") });
    highlightState.currentItemId = "456_42";
    expect(getCurrentStoryId()).toBe("456_42");
  });

  it("reads the reported story permalink before the media hook mounts", () => {
    vi.stubGlobal("window", {
      location: new URL("https://www.instagram.com/stories/rylan_oshea/4019954654901283619/"),
    });
    expect(getCurrentStoryId()).toBe("4019954654901283619");
  });

  it.each(["/stories/highlights/123/", "/stories/someone/", "/p/CODE123/"])(
    "does not treat %s as a story media id",
    (path) => {
      vi.stubGlobal("window", { location: new URL(`https://www.instagram.com${path}`) });
      expect(getCurrentStoryId()).toBeUndefined();
    },
  );
});
