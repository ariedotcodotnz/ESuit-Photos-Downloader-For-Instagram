import dayjs from "dayjs";
import { sanitizeFilename, stripInvisibleChars } from "./filename";
import { getUrlBasename, padNumber, stripExtension } from "./url";

/**
 * Filename templates are plain strings in which fields are wrapped in
 * `-**` / `**-`, e.g. `-**username code**-_-**date**-`. The same markers are
 * used as Tagify's mix-mode interpolators, so the editor stores tags in this
 * format directly (sometimes as JSON, e.g. `-**{"value":"date"}**-`).
 */
export const TEMPLATE_OPEN = "-**";
export const TEMPLATE_CLOSE = "**-";

/** Values a template can reference. */
export interface FilenameTemplateData {
  /** 1-based position within the whole download session. */
  index: number;
  /** 1-based position within a carousel post. */
  carouselIndex?: number;
  /** Unix seconds. */
  createdAt: number;
  id: string;
  authorName: string;
  fullName?: string;
  uri: string;
  code?: string;
  audioTitle?: string;
}

export interface FilenameField {
  value: string;
  transformer?: (data: FilenameTemplateData, field: string) => string;
}

const formatDate = (data: FilenameTemplateData, format: string) => dayjs.unix(data.createdAt).format(format);

export const FILENAME_FIELDS: readonly FilenameField[] = [
  {
    value: "user display name",
    transformer: (d) => sanitizeFilename(d.fullName ? d.fullName : d.authorName) || sanitizeFilename(d.authorName),
  },
  { value: "index", transformer: (d) => String(d.index) },
  { value: "date", transformer: (d) => formatDate(d, "YYYY_MM_DD__HH_mm_ss") },
  { value: "time", transformer: (d) => formatDate(d, "HH_mm_ss") },
  { value: "timestamp", transformer: (d) => String(d.createdAt) },
  { value: "short code", transformer: (d) => String(d.code) },
  { value: "file id", transformer: (d) => String(d.id) },
  { value: "username code", transformer: (d) => String(d.authorName) },
  { value: "original name", transformer: (d) => stripExtension(getUrlBasename(d.uri)) },
  { value: "0index", transformer: (d) => padNumber(2, d.index) },
  { value: "00index", transformer: (d) => padNumber(3, d.index) },
  { value: "000index", transformer: (d) => padNumber(4, d.index) },
  { value: "date us", transformer: (d) => formatDate(d, "MM/DD/YYYY") },
  { value: "years", transformer: (d) => formatDate(d, "YYYY") },
  { value: "months", transformer: (d) => formatDate(d, "MM") },
  { value: "days", transformer: (d) => formatDate(d, "DD") },
  { value: "hours", transformer: (d) => formatDate(d, "HH") },
  { value: "minutes", transformer: (d) => formatDate(d, "mm") },
  { value: "seconds", transformer: (d) => formatDate(d, "ss") },
  { value: "audio title", transformer: (d) => sanitizeFilename(d.audioTitle ?? "audio") || "audio" },
  { value: "file no", transformer: (d) => String(d.carouselIndex ?? 1) },
];

/** Sample data used to preview a template in the settings UI. */
export const FILENAME_EXAMPLE_DATA: FilenameTemplateData = {
  id: "442315268221",
  createdAt: 1695526699,
  index: 8,
  carouselIndex: 3,
  uri: "https://scontent.cdninstagram.com/v/t51.2885-15/345242088_283736111641893782_n.jpg",
  authorName: "example.user",
  fullName: "Example User",
  code: "CsyUsrKAsnR",
};

/** Resolves a tag that Tagify may have serialised as JSON (`{"value":"date"}`) to its plain name. */
function readTagName(raw: string): string {
  const name = raw.trim();
  try {
    const parsed: unknown = JSON.parse(name);
    if (parsed && typeof parsed === "object" && "value" in parsed && typeof parsed.value === "string" && parsed.value) {
      return parsed.value;
    }
  } catch {
    // Not JSON: the tag is stored as its plain name.
  }
  return name;
}

export interface RenderFilenameOptions {
  rule: string;
  fields?: readonly FilenameField[];
  data: FilenameTemplateData;
  /** Appended after sanitising, e.g. `.jpg`. */
  ext?: string;
}

/** Expands a filename template into a sanitised filename. */
export function renderFilenameTemplate({
  rule,
  fields = FILENAME_FIELDS,
  data,
  ext = "",
}: RenderFilenameOptions): string {
  const expanded = rule
    .trim()
    .split(TEMPLATE_OPEN)
    .map((chunk) => {
      const parts = chunk.split(TEMPLATE_CLOSE);
      const head = parts[0] ?? "";
      if (head.trim().length === 0) return parts.join("");
      const name = readTagName(head);
      const field = fields.find((f) => f.value === name);
      if (field) parts[0] = field.transformer ? field.transformer(data, name) : name;
      return parts.join("");
    })
    .join("")
    .trim();
  return stripInvisibleChars(sanitizeFilename(expanded) + ext);
}

/** Rewrites JSON-serialised tags to plain names so templates compare and store consistently. */
export function normalizeFilenameTemplate(rule: string): string {
  return stripInvisibleChars(
    rule
      .trim()
      .split(TEMPLATE_OPEN)
      .map((chunk) => {
        const parts = chunk.split(TEMPLATE_CLOSE);
        const head = parts[0] ?? "";
        if (head.trim().length === 0) return parts.join(TEMPLATE_CLOSE);
        parts[0] = readTagName(head);
        return parts.join(TEMPLATE_CLOSE);
      })
      .join(TEMPLATE_OPEN)
      .trim(),
  );
}
