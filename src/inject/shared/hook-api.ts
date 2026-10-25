import type * as ReactNamespace from "react";
import type * as ReactDOMNamespace from "react-dom";
import { HOOK_GLOBAL } from "@/shared/constants";
import type { PageContext } from "@/shared/messaging";
import type { PatchTargetName } from "./patch-targets";

/** Props every injected component receives from the patched Instagram component. */
export interface InjectedComponentProps<P = Record<string, unknown>> {
  /** The props Instagram passed to the patched component. */
  payload: P;
  /** What Instagram's original component rendered. */
  sourceElement: ReactNamespace.ReactNode;
  /**
   * Output of the previous injected component in the chain (equal to
   * `sourceElement` for the first one). Return it to keep Instagram's UI.
   */
  lastElement: ReactNamespace.ReactNode;
  /** Position of this component in the chain. */
  chainIndex: number;
}

export type InjectedComponent<P = Record<string, unknown>> = ReactNamespace.ComponentType<InjectedComponentProps<P>>;

export interface JsxRuntime {
  Fragment: ReactNamespace.ExoticComponent<{ children?: ReactNamespace.ReactNode }>;
  jsx: (type: unknown, props: unknown, key?: ReactNamespace.Key) => ReactNamespace.ReactElement;
  jsxs: (type: unknown, props: unknown, key?: ReactNamespace.Key) => ReactNamespace.ReactElement;
}

/** Instagram's own React instances, which the app bundle is bound to. */
export interface InstagramEnvironment {
  React: typeof ReactNamespace;
  ReactDOM: typeof ReactDOMNamespace;
  jsxRuntime: JsxRuntime;
  pageContext: PageContext;
}

/** API that `injects/hook.js` publishes on `window[HOOK_GLOBAL]` for `injects/app.js`. */
export interface HookApi {
  /** Resolves once Instagram's React/ReactDOM and the extension page context are available. */
  whenReady(): Promise<InstagramEnvironment>;
  /** Instagram's module loader (`window.require`). */
  require<T = unknown>(moduleName: string): T;
  /** Whether Instagram has defined (not necessarily initialised) a module. */
  isModuleDefined(moduleName: string): boolean;
  /** Attaches a component to one of the patched Instagram components. */
  registerComponent<P>(moduleName: PatchTargetName, component: InjectedComponent<P>): void;
  /** Reads a field from Relay's record store, e.g. `readRelayRecord("XDTUserDict:123", "full_name")`. */
  readRelayRecord(recordId: string, path: string): unknown;
}

export function getHookApi(): HookApi {
  const api = window[HOOK_GLOBAL];
  if (!api) throw new Error("Module hook is not installed");
  return api;
}
