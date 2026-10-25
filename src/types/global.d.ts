import type { HookApi } from "@/inject/shared/hook-api";

/** Factory passed to Meta's module definer. */
export type MetaModuleFactory = (...args: unknown[]) => unknown;

/** `__d(name, dependencies, factory, ...)`: Meta's (Haste) module definer. */
export type MetaDefine = (
  name: unknown,
  dependencies: unknown,
  factory: MetaModuleFactory,
  ...rest: unknown[]
) => unknown;

declare global {
  // File System Access API parts that are not in lib.dom yet.
  interface DirectoryPickerOptions {
    id?: string;
    mode?: "read" | "readwrite";
    startIn?: "desktop" | "documents" | "downloads" | "music" | "pictures" | "videos";
  }

  interface FileSystemHandle {
    requestPermission(descriptor?: { mode?: "read" | "readwrite" }): Promise<PermissionState>;
  }

  interface Window {
    showDirectoryPicker(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>;
    /** Meta's module definer; intercepted by the hook. */
    __d?: MetaDefine;
    /** Meta's synchronous module loader. */
    require?: <T = unknown>(moduleName: string) => T;
    /** Loads modules asynchronously, then calls back with their exports. */
    requireLazy?: (moduleNames: string[], callback: (...exports: unknown[]) => void) => void;
    /** Installed by injects/hook.js (see HOOK_GLOBAL). */
    __igAlbumDownloaderHook?: HookApi;
  }
}
