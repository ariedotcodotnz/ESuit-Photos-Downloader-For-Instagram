# IG Album Downloader

A Chrome (Manifest V3) extension that bulk-downloads photos, videos and reels from Instagram: whole
profiles (posts, reels, tagged), saved collections, highlights, stories and keyword searches, or posts
picked one by one. It is a clean TypeScript rewrite of the compiled extension
"ESUIT | Photos Downloader for Instagram™" v3.13.2, kept for reference in
[`reference/original-build/`](reference/original-build). The analysis of that build, the detected
libraries and a map from its minified code to this source tree are in
[docs/REVERSE_ENGINEERING.md](docs/REVERSE_ENGINEERING.md).

## Features

- **Download Whole Album** from Instagram's sidebar: profile posts, reels and tagged posts, all saved
  collections, a single saved collection, or keyword search results.
- **Select mode**: tick posts in any grid, then download only those.
- **Quick downloads**: an icon next to the save button of posts/reels (whole post, current carousel
  slide, or pick files), story/highlight player buttons, "Download Highlights", HD profile pictures,
  reel audio only, <kbd>Ctrl/⌘</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd> and a right-click menu entry.
- **HD Auto-Merge**: downloads the separate DASH video/audio streams and muxes them with ffmpeg.wasm.
- Filename templates (`-**username code**-_-**date**-` …) with a tag editor and presets, author
  folders and posts/reels/tagged/saved/highlights sub-folders, image re-encoding (jpg/png/webp).
- Skip already-downloaded files, resume interrupted downloads, limit by count / days / date range,
  concurrency, request delay and automatic pauses to avoid rate limits.

## Getting started

```sh
npm ci
npm run build          # → dist/
```

Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked** and pick `dist/`.
Then open instagram.com while logged in. Requires Chrome 111+.

| Script             |                                                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`      | Rebuild all targets on change (reload the extension afterwards)                                                              |
| `npm run check`    | Typecheck, lint, unit tests and build                                                                                        |
| `npm test`         | Unit tests (Vitest), including parity tests against the original bundle                                                      |
| `npm run test:e2e` | Builds, loads the extension in Chromium and drives it on a mock Instagram page (needs Playwright, see `tests/e2e/smoke.mjs`) |
| `npm run icons`    | Regenerates `public/icons` (Python + Pillow)                                                                                 |

## How it works

Instagram renders with React on top of Meta's in-page module system (`__d` / `require`). The extension
patches that module system to place its UI _inside_ Instagram's own components.

```
            ┌──────────────── www.instagram.com tab ────────────────┐
            │ content/bridge.js (isolated world, document_start)    │
            │   publishes extension id/URL on <html>, relays events │
            │ injects/hook.js (MAIN world, document_start)          │
            │   intercepts __d; wraps Polaris* components;          │
            │   resolves Instagram's React for the app bundle       │
            │ injects/app.js (MAIN world, document_end)             │
            │   antd UI bound to Instagram's React; Instagram API   │
            │   client; download pipeline; ffmpeg.wasm Worker       │
            └───────────────┬───────────────────────▲───────────────┘
  chrome.runtime.sendMessage│ (externally_connectable)│ tabs.sendMessage → postMessage
            ┌───────────────▼───────────────────────┴───────────────┐
            │ background.js (service worker): settings & history     │
            │ storage, chrome.downloads, context menu                │
            └────────────────────────────────────────────────────────┘
```

- **`src/inject/hook/`** — intercepts `window.__d` before Instagram defines its modules. Registered
  components (see `src/inject/shared/patch-targets.ts`) are wrapped so the original renders first and
  injected components receive its output (`lastElement`) to decorate. It can also patch module source
  text, and exposes Relay's record store.
- **`src/inject/app/`** — the in-page application. `vite.config.ts` builds it with `react`,
  `react-dom` and `react/jsx-runtime` externalised and wraps the bundle so it only evaluates once the
  hook has resolved Instagram's React (antd reads `React.version` at load time).
  - `ig/` typed access to Instagram internals (`modules.ts` lists every module relied upon),
    `instapi.ts` (v1 REST via Instagram's client), `graphql.ts` (persisted queries)
  - `fetchers/` one paginated source per album type; GraphQL with REST fallbacks
  - `download/` filename/folder logic, DASH segment download, FFmpeg merge, image conversion,
    File System Access writes
  - `state/`, `hooks/`, `components/` React state, the download loop and UI
- **`src/background/`** — RPC server for the page (`page-api.ts`, origin-checked), storage-backed
  handlers, guarded `chrome.downloads`, context menu.
- **`src/shared/`** — settings model, storage buckets, filename sanitising and templates, and the
  settings form shared by the in-page modal and the options page.
- **`src/pages/`** — popup (launcher and help) and options page (settings, history, resume points).
- **`src/manifest.ts`** — the manifest and the declarativeNetRequest ruleset, emitted at build time.

### Build targets

`scripts/build.mjs` runs each Vite target from `vite.config.ts` into `dist/`:

| Target    | Output                                                                   | Format                               |
| --------- | ------------------------------------------------------------------------ | ------------------------------------ |
| `pages`   | `background.js`, `pages/*`, `manifest.json`, `rules/csp.json`, `public/` | ES modules                           |
| `content` | `content/bridge.js`                                                      | IIFE                                 |
| `hook`    | `injects/hook.js`                                                        | IIFE                                 |
| `app`     | `injects/app.js`, `injects/app.css`                                      | IIFE, wrapped for Instagram's React  |
| `worker`  | `injects/ffmpeg-worker.js`                                               | ES module (started from a blob: URL) |

Builds use ASCII output: Chrome refuses content scripts containing Unicode noncharacters (one comes
from fast-xml-parser's XML-name regex) and reports them as "not UTF-8 encoded".

## Maintenance

Instagram changes its internals often. When something stops working:

1. Check the browser console on instagram.com; add `?debug` to the URL for verbose logs.
2. Component names to patch live in `src/inject/shared/patch-targets.ts`; the props each injected
   component reads are typed next to its registration in `components/injected/register.tsx`.
3. Every Instagram module the app requires is declared in `src/inject/app/ig/modules.ts`.
4. GraphQL query names and default variables are in `src/inject/app/fetchers/queries.ts`. Document
   ids are discovered from Instagram's loaded `<name>.graphql` modules; when unavailable, the profile
   fetchers fall back to the v1 REST feeds.

To rebrand, change `APP_NAME`/`APP_SLUG` in `src/shared/constants.ts`, the strings in
`public/_locales/en/messages.json` and the icons in `public/icons/`.

## Differences from the original

All features are free: the original's ESUIT account, subscription checks, free-try counters,
telemetry, remote GraphQL configuration and cross-promotion are not reproduced. Its CSP removal is
narrowed to top-level Instagram documents, web-accessible resources and download URLs are restricted,
and a dozen bugs are fixed. Details: [docs/REVERSE_ENGINEERING.md](docs/REVERSE_ENGINEERING.md).

## Caveats

This extension relies on undocumented Instagram internals and was verified against an emulated
Instagram module system (`tests/e2e/`), not the live site. Automated downloading may conflict with
Instagram's Terms of Use; only download content you have the right to save.
