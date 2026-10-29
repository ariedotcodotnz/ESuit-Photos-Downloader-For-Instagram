# IG Album Downloader

A Chrome (Manifest V3) extension that bulk-downloads photos, videos and reels from Instagram: whole
profiles (posts, reels, tagged), saved collections, highlights, stories and keyword searches, or posts
picked one by one.

## Features

- **Download Whole Album** from Instagram's sidebar: profile posts, reels and tagged posts, all saved
  collections, a single saved collection, or keyword search results.
- **Select mode**: tick posts in any grid, then download only those.
- **Quick downloads**: an icon next to the save button of posts/reels (whole post, current carousel
  slide, or pick files), story/highlight player buttons, "Download Highlights", HD profile pictures,
  reel audio only, <kbd>Ctrl/⌘</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd> and a right-click menu entry.
- **HD Auto-Merge**: downloads the separate DASH video/audio streams and muxes them with Mediabunny and WebCodecs.
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

To update, extract the next release
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

## Maintenance

Instagram changes its internals often. When something stops working:

1. Check the browser console on instagram.com; add `?debug` to the URL for verbose logs.
2. Component names to patch live in `src/inject/shared/patch-targets.ts`; the props each injected
   component reads are typed next to its registration in `components/injected/register.tsx`.
3. Every Instagram module the app requires is declared in `src/inject/app/ig/modules.ts`.
4. GraphQL query names and default variables are in `src/inject/app/fetchers/queries.ts`. Document
   ids are discovered from Instagram's loaded `<name>.graphql` modules; when unavailable, the profile
   fetchers fall back to the v1 REST feeds.
