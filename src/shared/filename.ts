import { UNPRINTABLE_CHARS } from "./unprintable-chars";

const FORBIDDEN_CHARS = /[?<>\\:*|":]/g;
// eslint-disable-next-line no-control-regex -- stripping control characters is the point
const CONTROL_CHARS = /[\x00-\x1f\x80-\x9f]/g;
const ONLY_DOTS = /^\.+$/;
const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
const EMOJI_AND_SYMBOLS =
  /([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g;

const MAX_FILENAME_LENGTH = 255;

/**
 * Makes a string safe to use as a single path segment on Windows, macOS and
 * Linux: strips emoji, reserved characters, control characters and Windows
 * device names, collapses whitespace and caps the length at 255 UTF-16 units.
 */
export function sanitizeFilename(name: string): string {
  return name
    .trim()
    .replace(EMOJI_AND_SYMBOLS, "")
    .replace(FORBIDDEN_CHARS, "")
    .replace(UNPRINTABLE_CHARS, "")
    .replace(/[\\/]/g, "")
    .replace(CONTROL_CHARS, "")
    .replace(ONLY_DOTS, "")
    .replace(WINDOWS_RESERVED_NAMES, "")
    .replaceAll(". ᴥ", "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_FILENAME_LENGTH)
    .replaceAll("~", "")
    .replaceAll("  ", " ")
    .replaceAll("..", "")
    .trim();
}

/** Like {@link sanitizeFilename}, but also trims leading/trailing dots, which folders must not have. */
export function sanitizeFolderName(name: string): string {
  return sanitizeFilename(name).replace(/^\.+/, "").replace(/\.+$/, "");
}

/** Removes newlines, tabs and every Unicode "Other" (control/format/unassigned) character. */
export function stripInvisibleChars(value: string): string {
  return value.replace(/[\n\t]/g, "").replace(/\p{C}/gu, "");
}
