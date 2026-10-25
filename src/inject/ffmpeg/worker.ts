/**
 * Web worker hosting ffmpeg.wasm. A typed port of the worker that ships with
 * @ffmpeg/ffmpeg 0.12 (same message protocol), built as its own file because
 * the in-page code must create workers from blob: URLs (see ffmpeg.ts).
 */
import type { FFFSType, FileData } from "@ffmpeg/ffmpeg";

type MessageType =
  | "LOAD"
  | "EXEC"
  | "FFPROBE"
  | "WRITE_FILE"
  | "READ_FILE"
  | "DELETE_FILE"
  | "RENAME"
  | "CREATE_DIR"
  | "LIST_DIR"
  | "DELETE_DIR"
  | "MOUNT"
  | "UNMOUNT"
  | "ERROR"
  | "LOG"
  | "PROGRESS";

/** The Emscripten module produced by ffmpeg-core.js. */
interface FFmpegCore {
  FS: {
    writeFile(path: string, data: FileData): void;
    readFile(path: string, options: { encoding?: string }): Uint8Array | string;
    unlink(path: string): void;
    rename(oldPath: string, newPath: string): void;
    mkdir(path: string): void;
    readdir(path: string): string[];
    stat(path: string): { mode: number };
    isDir(mode: number): boolean;
    rmdir(path: string): void;
    filesystems: Record<string, unknown>;
    mount(fs: unknown, options: unknown, mountPoint: string): void;
    unmount(mountPoint: string): void;
  };
  ret: number;
  exec(...args: string[]): void;
  ffprobe(...args: string[]): void;
  reset(): void;
  setTimeout(timeout: number): void;
  setLogger(logger: (data: unknown) => void): void;
  setProgress(handler: (data: unknown) => void): void;
}

type CreateFFmpegCore = (options: { mainScriptUrlOrBlob: string }) => Promise<FFmpegCore>;

interface WorkerScope {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<{ id: number; type: MessageType; data: unknown }>) => void) | null;
}

const scope = self as unknown as WorkerScope;
let core: FFmpegCore | undefined;

async function load({ coreURL, wasmURL, workerURL }: { coreURL?: string; wasmURL?: string; workerURL?: string }) {
  if (!coreURL) throw new Error("coreURL is required");
  const first = !core;
  // The packaged core is an ES module; this worker always runs as a module worker.
  const createFFmpegCore = ((await import(/* @vite-ignore */ coreURL)) as { default?: CreateFFmpegCore }).default;
  if (!createFFmpegCore) throw new Error("failed to import ffmpeg-core.js");

  const locations = {
    wasmURL: wasmURL ?? coreURL.replace(/.js$/g, ".wasm"),
    workerURL: workerURL ?? coreURL.replace(/.js$/g, ".worker.js"),
  };
  // ffmpeg-core reads the wasm/worker URLs from this hash (works around Emscripten's locateFile).
  core = await createFFmpegCore({ mainScriptUrlOrBlob: `${coreURL}#${btoa(JSON.stringify(locations))}` });
  core.setLogger((data) => scope.postMessage({ type: "LOG", data }));
  core.setProgress((data) => scope.postMessage({ type: "PROGRESS", data }));
  return first;
}

function run(fn: "exec" | "ffprobe", { args, timeout = -1 }: { args: string[]; timeout?: number }): number {
  const ffmpeg = core!;
  ffmpeg.setTimeout(timeout);
  ffmpeg[fn](...args);
  const ret = ffmpeg.ret;
  ffmpeg.reset();
  return ret;
}

function listDir(path: string) {
  const fs = core!.FS;
  return fs.readdir(path).map((name) => ({ name, isDir: fs.isDir(fs.stat(`${path}/${name}`).mode) }));
}

function mount({ fsType, options, mountPoint }: { fsType: FFFSType; options: unknown; mountPoint: string }): boolean {
  const fs = core!.FS.filesystems[fsType];
  if (!fs) return false;
  core!.FS.mount(fs, options, mountPoint);
  return true;
}

// Each handler receives the request's `data` field.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handlers: Partial<Record<MessageType, (data: any) => unknown>> = {
  LOAD: load,
  EXEC: (data) => run("exec", data),
  FFPROBE: (data) => run("ffprobe", data),
  WRITE_FILE: ({ path, data }) => (core!.FS.writeFile(path, data), true),
  READ_FILE: ({ path, encoding }) => core!.FS.readFile(path, { encoding }),
  DELETE_FILE: ({ path }) => (core!.FS.unlink(path), true),
  RENAME: ({ oldPath, newPath }) => (core!.FS.rename(oldPath, newPath), true),
  CREATE_DIR: ({ path }) => (core!.FS.mkdir(path), true),
  LIST_DIR: ({ path }) => listDir(path),
  DELETE_DIR: ({ path }) => (core!.FS.rmdir(path), true),
  MOUNT: mount,
  UNMOUNT: ({ mountPoint }) => (core!.FS.unmount(mountPoint), true),
};

scope.onmessage = async ({ data: { id, type, data } }) => {
  let result: unknown;
  try {
    if (type !== "LOAD" && !core) throw new Error("ffmpeg is not loaded, call `await ffmpeg.load()` first");
    const handler = handlers[type];
    if (!handler) throw new Error("unknown message type");
    result = await handler(data);
  } catch (error) {
    scope.postMessage({ id, type: "ERROR", data: String(error) });
    return;
  }
  scope.postMessage({ id, type, data: result }, result instanceof Uint8Array ? [result.buffer] : []);
};
