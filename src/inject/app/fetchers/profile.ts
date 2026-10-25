import { getHook } from "../env";
import { graphqlRequest, type GraphqlQuery } from "../ig/graphql";
import { apiGet, fetchMediaInfo } from "../ig/instapi";
import {
  MediaType,
  pickThumbnail,
  toMediaItems,
  withAuthor,
  type IgImageCandidate,
  type IgMedia,
} from "../media/parse-media";
import type { FetchContext, FetchResult, MediaItem } from "../media/types";
import { PROFILE_POSTS_QUERY, PROFILE_REELS_QUERY, PROFILE_TAGGED_QUERY, readConnection } from "./queries";
import { decodeCursor, encodeCursor, pickStrategy, withRestFallback, type FetchStrategy } from "./strategy";

export interface ProfileTarget {
  id: string;
  username: string;
}

/** Paging state shared by the profile fetchers. */
interface ProfilePage {
  strategy: FetchStrategy;
  /** Cursor of the next listing page. */
  cursor: string | null;
  /** Cursor that produced the current listing page (saved while its items are processed). */
  listingCursor?: string | null;
  /** Items found on the listing page whose full details are still to be fetched. */
  pendingIds?: string[];
  pendingItems?: MediaItem[];
  /** Whether the listing has more pages after `cursor`. */
  hasMorePages?: boolean;
}

type ProfileResult = FetchResult<ProfilePage>;

interface V1Feed {
  items?: IgMedia[];
  more_available?: boolean;
  next_max_id?: string | null;
}

function startPage(context: FetchContext<ProfilePage>, query: GraphqlQuery): ProfilePage {
  if (context.nextParams) return context.nextParams;
  const resumed = decodeCursor(context.resumeCursor);
  return { strategy: pickStrategy(query, resumed?.strategy), cursor: resumed?.cursor ?? null };
}

const isFirstPage = (context: FetchContext<ProfilePage>, page: ProfilePage) => !context.nextParams && !page.cursor;

const saveable = (strategy: FetchStrategy, cursor: string | null | undefined) => encodeCursor(strategy, cursor ?? "");

/** Full name from Relay's store when Instagram has loaded the profile. */
function profileFullName(target: ProfileTarget, fallback?: string): string {
  const name = getHook().readRelayRecord(`XDTUserDict:${target.id}`, "full_name");
  return typeof name === "string" && name ? name : (fallback ?? target.username);
}

/** One page of a v1 REST feed (`max_id` pagination). */
async function fetchV1Page(
  path: string,
  page: ProfilePage,
  select: (feed: V1Feed) => IgMedia[],
): Promise<ProfileResult> {
  const cursor = page.strategy === "rest" ? page.cursor : null;
  const feed = await apiGet<V1Feed>(path, { query: { count: 12, ...(cursor ? { max_id: cursor } : {}) } });
  return {
    items: toMediaItems(select(feed).map((media) => withAuthor(media))),
    hasMore: !!feed.more_available,
    nextParams: { strategy: "rest", cursor: feed.next_max_id ?? null },
    replayCursor: saveable("rest", cursor),
    cursorToSave: feed.more_available ? saveable("rest", feed.next_max_id) : null,
  };
}

/** All posts on a profile's main grid. */
export async function fetchProfilePosts(
  context: FetchContext<ProfilePage>,
  target: ProfileTarget,
): Promise<ProfileResult> {
  const page = startPage(context, PROFILE_POSTS_QUERY);
  return withRestFallback<ProfileResult>(
    page.strategy,
    isFirstPage(context, page),
    async () => {
      const payloads = await graphqlRequest(PROFILE_POSTS_QUERY, {
        username: target.username,
        ...(page.cursor ? { after: page.cursor } : {}),
      });
      const connection = readConnection<IgMedia>(payloads, "xdt_api__v1__feed__user_timeline_graphql_connection");
      const nodes = (connection.edges ?? []).map(({ node }) => node);
      const fullName = profileFullName(target, nodes[0]?.user?.full_name);
      return {
        items: toMediaItems(nodes.map((node) => ({ ...node, authorName: target.username, fullName }))),
        hasMore: !!connection.page_info?.has_next_page,
        nextParams: { strategy: "graphql", cursor: connection.page_info?.end_cursor ?? null },
        replayCursor: saveable("graphql", page.cursor),
        cursorToSave: connection.page_info?.has_next_page ? saveable("graphql", connection.page_info.end_cursor) : null,
      };
    },
    () => fetchV1Page(`/api/v1/feed/user/${target.id}/`, page, (feed) => feed.items ?? []),
  );
}

/**
 * A profile's reels. The reels connection lacks HD/DASH details, so each
 * listing page only yields ids; following calls fetch their details five at a
 * time.
 */
