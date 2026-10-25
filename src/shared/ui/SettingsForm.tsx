import { SettingOutlined } from "@ant-design/icons";
import { Button, Checkbox, Divider, InputNumber, Segmented, Slider, Space, Tooltip } from "antd";
import { useState, type CSSProperties } from "react";
import {
  CONCURRENT_DOWNLOADS_RANGE,
  DownloadType,
  ImageFormat,
  REQUEST_DELAY_RANGE,
  type UserSettings,
} from "../settings";
import { FetchQuantityControl } from "./FetchQuantityControl";
import { FilenameRuleInput } from "./FilenameRuleInput";

const sectionTitle: CSSProperties = { fontSize: 13, fontWeight: 600, marginBottom: 12 };
const section: CSSProperties = { marginBottom: 4 };
const label: CSSProperties = { fontSize: 13, marginRight: 8 };

export interface SettingsFormProps {
  settings: UserSettings;
  onChange(patch: Partial<UserSettings>): void;
  isDark?: boolean;
  /** Show the fetch-quantity control (only meaningful for profile albums). */
  showQuantityControl?: boolean;
  /** Start with the advanced sections expanded. */
  defaultExpanded?: boolean;
  onExpand?(): void;
  /** Lets the host confirm before Full Speed is switched on. */
  confirmFullSpeed?(): Promise<boolean>;
}

