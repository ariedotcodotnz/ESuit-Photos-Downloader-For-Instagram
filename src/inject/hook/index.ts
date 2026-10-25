/**
 * MAIN-world script injected at document_start, before Instagram's own
 * scripts. It intercepts Instagram's module system so the app script
 * (document_end) can render UI inside Instagram's React components.
 */
import { HOOK_GLOBAL } from "@/shared/constants";
import type { HookApi, InstagramEnvironment } from "../shared/hook-api";
import { PATCH_TARGETS } from "../shared/patch-targets";
import { waitForInstagramEnvironment } from "./environment";
import { isModuleDefined, metaRequire } from "./meta-modules";
import { ModuleHook } from "./module-hook";
import { captureRelayRecordSource, readRelayRecord } from "./relay-store";

function installHook(): HookApi {
  const hook = new ModuleHook();

  for (const [moduleName, options] of Object.entries(PATCH_TARGETS)) {
    hook.registerPatchTarget(moduleName, options);
  }

  captureRelayRecordSource(hook);

  // Injected elements are absent from the server-rendered HTML, which makes
  // ReactDOM report hydration mismatches (minified error #418). Silence it.
  hook.registerSourceRewrite("ReactDOM-prod.classic", (source) => source.replace(/Error\(\w\(418\)\)/g, "void 0"));

  hook.install();

  let environment: Promise<InstagramEnvironment> | undefined;
  return {
    whenReady: () => (environment ??= waitForInstagramEnvironment()),
    require: metaRequire,
    isModuleDefined,
    registerComponent: (moduleName, component) => hook.registerComponent(moduleName, component),
    readRelayRecord,
  };
}

window[HOOK_GLOBAL] ??= installHook();
