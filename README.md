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

### Install a release

1. Open the [latest release](https://github.com/ariedotcodotnz/ESuit-Photos-Downloader-For-Instagram/releases/latest)
   and download `ig-album-downloader-v<version>-chromium.zip` from **Assets**.
2. Extract the ZIP to a permanent folder.
3. Open `chrome://extensions` in your Chromium browser and enable **Developer mode**.
4. Click **Load unpacked** and select the extracted folder containing `manifest.json`.
5. Open instagram.com while logged in.

Keep the extracted folder: the browser loads the extension from it. To update, extract the next release
into that folder and click **Reload** on the extensions page. Requires Chrome 111+.
See Chrome's [unpacked extension instructions](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked).

### Build from source

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
| `npm run test:e2e` | Builds, loads the extension in Chromium and drives it on a mock Instagram page (run `npx playwright install chromium` first) |
| `npm run icons`    | Regenerates `public/icons` (Python + Pillow)                                                                                 |

### Automated releases

[GitHub Actions](https://github.com/ariedotcodotnz/ESuit-Photos-Downloader-For-Instagram/actions/workflows/extension.yml)
typechecks, lints, runs the unit tests, builds every extension target, and loads the result in Chromium
for the browser smoke test on pull requests and pushes to `main`.

After those checks pass on `main`, the workflow publishes a GitHub release if `v<package.json version>`
has not been published yet. The initial run publishes the current version. Each release includes the
built Chromium ZIP, its SHA-256 checksum, installation instructions, and generated change notes.
Only `dist/` contents are packaged, with `manifest.json` at the root of the ZIP.

To publish the next version:

```sh
npm version patch --no-git-tag-version  # or minor / major; updates package.json and package-lock.json
git add package.json package-lock.json
git commit -m "Bump extension version"
git push origin main
```

Use three numeric version components, such as `1.0.1`, without a prerelease suffix. Each component must
be at most 65535. The manifest version is generated from `package.json` during the build.
Pushing more commits with an already published version runs the checks and keeps the existing release.
You can also select **Run workflow** on `main` to retry a release. No additional repository secrets are
needed: only the publishing job receives `contents: write` for the built-in `GITHUB_TOKEN`.
Dependabot checks the pinned GitHub Actions for updates weekly.

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
