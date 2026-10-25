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

/** Results of a keyword/hashtag search (`/explore/search/keyword/?q=…`). */
export async function fetchSearchResults(
  context: FetchContext<SearchPage>,
  query: string,
): Promise<FetchResult<SearchPage>> {
  const nextMaxId = context.nextParams?.nextMaxId ?? context.resumeCursor;
  const response = await apiGet<TopSerpResponse>("/api/v1/fbsearch/web/top_serp", {
    query: {
      query,
      ...(nextMaxId ? { next_max_id: nextMaxId } : {}),
      ...(context.nextParams?.rankToken ? { rank_token: context.nextParams.rankToken } : {}),
    },
  });
  return {
    items: toMediaItems(collectMedia(response).map((media) => withAuthor(media))),
    hasMore: !!response.media_grid?.has_more,
    nextParams: { nextMaxId: response.media_grid?.next_max_id, rankToken: response.media_grid?.rank_token },
    cursorToSave: context.nextParams?.nextMaxId,
  };
}
