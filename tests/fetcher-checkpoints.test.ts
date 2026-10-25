import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchProfilePosts, fetchProfileReels, fetchProfileTagged } from "@/inject/app/fetchers/profile";
import { fetchAllCollections, fetchOwnCollection, fetchOwnSavedPosts } from "@/inject/app/fetchers/saved";
import { DownloadSessionStore } from "@/inject/app/state/download-session";
import { toMediaItems, withAuthor, type IgMedia } from "@/inject/app/media/parse-media";

const mocks = vi.hoisted(() => ({ apiGet: vi.fn(), graphqlRequest: vi.fn(), fetchMediaInfo: vi.fn(), graphql: false }));
vi.mock("@/inject/app/ig/instapi", () => ({ apiGet: mocks.apiGet, fetchMediaInfo: mocks.fetchMediaInfo }));
vi.mock("@/inject/app/ig/graphql", () => ({
  graphqlRequest: mocks.graphqlRequest,
  isGraphqlQueryAvailable: () => mocks.graphql,
  GraphqlUnavailableError: class extends Error {},
}));
vi.mock("@/inject/app/env", () => ({ getHook: () => ({ readRelayRecord: () => undefined }), isDebug: () => false }));
vi.mock("antd", () => ({ message: { info: vi.fn() } }));

const media = (pk: string): IgMedia => ({
  pk,
  code: `code${pk}`,
  media_type: 1,
  taken_at: 0,
  image_versions2: { candidates: [{ url: `https://scontent.cdninstagram.com/${pk}.jpg`, width: 100, height: 100 }] },
  user: { username: "someone" },
});
const target = { id: "123", username: "someone" };

beforeEach(() => {
  mocks.graphql = false;
  mocks.apiGet.mockReset();
  mocks.graphqlRequest.mockReset();
  mocks.fetchMediaInfo.mockReset().mockImplementation(async (id: string) => toMediaItems([withAuthor(media(id))]));
});

describe("profile checkpoints", () => {
  it("resumes REST from the next page, with a replay cursor for a partial first page", async () => {
    mocks.apiGet
      .mockResolvedValueOnce({ items: [media("1")], more_available: true, next_max_id: "next" })
      .mockResolvedValueOnce({ items: [media("2")], more_available: false });
    const first = await fetchProfilePosts({ nextParams: null }, target);
    expect(first.replayCursor).toBe("rest:");
    expect(first.cursorToSave).toBe("rest:next");
    const second = await fetchProfilePosts({ nextParams: null, resumeCursor: first.cursorToSave! }, target);
    expect(mocks.apiGet).toHaveBeenLastCalledWith("/api/v1/feed/user/123/", { query: { count: 12, max_id: "next" } });
    expect(second.items.map((item) => item.id)).toEqual(["2"]);
    expect(second.replayCursor).toBe("rest:next");
    expect(second.cursorToSave).toBeNull();
  });

  it("advances GraphQL post checkpoints to the end cursor", async () => {
    mocks.graphql = true;
    mocks.graphqlRequest.mockResolvedValue([
      {
        data: {
          xdt_api__v1__feed__user_timeline_graphql_connection: {
            edges: [{ node: media("1") }],
            page_info: { has_next_page: true, end_cursor: "next" },
          },
        },
      },
    ]);
    const result = await fetchProfilePosts({ nextParams: null }, target);
    expect(result.replayCursor).toBe("graphql:");
    expect(result.cursorToSave).toBe("graphql:next");
  });

  it("advances a reel listing only after all its detail batches", async () => {
    mocks.graphql = true;
    mocks.graphqlRequest.mockResolvedValue([
      {
        data: {
          xdt_api__v1__clips__user__connection_v2: {
            edges: ["1", "2", "3", "4", "5", "6"].map((pk) => ({ node: { media: media(pk) } })),
            page_info: { has_next_page: true, end_cursor: "next" },
          },
        },
      },
    ]);
    const listing = await fetchProfileReels({ nextParams: null }, target);
    const batch = await fetchProfileReels({ nextParams: listing.nextParams }, target);
    expect(batch.items).toHaveLength(5);
    expect(batch.replayCursor).toBe("graphql:");
    expect(batch.cursorToSave).toBeNull();
    const finalBatch = await fetchProfileReels({ nextParams: batch.nextParams }, target);
    expect(finalBatch.items).toHaveLength(1);
    expect(finalBatch.replayCursor).toBe("graphql:");
    expect(finalBatch.cursorToSave).toBe("graphql:next");
  });

  it("advances a tagged listing only after its last post", async () => {
    mocks.graphql = true;
    mocks.graphqlRequest.mockResolvedValue([
      {
        data: {
          xdt_api__v1__usertags__user_id__feed_connection: {
            edges: ["1", "2"].map((id) => ({ node: { ...media(id), id } })),
            page_info: { has_next_page: true, end_cursor: "next" },
          },
        },
      },
    ]);
    const listing = await fetchProfileTagged({ nextParams: null }, target);
    const first = await fetchProfileTagged({ nextParams: listing.nextParams }, target);
    const second = await fetchProfileTagged({ nextParams: first.nextParams }, target);
    expect(first.replayCursor).toBe("graphql:");
    expect(first.cursorToSave).toBeNull();
    expect(second.cursorToSave).toBe("graphql:next");
  });
});

describe("saved collections", () => {
  it.each(["🌴", "", "***"])("falls back to the collection id for an empty sanitized name %s", async (name) => {
    mocks.apiGet.mockResolvedValue({ items: [{ media: media("1") }] });
    const result = await fetchOwnCollection({ nextParams: null }, "123", name);
    expect(result.items[0]?.saveFolderPath).toEqual(["Saved", "123"]);
  });

  it("advances saved-post checkpoints to the next page", async () => {
    mocks.apiGet.mockResolvedValue({ items: [{ media: media("1") }], more_available: true, next_max_id: "next" });
    const result = await fetchOwnSavedPosts({ nextParams: null });
    expect(result.replayCursor).toBe("");
    expect(result.cursorToSave).toBe("next");
  });

  it("keeps a shared post in both collection folders", async () => {
    mocks.apiGet
      .mockResolvedValueOnce({
        items: [
          { collection_id: "a", collection_name: "A" },
          { collection_id: "b", collection_name: "B" },
        ],
      })
      .mockResolvedValue({ items: [{ media: media("1") }], more_available: false });
    const first = await fetchAllCollections({ nextParams: null });
    const second = await fetchAllCollections({ nextParams: first.nextParams });
    const session = new DownloadSessionStore();
    session.appendItems(first.items);
    session.appendItems(second.items);
    expect(session.state.items.map((item) => item.saveFolderPath)).toEqual([
      ["Saved", "A"],
      ["Saved", "B"],
    ]);
  });
});
