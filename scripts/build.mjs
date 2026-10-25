#!/usr/bin/env node
// Builds every Vite target (see vite.config.ts) into dist/.
// Usage: node scripts/build.mjs [--watch]
import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const TARGETS = ["hook", "app", "pages"];
const watch = process.argv.includes("--watch");

// Targets share dist/, so it is cleaned once here instead of per target.
await rm(new URL("../dist", import.meta.url), { recursive: true, force: true });

for (const mode of TARGETS) {
  console.log(`\n▶ building ${mode}${watch ? " (watch)" : ""}`);
  // `root` comes from each target's config (the pages target uses src/).
  await build({
    configFile: fileURLToPath(new URL("../vite.config.ts", import.meta.url)),
    mode,
    build: watch ? { watch: {} } : {},
  });
}

if (!watch) console.log("\n✔ extension built into dist/ — load it via chrome://extensions → Load unpacked");
