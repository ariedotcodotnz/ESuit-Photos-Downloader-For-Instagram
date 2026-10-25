import { createElement, Fragment, type ComponentType, type ReactNode } from "react";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import type { InjectedComponentProps } from "@/inject/shared/hook-api";
import type { MetaDefine } from "@/types/global";

/** Minimal stand-in for Instagram's error boundary (server rendering never hits the fallback). */
function FakeErrorBoundary({ children }: { children?: ReactNode; fallback?: unknown }) {
  return createElement(Fragment, null, children);
}

// The hook resolves React and the error boundary through Instagram's `require`.
const modules: Record<string, unknown> = { react: React, "CometErrorBoundary.react": FakeErrorBoundary };
(globalThis as unknown as { window: unknown }).window = {
  location: { search: "" },
  require: (name: string) => modules[name],
};

const { ModuleHook } = await import("@/inject/hook/module-hook");

type FakeWindow = { __d?: MetaDefine };

/** Simulates Meta's loader: `__d` stores the factory, `load` runs it like Instagram would. */
function createLoader(target: FakeWindow) {
  const factories = new Map<string, (...args: unknown[]) => unknown>();
  target.__d = (name, _deps, factory) => {
    factories.set(name as string, factory);
  };
  return {
    load(name: string) {
      const module = { exports: {} as Record<string, unknown>, dependencies: [] };
      factories.get(name)!(globalThis, null, null, null, null, module, module.exports);
      return module.exports;
    },
  };
}

describe("ModuleHook", () => {
  let target: FakeWindow;
  let hook: InstanceType<typeof ModuleHook>;

  beforeEach(() => {
    target = {};
    hook = new ModuleHook();
  });

  it("wraps a registered component and threads the injected chain", () => {
    hook.registerPatchTarget("PolarisSaveButton.react");
    hook.install(target as unknown as Window);
    const loader = createLoader(target);

    function SaveButton(props: { postId: string }) {
      return createElement("button", null, `save ${props.postId}`);
    }
    target.__d!("PolarisSaveButton.react", [], (_g, _r, _d, _n, _l, _m, exports) => {
      (exports as Record<string, unknown>).default = SaveButton;
    });

    const exports = loader.load("PolarisSaveButton.react");
    expect(exports.default).not.toBe(SaveButton);

    hook.registerComponent(
      "PolarisSaveButton.react",
      ({ payload, lastElement }: InjectedComponentProps<{ postId: string }>) =>
        createElement("div", { "data-post": payload.postId }, lastElement, createElement("a", null, "download")),
    );

    const Patched = exports.default as ComponentType<{ postId: string }>;
    expect(renderToStaticMarkup(createElement(Patched, { postId: "42" }))).toBe(
      '<div data-post="42"><button>save 42</button><a>download</a></div>',
    );
  });

  it("renders the original untouched until a component is registered", () => {
    hook.registerPatchTarget("PolarisFeedNavItem.react");
    hook.install(target as unknown as Window);
    const loader = createLoader(target);
    target.__d!("PolarisFeedNavItem.react", [], (_g, _r, _d, _n, _l, _m, exports) => {
      (exports as Record<string, unknown>).default = () => createElement("nav", null, "home");
    });

    const Patched = loader.load("PolarisFeedNavItem.react").default as ComponentType;
    expect(renderToStaticMarkup(createElement(Patched))).toBe("<nav>home</nav>");
  });

  it("patches memoised components through a custom definer path", () => {
    hook.registerPatchTarget("PolarisPost.react", { definerPath: "[6].default.type" });
    hook.install(target as unknown as Window);
    const loader = createLoader(target);
    target.__d!("PolarisPost.react", [], (_g, _r, _d, _n, _l, _m, exports) => {
      (exports as Record<string, unknown>).default = React.memo(() => createElement("article", null, "post"));
    });

    const Memo = loader.load("PolarisPost.react").default as ComponentType;
    hook.registerComponent("PolarisPost.react", ({ lastElement }: InjectedComponentProps) =>
      createElement("section", null, lastElement),
    );
    expect(renderToStaticMarkup(createElement(Memo))).toBe("<section><article>post</article></section>");
  });

  it("applies source rewrites before the module is evaluated", () => {
    hook.registerSourceRewrite("Answer", (source) => source.replace("41", "42"));
    hook.install(target as unknown as Window);
    const loader = createLoader(target);
    // A plain function, like Meta's factories, so its source can be recompiled.
    const factory = function (
      _g: unknown,
      _r: unknown,
      _d: unknown,
      _n: unknown,
      _l: unknown,
      _m: unknown,
      exports: Record<string, unknown>,
    ) {
      exports.value = 41;
    };
    target.__d!("Answer", [], factory as (...args: unknown[]) => unknown);
    expect(loader.load("Answer").value).toBe(42);
  });

  it("keeps the original factory when a rewrite does not match", () => {
    hook.registerSourceRewrite("Stable", (source) => source.replace("no-such-text", "x"));
    hook.install(target as unknown as Window);
    const loader = createLoader(target);
    target.__d!("Stable", [], (_g, _r, _d, _n, _l, _m, exports) => {
      (exports as Record<string, unknown>).value = "unchanged";
    });
    expect(loader.load("Stable").value).toBe("unchanged");
  });

  it("ignores modules defined twice", () => {
    hook.registerSourceRewrite("Twice", (source) => source.replace("1", "2"));
    hook.install(target as unknown as Window);
    const seen: unknown[] = [];
    target.__d = (_name, _deps, factory) => {
      seen.push(factory);
    };
    const factory = function (
      _g: unknown,
      _r: unknown,
      _d: unknown,
      _n: unknown,
      _l: unknown,
      _m: unknown,
      e: Record<string, unknown>,
    ) {
      e.v = 1;
    };
    target.__d!("Twice", [], factory as (...args: unknown[]) => unknown);
    target.__d!("Twice", [], factory as (...args: unknown[]) => unknown);
    expect(seen[0]).not.toBe(factory);
    expect(seen[1]).toBe(factory);
  });
});
