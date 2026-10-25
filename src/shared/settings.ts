/** Which media types a bulk download keeps. */
export enum DownloadType {
  BOTH = "both",
  VIDEOS_ONLY = "VideosOnly",
  IMAGES_ONLY = "ImagesOnly",
  AUDIO_ONLY = "AudioOnly",
}

/** Target image format; `ORIGINAL` keeps whatever the CDN serves. */
export enum ImageFormat {
  ORIGINAL = "none",
  PNG = "image/png",
  JPG = "image/jpeg",
  WEBP = "image/webp",
}

/** How a bulk download decides when to stop paging. */
export enum FetchCountType {
  ALL = 0,
  BY_PHOTOS_COUNT = 1,
  BY_DAYS_COUNT = 2,
  BY_DATE_RANGE = 3,
}

export interface UserSettings {
  /** Skip the randomised anti-rate-limit pauses and the request delay. */
  isFullSpeed: boolean;
  /** Skip media whose id is already in the downloaded-ids history. */
  isSkipDownloadedFile: boolean;
  /** Also save each video's cover image. */
  isDownloadVideoThumbnail: boolean;
  /** Put files in a folder named after the author. */
  isGenFolder: boolean;
  /** Additionally split into posts / reels / tagged / saved / highlights sub-folders. */
  isSplitFolder: boolean;
  downloadType: DownloadType;
  formatType: ImageFormat;
  /** Filename template, see `filename-template.ts`. */
  filenameFormats: string;
  /** Delay between page requests, in seconds. */
  requestDelay: number;
  fetchingCountType: FetchCountType;
  fetchingCountByPhotosCountValue: number;
  fetchingCountByPhotosDaysValue: number;
  /** Unix seconds, inclusive. */
  fetchingDateRangeFrom: number | null;
  /** Unix seconds, inclusive. */
  fetchingDateRangeTo: number | null;
  /** Download the HD DASH video + audio streams and mux them with FFmpeg. */
  isMergingVideo: boolean;
  concurrentDownloads: number;
}

export const FILENAME_PRESETS = [
  "-**original name**-",
  "-**index**-_-**date**-",
  "-**date**-",
  "-**short code**-_-**date**-",
  "-**timestamp**-",
  "-**user display name**-_-**date**-",
  "-**file id**-_-**date**-",
  "-**username code**-_-**timestamp**-",
] as const;

export const DEFAULT_SETTINGS: Readonly<UserSettings> = Object.freeze({
  isFullSpeed: false,
  isSkipDownloadedFile: false,
  isDownloadVideoThumbnail: false,
  isGenFolder: false,
  isSplitFolder: false,
  downloadType: DownloadType.BOTH,
  formatType: ImageFormat.ORIGINAL,
  filenameFormats: FILENAME_PRESETS[0],
  requestDelay: 0,
  fetchingCountType: FetchCountType.ALL,
  fetchingCountByPhotosCountValue: 10,
  fetchingCountByPhotosDaysValue: 3,
  fetchingDateRangeFrom: null,
  fetchingDateRangeTo: null,
  isMergingVideo: false,
  concurrentDownloads: 1,
});

export const CONCURRENT_DOWNLOADS_RANGE = { min: 1, max: 5 } as const;
export const REQUEST_DELAY_RANGE = { min: 0, max: 30 } as const;

/**
 * Applies a change while keeping dependent settings consistent: Split-Folder
 * implies Gen-Folder, and switching the fetch-quantity mode resets its values.
 */
export function applySettingsPatch(current: UserSettings, patch: Partial<UserSettings>): UserSettings {
  const next = { ...current, ...patch };
  if (patch.isSplitFolder === true) next.isGenFolder = true;
  if (patch.isGenFolder === false) next.isSplitFolder = false;
  if (patch.fetchingCountType !== undefined && patch.fetchingCountType !== current.fetchingCountType) {
    next.fetchingCountByPhotosCountValue = DEFAULT_SETTINGS.fetchingCountByPhotosCountValue;
    next.fetchingCountByPhotosDaysValue = DEFAULT_SETTINGS.fetchingCountByPhotosDaysValue;
    next.fetchingDateRangeFrom = DEFAULT_SETTINGS.fetchingDateRangeFrom;
    next.fetchingDateRangeTo = DEFAULT_SETTINGS.fetchingDateRangeTo;
  }
  return next;
}

/** Fills in missing keys and drops unknown ones from a stored settings object. */
export function normalizeSettings(stored: unknown): UserSettings {
  const source = (stored && typeof stored === "object" ? stored : {}) as Partial<Record<keyof UserSettings, unknown>>;
  const result = { ...DEFAULT_SETTINGS } as UserSettings;
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof UserSettings)[]) {
    const value = source[key];
    const fallback = DEFAULT_SETTINGS[key];
    // Nullable settings (the date range) default to null and otherwise hold numbers.
    const isValid = fallback === null ? value === null || typeof value === "number" : typeof value === typeof fallback;
    if (isValid) {
      (result as unknown as Record<string, unknown>)[key] = value;
    }
  }
  return result;
}
