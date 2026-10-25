import type { GraphqlQuery } from "../ig/graphql";

/*
 * Persisted GraphQL operations used by the profile fetchers. The document ids
 * are read from Instagram's own loaded modules at runtime (see graphql.ts);
 * only the default variables live here. The original extension downloaded
 * both from its vendor's server instead.
 */

export const PROFILE_POSTS_QUERY: GraphqlQuery = {
  name: "PolarisProfilePostsTabContentQuery_connection",
  variables: {
    data: {
      count: 12,
      include_reel_media_seen_timestamp: true,
      include_relationship_info: true,
      latest_besties_reel_media: true,
      latest_reel_media: true,
    },
    before: null,
    first: 12,
    last: null,
  },
};

export const PROFILE_REELS_QUERY: GraphqlQuery = {
  name: "PolarisProfileReelsTabContentQuery_connection",
  variables: { before: null, first: 12, last: null },
};

export const PROFILE_TAGGED_QUERY: GraphqlQuery = {
  name: "PolarisProfileTaggedTabContentQuery_connection",
  variables: { before: null, count: 12, first: 12, last: null },
};

export interface GraphqlConnection<TNode> {
  edges?: { node: TNode }[];
  page_info?: { has_next_page?: boolean; end_cursor?: string | null };
}

/** `data[key]` of the first payload chunk. */
export function readConnection<TNode>(payloads: { data?: unknown }[], key: string): GraphqlConnection<TNode> {
  return ((payloads[0]?.data as Record<string, unknown> | undefined)?.[key] ?? {}) as GraphqlConnection<TNode>;
}
