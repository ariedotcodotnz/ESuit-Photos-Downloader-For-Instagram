import { getHighestSources } from "./dash-manifest";
import type { MediaItem } from "./types";

/** Media type codes used by Instagram's v1 API (`PolarisMediaConstants.MediaTypes`). */
export const MediaType = {
  IMAGE: 1,
  VIDEO: 2,
  CAROUSEL: 8,
} as const;

export interface IgImageCandidate {
  url: string;
  width: number;
  height: number;
}

/** The subset of Instagram's v1 media object the downloader reads. */
export interface IgMedia {
  pk: string;
  id?: string;
  code?: string;
  media_type: number;
  product_type?: string;
  taken_at: number;
  image_versions2?: { candidates?: IgImageCandidate[] };
  video_versions?: IgImageCandidate[];
  video_dash_manifest?: string | null;
  carousel_media?: IgMedia[];
  user?: { pk?: string; username?: string; full_name?: string };
  owner?: { username?: string; full_name?: string };
  clips_metadata?: {
    original_sound_info?: { progressive_download_url?: string; original_audio_title?: string } | null;
    music_info?: { music_asset_info?: { progressive_download_url?: string; title?: string } | null } | null;
  } | null;
}

/** A media object annotated with the author's names, ready for {@link toMediaItems}. */
export interface AuthoredMedia extends IgMedia {
  authorName: string;
  fullName?: string;
}

const isSquare = (c: IgImageCandidate) => c.width === c.height;
const area = (c: IgImageCandidate) => c.width * c.height;

/** Largest candidate, preferring the original (non-square) aspect ratio. */
export function pickLargest(candidates: IgImageCandidate[]): string | undefined {
  return [...candidates].sort((a, b) => {
    if (isSquare(a) && isSquare(b)) return area(b) - area(a);
    if (isSquare(a)) return 1;
    if (isSquare(b)) return -1;
    return area(b) - area(a);
  })[0]?.url;
}

/** Smallest candidate, preferring square crops: a grid-style thumbnail. */
export function pickThumbnail(candidates: IgImageCandidate[]): string | undefined {
  return [...candidates].sort((a, b) => {
    if (isSquare(a) && isSquare(b)) return area(a) - area(b);
    if (isSquare(a)) return -1;
    if (isSquare(b)) return 1;
    return area(a) - area(b);
  })[0]?.url;
}

/** Attaches author names taken from the media's own `user` field. */
export function withAuthor(media: IgMedia, fallback?: { authorName?: string; fullName?: string }): AuthoredMedia {
  return {
    ...media,
    authorName: media.user?.username ?? media.owner?.username ?? fallback?.authorName ?? "",
    fullName: media.user?.full_name ?? media.owner?.full_name ?? fallback?.fullName,
  };
}

function toVideoItem(media: AuthoredMedia): MediaItem | undefined {
  const images = media.image_versions2?.candidates ?? [];
  if (images.length === 0) return undefined;
  const sound = media.clips_metadata?.original_sound_info;
  const music = media.clips_metadata?.music_info?.music_asset_info;
  return {
    id: media.pk,
    thumbnail: pickLargest(images) ?? "",
    uri: pickLargest(media.video_versions ?? []) ?? "",
    code: media.code,
    authorName: media.authorName,
    fullName: media.fullName,
    isVideo: true,
    createdAt: media.taken_at,
    status: "waiting",
    carouselIndex: 1,
    highestSource: getHighestSources(media.video_dash_manifest),
    audioUrl: sound?.progressive_download_url || music?.progressive_download_url || undefined,
    audioTitle: sound?.original_audio_title || music?.title || undefined,
  };
}

function toImageItem(media: AuthoredMedia): MediaItem | undefined {
  const images = media.image_versions2?.candidates ?? [];
  if (images.length === 0) return undefined;
  return {
    id: media.pk,
    thumbnail: pickThumbnail(images) ?? "",
    uri: pickLargest(images) ?? "",
    code: media.code,
    authorName: media.authorName,
    fullName: media.fullName,
    isVideo: false,
    createdAt: media.taken_at,
    status: "waiting",
    carouselIndex: 1,
    highestSource: getHighestSources(media.video_dash_manifest),
  };
}

/** Converts one media object into download items (several for a carousel). */
export function toMediaItemsFromMedia(media: AuthoredMedia): MediaItem[] {
  switch (media.media_type) {
    case MediaType.VIDEO:
      return [toVideoItem(media)].filter((item): item is MediaItem => !!item);
    case MediaType.IMAGE:
      return [toImageItem(media)].filter((item): item is MediaItem => !!item);
    case MediaType.CAROUSEL:
      return (media.carousel_media ?? []).flatMap((slide, index) =>
        toMediaItemsFromMedia({
          ...slide,
          // Slides carry neither the post's timestamp nor its shortcode.
          taken_at: media.taken_at,
          code: media.code,
          authorName: media.authorName,
          fullName: media.fullName,
        }).map((item) => ({ ...item, carouselIndex: index + 1 })),
      );
    default:
      return [];
  }
}

export function toMediaItems(medias: AuthoredMedia[]): MediaItem[] {
  return medias.flatMap(toMediaItemsFromMedia);
}
