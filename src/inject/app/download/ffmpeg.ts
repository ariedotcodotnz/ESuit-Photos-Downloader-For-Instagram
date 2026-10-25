import { FFmpeg, type LogEvent, type ProgressEvent } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { OUTPUT } from "@/manifest";
import { extensionUrl } from "../env";
import { closeProgressSoon, showProgress, showProgressError } from "./toast";

/** The wasm heap is never shrunk, so the worker is recycled after this much input. */
const MAX_PROCESSED_BYTES = 300 * 1024 * 1024;
const MAX_VIDEO_BYTES = 295 * 1024 * 1024;

const ffmpeg = new FFmpeg();
let processedBytes = 0;
let hasLoadedOnce = false;
let bundleUrlsPromise: Promise<{ classWorkerURL: string; coreURL: string; wasmURL: string }> | undefined;
let queue: Promise<unknown> = Promise.resolve();

function recycle(): void {
  ffmpeg.terminate();
  processedBytes = 0;
}

/**
 * ffmpeg.wasm must run in a Worker. Pages cannot start workers from
 * chrome-extension:// URLs, so the packaged worker, core and wasm are fetched
 * and handed over as blob: URLs.
 */
async function ensureLoaded(): Promise<void> {
  if (ffmpeg.loaded) return;
  if (!hasLoadedOnce) showProgress("Loading FFmpeg...");
  bundleUrlsPromise ??= Promise.all([
    toBlobURL(extensionUrl(OUTPUT.ffmpegWorker), "text/javascript"),
    toBlobURL(extensionUrl("ffmpeg/ffmpeg-core.js"), "text/javascript"),
    toBlobURL(extensionUrl("ffmpeg/ffmpeg-core.wasm"), "application/wasm"),
  ]).then(([classWorkerURL, coreURL, wasmURL]) => ({ classWorkerURL, coreURL, wasmURL }));
  try {
    await ffmpeg.load(await bundleUrlsPromise);
  } catch (error) {
    bundleUrlsPromise = undefined;
    throw error;
  }
  hasLoadedOnce = true;
}

export interface MergeInput {
  video: Blob;
  audio: Blob;
  /** Video codec string from the DASH manifest, used for the output MIME type. */
  codec?: string;
}

async function merge({ video, audio, codec }: MergeInput): Promise<File> {
  if (video.size > MAX_VIDEO_BYTES) throw new Error(`Video exceeds the maximum size of ${MAX_VIDEO_BYTES} bytes`);
  if (video.size + processedBytes > MAX_PROCESSED_BYTES) recycle();

  try {
    await ensureLoaded();
  } catch (error) {
    throw new Error(`Failed to load FFmpeg.wasm: ${String(error)}`);
  }

  let log = "";
  const onProgress = ({ progress }: ProgressEvent) =>
    showProgress(`Merging video... ${Math.min(100, progress * 100).toFixed(2)}%`);
  const onLog = ({ message }: LogEvent) => {
    log += `${message}\n`;
  };

  try {
    await ffmpeg.writeFile("video.mp4", await fetchFile(video));
    await ffmpeg.writeFile("audio.mp4", await fetchFile(audio));
    ffmpeg.on("progress", onProgress);
    ffmpeg.on("log", onLog);

    // AAC in an MP4 container needs the ADTS→ASC bitstream filter when remuxed.
    await ffmpeg.ffprobe([
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      "-select_streams",
      "a:0",
      "-show_entries",
      "stream=codec_name",
      "audio.mp4",
      "-o",
      "audioInfo.json",
    ]);
    // readFile returns ArrayBuffer-backed bytes transferred from the worker.
    const probe = JSON.parse(await new Blob([(await ffmpeg.readFile("audioInfo.json")) as BlobPart]).text()) as {
      streams?: { codec_name?: string }[];
    };
    const isAac = probe.streams?.[0]?.codec_name === "aac";

    await ffmpeg.exec([
      "-i",
      "video.mp4",
      "-i",
      "audio.mp4",
      "-c",
      "copy",
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-movflags",
      "+faststart",
      ...(isAac ? ["-bsf:a:0", "aac_adtstoasc"] : []),
      "-max_muxing_queue_size",
      "9999",
      "output.mp4",
    ]);
    processedBytes += video.size;

    const output = await ffmpeg.readFile("output.mp4");
    const type = codec ? `video/mp4; codecs="${codec}"` : "video/mp4";
    const file = new File([output as BlobPart], "merged_output.mp4", { type });

    closeProgressSoon();
    return file;
  } catch (error) {
    console.error(error);
    console.warn(log);
    showProgressError("Failed to merge video, check the console for details");
    throw error instanceof Error ? error : new Error(String(error));
  } finally {
    ffmpeg.off("progress", onProgress);
    ffmpeg.off("log", onLog);
    for (const path of ["video.mp4", "audio.mp4", "output.mp4", "audioInfo.json"]) {
      await ffmpeg.deleteFile(path).catch(() => undefined);
    }
    if (processedBytes > MAX_PROCESSED_BYTES) recycle();
  }
}

/** Muxes separate video and audio tracks into one MP4 without re-encoding. Calls are serialised. */
export function mergeVideoAndAudio(input: MergeInput): Promise<File> {
  const result = queue.then(() => merge(input));
  queue = result.catch(() => undefined);
  return result;
}
