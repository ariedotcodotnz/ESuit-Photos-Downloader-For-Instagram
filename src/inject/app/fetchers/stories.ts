import { fetchMediaInfo, fetchReelsMedia } from "../ig/instapi";
import { highlightState } from "../ig/route";
import type { FetchContext, FetchQuery, FetchResult } from "../media/types";

/** Downloads several highlight reels, one reel per page. */
export function createHighlightsFetcher(highlightIds: string[]): FetchQuery {
  return async (context: FetchContext<{ remaining: string[] }>): Promise<FetchResult<{ remaining: string[] }>> => {
    const remaining = [...(context.nextParams?.remaining ?? highlightIds)];
    const id = remaining.shift();
    if (!id) return { items: [], hasMore: false, nextParams: null };

    const { reels, items } = await fetchReelsMedia([id]);
    highlightState.current = { id, name: reels.find((reel) => reel.id === id)?.title ?? reels[0]?.title };
    return { items, hasMore: remaining.length > 0, nextParams: { remaining } };
  };
}

/** Downloads the given posts (picked in select mode), one post per page. */
export function createSelectedPostsFetcher(postIds: readonly string[]): FetchQuery {
  return async (context: FetchContext<{ remaining: string[] }>) => {
    const remaining = [...(context.nextParams?.remaining ?? postIds)];
    const id = remaining.shift();
    if (!id) return { items: [], hasMore: false, nextParams: null };
    return { items: await fetchMediaInfo(id), hasMore: remaining.length > 0, nextParams: { remaining } };
  };
}
