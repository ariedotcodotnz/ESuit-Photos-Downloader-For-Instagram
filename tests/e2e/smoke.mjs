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
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByText("Saved successfully.").waitFor({ timeout: 10000 });
  const stored = await worker.evaluate(async () => (await chrome.storage.local.get("settings")).settings);
  check("settings saved through the background", stored?.isFullSpeed === true, JSON.stringify(stored).slice(0, 80));

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
      requested[0].filename === "IG Album Downloader/full_n.jpg",
    JSON.stringify(requested),
  );
  check(
    "media info requested through Instagram's API client",
    (await page.evaluate(() => window.__apiCalls)).some((p) => p.includes("/api/v1/media/3141592653589793/info/")),
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
} finally {
  await context.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed (screenshots: ${out})`);
process.exit(failed.length ? 1 : 0);