/** Every download option, shared by the in-page modal and the options page. */
export function SettingsForm({
  settings,
  onChange,
  isDark = false,
  showQuantityControl = false,
  defaultExpanded = false,
  onExpand,
  confirmFullSpeed,
}: SettingsFormProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const { downloadType } = settings;
  const showsVideoOptions = downloadType !== DownloadType.IMAGES_ONLY && downloadType !== DownloadType.AUDIO_ONLY;
  const showsImageOptions = downloadType !== DownloadType.VIDEOS_ONLY && downloadType !== DownloadType.AUDIO_ONLY;

  const setFullSpeed = async (enabled: boolean) => {
    if (enabled && confirmFullSpeed && !(await confirmFullSpeed())) return;
    onChange({ isFullSpeed: enabled });
  };

  return (
    <Space direction="vertical" size={0} style={{ width: "100%" }}>
      <div style={section}>
        <div style={sectionTitle}>📥 Download Scope</div>
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          <div>
            <span style={label}>Type:</span>
            <Segmented
              size="small"
              value={downloadType}
              onChange={(value) => onChange({ downloadType: value })}
              options={[
                { label: "Both", value: DownloadType.BOTH },
                { label: "Images", value: DownloadType.IMAGES_ONLY },
                { label: "Videos", value: DownloadType.VIDEOS_ONLY },
                { label: "Audio", value: DownloadType.AUDIO_ONLY },
              ]}
            />
          </div>
          {showQuantityControl && <FetchQuantityControl settings={settings} onChange={onChange} />}
        </Space>
      </div>

      {!expanded ? (
        <>
          <Divider style={{ margin: "16px 0 12px" }} />
          <Button
            icon={<SettingOutlined />}
            type="text"
            block
            onClick={() => {
              setExpanded(true);
              onExpand?.();
            }}
          >
            Show advanced settings
          </Button>
        </>
      ) : (
        <>
          <Divider style={{ margin: "16px 0 12px" }} />
          <div style={section}>
            <div style={sectionTitle}>📁 File Output</div>
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              {showsImageOptions && (
                <div>
                  <span style={label}>Image format:</span>
                  <Segmented
                    size="small"
                    value={settings.formatType}
                    onChange={(value) => onChange({ formatType: value })}
                    options={[
                      { label: "original", value: ImageFormat.ORIGINAL },
                      { label: "jpg", value: ImageFormat.JPG },
                      { label: "png", value: ImageFormat.PNG },
                      { label: "webp", value: ImageFormat.WEBP },
                    ]}
                  />
                  {settings.formatType === ImageFormat.PNG && (
                    <div style={{ paddingTop: 4, fontSize: 12 }}>
                      ⚠️ Notice: PNG format will result in larger file sizes.
                    </div>
                  )}
                </div>
              )}
              <div>
                <div style={{ fontSize: 13 }}>File naming rules:</div>
                <FilenameRuleInput
                  rule={settings.filenameFormats}
                  onChange={(filenameFormats) => onChange({ filenameFormats })}
                  theme={isDark ? "dark" : "light"}
                />
              </div>
              <Space size={16}>
                <Checkbox checked={settings.isGenFolder} onChange={(e) => onChange({ isGenFolder: e.target.checked })}>
                  <Tooltip title="Automatically download images into folders based on the author name.">
                    <span>Gen-Folder</span>
                  </Tooltip>
                </Checkbox>
                <Checkbox
                  checked={settings.isSplitFolder}
                  onChange={(e) => onChange({ isSplitFolder: e.target.checked })}
                >
                  <Tooltip title="Split the downloaded images into different folders as posts, reels, tagged, saved.">
                    <span>Split-Folder</span>
                  </Tooltip>
                </Checkbox>
              </Space>
            </Space>
          </div>

          <Divider style={{ margin: "12px 0" }} />
          <div style={section}>
            <div style={sectionTitle}>⚡ Performance</div>
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              <Space size={16} wrap>
                <Checkbox checked={settings.isFullSpeed} onChange={(e) => void setFullSpeed(e.target.checked)}>
                  <Tooltip title="To prevent account restrictions, downloads pause for random intervals. Enable Full Speed to skip the pauses.">
                    <span>⚡ Full Speed</span>
                  </Tooltip>
                </Checkbox>
                <Checkbox
                  checked={settings.isSkipDownloadedFile}
                  onChange={(e) => onChange({ isSkipDownloadedFile: e.target.checked })}
                >
                  <Tooltip title="If the file has already been downloaded before, it will be skipped to reduce network load.">
                    <span>Skip Downloaded</span>
                  </Tooltip>
                </Checkbox>
              </Space>
              <Space size={24} wrap style={{ width: "100%" }}>
                <div>
                  <span style={label}>Concurrent:</span>
                  <Slider
                    value={settings.concurrentDownloads}
                    onChange={(concurrentDownloads) => onChange({ concurrentDownloads })}
                    min={CONCURRENT_DOWNLOADS_RANGE.min}
                    max={CONCURRENT_DOWNLOADS_RANGE.max}
                    step={1}
                    marks={{ 1: "1", 3: "3", 5: "5" }}
                    style={{ width: 160, display: "inline-block", margin: "0 8px", verticalAlign: "middle" }}
                  />
                </div>
                <Tooltip
                  title={
                    settings.isFullSpeed
                      ? 'Does not apply while "⚡ Full Speed" is enabled.'
                      : "Wait between page requests to reduce the risk of rate limiting."
                  }
                >
                  <span>
                    <span style={label}>Request Delay:</span>
                    <InputNumber
                      value={settings.requestDelay}
                      onChange={(value) => onChange({ requestDelay: value ?? 0 })}
                      min={REQUEST_DELAY_RANGE.min}
                      max={REQUEST_DELAY_RANGE.max}
                      step={0.1}
                      addonAfter="s"
                      disabled={settings.isFullSpeed}
                      size="small"
                      style={{ width: 120 }}
                    />
                  </span>
                </Tooltip>
              </Space>
            </Space>
          </div>

          {showsVideoOptions && (
            <>
              <Divider style={{ margin: "12px 0" }} />
              <div style={section}>
                <div style={sectionTitle}>🎬 Video Options</div>
                <Space size={16} wrap>
                  <Checkbox
                    checked={settings.isMergingVideo}
                    onChange={(e) => onChange({ isMergingVideo: e.target.checked })}
                  >
                    <Tooltip title="Downloads the HD video and audio streams separately and merges them with FFmpeg in the browser.">
                      <span>HD Auto-Merge</span>
                    </Tooltip>
                  </Checkbox>
                  <Checkbox
                    checked={settings.isDownloadVideoThumbnail}
                    onChange={(e) => onChange({ isDownloadVideoThumbnail: e.target.checked })}
                  >
                    <Tooltip title="Download the thumbnail of the video while downloading the video.">
                      <span>Download Thumbnail</span>
                    </Tooltip>
                  </Checkbox>
                </Space>
              </div>
            </>
          )}
        </>
      )}
    </Space>
  );
}
