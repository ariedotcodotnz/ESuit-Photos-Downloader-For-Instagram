/**
 * The extension is built as several independent Vite targets, selected with
 * `--mode` (see `scripts/build.mjs`, which runs them all):
 *
 *   pages   popup + options pages and the background service worker (ES modules)
 *   content isolated-world content script            -> content/bridge.js (IIFE)
 *   hook    MAIN-world module hook, document_start    -> injects/hook.js   (IIFE)
 *   app     MAIN-world downloader UI, document_end    -> injects/app.js    (IIFE)
 *   worker  FFmpeg web worker, loaded via a blob: URL -> injects/ffmpeg-worker.js
 *
 * Content scripts cannot be ES modules, hence the separate IIFE builds.
 */
import { resolve } from "node:path";
import { defineConfig, type Plugin, type UserConfig } from "vite";
import pkg from "./package.json" with { type: "json" };
import { createCspRules, createManifest, OUTPUT } from "./src/manifest";
import { APP_BUNDLE_GLOBALS, HOOK_GLOBAL } from "./src/shared/constants";

const root = import.meta.dirname;
const r = (path: string) => resolve(root, path);
const outDir = r("dist");
const target = "chrome111";
/** The in-page app and the pages' vendor chunk are a single antd UI each (~1 MB); that is expected. */
const chunkSizeWarningLimit = 1500;

const common: UserConfig = {
  resolve: { alias: { "@": r("src") } },
  // Library builds leave `process.env.NODE_ENV` untouched; antd and rc-* read it.
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  // ASCII output escapes every non-ASCII character. Chrome refuses content
  // scripts containing Unicode noncharacters (fast-xml-parser's name regex
  // has U+EFFFF), reporting them as "not UTF-8 encoded".
  esbuild: { jsx: "automatic", legalComments: "none", charset: "ascii" },
};

/** antd marks its modules "use client" (for React Server Components); irrelevant here. */
const onwarn: NonNullable<NonNullable<UserConfig["build"]>["rollupOptions"]>["onwarn"] = (warning, warn) => {
  if (warning.code === "MODULE_LEVEL_DIRECTIVE") return;
  warn(warning);
};

/** Emits manifest.json and the declarativeNetRequest ruleset next to the pages. */
function extensionManifest(): Plugin {
  return {
    name: "extension-manifest",
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "manifest.json", source: JSON.stringify(createManifest(pkg), null, 2) });
      this.emitFile({ type: "asset", fileName: OUTPUT.cspRules, source: JSON.stringify(createCspRules(), null, 2) });
    },
  };
}

/**
 * The in-page UI renders inside Instagram's React tree, so it must use
 * Instagram's React instance rather than a bundled copy (hooks would break
 * otherwise). `react`, `react-dom` and `react/jsx-runtime` are externalised to
 * the parameters of a wrapper function, and the wrapper only runs once the
 * hook (`injects/hook.js`) has resolved those modules from Instagram's module
 * system. Evaluation has to wait because antd reads `React.version` at load.
 */
function wrapForInstagramReact(): Plugin {
  const { react, reactDom, jsxRuntime } = APP_BUNDLE_GLOBALS;
  const hook = JSON.stringify(HOOK_GLOBAL);
  return {
    name: "wrap-for-instagram-react",
    enforce: "post",
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type !== "chunk" || !file.isEntry) continue;
        file.code = [
          `(function () {`,
          `  "use strict";`,
          `  var hook = window[${hook}];`,
          `  if (!hook) { console.error("[${pkg.name}] module hook missing; app not started"); return; }`,
          `  hook.whenReady().then(function (env) {`,
          `    (function (${react}, ${reactDom}, ${jsxRuntime}) {`,
          file.code,
          `    })(env.React, env.ReactDOM, env.jsxRuntime);`,
          `  }).catch(function (error) { console.error("[${pkg.name}] failed to start", error); });`,
          `})();`,
          ``,
        ].join("\n");
      }
    },
  };
}

interface IifeTarget {
  entry: string;
  fileName: string;
  name: string;
  format?: "iife" | "es";
  cssFileName?: string;
  external?: string[];
  globals?: Record<string, string>;
  plugins?: Plugin[];
}

function scriptTarget({
  entry,
  fileName,
  name,
  format = "iife",
  cssFileName,
  external,
  globals,
  plugins,
}: IifeTarget): UserConfig {
  return {
    ...common,
    publicDir: false,
    plugins,
    build: {
      outDir,
      emptyOutDir: false,
      target,
      chunkSizeWarningLimit,
      lib: { entry: r(entry), formats: [format], name, fileName: () => fileName, cssFileName },
      rollupOptions: { external, onwarn, output: { globals } },
    },
  };
}

const targets: Record<string, UserConfig> = {
  pages: {
    ...common,
    root: r("src"),
    base: "/",
    publicDir: r("public"),
    plugins: [extensionManifest()],
    build: {
      outDir,
      emptyOutDir: false,
      target,
      chunkSizeWarningLimit,
      modulePreload: { polyfill: false },
      rollupOptions: {
        onwarn,
        input: {
          popup: r("src/pages/popup/index.html"),
          options: r("src/pages/options/index.html"),
          background: r("src/background/index.ts"),
        },
        output: {
          entryFileNames: (chunk) => (chunk.name === "background" ? OUTPUT.background : "assets/[name]-[hash].js"),
          // Libraries are only used by the pages; the service worker never imports this chunk.
          manualChunks: (id) => (id.includes("node_modules") ? "vendor" : undefined),
        },
      },
    },
  },

  content: scriptTarget({ entry: "src/content/bridge.ts", fileName: OUTPUT.contentBridge, name: "IgdlBridge" }),

  hook: scriptTarget({ entry: "src/inject/hook/index.ts", fileName: OUTPUT.hook, name: "IgdlHook" }),

  app: scriptTarget({
    entry: "src/inject/app/index.tsx",
    fileName: OUTPUT.app,
    name: "IgdlApp",
    cssFileName: OUTPUT.appCss.replace(/\.css$/, ""),
    external: ["react", "react-dom", "react-dom/client", "react/jsx-runtime"],
    globals: {
      react: APP_BUNDLE_GLOBALS.react,
      "react-dom": APP_BUNDLE_GLOBALS.reactDom,
      "react-dom/client": APP_BUNDLE_GLOBALS.reactDom,
      "react/jsx-runtime": APP_BUNDLE_GLOBALS.jsxRuntime,
    },
    plugins: [wrapForInstagramReact()],
  }),

  worker: scriptTarget({
    entry: "src/inject/ffmpeg/worker.ts",
    fileName: OUTPUT.ffmpegWorker,
    name: "IgdlFfmpegWorker",
    format: "es",
  }),
};

export default defineConfig(({ mode }) => {
  const config = targets[mode];
  if (!config) throw new Error(`Unknown build mode "${mode}". Expected one of: ${Object.keys(targets).join(", ")}`);
  return config;
});
