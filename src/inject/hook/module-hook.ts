import type * as ReactNamespace from "react";
import { createLogger } from "@/shared/logger";
import type { MetaDefine, MetaModuleFactory } from "@/types/global";
import type { InjectedComponent, InjectedComponentProps } from "../shared/hook-api";
import type { PatchTargetOptions } from "../shared/patch-targets";
import { metaRequire } from "./meta-modules";
import { recompileFunction } from "./recompile";

const log = createLogger("hook", () => window.location.search.includes("debug"));

type ErrorBoundaryProps = {
  fallback: (error: unknown) => ReactNamespace.ReactNode;
  children?: ReactNamespace.ReactNode;
};

interface PatchEntry {
  moduleName: string;
  options: Required<PatchTargetOptions>;
  component?: InjectedComponent<unknown>;
}

export interface SourceRewrite {
  replace: (source: string) => string;
  order: number;
  skipOthers: boolean;
}

const DEFAULT_PATCH_OPTIONS: Required<PatchTargetOptions> = {
  order: 10,
  skipOthers: false,
  definerPath: "[6].default",
};

const byOrder = (a: { order: number }, b: { order: number }) => a.order - b.order;

/** `"[6].default.type"` → `["6", "default", "type"]` */
function parsePath(path: string): string[] {
  return path.split(/\.|\[(\d+)\]/).filter((segment): segment is string => !!segment);
}

