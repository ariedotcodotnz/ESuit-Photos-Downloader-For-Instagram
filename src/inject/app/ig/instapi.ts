import { createLogger } from "@/shared/logger";
import { isDebug } from "../env";
import { extractErrorMessage } from "../download/errors";
import { HIGHLIGHTS_QUERY, STORIES_QUERY, readConnection } from "../fetchers/queries";
import { toMediaItems, withAuthor, type IgImageCandidate, type IgMedia } from "../media/parse-media";
import type { MediaItem } from "../media/types";
import { requireIg, type IgApiGetOptions } from "./modules";
import { GraphqlUnavailableError, graphqlRequest, isGraphqlQueryAvailable } from "./graphql";

const log = createLogger("instapi", isDebug);

/**
 * GET request through Instagram's own v1 API client, which attaches the
 * session cookies, CSRF token and app id headers for us.
 */
export async function apiGet<T>(path: string, options?: IgApiGetOptions): Promise<T> {
  const response = await requireIg("PolarisInstapi").apiGet<T>(path, options);
  return response.data;
}

/** Full details (all carousel slides, HD URLs, DASH manifest) of a single post or reel. */
export async function fetchMediaInfo(mediaId: string): Promise<MediaItem[]> {
  const data = await apiGet<{ items?: IgMedia[] }>(`/api/v1/media/${mediaId}/info/`);
  return toMediaItems((data.items ?? []).map((media) => withAuthor(media)));
}

export interface IgReel {
  id: string;
  title?: string;
  reel_title?: string;
  user?: { pk?: string; pk_id?: string; username?: string; full_name?: string };
  items: IgMedia[];
}

/** Only current stories have a user feed; highlight ids must keep their own API. */
const isUserReelId = (id: string) => /^\d+$/.test(id);

interface IgReelsMediaResponse {
  reels?: Record<string, IgReel>;
  reels_media?: IgReel[];
}

/**
 * Reels of a `reels_media` response. The `reels_media` list is what gallery-dl
 * reads; the keyed `reels` map can be empty while the list is not.
 */
function reelsOf(data: IgReelsMediaResponse): IgReel[] {
  const reels = [...(data.reels_media ?? []), ...Object.values(data.reels ?? {})];
  return reels.filter((reel, index) => reels.findIndex((other) => String(other.id) === String(reel.id)) === index);
}

/** Compatibility path for pages where Instagram has not loaded the story query. */
async function fetchRestReels(reelIds: string[]): Promise<IgReel[]> {
  let reels: IgReel[] = [];
  try {
    reels = reelsOf(await apiGet<IgReelsMediaResponse>("/api/v1/feed/reels_media/", { query: { reel_ids: reelIds } }));
  } catch (error) {
    const status = (error as { statusCode?: unknown } | null)?.statusCode;
    // The bulk endpoint can fail while a user's story feed still works.
    // Do not issue more requests for login, permission or rate-limit errors.
    if (typeof status !== "number" || status < 500 || status >= 600 || !reelIds.every(isUserReelId)) throw error;
    log.debug(`Story request failed (HTTP ${status}); trying individual story feeds: ${extractErrorMessage(error)}`);
  }

  // It can also answer without a user's stories, which the story feed still has.
  const missing = reelIds.filter(
    (id) => isUserReelId(id) && !reels.some((reel) => String(reel.id) === id && reel.items?.length),
  );
  for (const id of missing) {
    const data = await apiGet<{ reel?: IgReel | null }>(`/api/v1/feed/user/${id}/story/`);
    if (data.reel) reels = [...reels.filter((reel) => String(reel.id) !== id), data.reel];
  }
  return reels;
}

/** Uses the same persisted query as the story/highlight viewer. */
async function fetchStoryReels(reelIds: string[]): Promise<IgReel[]> {
  const query = reelIds.every(isUserReelId)
    ? STORIES_QUERY
    : reelIds.every((id) => id.startsWith("highlight:"))
      ? HIGHLIGHTS_QUERY
      : undefined;
  if (!query || !isGraphqlQueryAvailable(query)) return fetchRestReels(reelIds);

  let payloads;
  try {
    payloads = await graphqlRequest(query, { initial_reel_id: reelIds[0], reel_ids: reelIds }, { maxRetries: 0 });
  } catch (error) {
    // A missing module can race with navigation. Other failures must reach the
    // UI without repeating requests or switching endpoints after a rate limit.
    if (error instanceof GraphqlUnavailableError) return fetchRestReels(reelIds);
    throw error;
  }
  const connection = readConnection<IgReel>(payloads, "xdt_api__v1__feed__reels_media__connection");
  if (!Array.isArray(connection.edges)) throw new Error("Instagram did not return the story media connection.");
  // Gallery queries can include adjacent users' reels. Download only the
  // requested reels, including highlights returned with a numeric id.
  return reelsOf({
    reels_media: connection.edges
      .flatMap(({ node }) =>
        node ? [{ ...node, id: String(node.id ?? node.user?.pk ?? node.user?.pk_id ?? "") }] : [],
      )
      .filter((reel) =>
        reelIds.some(
          (id) => String(reel.id) === id || (id.startsWith("highlight:") && String(reel.id) === id.slice(10)),
        ),
      ),
  });
}

/** Stories or highlight reels (`highlight:<id>` or a user id for current stories). */
export async function fetchReelsMedia(reelIds: string[]): Promise<{ reels: IgReel[]; items: MediaItem[] }> {
  if (!reelIds.length) return { reels: [], items: [] };
  const reels = await fetchStoryReels(reelIds);
  const items = reels.flatMap((reel) => {
    const mediaItems = toMediaItems(
      (reel.items ?? []).map((media) =>
        withAuthor(media, { authorName: reel.user?.username, fullName: reel.user?.full_name }),
      ),
    );
    const id = String(reel.id);
    const highlightId = id.startsWith("highlight:")
      ? id
      : reelIds.find((requested) => requested.startsWith("highlight:") && requested.slice("highlight:".length) === id);
    return highlightId
      ? mediaItems.map((item) => ({ ...item, highlight: { id: highlightId, name: reel.title || reel.reel_title } }))
      : mediaItems;
  });
  return { reels, items };
}

export interface IgUserInfo {
  pk: string;
  username: string;
  full_name?: string;
  profile_pic_url?: string;
  profile_pic_url_hd?: string;
  hd_profile_pic_url_info?: { url?: string };
  hd_profile_pic_versions?: IgImageCandidate[];
}

export async function fetchUserInfo(userId: string): Promise<IgUserInfo | undefined> {
  const data = await apiGet<{ user?: IgUserInfo }>(`/api/v1/users/${userId}/info/`);
  return data.user;
}
