/**
 * Product identity. Rebrand the extension by editing these values (and the
 * icons in `public/icons`).
 */
export const APP_NAME = "IG Album Downloader";

/**
 * Machine-friendly identifier used to namespace window globals, DOM ids,
 * storage keys and bridge messages so they never clash with Instagram's own
 * code or with other extensions.
 */
export const APP_SLUG = "ig-album-downloader";

export const INSTAGRAM_ORIGIN = "https://www.instagram.com";

/** Match patterns for every page the extension runs on. */
export const HOST_MATCHES = [`${INSTAGRAM_ORIGIN}/*`];

export const CONTEXT_MENU_ID = `${APP_SLUG}-download`;

/**
 * Attribute on `<html>` through which the isolated-world content script hands
 * extension metadata (id, base URL, version) to the MAIN-world scripts, which
 * cannot call `chrome.runtime.getURL` themselves.
 */
export const PAGE_CONTEXT_ATTRIBUTE = `data-${APP_SLUG}-context`;

/**
 * Name of the window global holding the module-hook API that `injects/hook.js`
 * installs at `document_start` and `injects/app.js` consumes later.
 */
export const HOOK_GLOBAL = "__igAlbumDownloaderHook";

/**
 * Names of the parameters that the build wraps around the in-page app bundle.
 * The bundle's externalised `react`, `react-dom` and `react/jsx-runtime`
 * imports resolve to these, and the hook passes Instagram's own instances in.
 * Shared between `vite.config.ts` and the hook so both sides agree.
 */
export const APP_BUNDLE_GLOBALS = {
  react: "__igdl_react",
  reactDom: "__igdl_react_dom",
  jsxRuntime: "__igdl_jsx_runtime",
} as const;
