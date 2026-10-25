import dayjs from "dayjs";
import { FetchCountType, type UserSettings } from "@/shared/settings";
import type { MediaItem } from "../media/types";

type QuantitySettings = Pick<
  UserSettings,
  | "fetchingCountType"
  | "fetchingCountByPhotosCountValue"
  | "fetchingCountByPhotosDaysValue"
  | "fetchingDateRangeFrom"
  | "fetchingDateRangeTo"
>;

export interface QuantityLimitResult {
  items: MediaItem[];
  /** True once the limit is reached and no further pages should be fetched. */
  reached: boolean;
}

/**
 * Applies the "fetch quantity" setting to a newly fetched page. Feeds are
 * newest first, so for the date-based modes a page made up entirely of older
 * items means the limit has been passed.
 */
export function applyQuantityLimit(
  items: MediaItem[],
  settings: QuantitySettings,
  alreadyFound: number,
  now: dayjs.Dayjs = dayjs(),
): QuantityLimitResult {
  if (items.length === 0) return { items, reached: false };

  switch (settings.fetchingCountType) {
    case FetchCountType.BY_PHOTOS_COUNT: {
      const limit = settings.fetchingCountByPhotosCountValue;
      if (alreadyFound + items.length < limit) return { items, reached: false };
      return { items: items.slice(0, Math.max(0, limit - alreadyFound)), reached: true };
    }

    case FetchCountType.BY_DAYS_COUNT: {
      const cutoff = now
        .subtract(settings.fetchingCountByPhotosDaysValue - 1, "day")
        .startOf("day")
        .unix();
      const recent = items.filter((item) => item.createdAt >= cutoff);
      return { items: recent, reached: recent.length === 0 };
    }

    case FetchCountType.BY_DATE_RANGE: {
      const { fetchingDateRangeFrom: from, fetchingDateRangeTo: to } = settings;
      if (from === null && to === null) return { items, reached: false };
      const inRange = items.filter(
        (item) => !((to !== null && item.createdAt > to) || (from !== null && item.createdAt < from)),
      );
      const allOlder = from !== null && items.every((item) => item.createdAt < from);
      return { items: inRange, reached: allOlder };
    }

    default:
      return { items, reached: false };
  }
}
