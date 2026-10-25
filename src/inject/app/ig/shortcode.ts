const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** Shortcode of the post/reel in a URL such as `https://www.instagram.com/p/CsyUsrKAsnR/`. */
export function shortcodeFromUrl(url: string): string | null {
  return url.match(/\/(p|reels?)\/([^/?#]+)/)?.[2] ?? null;
}

/**
 * Converts a shortcode to the numeric media id: shortcodes are the id written
 * in URL-safe base64. Private posts append a 28-character suffix, which is
 * dropped.
 */
export function shortcodeToMediaId(shortcode: string): string {
  const code = shortcode.length > 28 ? shortcode.substring(0, shortcode.length - 28) : shortcode;
  let id = 0n;
  for (const char of code) id = id * 64n + BigInt(ALPHABET.indexOf(char));
  return id.toString();
}
