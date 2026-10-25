// End-to-end smoke test: loads dist/ into Chromium and serves a mock
// www.instagram.com page (mock-instagram.html) that emulates Meta's module
// system with real React, then drives the injected UI.
//
// Usage: npm run test:e2e   (builds first; screenshots go to $SMOKE_OUT if set)
// Install Chromium after `npm ci`: `npx playwright install chromium`,
// or a global installation reachable through NODE_PATH.
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const repo = fileURLToPath(new URL("../..", import.meta.url));
const out = process.env.SMOKE_OUT ?? mkdtempSync(join(tmpdir(), "igdl-smoke-"));
mkdirSync(out, { recursive: true });
const dist = join(repo, "dist");
const html = readFileSync(new URL("./mock-instagram.html", import.meta.url), "utf8");
// The mock page hosts React from the UMD builds (not exposed through package exports).
const umd = (pkg, file) => readFileSync(join(dirname(require.resolve(`${pkg}/package.json`)), "umd", file), "utf8");
const reactJs = umd("react", "react.production.min.js");
const reactDomJs = umd("react-dom", "react-dom.production.min.js");

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
};

const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "igdl-")), {
  channel: "chromium",
  headless: true,
  ignoreDefaultArgs: ["--disable-extensions"],
  args: [
    `--disable-extensions-except=${dist}`,
    `--load-extension=${dist}`,
    "--disable-features=DisableLoadExtensionCommandLineSwitch",
  ],
});

