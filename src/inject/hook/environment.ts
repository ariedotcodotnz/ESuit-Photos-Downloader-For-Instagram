import type * as ReactNamespace from "react";
import type * as ReactDOMNamespace from "react-dom";
import { PAGE_CONTEXT_ATTRIBUTE } from "@/shared/constants";
import type { PageContext } from "@/shared/messaging";
import type { InstagramEnvironment, JsxRuntime } from "../shared/hook-api";
import { findReactDomModuleName, metaRequire } from "./meta-modules";

const POLL_INTERVAL_MS = 50;

function waitFor(condition: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    const check = () => {
      let ready = false;
      try {
        ready = condition();
      } catch {
        // Instagram's globals are not fully set up yet.
      }
      if (ready) resolve();
      else setTimeout(check, POLL_INTERVAL_MS);
    };
    check();
  });
}

function readPageContext(): PageContext | null {
  const raw = document.documentElement.getAttribute(PAGE_CONTEXT_ATTRIBUTE);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PageContext;
  } catch {
    return null;
  }
}

/**
 * The app bundle is compiled against the automatic JSX runtime. Instagram's
 * `react` module exposes `jsx`; fall back to `createElement` otherwise.
 */
function createJsxRuntime(React: typeof ReactNamespace): JsxRuntime {
  const reactWithJsx = React as typeof React & { jsx?: JsxRuntime["jsx"] };
  const jsx: JsxRuntime["jsx"] = (type, props, key) =>
    typeof reactWithJsx.jsx === "function"
      ? reactWithJsx.jsx(type, props, key)
      : React.createElement(
          type as ReactNamespace.ElementType,
          key === undefined ? (props as object) : { ...(props as object), key },
        );
  return { Fragment: React.Fragment, jsx, jsxs: jsx };
}

/**
 * Resolves once Instagram's module loader is up, React and the rendering
 * ReactDOM build are initialised, and the content-script bridge has published
 * the extension's page context.
 */
export async function waitForInstagramEnvironment(): Promise<InstagramEnvironment> {
  await waitFor(() => typeof window.requireLazy === "function" && readPageContext() !== null);
  await new Promise<void>((resolve) => window.requireLazy!(["react", "__debug"], () => resolve()));
  await waitFor(() => findReactDomModuleName() !== undefined);

  const React = metaRequire<typeof ReactNamespace>("react");
  const ReactDOM = metaRequire<typeof ReactDOMNamespace>(findReactDomModuleName()!);
  return { React, ReactDOM, jsxRuntime: createJsxRuntime(React), pageContext: readPageContext()! };
}
