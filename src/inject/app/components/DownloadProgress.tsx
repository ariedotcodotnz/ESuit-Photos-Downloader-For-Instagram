import { CheckOutlined, CloseOutlined } from "@ant-design/icons";
import { Alert, Progress, Space, Spin } from "antd";
import { useEffect, useRef, type ReactNode } from "react";
import { FetchCountType } from "@/shared/settings";
import type { MediaStatus } from "../media/types";
import { useDownloaderModal } from "../state/downloader-modal";
import { useDownloadSession, type DownloadSessionState } from "../state/download-session";
import { useSettings } from "../state/settings";

/** Only the most recent thumbnails are rendered, to keep long downloads responsive. */
const VISIBLE_THUMBNAILS = 320;

interface ProgressInfo {
  isKnownTotal: boolean;
  total: number;
  processed: number;
  percent: number;
}

function computeProgress(state: DownloadSessionState, countLimit: number | null): ProgressInfo {
  const { processedCount: processed, scanComplete, totalFound } = state;
  let total = 0;
  let isKnownTotal = false;
  if (countLimit !== null) {
    isKnownTotal = true;
    total = scanComplete ? Math.min(totalFound, countLimit) : countLimit;
  } else if (scanComplete) {
    isKnownTotal = true;
    total = totalFound;
  }
  const denominator = isKnownTotal ? total : totalFound;
  const percent = denominator > 0 ? Math.min(Math.round((processed / denominator) * 100), 100) : 0;
  return { isKnownTotal, total, processed, percent };
}

function StatusOverlay({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "rgba(0,0,0,0.4)",
      }}
    >
      {children}
    </div>
  );
}

function StatusIcon({ status }: { status: MediaStatus }) {
  if (status === "waiting") return null;
  return (
    <StatusOverlay>
      {status === "done" && <CheckOutlined style={{ color: "#A3E636", fontSize: 24 }} />}
      {status === "skip" && <span style={{ fontSize: 14, color: "#fff" }}>skip</span>}
      {status === "error" && <CloseOutlined style={{ fontSize: 24, color: "#f20" }} />}
    </StatusOverlay>
  );
}

function WaitIndicator({ color, children }: { color?: string; children: ReactNode }) {
  return (
    <span>
      <Spin size="small" />
      <span style={{ paddingLeft: 6, color }}>{children}</span>
    </span>
  );
}

/** Progress bar and a live grid of thumbnails with their download status. */
export function DownloadProgress({ overlay }: { overlay?: ReactNode }) {
  const state = useDownloadSession();
  const { settings } = useSettings();
  const { isUseQuantityControl } = useDownloaderModal();
  const gridRef = useRef<HTMLDivElement>(null);
  const countLimit =
    isUseQuantityControl && settings.fetchingCountType === FetchCountType.BY_PHOTOS_COUNT
      ? settings.fetchingCountByPhotosCountValue
      : null;
  const progress = computeProgress(state, countLimit);

  useEffect(() => {
    if (gridRef.current) gridRef.current.scrollTop = gridRef.current.scrollHeight;
  }, [state.items.length]);

  return (
    <Space direction="vertical" size={8} style={{ width: "100%", position: "relative" }}>
      <div>
        {progress.isKnownTotal
          ? `Downloaded ${progress.processed}/${progress.total} (${progress.percent}%)`
          : `Downloaded ${progress.processed} items... scanning`}
      </div>
      <Progress
        percent={progress.percent}
        status={state.scanComplete ? undefined : "active"}
        size="small"
        showInfo={false}
      />
      <div
        ref={gridRef}
        style={{ height: 350, width: "100%", overflow: "auto", overflowX: "hidden", position: "relative" }}
      >
        {state.items.slice(-VISIBLE_THUMBNAILS).map((item) => (
          <div
            key={item.id}
            style={{
              position: "relative",
              display: "inline-block",
              width: 50,
              height: 50,
              marginRight: 8,
              marginBottom: 8,
              background: "rgba(0,0,0,.2)",
              borderRadius: 4,
            }}
          >
            <div
              style={{
                backgroundImage: `url(${item.thumbnail})`,
                width: 50,
                height: 50,
                backgroundPosition: "center",
                backgroundSize: "contain",
                backgroundRepeat: "no-repeat",
                borderRadius: 4,
              }}
            />
            <StatusIcon status={item.status} />
          </div>
        ))}
      </div>
      {overlay}
      <div>
        {state.isFetchingNextPage && <WaitIndicator color="#3b82f6">fetching next page.</WaitIndicator>}
        {state.requestDelayMs > 0 && (
          <WaitIndicator>
            Request delay, please wait for {(state.requestDelayMs / 1000).toFixed(1)} seconds.
          </WaitIndicator>
        )}
        {state.rateLimitWaitMs > 0 && (
          <WaitIndicator color="#DC2625">
            To avoid account restrictions, please wait for {(state.rateLimitWaitMs / 1000).toFixed(1)} seconds.
          </WaitIndicator>
        )}
      </div>
    </Space>
  );
}

export function DownloadSucceeded() {
  const { downloadCount } = useDownloadSession();
  return (
    <div style={{ position: "absolute", inset: 0, padding: 16, backgroundColor: "rgba(0,0,0,.4)" }}>
      <Alert
        type="success"
        message={
          <Space direction="vertical" size={12} style={{ textAlign: "center", width: "100%" }}>
            <p style={{ fontSize: 24, margin: "8px 0px" }}>🎉 Download Successful</p>
            <div>{downloadCount} files</div>
          </Space>
        }
      />
    </div>
  );
}

export function DownloadFailed() {
  return (
    <Alert
      type="error"
      message={<div style={{ textAlign: "center", width: "100%" }}>Unable to download any files.</div>}
    />
  );
}
