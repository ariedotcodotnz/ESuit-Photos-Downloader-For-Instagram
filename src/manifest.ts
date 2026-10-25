import { HOST_MATCHES, INSTAGRAM_ORIGIN } from "./shared/constants";

/** Output paths shared by the manifest and the build (see `vite.config.ts`). */
export const OUTPUT = {
  background: "background.js",
  popup: "pages/popup/index.html",
  options: "pages/options/index.html",
  contentBridge: "content/bridge.js",
  hook: "injects/hook.js",
  app: "injects/app.js",
  appCss: "injects/app.css",
  ffmpegWorker: "injects/ffmpeg-worker.js",
  cspRules: "rules/csp.json",
} as const;

const ICON_SIZES = [16, 19, 32, 38, 48, 128] as const;
const icons = Object.fromEntries(ICON_SIZES.map((size) => [String(size), `icons/icon-${size}.png`]));

interface PackageInfo {
  version: string;
}

export function createManifest(pkg: PackageInfo): chrome.runtime.ManifestV3 {
  return {
    manifest_version: 3,
    name: "__MSG_name__",
    description: "__MSG_description__",
    default_locale: "en",
    version: pkg.version,
    // Manifest-declared MAIN-world content scripts need Chrome 111.
    minimum_chrome_version: "111",
    icons,
    action: {
      default_icon: icons,
      default_popup: OUTPUT.popup,
    },
    options_page: OUTPUT.options,
    background: {
      service_worker: OUTPUT.background,
      type: "module",
    },
    permissions: ["storage", "downloads", "declarativeNetRequest", "contextMenus"],
    host_permissions: HOST_MATCHES,
    content_scripts: [
      {
        // Isolated world: publishes extension metadata to the page and relays
        // background -> page events.
        matches: HOST_MATCHES,
        js: [OUTPUT.contentBridge],
        css: [OUTPUT.appCss],
        run_at: "document_start",
      },
      {
        // Must run before Instagram defines its modules so they can be patched.
        matches: HOST_MATCHES,
        js: [OUTPUT.hook],
        run_at: "document_start",
        world: "MAIN",
      },
      {
        matches: HOST_MATCHES,
        js: [OUTPUT.app],
        run_at: "document_end",
        world: "MAIN",
      },
    ] as chrome.runtime.ManifestV3["content_scripts"],
    // Lets the MAIN-world scripts call chrome.runtime.sendMessage(extensionId, ...).
    externally_connectable: {
      matches: HOST_MATCHES,
    },
    web_accessible_resources: [
      {
        // The page fetches these to run FFmpeg in a Worker and to show the icon.
        resources: ["ffmpeg/*", OUTPUT.ffmpegWorker, "icons/*"],
        matches: HOST_MATCHES,
      },
    ],
    declarative_net_request: {
      rule_resources: [{ id: "csp", enabled: true, path: OUTPUT.cspRules }],
    },
    incognito: "not_allowed",
  };
}

/**
 * Instagram's Content-Security-Policy blocks what the in-page code needs:
 * re-evaluating patched module sources (inline script), running FFmpeg's
 * WebAssembly in a blob: Worker and fetching extension resources. The original
 * extension removed the CSP headers for every request on the site; this rule
 * is narrowed to top-level Instagram documents only.
 */
export function createCspRules(): chrome.declarativeNetRequest.Rule[] {
  return [
    {
      id: 1,
      priority: 1,
      action: {
        type: "modifyHeaders" as chrome.declarativeNetRequest.RuleActionType,
        responseHeaders: [
          { header: "Content-Security-Policy", operation: "remove" as chrome.declarativeNetRequest.HeaderOperation },
          {
            header: "Content-Security-Policy-Report-Only",
            operation: "remove" as chrome.declarativeNetRequest.HeaderOperation,
          },
        ],
      },
      condition: {
        regexFilter: `^${INSTAGRAM_ORIGIN.replaceAll(".", "\\.")}/`,
        resourceTypes: ["main_frame" as chrome.declarativeNetRequest.ResourceType],
      },
    },
  ];
}
