import { createLogger } from "@/shared/logger";
import { isDebug } from "../env";
import { toMediaItems, withAuthor, type IgImageCandidate, type IgMedia } from "../media/parse-media";
import type { MediaItem } from "../media/types";
import { requireIg, type IgApiGetOptions } from "./modules";

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
  user?: { username?: string; full_name?: string };
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

/** Stories or highlight reels (`highlight:<id>` or a user id for current stories). */
export async function fetchReelsMedia(reelIds: string[]): Promise<{ reels: IgReel[]; items: MediaItem[] }> {
  if (!reelIds.length) return { reels: [], items: [] };

  let reels: IgReel[] = [];
  try {
    reels = reelsOf(await apiGet<IgReelsMediaResponse>("/api/v1/feed/reels_media/", { query: { reel_ids: reelIds } }));
  } catch (error) {
    const status = (error as { statusCode?: unknown } | null)?.statusCode;
    // The bulk endpoint can fail while a user's story feed still works.
    // Do not issue more requests for login, permission or rate-limit errors.
    if (typeof status !== "number" || status < 500 || status >= 600 || !reelIds.every(isUserReelId)) throw error;
    log.warn("Story request failed; trying individual story feeds", error);
  }

  // It can also answer without a user's stories, which the story feed still has.
  const missing = reelIds.filter(
    (id) => isUserReelId(id) && !reels.some((reel) => String(reel.id) === id && reel.items?.length),
  );
  for (const id of missing) {
    const data = await apiGet<{ reel?: IgReel | null }>(`/api/v1/feed/user/${id}/story/`);
    if (data.reel) reels = [...reels.filter((reel) => String(reel.id) !== id), data.reel];
  }
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
      ? mediaItems.map((item) => ({ ...item, highlight: { id: highlightId, name: reel.title } }))
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
