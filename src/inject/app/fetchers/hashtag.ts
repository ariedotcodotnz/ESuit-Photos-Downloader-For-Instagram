import { uniqBy } from "lodash-es";
import { apiGet } from "../ig/instapi";
import { toMediaItems, withAuthor, type IgMedia } from "../media/parse-media";
import type { FetchContext, FetchResult } from "../media/types";

interface SearchSection {
  layout_content: {
    medias?: { media?: IgMedia }[];
    media?: IgMedia[];
    two_by_two_item?: { channel?: { media?: IgMedia } };
  };
}

interface TopSerpResponse {
  media_grid?: {
    sections?: SearchSection[];
    has_more?: boolean;
    next_max_id?: string;
    rank_token?: string;
  };
}

interface SearchPage {
  nextMaxId?: string;
  rankToken?: string;
}

function collectMedia(response: TopSerpResponse): IgMedia[] {
  const medias: IgMedia[] = [];
  for (const { layout_content: content } of response.media_grid?.sections ?? []) {
    for (const entry of content.medias ?? []) if (entry.media) medias.push(entry.media);
    if (content.media) medias.push(...content.media);
    const featured = content.two_by_two_item?.channel?.media;
    if (featured) medias.push(featured);
  }
  return uniqBy(medias, (media) => media.id ?? media.pk);
}

function encodeSearchCursor(nextMaxId?: string, rankToken?: string): string {
  if (!nextMaxId) return "";
  return rankToken ? JSON.stringify({ nextMaxId, rankToken }) : nextMaxId;
}

function decodeSearchCursor(saved: string | undefined): SearchPage {
  if (!saved) return {};
  if (saved.startsWith("{")) {
    try {
      const parsed = JSON.parse(saved) as SearchPage;
      if (typeof parsed.nextMaxId === "string") return parsed;
    } catch {
      // Treat as a raw next_max_id cursor.
    }
  }
  return { nextMaxId: saved };
}

/** Results of a keyword/hashtag search (`/explore/search/keyword/?q=…`). */
export async function fetchSearchResults(
  context: FetchContext<SearchPage>,
  query: string,
): Promise<FetchResult<SearchPage>> {
  const current = context.nextParams ?? decodeSearchCursor(context.resumeCursor);
  const { nextMaxId, rankToken } = current;
  const response = await apiGet<TopSerpResponse>("/api/v1/fbsearch/web/top_serp", {
    query: {
      query,
      ...(nextMaxId ? { next_max_id: nextMaxId } : {}),
      ...(rankToken ? { rank_token: rankToken } : {}),
    },
  });
  const nextCursor = response.media_grid?.next_max_id || undefined;
  const nextRankToken = response.media_grid?.rank_token ?? rankToken;
  const hasMore = !!response.media_grid?.has_more && !!nextCursor;
  return {
    items: toMediaItems(collectMedia(response).map((media) => withAuthor(media))),
    hasMore,
    nextParams: { nextMaxId: nextCursor, rankToken: nextRankToken },
    replayCursor: encodeSearchCursor(nextMaxId, rankToken),
    cursorToSave: hasMore ? encodeSearchCursor(nextCursor, nextRankToken) : null,
  };
}