function readPath(root: unknown, segments: string[]): unknown {
  let current = root;
  for (const segment of segments) {
    if (current == null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/**
 * Some Polaris components return an object exposing a `$1` render function
 * instead of an element; render it as a component so it can be wrapped.
 */
function normalizeRendered(React: typeof ReactNamespace, rendered: unknown): ReactNamespace.ReactNode {
  const candidate = rendered as { $1?: unknown; props?: Record<string, unknown> } | null;
  if (candidate && typeof candidate.$1 === "function") {
    return React.createElement(candidate as unknown as ReactNamespace.ElementType, candidate.props);
  }
  return rendered as ReactNamespace.ReactNode;
}

/**
 * Intercepts Meta's module definer (`window.__d`) so Instagram's React
 * components can be wrapped with extension UI, and module sources can be
 * patched, before Instagram ever uses them.
 *
 * Flow: Instagram calls `__d(name, deps, factory)` for every module. For a
 * registered module, the factory is wrapped so that, once it has populated its
 * exports, the exported component is replaced by `PatchedComponent`, which
 * renders the original and then threads the result through every injected
 * component registered for that module.
 */
export class ModuleHook {
  private readonly patches = new Map<string, PatchEntry[]>();
  private readonly rewrites = new Map<string, SourceRewrite[]>();
  private readonly processed = new Set<string>();
  private readonly listeners = new Map<string, Set<() => void>>();

  /** Declares a module whose exported component will be wrapped. Must happen before Instagram defines it. */
  registerPatchTarget(moduleName: string, options: PatchTargetOptions = {}): void {
    const entries = this.patches.get(moduleName) ?? [];
    entries.push({ moduleName, options: { ...DEFAULT_PATCH_OPTIONS, ...options } });
    this.patches.set(moduleName, entries);
  }

  /** Attaches the component to render for a patch target; already-mounted instances re-render. */
  registerComponent<P>(moduleName: string, component: InjectedComponent<P>): void {
    const entry = this.patches.get(moduleName)?.[0];
    if (!entry) {
      log.error(`"${moduleName}" is not a registered patch target`);
      return;
    }
    entry.component = component as InjectedComponent<unknown>;
    this.notify(moduleName);
  }

  /** Rewrites a module's factory source (with string/regex replacement) before it is evaluated. */
  registerSourceRewrite(
    moduleName: string,
    replace: (source: string) => string,
    options: Partial<SourceRewrite> = {},
  ): void {
    const rewrites = this.rewrites.get(moduleName) ?? [];
    rewrites.push({ replace, order: options.order ?? 10, skipOthers: options.skipOthers ?? false });
    this.rewrites.set(moduleName, rewrites);
  }

  install(target: Window = window): void {
    const wrapDefine = (define: MetaDefine): MetaDefine =>
      new Proxy(define, {
        apply: (fn, thisArg, args: Parameters<MetaDefine>) => Reflect.apply(fn, thisArg, this.processDefinition(args)),
      });

    let current = target.__d;
    if (current) {
      // Before its loader boots, Instagram installs a stub that only queues
      // definitions; leave it alone and wrap the real definer once assigned.
      if (current.toString().includes("__d_stub")) delete target.__d;
      else current = wrapDefine(current);
    }

    try {
      Object.defineProperty(target, "__d", {
        configurable: true,
        get: () => current,
        set: (value: unknown) => {
          current = typeof value === "function" ? wrapDefine(value as MetaDefine) : (value as MetaDefine | undefined);
        },
      });
    } catch (error) {
      log.error("Cannot intercept Instagram's module definer", error);
    }
  }

  private processDefinition(args: Parameters<MetaDefine>): Parameters<MetaDefine> {
    const [name, , factory] = args;
    if (typeof name !== "string" || typeof factory !== "function" || this.processed.has(name)) return args;
    this.processed.add(name);
    args[2] = this.applyPatches(this.applySourceRewrites(factory, name), name);
    return args;
  }

  private applySourceRewrites(factory: MetaModuleFactory, moduleName: string): MetaModuleFactory {
    const rewrites = this.rewrites.get(moduleName);
    if (!rewrites?.length) return factory;

    const sorted = [...rewrites].sort(byOrder);
    const exclusive = sorted.find((rewrite) => rewrite.skipOthers);
    const source = factory.toString();
    const patched = exclusive
      ? exclusive.replace(source)
      : sorted.reduce((src, rewrite) => rewrite.replace(src), source);
    if (patched === source) {
      log.debug(`source rewrite for ${moduleName} did not match`);
      return factory;
    }

    const compiled = recompileFunction(patched);
    if (!compiled) log.warn(`could not recompile ${moduleName}; keeping the original`);
    return compiled ?? factory;
  }

  private applyPatches(factory: MetaModuleFactory, moduleName: string): MetaModuleFactory {
    const entries = this.patches.get(moduleName);
    if (!entries?.length) return factory;

    const groups = new Map<string, PatchEntry[]>();
    for (const entry of [...entries].sort((a, b) => a.options.order - b.options.order)) {
      const group = groups.get(entry.options.definerPath) ?? [];
      group.push(entry);
      groups.set(entry.options.definerPath, group);
    }

    return new Proxy(factory, {
      apply: (fn, thisArg, factoryArgs: unknown[]) => {
        const result = Reflect.apply(fn, thisArg, factoryArgs);
        // Expose dependency exports after the regular arguments so a definer
        // path can also point into a dependency.
        const module = factoryArgs[5] as { dependencies?: { exports: unknown }[] } | undefined;
        for (const dependency of module?.dependencies ?? []) factoryArgs.push(dependency.exports);

        for (const [path, group] of groups) {
          const segments = parsePath(path);
          const key = segments.pop();
          const parent = readPath(factoryArgs, segments) as Record<string, unknown> | undefined;
          const original = key && parent ? parent[key] : undefined;
          if (!key || !parent || typeof original !== "function") {
            log.warn(`nothing to patch at ${moduleName} ${path}`);
            continue;
          }
          parent[key] = this.createPatchedComponent(original as (...args: unknown[]) => unknown, moduleName, group);
        }
        return result;
      },
    });
  }

  private createPatchedComponent(
    original: (...args: unknown[]) => unknown,
    moduleName: string,
    entries: PatchEntry[],
  ): (...args: unknown[]) => ReactNamespace.ReactNode {
    const subscribe = (listener: () => void) => this.subscribe(moduleName, listener);

    // Runs inside Instagram's render: renders the original inline (its hooks
    // first), then always the same two hooks, so the hook order is stable.
    function PatchedComponent(this: unknown, ...callArgs: unknown[]): ReactNamespace.ReactNode {
      const React = metaRequire<typeof ReactNamespace>("react");
      const ErrorBoundary = metaRequire<ReactNamespace.ComponentType<ErrorBoundaryProps>>("CometErrorBoundary.react");

      const sourceElement = normalizeRendered(React, original.apply(this, callArgs));
      const payload = callArgs[0];

      const [, forceRender] = React.useState(0);
      React.useEffect(() => subscribe(() => forceRender((count) => count + 1)), []);

      const active = entries.filter((entry) => entry.component);
      const exclusive = active.find((entry) => entry.options.skipOthers);
      const chain = exclusive ? [exclusive] : active;

      return chain.reduce<ReactNamespace.ReactNode>((lastElement, entry, chainIndex) => {
        const props: InjectedComponentProps<unknown> = { payload, sourceElement, lastElement, chainIndex };
        return React.createElement(ErrorBoundary, {
          // If the injected UI crashes, fall back to what was there before it.
          fallback: (error: unknown) => {
            log.error(`injected component for ${moduleName} crashed`, error);
            return lastElement;
          },
          children: React.createElement(entry.component as ReactNamespace.ComponentType<typeof props>, props),
        });
      }, sourceElement);
    }

    const name = (original as { displayName?: string }).displayName ?? original.name;
    (PatchedComponent as { displayName?: string }).displayName = `Patched(${name || moduleName})`;
    return PatchedComponent;
  }

  private subscribe(moduleName: string, listener: () => void): () => void {
    const listeners = this.listeners.get(moduleName) ?? new Set();
    listeners.add(listener);
    this.listeners.set(moduleName, listeners);
    return () => listeners.delete(listener);
  }

  private notify(moduleName: string): void {
    for (const listener of this.listeners.get(moduleName) ?? []) listener();
  }
}
