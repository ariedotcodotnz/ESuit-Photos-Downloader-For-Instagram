import {
  BlobSource,
  BufferTarget,
  EncodedAudioPacketSource,
  EncodedPacket,
  EncodedVideoPacketSource,
  Input,
  MP4,
  Mp4OutputFormat,
  Output,
} from "mediabunny";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mergeVideoAndAudio } from "@/inject/app/download/ffmpeg";

const { showProgress, showProgressError, closeProgressSoon } = vi.hoisted(() => ({
  showProgress: vi.fn(),
  showProgressError: vi.fn(),
  closeProgressSoon: vi.fn(),
}));
vi.mock("@/inject/app/download/toast", () => ({
  showProgress,
  showProgressError,
  closeProgressSoon,
}));

/** Minimal valid AVCDecoderConfigurationRecord (avcC) for 16x16 baseline H.264. */
const SAMPLE_AVCC = new Uint8Array([
  0x01, 0x42, 0xc0, 0x0a, 0xff, 0xe1, 0x00, 0x09, 0x67, 0x42, 0xc0, 0x0a, 0xd9, 0x03, 0x83, 0xf2, 0x00, 0x01, 0x00,
  0x04, 0x68, 0xce, 0x3c, 0x80,
]);

/** Minimal length-prefixed IDR slice NAL unit. */
const SAMPLE_H264_KEYFRAME = new Uint8Array([0x00, 0x00, 0x00, 0x05, 0x65, 0x88, 0x84, 0x21, 0xa0]);

/** Minimal AudioSpecificConfig for 48 kHz stereo AAC-LC (0x11, 0x90). */
const SAMPLE_AAC_ASC = new Uint8Array([0x11, 0x90]);

/** Minimal raw AAC frame payload. */
const SAMPLE_AAC_FRAME = new Uint8Array([0x21, 0x10, 0x04, 0x60, 0x8c, 0x1c]);

async function createVideoOnlyMp4(): Promise<Blob> {
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat(), target });
  const source = new EncodedVideoPacketSource("avc");
  output.addVideoTrack(source);
  await output.start();
  await source.add(new EncodedPacket(SAMPLE_H264_KEYFRAME, "key", 0, 0.5), {
    decoderConfig: {
      codec: "avc1.42c00a",
      codedWidth: 16,
      codedHeight: 16,
      description: SAMPLE_AVCC,
    },
  });
  source.close();
  await output.finalize();
  return new Blob([target.buffer!], { type: "video/mp4" });
}

async function createAudioOnlyMp4(): Promise<Blob> {
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat(), target });
  const source = new EncodedAudioPacketSource("aac");
  output.addAudioTrack(source);
  await output.start();
  await source.add(new EncodedPacket(SAMPLE_AAC_FRAME, "key", 0, 0.5), {
    decoderConfig: {
      codec: "mp4a.40.2",
      sampleRate: 48000,
      numberOfChannels: 2,
      description: SAMPLE_AAC_ASC,
    },
  });
  source.close();
  await output.finalize();
  return new Blob([target.buffer!], { type: "audio/mp4" });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("mergeVideoAndAudio (Mediabunny + WebCodecs)", () => {
  it("muxes separate MP4 video and audio blobs into a fast-start MP4 file", async () => {
    const [video, audio] = await Promise.all([createVideoOnlyMp4(), createAudioOnlyMp4()]);

    const merged = await mergeVideoAndAudio({ video, audio, codec: "avc1.42c00a" });

    expect(merged.name).toBe("merged_output.mp4");
    expect(merged.type).toBe('video/mp4; codecs="avc1.42c00a"');
    expect(merged.size).toBeGreaterThan(0);
    expect(showProgress).toHaveBeenCalled();
    expect(closeProgressSoon).toHaveBeenCalledOnce();
    expect(showProgressError).not.toHaveBeenCalled();

    const probe = new Input({ source: new BlobSource(merged), formats: [MP4] });
    try {
      const videoTrack = await probe.getPrimaryVideoTrack();
      const audioTrack = await probe.getPrimaryAudioTrack();
      expect(videoTrack).not.toBeNull();
      expect(audioTrack).not.toBeNull();
      expect(videoTrack?.codec).toBe("avc");
      expect(audioTrack?.codec).toBe("aac");
    } finally {
      probe.dispose();
    }
  });

  it("reports an error and rejects when a required track is missing", async () => {
    const videoOnly = await createVideoOnlyMp4();

    await expect(mergeVideoAndAudio({ video: videoOnly, audio: videoOnly })).rejects.toThrow(
      /Missing media tracks for merge/,
    );
    expect(showProgressError).toHaveBeenCalledWith("Failed to merge video, check the console for details");
  });

  it("rejects videos exceeding the maximum size limit", async () => {
    const oversizedVideo = { size: 300 * 1024 * 1024 } as Blob;
    const audio = new Blob([]);

    await expect(mergeVideoAndAudio({ video: oversizedVideo, audio })).rejects.toThrow(
      /Video exceeds the maximum size/,
    );
  });
});
