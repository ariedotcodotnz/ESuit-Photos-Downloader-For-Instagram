# Reverse-engineering notes

Analysis of the compiled extension **"ESUIT | Photos Downloader for Instagram™" v3.13.2**
(Chrome extension, Manifest V3, author field "William Chen"), kept unmodified in
[`reference/original-build/`](../reference/original-build), and how it maps onto the
TypeScript rewrite in `src/`.

## 1. Anatomy of the original build

| File                                                          | Size           | What it is                                                                                                |
| ------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------- |
| `manifest.json`                                               | —              | MV3 manifest. Pins the extension id with a `key`; hosts `www.instagram.com` and `*.esuit.dev`             |
| `service-worker-loader.js`                                    | 1 line         | CRXJS loader: `import './assets/index.ts-*.js'`                                                           |
| `assets/index.ts-qnr4TIc5.js`                                 | 41 KB          | **Background service worker** (messaging bus, storage, licensing, downloads, content-script registration) |
| `assets/index.ts-loader-*.js` + `assets/index.ts-BYWds_Pm.js` | < 1 KB         | Isolated-world content script (CRXJS dynamic-import loader + background→page relay)                       |
| `assets/index-C1oC9I1t.js`                                    | 3 KB           | Shared chunk: background RPC registry, ESUIT subscription enums/helpers, XOR token encoder                |
| `assets/const-DewCs8rR.js`                                    | < 1 KB         | Constants: host matches, product name, project id `download-albums-for-instagram`                         |
| `assets/index-D1RQGaBl.js`                                    | 714 KB         | Popup/options vendor chunk: React 18.3.1 + ReactDOM + antd 5.29.3 + ESUIT account UI                      |
| `assets/index.html-*.js`                                      | 8 KB / 0.3 KB  | Popup and options entries (only the ESUIT login/subscription widgets and cross-promotion)                 |
| `injects/proxy.js`                                            | 10 KB          | **MAIN-world module hook**, `document_start`: intercepts Meta's `__d` module definer                      |
| `injects/vendors.js`                                          | 882 KB         | MAIN-world vendor bundle (antd, icons, lodash-es, dayjs, @ffmpeg/*) bound to _Instagram's_ React          |
| `injects/index.js`                                            | 331 KB         | **MAIN-world app**: downloader UI, Instagram API access, download pipeline                                |
| `injects/index.css`, `injects/assets/worker-*.js`             | small          | In-page CSS; Vite-emitted copy of the @ffmpeg worker (unused at runtime)                                  |
| `ffmpeg/ffmpeg-core.{js,wasm}`                                | 85 KB / 2.7 MB | Custom ffmpeg.wasm core (see §2.2) — reused by the rewrite in `public/ffmpeg/`                            |
| `_locales/*`                                                  | 54 dirs        | All 54 locales contain the same two English strings                                                       |

### How it works

```
document_start  injects/proxy.js (MAIN)   installs a getter/setter on window.__d; wraps each
                                          module factory of interest before Instagram runs it
tab "loading"   background → executeScript(MAIN): window["download-albums-for-instagram"] = {id, version, icons, URL…}
                background → executeScript(MAIN): window.download_albums_for_instagram = feature/paywall table
document_end    injects/vendors.js + index.js (MAIN), registered at runtime with
                chrome.scripting.registerContentScripts; both wait for window.requireLazy,
                then require("react") / the "ReactDOM-…classic" module from Instagram's own
                module system and evaluate themselves against those instances
                → ___km("PolarisFeedNavItem.react|…", Component) etc. attach UI to Instagram components
page → background   chrome.runtime.sendMessage(extensionId, …)  (allowed by externally_connectable)
background → page   chrome.tabs.sendMessage → isolated content script → window.postMessage
```

Key techniques worth knowing:

- **Module patching (`proxy.js`).** Instagram ships Meta's Haste module system. `__d(name, deps, factory)`
  is intercepted; for registered component modules the factory is wrapped so that after it fills
  `exports.default`, the component is replaced with a wrapper that renders the original _inline_ and
  then threads the result through registered extension components (`lastCmp` chain). Other helpers:
  `___cr` re-evaluates a module's **source** after regex replacement (via an injected `<script>`),
  `___sf` reads Relay's record store, `___ah` hijacks GraphQL request params (unused by this extension).
- **Sharing Instagram's React.** Both MAIN-world bundles are Vite library builds with `react`,
  `react-dom` and `react/jsx-runtime` externalised and bound at runtime to Instagram's instances, so
  extension components can live inside Instagram's React tree (hooks need a single React).
- **CSP removal.** A dynamic declarativeNetRequest rule strips `Content-Security-Policy` headers from
  every Instagram document _and XHR_, so module sources can be re-evaluated, ffmpeg.wasm can run in a
  blob: Worker, and extension resources can be fetched.
- **Data access.** All requests go through Instagram's own clients: `PolarisInstapi.apiGet` (v1 REST)
  and a hand-rolled persisted-GraphQL call through Instagram's `XHRRequest` stack, so session cookies,
  CSRF tokens and app ids are attached automatically.
- **HD video.** Media objects carry a DASH manifest (`video_dash_manifest`). The highest video and audio
  representations are downloaded segment by segment (`sidx` box parsing, `bytestart`/`byteend` CDN
  query params) and remuxed (`-c copy`) with ffmpeg.wasm in a Worker.
- **Writing files.** Bulk downloads use the File System Access API (`showDirectoryPicker`) to write
  into a chosen folder; single downloads go through `chrome.downloads`.

## 2. Detected libraries

### 2.1 Runtime libraries (re-used by the rewrite)

| Library                                        | Version found      | Evidence in the build                                                                        | Used for                                | Rewrite                                                                                   |
| ---------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------- |
| React / ReactDOM                               | **18.3.1** (pages) | `version:"18.3.1"`, `rendererPackageName:"react-dom"` in `assets/index-D1RQGaBl.js`          | Popup/options UI                        | `react@^18.3.1` for the pages; in-page code uses Instagram's React (as the original)      |
| antd                                           | **5.29.3**         | `"5.29.3"` (`Fx`/`jE`) in both vendor bundles; `ant-` classes, `@ant-design/cssinjs`         | All UI                                  | `antd@~5.29.3`                                                                            |
| @ant-design/icons                              | 5.x                | `[@ant-design/icons]` warnings, icon definitions (`thunderbolt`, `setting`, …)               | Icons                                   | `@ant-design/icons@^5.6.1`                                                                |
| dayjs                                          | 1.11.x             | `$isDayjsObject`; plugins `relativeTime` (inlined), `weekday`/`localeData` (antd DatePicker) | Dates in filenames, resume info, ranges | `dayjs@^1.11`                                                                             |
| lodash-es                                      | 4.17.x             | vendor export map `"lodash-es": { get, throttle, cloneDeep, pick, uniqBy }`                  | Misc helpers                            | `lodash-es` (`throttle`, `debounce`, `uniqBy`; `get` replaced by typed optional chaining) |
| @ffmpeg/ffmpeg + @ffmpeg/util                  | 0.12.x             | vendor export map; `FFMessageType` incl. `FFPROBE`/`MOUNT`; `toBlobURL`, `fetchFile`         | Merging DASH video + audio              | `@ffmpeg/ffmpeg@^0.12.15`, `@ffmpeg/util@^0.12.2`                                         |
| @yaireo/tagify                                 | 4.x                | Tagify core + `react.tagify` wrapper + `tagify.css` inlined in `injects/index.js`            | Filename template editor (mix mode)     | `@yaireo/tagify@^4.39` (own typed React wrapper)                                          |
| fast-xml-parser                                | 5.x                | `XMLParser`, `getMetaDataSymbol()` (v5 API) inlined in `injects/index.js`                    | Parsing DASH manifests                  | `fast-xml-parser@^5`                                                                      |
| classnames, rc-\*, stylis, @ant-design/cssinjs | —                  | inlined                                                                                      | antd internals                          | pulled in by antd                                                                         |

### 2.2 The FFmpeg core

`ffmpeg/ffmpeg-core.wasm` is not the official 30 MB `@ffmpeg/core`. Its embedded configuration shows a
**remux-only FFmpeg 5.1 build** (libavcodec 59.37.100, libavformat 59.27.100), single-threaded, ES-module
glue (`export default createFFmpegCore`, `import.meta.url`):

```
--disable-everything --enable-demuxer=mov --enable-muxer=mp4 --enable-decoder=vp9 --enable-decoder=vp8
--enable-parser=h264 --enable-parser=hevc --enable-parser=av1 --enable-parser=vp9 --enable-parser=vp8
--enable-parser=aac --enable-parser=opus --enable-parser=vorbis --enable-bsf=aac_adtstoasc
--enable-bsf=vp9_superframe --enable-bsf=vp9_raw_reorder --enable-bsf=null --enable-protocol=file
--enable-filter=null --enable-filter=anull --disable-pthreads --disable-asm --extra-cflags='-O3 -msimd128'
```

The rewrite ships this pair unchanged in `public/ffmpeg/`. To rebuild it from source, run the
[ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) 0.12 build scripts with the configure flags
above. The official `@ffmpeg/core@0.12.x` ESM build (`dist/esm/ffmpeg-core.{js,wasm}`) is a drop-in
replacement, just much larger.

### 2.3 Build tooling (identified, not all re-used)

| Tool                                      | Evidence                                                                                                  | Rewrite                                                                                |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Vite                                      | hashed `assets/*-[hash].js` names, `<link rel="modulepreload">` in the pages, Vite's modulepreload helper | Vite 7 (multi-target build, see `vite.config.ts`)                                      |
| @crxjs/vite-plugin 2.x                    | `service-worker-loader.js`, `*-loader-*.js` calling `onExecute({perf})`                                   | Not used: MAIN-world IIFE bundles with deferred evaluation need custom output wrapping |
| Vite library mode (IIFE, React externals) | `window.download_albums_for_instagram_vendors`, `requireLazy(["react","__debug"])` bootstrap              | Same idea: `wrapForInstagramReact()` plugin in `vite.config.ts`                        |
| vite-plugin-css-injected-by-js            | `console.error("vite-plugin-css-injected-by-js", …)`                                                      | Not needed: CSS is emitted as `injects/app.css` and listed in the manifest             |
| TypeScript                                | `.ts` entry names, enum IIFEs, class fields                                                               | TypeScript 5.9 (strict)                                                                |

## 3. External services contacted by the original

| Endpoint                                                                                                        | Purpose                                                                     | Rewrite                                                                                               |
| --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `esuit-dev-sentry-6b0d6.web.app/api/sentry`                                                                     | Error telemetry (payload XOR-"encrypted" with the key `sentry`)             | Removed                                                                                               |
| `getusersubscription-57pphaecyq-uc.a.run.app/?token=`                                                           | Subscription lookup (token = base64(XOR(`{uid, productId}`, `zzq8iM3Nft`))) | Removed                                                                                               |
| `static-data.esuit.dev/index.json`                                                                              | Product/price catalogue (keys minified a…m)                                 | Removed                                                                                               |
| `stats.esuit.dev/index.json`                                                                                    | User counts/ratings for "Useful extensions" cross-promotion                 | Removed                                                                                               |
| `graphql-info.esuit.dev/<query>` → fallback `esuit-dev-site-graphql-args.web.app`                               | Persisted GraphQL **doc ids + variables** (XOR key `string`)                | Replaced: doc ids are read from Instagram's own loaded `<query>.graphql` modules, with REST fallbacks |
| `esuit.dev/{login,pricing,dashboard,faq,disclaimer}`, `docs.esuit.dev`, Facebook/Chrome Web Store/YouTube links | Account, upsell and support pages                                           | Removed                                                                                               |

The rewrite talks only to `www.instagram.com` (through Instagram's own clients) and Instagram's CDNs.

## 4. Where the original code went

Minified names refer to `reference/original-build/injects/index.js` unless noted.

| Original                                                                                          | Rewrite                                                                                   |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `proxy.js`: `__d` interception, `___pt` / `___km` / `___cr`, `S`, `k`, `t` (script-tag recompile) | `src/inject/hook/module-hook.ts`, `recompile.ts`, `src/inject/shared/patch-targets.ts`    |
| `proxy.js`: `___sf` store finder + `RelayPublishQueue` rewrite                                    | `src/inject/hook/relay-store.ts`                                                          |
| bootstrap (`requireLazy`, ReactDOM module search `n()`, jsx shim `r()`)                           | `src/inject/hook/environment.ts` + `wrapForInstagramReact()` in `vite.config.ts`          |
| background `et`/`ge`/`Ot` (three copies of one bus class), `index-C1oC9I1t.js` RPC                | `src/background/page-api.ts`, `src/inject/app/messaging.ts`, `src/shared/messaging.ts`    |
| background `ae`/`se`/JSON-schema buckets, `navigator.locks`                                       | `src/shared/storage.ts`                                                                   |
| background `Lt` (`downloadFileByUri`), `qt` (history/resume cursors), context menu                | `src/background/{downloads,handlers,context-menu}.ts`                                     |
| background `yt` (dynamic DNR rules)                                                               | static ruleset generated by `createCspRules()` in `src/manifest.ts`                       |
| `St`/`Tt` + regexes, `It`/`$t` (background copy)                                                  | `src/shared/filename.ts`, `src/shared/unprintable-chars.ts`                               |
| `wn`/`xn`/`bn`, fields `An`, presets `In`, defaults `jn`                                          | `src/shared/filename-template.ts`, `src/shared/settings.ts`                               |
| `Fn`/`hn` (Tagify editor), `Kn` (options form), `Wn` (quantity control), `m` (auto-merge)         | `src/shared/ui/*` (shared by the in-page modal and the options page)                      |
| `xo`/`wo`/`_o`/`bo`, `po` (DASH manifest)                                                         | `src/inject/app/media/{parse-media,dash-manifest}.ts`                                     |
| `A`/`I`/`j`/`M`/`N`/`P`/`R` (DASH segments, `sidx`)                                               | `src/inject/app/download/dash.ts`                                                         |
| `D`/`k`/`O` + inlined worker string `v`                                                           | `src/inject/app/download/ffmpeg.ts`, `src/inject/ffmpeg/worker.ts`                        |
| `Ar`/`jr`/`Ir`/`Mr`, `Er`/`Fr`, `vr`/`wr`                                                         | `src/inject/app/download/{download-media,image,filesystem}.ts`, `ig/route.ts`             |
| `gt`/`pt`/`Ze`/`et`/`nt` (GraphQL)                                                                | `src/inject/app/ig/graphql.ts`, `fetchers/{queries,strategy}.ts`                          |
| `yo`, `Do`, `ko`, `Mo`, `Io`/`jo`, `Fo`, `Co`, `Ro`, `Po`                                         | `src/inject/app/ig/instapi.ts`, `fetchers/{profile,saved,hashtag,stories,route-album}.ts` |
| `he`/`fe` (session refs), `zn`/`Vn` (settings), `we`/`ve` (history), `Cr` (resume)                | `src/inject/app/state/*`                                                                  |
| `Rr`/`Or`/`Sr`/`Pr`/`Tr` (download loop, pacing, quantity guard)                                  | `src/inject/app/hooks/use-album-download.ts`, `download/quantity-limit.ts`                |
| `ti`/`ei`/`Jr`, `Kr`, `Xr`, `Qr`, `fr`, `Yr`, `br`, `Lr`, `Oe`                                    | `src/inject/app/components/*`                                                             |
| `oe`, `Uo`/`Bo`, `Hp`/`Np`, `Ip`, `Rp`, `Co`, `qo`, `___km` calls                                 | `src/inject/app/components/injected/*`, `register.tsx`                                    |
| `Sp`/`Tp`, `Ep`/`Dp`/`Ap` (hotkey, context menu)                                                  | `src/inject/app/ig/shortcode.ts`, `features/hotkey.ts`                                    |
| Popup/options (`he`, `k_`, `__`, `I_`, …)                                                         | `src/pages/*` (rewritten: launcher popup + real settings page)                            |

`tests/parity.test.ts` extracts `St`, `Tt`, `wn`, `xn`, `An`, `Tp`, `Sp`, `P`, `_o` and `bo` from the
original bundle and checks the rewrite produces identical results.

## 5. Bugs in the original, fixed in the rewrite

1. Unticking a post in select mode removed the **first** selected id (`splice(0, 1)`), not the unticked one.
2. Download type **"Videos"** still downloaded images in bulk downloads (`VIDEOS_ONLY` was never checked).
3. The `sidx` reader's `readUint64` swapped the high/low 32-bit words (version-1 boxes and 64-bit sizes misparsed).
4. Image-format conversion overwrote the media item's `uri` with a blob URL revoked after 2 s, breaking re-downloads.
5. Progress messages passed milliseconds as antd's _seconds_ `duration` (≈50 min) and appended a new `<style>` per update.
6. "Download all saved collections" crashed when the second collection was empty (it indexed the list before filtering).
7. A tagged post whose details failed to load was still "downloaded" — saving its thumbnail as the file.
8. Single downloads through `chrome.downloads` were fire-and-forget, so failures still reported success.
9. Split-Folder on highlights crashed when no highlight had been loaded yet (`window.currentHighlight.name`).
10. DASH parsing misclassified audio sets with several representations and ignored single-`AdaptationSet` manifests.
11. Resuming a reels/tagged download saved the _next_ page cursor while the current page was still being processed, skipping its remaining items.
12. The "x / N" progress used the count limit even when the quantity control did not apply.

## 6. Intentionally not reproduced

- **ESUIT account, subscription checks and paywall**: plan-based feature table, "free try" counters,
  50-file limits, upgrade dialogs. Every feature is simply available.
- **Telemetry** and the **remote GraphQL configuration** service (see §3).
- **Cross-promotion**: "Useful extensions", rating prompts, "Report on Facebook" links, case-id copier.
- Branding and identity: ESUIT name/logo, the manifest `key` (it would clone the original's extension id),
  `*.esuit.dev` host permissions and `externally_connectable` entry.
- Unused hook-runtime features (`___ah` ajax hijack, `___gi` init hooks, Relay parent finders), the
  Facebook-specific `commitPayload` patch and the unused `PolarisProfilePostsActions` rewrite.

## 7. Security-relevant changes

| Original                                                           | Rewrite                                                                                     |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| CSP stripped from all Instagram documents **and XHR** responses    | CSP stripped from top-level Instagram documents only                                        |
| `web_accessible_resources: ["*"]`                                  | Only `ffmpeg/*`, the FFmpeg worker and icons                                                |
| `scripting`, `downloads.ui` permissions; esuit.dev host access     | Not requested (content scripts are declared statically)                                     |
| Background accepted any `downloadFileByUri` URL/path from the page | Only Instagram CDN / Instagram blob URLs; every path segment sanitised under the app folder |
| `window.postMessage(…, "*")` relay                                 | Posted to the page's own origin and filtered by sender                                      |

Removing Instagram's CSP is still a trade-off: it is required for patching module sources and for
running WebAssembly in the page. Everything else runs without it.
