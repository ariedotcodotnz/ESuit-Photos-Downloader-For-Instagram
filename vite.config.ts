/**
 * The extension is built with Vite + `@crxjs/vite-plugin` across three targets,
 * selected with `--mode` (see `scripts/build.mjs`, which runs them in order):
 *
 *   hook    MAIN-world module hook, document_start    -> injects/hook.js   (IIFE)
 *   app     MAIN-world downloader UI, document_end    -> injects/app.js    (IIFE)
 *   pages   CRXJS extension build: popup + options pages, background service
 *           worker, isolated-world content/bridge.ts (standalone IIFE), and
 *           manifest.json
 *
 * `hook` and `app` run in Instagram's MAIN world (`app` externalises `react`
 * and `react-dom` to Instagram's in-page React instance via a runtime wrapper),
 * so they are built as self-contained IIFE bundles first and registered in the
 * final CRX manifest via `renderCrxManifest`.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { crx } from "@crxjs/vite-plugin";
import { defineConfig, type Plugin, type PluginOption, type UserConfig } from "vite";
import pkg from "./package.json" with { type: "json" };
import { createCrxManifest, createCspRules, MAIN_WORLD_CONTENT_SCRIPTS, OUTPUT } from "./src/manifest";
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

/**
 * Emits the declarativeNetRequest ruleset, registers the pre-built `app.css`
 * asset in the Rollup bundle, and attaches the pre-built MAIN-world scripts
 * (`hook.js`, `app.js`, and `app.css`) to the manifest rendered by `@crxjs/vite-plugin`.
 */
function extensionFinalize(): Plugin & { renderCrxManifest?: (manifest: chrome.runtime.ManifestV3) => unknown } {
  return {
    name: "extension-finalize",
    generateBundle(_options, bundle) {
      this.emitFile({ type: "asset", fileName: OUTPUT.cspRules, source: JSON.stringify(createCspRules(), null, 2) });
      if (!bundle[OUTPUT.appCss]) {
        this.emitFile({
          type: "asset",
          fileName: OUTPUT.appCss,
          source: readFileSync(resolve(outDir, OUTPUT.appCss)),
        });
      }
    },
    renderCrxManifest(manifest) {
      const scripts = manifest.content_scripts ?? [];
      for (const script of scripts) {
        if (script.js?.some((file) => file.includes("bridge"))) {
          script.css = [OUTPUT.appCss];
        }
      }
      manifest.content_scripts = [
        ...scripts,
        ...MAIN_WORLD_CONTENT_SCRIPTS.map((script) => ({
          ...script,
          matches: [...script.matches],
          js: [...script.js],
        })),
      ] as chrome.runtime.ManifestV3["content_scripts"];
      return manifest;
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
  plugins?: PluginOption[];
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

  pages: {
    ...common,
    root: r("src"),
    base: "/",
    publicDir: r("public"),
    plugins: [
      crx({
        manifest: createCrxManifest(pkg),
        contentScripts: {
          injectCss: false,
          standaloneFiles: ["content/bridge.ts"],
        },
      }),
      extensionFinalize(),
    ],
    build: {
      outDir,
      emptyOutDir: false,
      target,
      chunkSizeWarningLimit,
      modulePreload: { polyfill: false },
      rollupOptions: {
        onwarn,
        output: {
          // Libraries are only used by the pages; the service worker never imports this chunk.
          manualChunks: (id) => (id.includes("node_modules") ? "vendor" : undefined),
        },
      },
    },
  },
};

export default defineConfig(({ mode }) => {
  const config = targets[mode];
  if (!config) throw new Error(`Unknown build mode "${mode}". Expected one of: ${Object.keys(targets).join(", ")}`);
  return config;
});