export async function fetchProfileReels(
  context: FetchContext<ProfilePage>,
  target: ProfileTarget,
): Promise<ProfileResult> {
  const page = startPage(context, PROFILE_REELS_QUERY);

  if (page.pendingIds?.length) {
    const pendingIds = [...page.pendingIds];
    const batch = pendingIds.splice(0, 5);
    const items = (await Promise.all(batch.map((id) => fetchMediaInfo(id)))).flat();
    return {
      items,
      hasMore: pendingIds.length > 0 || !!page.hasMorePages,
      nextParams: { ...page, pendingIds },
      replayCursor: saveable(page.strategy, page.listingCursor),
      cursorToSave: pendingIds.length === 0 && page.hasMorePages ? saveable(page.strategy, page.cursor) : null,
    };
  }

  return withRestFallback<ProfileResult>(
    page.strategy,
    isFirstPage(context, page),
    async () => {
      const payloads = await graphqlRequest(PROFILE_REELS_QUERY, {
        data: { include_feed_video: true, page_size: 12, target_user_id: target.id },
        ...(page.cursor ? { after: page.cursor } : {}),
      });
      const connection = readConnection<{ media: IgMedia }>(payloads, "xdt_api__v1__clips__user__connection_v2");
      const pendingIds = (connection.edges ?? []).map(({ node }) => node.media.pk);
      const hasMorePages = !!connection.page_info?.has_next_page;
      return {
        items: [],
        hasMore: hasMorePages || pendingIds.length > 0,
        nextParams: {
          strategy: "graphql",
          cursor: connection.page_info?.end_cursor ?? null,
          listingCursor: page.cursor,
          pendingIds,
          hasMorePages,
        },
        replayCursor: saveable("graphql", page.cursor),
        cursorToSave:
          pendingIds.length === 0 && hasMorePages ? saveable("graphql", connection.page_info?.end_cursor) : null,
      };
    },
    // REST fallback: the reels that also appear on the profile feed.
    () =>
      fetchV1Page(`/api/v1/feed/user/${target.id}/`, page, (feed) =>
        (feed.items ?? []).filter((media) => media.product_type === "clips"),
      ),
  );
}

interface TaggedNode {
  id: string;
  pk?: string;
  media_type: number;
  taken_at_timestamp?: number;
  taken_at?: number;
  owner?: { username?: string; full_name?: string };
  image_versions2?: { candidates?: IgImageCandidate[] };
}

function toPlaceholder(node: TaggedNode): MediaItem {
  const thumbnail = pickThumbnail(node.image_versions2?.candidates ?? []) ?? "";
  return {
    id: node.pk ?? node.id,
    thumbnail,
    uri: thumbnail,
    authorName: node.owner?.username ?? "",
    fullName: node.owner?.full_name ?? "",
    isVideo: node.media_type === MediaType.VIDEO,
    createdAt: node.taken_at_timestamp ?? node.taken_at ?? 0,
    status: "waiting",
  };
}

/**
 * Posts a profile is tagged in. The GraphQL listing only has thumbnails, so
 * each post's details are fetched one per call; already-downloaded posts are
 * skipped without a request when "Skip Downloaded" is on.
 */
export async function fetchProfileTagged(
  context: FetchContext<ProfilePage>,
  target: ProfileTarget,
): Promise<ProfileResult> {
  const page = startPage(context, PROFILE_TAGGED_QUERY);

  if (page.pendingItems?.length) {
    const pendingItems = [...page.pendingItems];
    const placeholder = pendingItems.shift()!;
    const hasMore = pendingItems.length > 0 || !!page.hasMorePages;
    const nextParams: ProfilePage = { ...page, pendingItems };
    const replayCursor = saveable(page.strategy, page.listingCursor);
    const cursorToSave = pendingItems.length === 0 && page.hasMorePages ? saveable(page.strategy, page.cursor) : null;

    if (context.isSkipDownloadedFile && context.isFileIdDownloaded?.(placeholder.id)) {
      return {
        items: [{ ...placeholder, status: "skip" }],
        hasMore,
        nextParams,
        replayCursor,
        cursorToSave,
        skipWaiting: true,
      };
    }
    try {
      return { items: await fetchMediaInfo(placeholder.id), hasMore, nextParams, replayCursor, cursorToSave };
    } catch (error) {
      console.error(error, placeholder);
      return { items: [{ ...placeholder, status: "error" }], hasMore, nextParams, replayCursor, cursorToSave };
    }
  }

  return withRestFallback<ProfileResult>(
    page.strategy,
    isFirstPage(context, page),
    async () => {
      const payloads = await graphqlRequest(PROFILE_TAGGED_QUERY, {
        user_id: target.id,
        ...(page.cursor ? { after: page.cursor } : {}),
      });
      const connection = readConnection<TaggedNode>(payloads, "xdt_api__v1__usertags__user_id__feed_connection");
      const pendingItems = (connection.edges ?? []).map(({ node }) => toPlaceholder(node));
      const endCursor = connection.page_info?.end_cursor ?? null;
      return {
        items: [],
        hasMore: pendingItems.length > 0 || (!!endCursor && endCursor !== "None"),
        nextParams: {
          strategy: "graphql",
          cursor: endCursor,
          listingCursor: page.cursor,
          pendingItems,
          hasMorePages: !!connection.page_info?.has_next_page,
        },
        replayCursor: saveable("graphql", page.cursor),
        cursorToSave:
          pendingItems.length === 0 && connection.page_info?.has_next_page ? saveable("graphql", endCursor) : null,
      };
    },
    () => fetchV1Page(`/api/v1/usertags/${target.id}/feed/`, page, (feed) => feed.items ?? []),
  );
}
