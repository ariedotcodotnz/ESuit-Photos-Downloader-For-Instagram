import { APP_SLUG } from "@/shared/constants";
import { requireIg } from "../ig/modules";

const RATE_LIMIT_MARKERS = [
  "1390008",
  "1348007",
  "3252001",
  "1404006",
  "1675004",
  "1404078",
  "Request is too frequent",
  "Rate limit",
  "Temporarily",
  "again later",
  "rate_limit_exceeded",
];

export function isRateLimitError(message: string): boolean {
  return RATE_LIMIT_MARKERS.some((marker) => message.includes(marker));
}

/** Explains well-known failure messages in plain language. */
export function friendlyErrorMessage(message: string): string {
  if (message.includes("it was read from disk")) {
    return "The disk where the download folder is located is either full or disconnected. Please check your disk.";
  }
  if (isRateLimitError(message)) {
    return "Instagram is temporarily limiting requests from your account because of too many API calls. The restriction is usually lifted automatically within 4-8 hours. Please try again later.";
  }
  if (message.includes("HTTP 500 HTTP_SERVER_ERROR")) {
    return "The requested resource seems to be missing on Instagram's side, which typically happens for content from several years ago.";
  }
  return message;
}

/** Pulls a human-readable message out of the many error shapes Instagram's APIs produce. */
export function extractErrorMessage(error: unknown): string {
  if (!error) return "unknown errors";
  const e = error as Record<string, unknown> & Record<number, Record<string, unknown> | undefined>;
  const nested = (value: unknown) => (value as { message?: unknown } | undefined)?.message;
  const candidates = [
    nested(e.error),
    nested(e[0]?.error),
    e.error_subcode ? e.message : undefined,
    nested((e.errors as unknown[] | undefined)?.[0]),
    e[0]?.message,
    e.message,
  ];
  const found = candidates.find((candidate) => typeof candidate === "string" && candidate);
  if (found) return found as string;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export interface ErrorRecord {
  from: string;
  error: string;
  payload?: unknown;
  readableTime: string;
  href: string;
}

const ERROR_RECORDS_KEY = `${APP_SLUG}:error-records`;
const MAX_ERROR_RECORDS = 10;

/** Keeps the last few API failures in localStorage for the downloadable error report. */
export function recordError(from: string, error: string, payload?: unknown): void {
  try {
    const records = getErrorRecords();
    records.unshift({ from, error, payload, readableTime: new Date().toLocaleString(), href: window.location.href });
    localStorage.setItem(ERROR_RECORDS_KEY, JSON.stringify(records.slice(0, MAX_ERROR_RECORDS)));
  } catch (storageError) {
    console.error("Failed to save error record:", storageError);
  }
}

export function getErrorRecords(): ErrorRecord[] {
  try {
    return JSON.parse(localStorage.getItem(ERROR_RECORDS_KEY) ?? "[]") as ErrorRecord[];
  } catch {
    return [];
  }
}

/** Recent errors from Instagram's error log that originated in an extension script. */
export function getInstagramErrorHistory(): unknown[] {
  try {
    return requireIg("ErrorPubSub")
      .history.slice(-10)
      .map((entry) => ({
        message: entry.message,
        name: entry.name,
        type: entry.type,
        project: entry.project,
        script: entry.script,
        line: entry.line,
        clientTime: entry.clientTime,
        loggingSource: entry.loggingSource,
        windowLocationURL: entry.windowLocationURL,
        extensionFrames: (entry.stackFrames ?? [])
          .filter((frame) => frame.script?.includes("chrome-extension://"))
          .map(({ script, line, column }) => ({ script, line, column })),
      }));
  } catch {
    return [];
  }
}

/** Triggers a browser download of an in-memory blob. */
export function saveBlobAs(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.style.display = "none";
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** Bundles an error with recent context into a JSON file the user can attach to a bug report. */
export function downloadErrorReport(error: unknown): void {
  const report = {
    message: {
      errorMsg: extractErrorMessage(error),
      stack: (error as { stack?: string } | undefined)?.stack ?? "",
      description: (error as { description?: string } | undefined)?.description,
    },
    href: window.location.href,
    stacks: getInstagramErrorHistory(),
    errors: getErrorRecords(),
  };
  saveBlobAs(
    new Blob([JSON.stringify(report, null, 2)], { type: "application/json;charset=utf-8" }),
    `${APP_SLUG}-error-report.json`,
  );
}
