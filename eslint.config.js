import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
  { ignores: ["dist/", "reference/", "public/", "node_modules/"] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}", "tests/**/*.ts"],
    languageOptions: { globals: { ...globals.browser, chrome: "readonly" } },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
    },
  },
  {
    files: ["scripts/**/*.{js,mjs}", "*.config.{js,ts}"],
    languageOptions: { globals: globals.node },
  },
  {
    // Node script whose page.evaluate() callbacks run in the browser / service worker.
    files: ["tests/e2e/**/*.mjs"],
    languageOptions: { globals: { ...globals.node, ...globals.browser, chrome: "readonly" } },
  },
);
