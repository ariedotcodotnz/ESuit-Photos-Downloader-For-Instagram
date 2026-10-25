export type MediaStatus = "waiting" | "done" | "skip" | "error";

/** DASH `SegmentBase` of a single-file (on-demand profile) representation. */
export interface SegmentBase {
  /** Byte range of the `sidx` box, e.g. `"831-1234"`. */
  indexRange?: string;
  timescale?: string;
  FBFirstSegmentRange?: string;
  Initialization: { range?: string };
}

export interface DashStream {
  type: "video" | "audio";
  uri: string;
  /** Quality label for video, e.g. `"1080p"`. */
  label?: string;
  codec?: string;
  segmentBase: SegmentBase;
}

/** The highest-quality separate video and audio streams of a post's DASH manifest. */
export interface DashSources {
  video: DashStream;
  audio: DashStream;
}

/** One downloadable file (a carousel post yields one item per slide). */
export interface MediaItem {
  /** Instagram media pk. */
  id: string;
  thumbnail: string;
  /** Progressive (muxed) URL of the image or video. */
  uri: string;
  /** Shortcode, as in `/p/<code>/`. */
  code?: string;
  authorName: string;
  fullName?: string;
  isVideo: boolean;
  /** Unix seconds. */
  createdAt: number;
  status: MediaStatus;
  /** 1-based slide position within a carousel. */
  carouselIndex?: number;
  /** HD streams for "Auto-Merge"; absent when Instagram serves no DASH manifest. */
  highestSource?: DashSources;
  /** Progressive audio of a reel's sound, when available. */
  audioUrl?: string;
  audioTitle?: string;
  /** Overrides the generated folder structure, e.g. `["Saved", "Travel"]`. */
  saveFolderPath?: string[];
}

/** One page of results from any of the album fetchers. */
export interface FetchResult<TNext = unknown> {
  items: MediaItem[];
  hasMore: boolean;
  /** Passed back as `nextParams` to fetch the following page. */
  nextParams: TNext | null;
  /** Cursor to persist after all items on this page have been processed. */
  cursorToSave?: string | null;
  /** Page/listing to replay on interruption, with its index saved before any files are processed. */
  replayCursor?: string;
  /** Skip the anti-rate-limit pauses before the next page (no request was made). */
  skipWaiting?: boolean;
}

export interface FetchContext<TNext = unknown> {
  nextParams: TNext | null;
  /** Cursor restored from a previous, interrupted download. */
  resumeCursor?: string;
  isSkipDownloadedFile?: boolean;
  isFileIdDownloaded?: (id: string) => boolean;
}

// The pagination state differs per fetcher; callers treat it as opaque.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FetchQuery = (context: FetchContext<any>) => Promise<FetchResult<any>>;
