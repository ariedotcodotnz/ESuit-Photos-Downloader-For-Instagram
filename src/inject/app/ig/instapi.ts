import { toMediaItems, withAuthor, type IgMedia } from "../media/parse-media";
import type { MediaItem } from "../media/types";
import { requireIg, type IgApiGetOptions } from "./modules";

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

/** Stories or highlight reels (`highlight:<id>` or a user id for current stories). */
export async function fetchReelsMedia(reelIds: string[]): Promise<{ reels: IgReel[]; items: MediaItem[] }> {
  const data = await apiGet<{ reels?: Record<string, IgReel> }>("/api/v1/feed/reels_media/", {
    query: { reel_ids: reelIds },
  });
  const reels = Object.values(data.reels ?? {});
  const items = reels.flatMap((reel) =>
    toMediaItems(
      reel.items.map((media) => withAuthor(media, { authorName: reel.user?.username, fullName: reel.user?.full_name })),
    ),
  );
  return { reels, items };
}

export interface IgUserInfo {
  pk: string;
  username: string;
  full_name?: string;
  profile_pic_url?: string;
  hd_profile_pic_url_info?: { url?: string };
}

export async function fetchUserInfo(userId: string): Promise<IgUserInfo | undefined> {
  const data = await apiGet<{ user?: IgUserInfo }>(`/api/v1/users/${userId}/info/`);
  return data.user;
}