try {
  let [worker] = context.serviceWorkers();
  worker ??= await context.waitForEvent("serviceworker", { timeout: 15000 });
  const extensionId = new URL(worker.url()).host;
  check("service worker starts", !!extensionId, worker.url());

  const png = readFileSync(join(dist, "icons/icon-128.png"));
  await context.route("https://scontent.cdninstagram.com/**", (route) =>
    route.fulfill({ body: png, contentType: "image/jpeg" }),
  );
  await context.route("https://www.instagram.com/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/static/react.js") return route.fulfill({ body: reactJs, contentType: "text/javascript" });
    if (url.pathname === "/static/react-dom.js")
      return route.fulfill({ body: reactDomJs, contentType: "text/javascript" });
    return route.fulfill({
      body: html,
      contentType: "text/html",
      headers: { "content-security-policy": "script-src 'self' 'unsafe-inline'" },
    });
  });

  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (msg) => msg.type() === "error" && consoleErrors.push(msg.text()));
  page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

  await page.goto("https://www.instagram.com/someone/");
  await page.waitForSelector(".ig-home");
  check("Instagram's own nav item still renders", await page.isVisible(".ig-home"));

  const navItem = page.locator(".ig-nav-item", { hasText: "IG Album Downloader" });
  await navItem.waitFor({ timeout: 15000 });
  check("injected nav item renders inside the patched component", await navItem.isVisible());

  const saveRow = page.locator("#post button.ig-save");
  check(
    "patched save button keeps Instagram's button",
    (await saveRow.textContent())?.includes("Save 3141592653589793"),
  );
  check(
    "download icon injected next to save button",
    await page.locator("#post .download-single-button img").first().isVisible(),
  );

  // Fulfilled routes bypass the network stack (and DNR), so ask Chrome which rule would apply.
  const outcome = await worker.evaluate(() =>
    chrome.declarativeNetRequest.testMatchOutcome({ url: "https://www.instagram.com/someone/", type: "main_frame" }),
  );
  check("DNR CSP rule matches Instagram documents", outcome.matchedRules.length === 1, JSON.stringify(outcome));
  const xhrOutcome = await worker.evaluate(() =>
    chrome.declarativeNetRequest.testMatchOutcome({
      url: "https://www.instagram.com/api/v1/x",
      type: "xmlhttprequest",
    }),
  );
  check("DNR CSP rule leaves API requests alone", xhrOutcome.matchedRules.length === 0);

  await navItem.click();
  const albumButton = page.getByRole("button", { name: "Download Whole Album" });
  await albumButton.waitFor({ timeout: 10000 });
  check("nav popover opens", await albumButton.isVisible());
  await page.screenshot({ path: join(out, "instagram-popover.png") });

  await page.getByRole("button", { name: "Start Select" }).click();
  check("select mode toggles", await page.getByRole("button", { name: /Start Download/ }).isVisible());
  await page.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "Options" }).click();
  await page.getByText("Download Scope").waitFor({ timeout: 10000 });
  check("options modal opens", true);
  await page.getByRole("button", { name: "Show advanced settings" }).click();
  await page.locator(".tagify").waitFor({ timeout: 10000 });
  check("Tagify filename editor renders", await page.locator(".tagify").isVisible());
  const example = await page.locator(".tagify-example .eg-txt").textContent();
  check("filename example rendered", !!example && example.endsWith(".jpg"), example ?? "");
  await page.screenshot({ path: join(out, "instagram-options.png") });

  // Round-trip through the background: save settings from the page.
  await page.getByText("⚡ Full Speed").click();
  await page.getByRole("button", { name: "I understand" }).click();
  const customRule = "custom_-**username code**-_-**timestamp**-";
  await page.locator(".tagify__input").fill(customRule);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByText("Saved successfully.").waitFor({ timeout: 10000 });
  const stored = await worker.evaluate(async () => (await chrome.storage.local.get("settings")).settings);
  check("settings saved through the background", stored?.isFullSpeed === true, JSON.stringify(stored).slice(0, 80));
  check("saving immediately keeps the latest custom filename rule", stored?.filenameFormats === customRule);

  const relevantErrors = consoleErrors.filter((e) => !/favicon|Warning:/i.test(e));
  check("no page errors", relevantErrors.length === 0, relevantErrors.join(" | ").slice(0, 500));

  await page.locator("button.ant-modal-close").click();
  await page.locator(".ant-modal-wrap").waitFor({ state: "detached", timeout: 10000 });
  check("modal closes", true);

  // Single-post download: injected icon -> IG API -> filename template -> background -> chrome.downloads.
  // Playwright takes over browser downloads, so record what the extension asked for instead.
  await worker.evaluate(() => {
    const original = chrome.downloads.download.bind(chrome.downloads);
    globalThis.__requestedDownloads = [];
    chrome.downloads.download = (options) => {
      globalThis.__requestedDownloads.push(options);
      return original(options);
    };
  });
  await page.locator("#post .download-single-button img").first().click();
  await page.getByText("Download Successful").first().waitFor({ timeout: 15000 });
  const requested = await worker.evaluate(() => globalThis.__requestedDownloads);
  check(
    "post download requested with templated path",
    requested.length === 1 &&
      requested[0].url === "https://scontent.cdninstagram.com/v/full_n.jpg" &&
      requested[0].filename === "IG Album Downloader/custom_someone_1700000000.jpg",
    JSON.stringify(requested),
  );
  check(
    "media info requested through Instagram's API client",
    (await page.evaluate(() => window.__apiCalls)).some((p) => p.includes("/api/v1/media/3141592653589793/info/")),
  );
  check(
    "quick download is recorded in persistent history",
    await worker.evaluate(async () => {
      for (let attempt = 0; attempt < 20; attempt++) {
        const { downloadedFileIds = [] } = await chrome.storage.local.get("downloadedFileIds");
        if (downloadedFileIds.includes("3141592653589793")) return true;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return false;
    }),
  );

  // Hotkey on a post URL.
  await page.goto("https://www.instagram.com/p/CODE123/");
  await page.locator(".ig-nav-item").waitFor({ timeout: 15000 });
  await page.keyboard.press("Control+Shift+D");
  await page.getByText("Download Successful").first().waitFor({ timeout: 15000 });
  const calls = await page.evaluate(() => window.__apiCalls);
  const expectedId = (() => {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let id = 0n;
    for (const c of "CODE123") id = id * 64n + BigInt(alphabet.indexOf(c));
    return id.toString();
  })();
  check(
    "hotkey downloads the post in the URL",
    calls.some((p) => p.includes(`/api/v1/media/${expectedId}/info/`)),
    calls.join(","),
  );
  check(
    "hotkey uses the saved custom filename without selecting a folder",
    await worker.evaluate(
      () => globalThis.__requestedDownloads.at(-1)?.filename === "IG Album Downloader/custom_someone_1700000000.jpg",
    ),
  );

  // Reproduce a bulk-story HTTP 500, then exercise the selection view when
  // both endpoints fail. A retry should recover without reopening the modal.
  await page.goto("https://www.instagram.com/stories/someone/");
  const storyIcon = page.locator('#story img[alt="Download"]');
  await storyIcon.waitFor({ timeout: 15000 });
  await storyIcon.click();
  await page.getByText("Download Successful").first().waitFor({ timeout: 15000 });
  const storyCalls = await page.evaluate(() => window.__apiCalls);
  check(
    "story download recovers from a bulk API server error",
    storyCalls.includes("/api/v1/feed/reels_media/") && storyCalls.includes("/api/v1/feed/user/1563074505/story/"),
    storyCalls.join(","),
  );
  const storyDownloads = await worker.evaluate(() => globalThis.__requestedDownloads);
  check(
    "fallback story is sent to browser downloads",
    storyDownloads.at(-1)?.url === "https://scontent.cdninstagram.com/v/full_n.jpg" &&
      storyDownloads.at(-1)?.filename === "IG Album Downloader/custom_someone_1700000000.jpg",
  );

  await page.evaluate(() => {
    window.__storyFeedFailure = true;
  });
  const errorStart = consoleErrors.length;
  await page.mouse.move(0, 0);
  await storyIcon.hover();
  await page.getByRole("button", { name: "Select to Download" }).click();
  const loadError = page.getByRole("alert").filter({ hasText: "Failed to load the files." });
  await loadError.waitFor({ timeout: 10000 });
  check(
    "failed selection load displays an error and stops the spinner",
    (await loadError.textContent()).includes("Stories are temporarily unavailable.") &&
      (await page.locator(".ant-modal-body .ant-spin").count()) === 0,
  );
  check(
    "download stays disabled after a failed load",
    await page.getByRole("button", { name: "Select a Folder to Download" }).isDisabled(),
  );
  await page.screenshot({ path: join(out, "story-selection-error.png") });
  // The failed request is expected to be logged once by the selection view.
  const expectedErrors = consoleErrors.splice(errorStart);
  check(
    "selection failure is handled without extra errors",
    expectedErrors.length === 1 && expectedErrors[0].includes("Stories are temporarily unavailable."),
    expectedErrors.join(" | "),
  );
  await page.evaluate(() => {
    window.__storyFeedFailure = false;
  });
  await loadError.getByRole("button", { name: "Retry" }).click();
  await page.getByRole("checkbox", { name: "Select All", exact: true }).waitFor({ timeout: 10000 });
  check(
    "retry loads and selects the story files",
    (await page.getByRole("checkbox", { name: "Select All", exact: true }).isChecked()) &&
      (await page.getByRole("button", { name: "Select a Folder to Download" }).isEnabled()),
  );
  await page.screenshot({ path: join(out, "story-selection-recovered.png") });
  await page.locator("button.ant-modal-close").click();

  // Avatar downloads should reuse the profile's loaded picture even when the
  // user-info API is rate limited. With no cached picture, explain a blank 429.
  await page.goto("https://www.instagram.com/someone/");
  const avatarIcon = page.locator("#profile-avatar .ant-avatar");
  await avatarIcon.waitFor({ timeout: 15000 });
  check("Instagram's profile picture still renders", await page.locator(".ig-profile-pic").isVisible());
  const beforeAvatar = await worker.evaluate(() => globalThis.__requestedDownloads.length);
  await avatarIcon.click();
  await page.getByText("Download Successful").first().waitFor({ timeout: 10000 });
  const avatarDownloads = await worker.evaluate(() => globalThis.__requestedDownloads);
  check(
    "avatar download uses the loaded HD picture with the correct folder",
    avatarDownloads.length === beforeAvatar + 1 &&
      avatarDownloads.at(-1).url === "https://scontent.cdninstagram.com/v/avatar-hd.jpg" &&
      avatarDownloads.at(-1).filename === "IG Album Downloader/Some One/avatar.jpg",
  );
  check(
    "loaded avatar does not call the rate-limited user-info API",
    !(await page.evaluate(() => window.__apiCalls ?? [])).includes("/api/v1/users/50230154343/info/"),
  );

  await page.goto("https://www.instagram.com/someone/?avatarFromDom");
  await avatarIcon.waitFor({ timeout: 15000 });
  await avatarIcon.click();
  await page.getByText("Download Successful").first().waitFor({ timeout: 10000 });
  const displayedAvatarDownloads = await worker.evaluate(() => globalThis.__requestedDownloads);
  check(
    "avatar can use its displayed image when profile metadata is missing",
    displayedAvatarDownloads.length === avatarDownloads.length + 1 &&
      displayedAvatarDownloads.at(-1).url === "https://scontent.cdninstagram.com/v/avatar-small.jpg" &&
      displayedAvatarDownloads.at(-1).filename === "IG Album Downloader/50230154343/avatar.jpg" &&
      !(await page.evaluate(() => window.__apiCalls ?? [])).includes("/api/v1/users/50230154343/info/"),
  );

  await page.goto("https://www.instagram.com/someone/?emptyAvatar");
  await avatarIcon.waitFor({ timeout: 15000 });
  const rateLimitErrorStart = consoleErrors.length;
  await avatarIcon.click();
  await page
    .getByText("Instagram is temporarily limiting requests. Please wait before trying again.", { exact: true })
    .waitFor({ timeout: 10000 });
  await avatarIcon.waitFor({ state: "visible", timeout: 10000 });
  const avatarCalls = await page.evaluate(() => window.__apiCalls);
  check(
    "uncached avatar reports a blank HTTP 429 without retrying",
    avatarCalls.filter((path) => path === "/api/v1/users/50230154343/info/").length === 1 &&
      (await worker.evaluate(() => globalThis.__requestedDownloads.length)) === displayedAvatarDownloads.length,
  );
  check(
    "avatar failure releases the busy state and is handled once",
    (await avatarIcon.isVisible()) && consoleErrors.splice(rateLimitErrorStart).length === 1,
  );
  await page.screenshot({ path: join(out, "avatar-rate-limit.png") });

  // Stop must drain pending fetches/writes before restart controls appear,
  // and a partial final page must retain a checkpoint with its starting index.
  await worker.evaluate(async () => {
    const { settings } = await chrome.storage.local.get("settings");
    await chrome.storage.local.set({
      settings: { ...settings, filenameFormats: "-**index**-", isSkipDownloadedFile: false },
    });
  });
  await page.goto("https://www.instagram.com/someone/");
  await navItem.waitFor({ timeout: 15000 });
  await page.evaluate(() => {
    window.__holdProfileFeed = true;
    window.__holdAlbumWrite = false;
    window.__fileWrites = [];
    const directory = {
      requestPermission: async () => "granted",
      getDirectoryHandle: async (name) => {
        if (!name) throw new Error("Empty folder name");
        return directory;
      },
      getFileHandle: async (name) => ({
        createWritable: async () => ({
          write: async () => {},
          close: async () => {
            if (window.__holdAlbumWrite) {
              await new Promise((resolve) => {
                window.__releaseAlbumWrite = resolve;
              });
            }
            window.__fileWrites.push(name);
          },
        }),
      }),
    };
    window.showDirectoryPicker = async () => directory;
  });
  await navItem.click();
  await page.getByRole("button", { name: "Download Whole Album" }).click();
  await page.getByRole("button", { name: "Select a Folder to Download" }).click();
  await page.waitForFunction(() => typeof window.__releaseProfileFeed === "function");
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  check(
    "stopped fetch cannot restart before it settles",
    (await page.getByRole("button", { name: "Stopping…", exact: true }).isDisabled()) &&
      (await page.getByRole("button", { name: "ReDownload", exact: true }).count()) === 0,
  );
  await page.evaluate(() => {
    window.__holdProfileFeed = false;
    window.__releaseProfileFeed();
  });
  await page.getByRole("button", { name: "ReDownload", exact: true }).waitFor();
  const fetchCheckpoint = await worker.evaluate(async () =>
    (await chrome.storage.local.get("resumeCursors")).resumeCursors.find(
      (cursor) => cursor.collectionToken === "999_posts",
    ),
  );
  check(
    "stopping the final fetch keeps a checkpoint without writing files",
    fetchCheckpoint?.lastCursor === "rest:" &&
      fetchCheckpoint?.lastIndex === 0 &&
      (await page.evaluate(() => window.__fileWrites.length)) === 0,
  );

  await page.getByRole("button", { name: "ReDownload", exact: true }).click();
  await page.evaluate(() => {
    window.__holdAlbumWrite = true;
  });
  await page.getByRole("button", { name: "Resume downloading?", exact: true }).click();
  await page.waitForFunction(() => typeof window.__releaseAlbumWrite === "function");
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  check(
    "stopped write cannot restart before it settles",
    (await page.getByRole("button", { name: "Stopping…", exact: true }).isDisabled()) &&
      (await page.getByRole("button", { name: "ReDownload", exact: true }).count()) === 0,
  );
  await page.evaluate(() => {
    window.__holdAlbumWrite = false;
    window.__releaseAlbumWrite();
  });
  await page.getByRole("button", { name: "ReDownload", exact: true }).waitFor();
  const partialCheckpoint = await worker.evaluate(async () =>
    (await chrome.storage.local.get("resumeCursors")).resumeCursors.find(
      (cursor) => cursor.collectionToken === "999_posts",
    ),
  );
  check(
    "partial final page keeps its checkpoint and leaves the second file pending",
    partialCheckpoint?.lastCursor === "rest:" &&
      partialCheckpoint?.lastIndex === 0 &&
      JSON.stringify(await page.evaluate(() => window.__fileWrites)) === JSON.stringify(["1.jpg"]),
  );
  await page.getByRole("button", { name: "ReDownload", exact: true }).click();
  await page.getByRole("button", { name: "Resume downloading?", exact: true }).click();
  await page.getByRole("button", { name: "ReDownload", exact: true }).waitFor({ timeout: 10000 });
  check(
    "resume replays a partial page with matching file indices",
    JSON.stringify(await page.evaluate(() => window.__fileWrites)) === JSON.stringify(["1.jpg", "1.jpg", "2.jpg"]),
  );
  check(
    "a fully processed final page clears its checkpoint",
    await worker.evaluate(
      async () =>
        !(await chrome.storage.local.get("resumeCursors")).resumeCursors.some(
          (cursor) => cursor.collectionToken === "999_posts",
        ),
    ),
  );
  await page.locator("button.ant-modal-close").click();

  // Reproduce highlight downloads with automatic author/type folders. The
  // second highlight has an emoji-only title and contains the same story.
  await worker.evaluate(async () => {
    const { settings } = await chrome.storage.local.get("settings");
    await chrome.storage.local.set({
      settings: {
        ...settings,
        isGenFolder: true,
        isSplitFolder: true,
        isSkipDownloadedFile: false,
        filenameFormats: "highlight_-**username code**-_-**file id**-",
      },
    });
  });
  await page.goto("https://www.instagram.com/stories/highlights/777/");
  await storyIcon.waitFor({ timeout: 15000 });
  await page.evaluate(() => {
    window.__highlightWrites = [];
    const directory = (path = []) => ({
      requestPermission: async () => "granted",
      getDirectoryHandle: async (name) => {
        if (!name || /[/:]/.test(name)) throw new Error("Invalid folder name: " + JSON.stringify(name));
        return directory([...path, name]);
      },
      getFileHandle: async (name) => ({
        createWritable: async () => ({
          write: async () => {},
          close: async () => {
            window.__highlightWrites.push([...path, name].join("/"));
          },
        }),
      }),
    });
    window.showDirectoryPicker = async () => directory();
  });
  await storyIcon.click();
  await page.getByText("Download Successful").first().waitFor({ timeout: 10000 });
  check(
    "quick highlight download uses custom filenames and the author, type and title folders",
    await worker.evaluate(
      () =>
        globalThis.__requestedDownloads.at(-1)?.filename ===
        "IG Album Downloader/someone/highlights/Trips/highlight_someone_3141592653589793.jpg",
    ),
  );
  await page.mouse.move(0, 0);
  await storyIcon.hover();
  await page.getByRole("button", { name: "Select to Download" }).click();
  await page.getByRole("checkbox", { name: "Select All", exact: true }).waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: "Select a Folder to Download" }).click();
  await page.waitForFunction(() => window.__highlightWrites.length === 1);
  check(
    "selected highlight files write successfully with type folders enabled",
    (await page.evaluate(() => window.__highlightWrites[0])) ===
      "someone/highlights/Trips/highlight_someone_3141592653589793.jpg",
  );
  await page.locator("button.ant-modal-close").click();
  await page.evaluate(() => {
    window.__highlightWrites = [];
  });
  await page.getByRole("button", { name: "Download Highlights", exact: true }).click();
  await page.getByRole("button", { name: "Select a Folder to Download" }).click();
  await page.getByRole("button", { name: "ReDownload", exact: true }).waitFor({ timeout: 15000 });
  check(
    "bulk highlights create valid title and id folders for a shared story",
    JSON.stringify(await page.evaluate(() => window.__highlightWrites)) ===
      JSON.stringify([
        "someone/highlights/Trips/highlight_someone_3141592653589793.jpg",
        "someone/highlights/888/highlight_someone_3141592653589793.jpg",
      ]),
  );
  await page.screenshot({ path: join(out, "highlight-type-folders.png") });
  await page.locator("button.ant-modal-close").click();

  const finalErrors = consoleErrors.filter((e) => !/favicon|Warning:/i.test(e));
  check("still no page errors after downloads", finalErrors.length === 0, finalErrors.join(" | ").slice(0, 500));

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/pages/popup/index.html`);
  await popup.getByText("How to use").waitFor({ timeout: 10000 });
  check("popup renders", true);
  await popup.screenshot({ path: join(out, "popup.png") });

  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/pages/options/index.html`);
  await options.getByText("Download settings").waitFor({ timeout: 10000 });
  check("options page renders", true);
  check(
    "options page shows stored settings",
    await options.locator(".ant-checkbox-wrapper-checked", { hasText: "Full Speed" }).isVisible(),
  );
  await options.screenshot({ path: join(out, "options.png"), fullPage: true });
  const optionsRule = "options_-**username code**-_-**file id**-";
  await options.locator(".tagify__input").fill(optionsRule);
  await options.getByRole("button", { name: "Save", exact: true }).click();
  await options.getByText("Saved successfully.").waitFor({ timeout: 10000 });
  check(
    "options page saves the latest filename rule immediately",
    await worker.evaluate(
      async (rule) => (await chrome.storage.local.get("settings")).settings.filenameFormats === rule,
      optionsRule,
    ),
  );
  await page.goto("https://www.instagram.com/someone/");
  await page.locator("#post .download-single-button img").first().waitFor({ timeout: 15000 });
  await page.locator("#post .download-single-button img").first().click();
  await page.getByText("Download Successful").first().waitFor({ timeout: 10000 });
  check(
    "direct download applies filename changes saved on the extension options page",
    await worker.evaluate(
      () =>
        globalThis.__requestedDownloads.at(-1)?.filename ===
        "IG Album Downloader/someone/posts/options_someone_3141592653589793.jpg",
    ),
  );
} finally {
  await context.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed (screenshots: ${out})`);
process.exit(failed.length ? 1 : 0);
