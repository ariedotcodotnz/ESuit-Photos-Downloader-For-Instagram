import { message } from "antd";
import { sanitizeFolderName } from "@/shared/filename";
import { apiGet } from "../ig/instapi";
import { getCurrentRoute } from "../ig/route";
import { toMediaItems, withAuthor, type IgMedia } from "../media/parse-media";
import type { FetchContext, FetchResult, MediaItem } from "../media/types";

/** Instagram's implicit "All Posts" collection. */
const ALL_POSTS_COLLECTION = "ALL_MEDIA_AUTO_COLLECTION";

interface SavedFeed {
  items?: { media: IgMedia }[];
  more_available?: boolean;
  next_max_id?: string;
}

interface Collection {
  collection_id: string;
  collection_name: string;
  collection_media_count?: number;
}

interface MaxIdPage {
  maxId?: string;
}

function inFolder(items: MediaItem[], folder: string[]): MediaItem[] {
  return items.map((item) => ({ ...item, saveFolderPath: folder }));
}

async function fetchSavedPage(
  path: string,
  context: FetchContext<MaxIdPage>,
  folder: string[],
): Promise<FetchResult<MaxIdPage>> {
  const maxId = context.resumeCursor ?? context.nextParams?.maxId;
  const feed = await apiGet<SavedFeed>(path, { query: maxId ? { max_id: maxId } : {} });
  return {
    items: inFolder(toMediaItems((feed.items ?? []).map(({ media }) => withAuthor(media))), folder),
    hasMore: !!feed.more_available,
    nextParams: { maxId: feed.next_max_id },
    replayCursor: maxId ?? "",
    cursorToSave: feed.more_available ? feed.next_max_id : null,
  };
}

/** The viewer's own "All Posts" saved list. */
export function fetchOwnSavedPosts(context: FetchContext<MaxIdPage>): Promise<FetchResult<MaxIdPage>> {
  return fetchSavedPage("/api/v1/feed/saved/posts/", context, ["Saved", "All Posts"]);
}

/** One of the viewer's saved collections. */
export function fetchOwnCollection(
  context: FetchContext<MaxIdPage>,
  collectionId: string,
  collectionName?: string,
): Promise<FetchResult<MaxIdPage>> {
  const folderName = sanitizeFolderName(collectionName ?? getCurrentRoute()?.params?.slug ?? "") || collectionId;
  return fetchSavedPage(`/api/v1/feed/collection/${collectionId}/posts/`, context, ["Saved", folderName]);
}

async function listCollections(maxId?: string, collected: Collection[] = []): Promise<Collection[]> {
  const page = await apiGet<{ items: Collection[]; more_available?: boolean; next_max_id?: string }>(
    "/api/v1/collections/list/",
    {
      query: {
        collection_types: '["ALL_MEDIA_AUTO_COLLECTION","MEDIA","AUDIO_AUTO_COLLECTION"]',
        include_public_only: 0,
        get_cover_media_lists: true,
        max_id: maxId,
      },
    },
  );
  collected.push(...page.items);
  return page.more_available ? listCollections(page.next_max_id, collected) : collected;
}

interface AllCollectionsPage {
  collections: Collection[];
  /** Index into `collections` of the collection being downloaded. */
  current: number;
  inner: MaxIdPage | null;
}

/**
 * Every saved collection, one after another, each into its own folder.
 * "All Posts" is skipped unless it is the only collection, because it
 * duplicates the others.
 */
export async function fetchAllCollections(
  context: FetchContext<AllCollectionsPage>,
): Promise<FetchResult<AllCollectionsPage>> {
  let state = context.nextParams;
  if (!state) {
    const all = await listCollections();
    let collections = all.filter(
      (c) => c.collection_id !== ALL_POSTS_COLLECTION && (c.collection_media_count ?? 1) > 0,
    );
    if (collections.length === 0) {
      collections = all.filter((c) => c.collection_id === ALL_POSTS_COLLECTION);
    } else if (all.some((c) => c.collection_id === ALL_POSTS_COLLECTION)) {
      void message.info('Skipping "All Posts"; open it and download it separately if you need it.');
    }
    if (collections.length === 0) return { items: [], hasMore: false, nextParams: null };
    state = { collections, current: 0, inner: null };
  }

  const collection = state.collections[state.current]!;
  const result =
    collection.collection_id === ALL_POSTS_COLLECTION
      ? await fetchOwnSavedPosts({ nextParams: state.inner })
      : await fetchOwnCollection({ nextParams: state.inner }, collection.collection_id, collection.collection_name);

  if (result.hasMore) {
    return { items: result.items, hasMore: true, nextParams: { ...state, inner: result.nextParams } };
  }
  const hasNextCollection = state.current + 1 < state.collections.length;
  return {
    items: result.items,
    hasMore: hasNextCollection,
    nextParams: hasNextCollection ? { ...state, current: state.current + 1, inner: null } : null,
  };
}
