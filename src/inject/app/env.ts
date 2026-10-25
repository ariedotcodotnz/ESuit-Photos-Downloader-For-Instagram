import type { PageContext } from "@/shared/messaging";
import { getHookApi, type HookApi } from "../shared/hook-api";

let hookApi: HookApi | undefined;

/** The module hook installed by injects/hook.js. Always present once the app bundle runs. */
export function getHook(): HookApi {
  return (hookApi ??= getHookApi());
}

let pageContext: PageContext | undefined;

/** Must be awaited once before anything reads the page context. */
export async function initEnvironment(): Promise<void> {
  pageContext = (await getHook().whenReady()).pageContext;
}

export function getPageContext(): PageContext {
  if (!pageContext) throw new Error("initEnvironment() has not completed");
  return pageContext;
}

/** Absolute `chrome-extension://` URL of a packaged file. */
export function extensionUrl(path: string): string {
  return getPageContext().extensionUrl + path.replace(/^\//, "");
}

export function appIconUrl(): string {
  return extensionUrl("icons/icon-128.png");
}

/** Verbose logging for unpacked installs or when the page URL contains `debug`. */
export function isDebug(): boolean {
  return window.location.search.includes("debug") || !!pageContext?.isDevelopment;
}
