import { DatePicker, Divider, Segmented, Slider, Space } from "antd";
import dayjs from "dayjs";
import { FetchCountType, type UserSettings } from "../settings";

const { RangePicker } = DatePicker;

const rangePresets = () => [
  { label: "Last 7 days", value: [dayjs().subtract(7, "day"), dayjs()] as [dayjs.Dayjs, dayjs.Dayjs] },
  { label: "Last 30 days", value: [dayjs().subtract(30, "day"), dayjs()] as [dayjs.Dayjs, dayjs.Dayjs] },
  { label: "Last 90 days", value: [dayjs().subtract(90, "day"), dayjs()] as [dayjs.Dayjs, dayjs.Dayjs] },
  { label: "Last 180 days", value: [dayjs().subtract(180, "day"), dayjs()] as [dayjs.Dayjs, dayjs.Dayjs] },
  { label: "Last 1 year", value: [dayjs().subtract(1, "year"), dayjs()] as [dayjs.Dayjs, dayjs.Dayjs] },
];

interface FetchQuantityControlProps {
  settings: UserSettings;
  onChange(patch: Partial<UserSettings>): void;
}

/** Limits a bulk download to a number of files, recent days or a date range. */
export function FetchQuantityControl({ settings, onChange }: FetchQuantityControlProps) {
  const type = settings.fetchingCountType;
  const { fetchingDateRangeFrom: from, fetchingDateRangeTo: to } = settings;

  return (
    <div>
      <p style={{ paddingBottom: 4, marginBottom: 0, marginTop: 12 }}>Photos fetch quantity control:</p>
      <Segmented
        size="small"
        value={type}
        onChange={(value) => onChange({ fetchingCountType: value })}
        options={[
          { label: "Fetch ALL", value: FetchCountType.ALL },
          { label: "By count", value: FetchCountType.BY_PHOTOS_COUNT },
          { label: "By days", value: FetchCountType.BY_DAYS_COUNT },
          { label: "By date range", value: FetchCountType.BY_DATE_RANGE },
        ]}
      />
      {type !== FetchCountType.ALL && <Divider style={{ margin: "8px 0" }} />}

      {type === FetchCountType.BY_PHOTOS_COUNT && (
        <Space>
          <span>Numbers of photos to fetch:</span>
          <Slider
            min={1}
            max={1000}
            value={settings.fetchingCountByPhotosCountValue}
            onChange={(value) => onChange({ fetchingCountByPhotosCountValue: value })}
            style={{ width: 400 }}
          />
          <span>{settings.fetchingCountByPhotosCountValue}</span>
        </Space>
      )}

      {type === FetchCountType.BY_DAYS_COUNT && (
        <Space>
          <span>Days back to fetch:</span>
          <Slider
            min={1}
            max={180}
            value={settings.fetchingCountByPhotosDaysValue}
            onChange={(value) => onChange({ fetchingCountByPhotosDaysValue: value })}
            style={{ width: 200 }}
          />
          <span>{settings.fetchingCountByPhotosDaysValue}</span>
        </Space>
      )}

      {type === FetchCountType.BY_DATE_RANGE && (
        <Space>
          <span>Date range:</span>
          <RangePicker
            size="small"
            presets={rangePresets()}
            disabledDate={(date) => date && date > dayjs().endOf("day")}
            value={[from ? dayjs.unix(from) : null, to ? dayjs.unix(to) : null]}
            onChange={(dates) =>
              onChange({
                fetchingDateRangeFrom: dates?.[0] ? dates[0].startOf("day").unix() : null,
                fetchingDateRangeTo: dates?.[1] ? dates[1].endOf("day").unix() : null,
              })
            }
          />
        </Space>
      )}
    </div>
  );
}
