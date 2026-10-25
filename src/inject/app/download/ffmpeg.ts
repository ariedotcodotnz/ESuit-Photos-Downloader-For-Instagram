import {
  ADTS,
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  MATROSKA,
  MP4,
  Mp4OutputFormat,
  Output,
  QTFF,
  WEBM,
} from "mediabunny";
import { closeProgressSoon, showProgress, showProgressError } from "./toast";

const MAX_VIDEO_BYTES = 295 * 1024 * 1024;
const INPUT_FORMATS = [MP4, QTFF, ADTS, WEBM, MATROSKA];
/** Interleave step in seconds when composing video and audio tracks into the same output. */
const INTERLEAVE_STEP_SECONDS = 1;

let queue: Promise<unknown> = Promise.resolve();

export interface MergeInput {
  video: Blob;
  audio: Blob;
  /** Video codec string from the DASH manifest, used for the output MIME type. */
  codec?: string;
}

async function merge({ video, audio, codec }: MergeInput): Promise<File> {
  if (video.size > MAX_VIDEO_BYTES) throw new Error(`Video exceeds the maximum size of ${MAX_VIDEO_BYTES} bytes`);

  const videoInput = new Input({ source: new BlobSource(video), formats: INPUT_FORMATS });
  const audioInput = new Input({ source: new BlobSource(audio), formats: INPUT_FORMATS });
  const target = new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target,
  });

  let videoConversion: Conversion | undefined;
  let audioConversion: Conversion | undefined;

  try {
    showProgress("Merging video... 0.00%");

    videoConversion = await Conversion.init({
      input: videoInput,
      output,
      composable: true,
      tracks: "primary",
      audio: { discard: true },
      copy: { shiftTolerance: Infinity },
      showWarnings: false,
    });

    audioConversion = await Conversion.init({
      input: audioInput,
      output,
      composable: true,
      tracks: "primary",
      video: { discard: true },
      copy: { shiftTolerance: Infinity },
      showWarnings: false,
    });

    if (videoConversion.utilizedTracks.length === 0 || audioConversion.utilizedTracks.length === 0) {
      const reasons = [
        ...videoConversion.discardedTracks
          .filter((d) => d.reason !== "discarded_by_user")
          .map((d) => `video:${d.reason}`),
        ...audioConversion.discardedTracks
          .filter((d) => d.reason !== "discarded_by_user")
          .map((d) => `audio:${d.reason}`),
      ];
      throw new Error(
        `Missing media tracks for merge (video=${videoConversion.utilizedTracks.length}, audio=${audioConversion.utilizedTracks.length}${reasons.length ? `, discarded=${reasons.join(",")}` : ""})`,
      );
    }

    let videoProgress = 0;
    let audioProgress = 0;
    const reportProgress = () => {
      const pct = Math.min(100, ((videoProgress + audioProgress) / 2) * 100);
      showProgress(`Merging video... ${pct.toFixed(2)}%`);
    };
    videoConversion.onProgress = (progress) => {
      videoProgress = progress;
      reportProgress();
    };
    audioConversion.onProgress = (progress) => {
      audioProgress = progress;
      reportProgress();
    };

    await output.start();

    let until = INTERLEAVE_STEP_SECONDS;
    while (videoConversion.state !== "done" && audioConversion.state !== "done") {
      await Promise.all([videoConversion.execute({ until }), audioConversion.execute({ until })]);
      until += INTERLEAVE_STEP_SECONDS;
    }
    await Promise.all([videoConversion.execute(), audioConversion.execute()]);

    await output.finalize();

    const buffer = target.buffer;
    if (!buffer) throw new Error("Mediabunny produced an empty output buffer");

    const type = codec ? `video/mp4; codecs="${codec}"` : await output.getMimeType().catch(() => "video/mp4");
    const file = new File([buffer], "merged_output.mp4", { type });

    closeProgressSoon();
    return file;
  } catch (error) {
    await Promise.allSettled([
      videoConversion?.cancel(),
      audioConversion?.cancel(),
      output.state === "started" ? output.cancel() : Promise.resolve(),
    ]);
    console.error(error);
    showProgressError("Failed to merge video, check the console for details");
    throw error instanceof Error ? error : new Error(String(error));
  } finally {
    videoInput.dispose();
    audioInput.dispose();
  }
}

/** Muxes separate video and audio tracks into one MP4 using Mediabunny and WebCodecs. Calls are serialised. */
export function mergeVideoAndAudio(input: MergeInput): Promise<File> {
  const result = queue.then(() => merge(input));
  queue = result.catch(() => undefined);
  return result;
}
