/**
 * MAIN-world entry (document_end). Evaluated only after the hook has bound
 * this bundle to Instagram's React (see `wrapForInstagramReact` in
 * vite.config.ts), it attaches the extension's UI to Instagram's components.
 */
import { createLogger } from "@/shared/logger";
import "./app.css";
import { registerInjectedComponents } from "./components/injected/register";
import { initEnvironment, isDebug } from "./env";
import { installQuickDownloadTriggers } from "./features/hotkey";

const log = createLogger("app", isDebug);

async function start(): Promise<void> {
  await initEnvironment();
  registerInjectedComponents();
  installQuickDownloadTriggers();
  log.debug("started");
}

start().catch((error: unknown) => log.error("failed to start", error));
