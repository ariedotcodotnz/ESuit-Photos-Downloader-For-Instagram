/** Thin, typed wrappers around Meta's in-page module system. */

interface ModuleRecord {
  exports?: { version?: unknown } | null;
  depPosition?: number;
}

interface DebugModule {
  modulesMap: Record<string, ModuleRecord>;
}

export function metaRequire<T = unknown>(moduleName: string): T {
  if (!window.require) throw new Error("Instagram's module system is not available");
  return window.require<T>(moduleName);
}

function modulesMap(): Record<string, ModuleRecord> {
  return metaRequire<DebugModule>("__debug").modulesMap;
}

export function isModuleDefined(moduleName: string): boolean {
  try {
    return moduleName in modulesMap();
  } catch {
    return false;
  }
}

/**
 * Instagram ships several ReactDOM builds; the one rendering the page is the
 * initialised "classic" build that sits deep in the dependency graph.
 */
export function findReactDomModuleName(): string | undefined {
  const map = modulesMap();
  return Object.keys(map)
    .filter((name) => name.startsWith("ReactDOM"))
    .find((name) => {
      const record = map[name];
      return !!record?.exports?.version && (record.depPosition ?? 0) > 3 && name.includes("classic");
    });
}
