import { sanitizeFolderName } from "@/shared/filename";
import { getPageName } from "../ig/route";
import type { IgRouteContextValue } from "../ig/modules";
import type { FetchQuery } from "../media/types";
import { fetchSearchResults } from "./hashtag";
import { fetchProfilePosts, fetchProfileReels, fetchProfileTagged } from "./profile";
import { fetchAllCollections, fetchOwnCollection, fetchOwnSavedPosts } from "./saved";

export interface RouteAlbum {
  /** Identifies the album for resumable downloads; empty when resuming is not supported. */
  collectionId: string;
  /** Folder used by "Gen-Folder" instead of each post's author. */
  folderName: string;
  fetchQuery: FetchQuery | null;
  /** Whether the fetch-quantity controls apply (profile pages). */
  isProfile: boolean;
}

/** Works out what "Download Whole Album" should download on the current page. */
export function resolveRouteAlbum(route: IgRouteContextValue | null): RouteAlbum {
  const pageName = getPageName(route);
  const params = route?.params ?? {};
  const none: RouteAlbum = { collectionId: "", folderName: "", fetchQuery: null, isProfile: false };

  if (pageName === "KeywordSearchExplorePage" && params.q) {
    const query = params.q;
    const folder = sanitizeFolderName(query);
    return {
      collectionId: folder,
      folderName: folder,
      isProfile: false,
      fetchQuery: (c) => fetchSearchResults(c, query),
    };
  }

  if (pageName === "SavedCollectionPage") {
    if (!params.collection_id && params.slug === "all-posts") {
      return { ...none, fetchQuery: fetchOwnSavedPosts };
    }
    if (params.collection_id) {
      const collectionId = params.collection_id;
      return {
        ...none,
        collectionId: `${collectionId}_${params.slug}`,
        fetchQuery: (c) => fetchOwnCollection(c, collectionId),
      };
    }
  }

  if (pageName === "profilePage") {
    const id = route?.rootView?.props?.id;
    const username = params.username ?? "";
    if (id) {
      const target = { id, username };
      switch (params.tab) {
        case undefined:
          return {
            collectionId: `${id}_posts`,
            folderName: username,
            isProfile: true,
            fetchQuery: (c) => fetchProfilePosts(c, target),
          };
        case "reels":
          return {
            collectionId: `${id}_reels`,
            folderName: username,
            isProfile: true,
            fetchQuery: (c) => fetchProfileReels(c, target),
          };
        case "tagged":
          return {
            collectionId: `${id}_tagged`,
            folderName: username,
            isProfile: true,
            fetchQuery: (c) => fetchProfileTagged(c, target),
          };
        case "saved":
          return { ...none, isProfile: true, fetchQuery: fetchAllCollections };
      }
    }
  }

  return none;
}
