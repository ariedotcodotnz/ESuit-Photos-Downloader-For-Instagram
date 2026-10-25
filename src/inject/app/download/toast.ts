import { message } from "antd";

/**
 * Progress notifications shown while long operations run (loading FFmpeg,
 * fetching DASH segments, merging). Uses antd's static message API so it works
 * from anywhere, including outside React components.
 */
const KEY = "igdl-progress";
const CLOSE_DELAY_MS = 1_000;

let closeTimer: ReturnType<typeof setTimeout> | undefined;

export function showProgress(content: string): void {
  clearTimeout(closeTimer);
  // duration 0 keeps the message open until closeProgressSoon() is called.
  void message.loading({ content, key: KEY, duration: 0, className: "igdl-progress-message" });
}

/** Closes the progress message shortly after the last update. */
export function closeProgressSoon(): void {
  clearTimeout(closeTimer);
  closeTimer = setTimeout(() => message.destroy(KEY), CLOSE_DELAY_MS);
}

export function showProgressError(content: string): void {
  clearTimeout(closeTimer);
  void message.error({ content, key: KEY, duration: 5 });
}
