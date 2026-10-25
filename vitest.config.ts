import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Date-based filename fields must not depend on the machine's time zone.
    env: { TZ: "UTC" },
  },
});
