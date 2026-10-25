/** Last path segment of a URL, e.g. `abc_n.jpg`. */
export function getUrlBasename(url: string): string {
  try {
    const { pathname } = new URL(url);
    return pathname.substring(pathname.lastIndexOf("/") + 1);
  } catch {
    const clean = url.split(/[?#]/)[0] ?? "";
    return clean.substring(clean.lastIndexOf("/") + 1);
  }
}

/** Text after the last dot of a URL's basename, e.g. `jpg` or `mp4`. */
export function getUrlExtension(url: string): string {
  const base = getUrlBasename(url);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1) : "";
}

export function stripExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? filename : filename.slice(0, dot);
}

export function padNumber(width: number, value: number): string {
  return String(value).padStart(width, "0");
}
