import { XMLParser } from "fast-xml-parser";
import type { DashSources, DashStream } from "./types";

type XmlNode = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  ignoreDeclaration: true,
  ignorePiTags: true,
  attributeNamePrefix: "@_",
});

const toArray = <T>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

const contentLength = (representation: XmlNode) =>
  Number(representation["@_FBContentLength"] ?? representation["@_bandwidth"] ?? 0);

function isAudioSet(set: XmlNode, representations: XmlNode[]): boolean {
  return (
    set["@_contentType"] === "audio" ||
    String(set["@_mimeType"] ?? "").startsWith("audio") ||
    representations.some((rep) => rep.AudioChannelConfiguration || String(rep["@_mimeType"] ?? "").startsWith("audio"))
  );
}

function toStream(type: DashStream["type"], representation: XmlNode): DashStream | null {
  const uri = representation.BaseURL;
  if (typeof uri !== "string") return null;
  const segmentBase = (representation.SegmentBase ?? {}) as XmlNode;
  const initialization = (segmentBase.Initialization ?? {}) as XmlNode;
  return {
    type,
    uri,
    label: type === "audio" ? "audio" : (representation["@_FBQualityLabel"] as string | undefined),
    codec: representation["@_codecs"] as string | undefined,
    segmentBase: {
      indexRange: segmentBase["@_indexRange"] as string | undefined,
      timescale: segmentBase["@_timescale"] as string | undefined,
      FBFirstSegmentRange: segmentBase["@_FBFirstSegmentRange"] as string | undefined,
      Initialization: { range: initialization["@_range"] as string | undefined },
    },
  };
}

/**
 * Picks the largest video and audio representations from the DASH manifest
 * Instagram embeds in media objects (`video_dash_manifest`). These are the
 * HD, separately encoded streams that "Auto-Merge" downloads and muxes.
 */
export function parseDashManifest(manifest: string | null | undefined): Partial<DashSources> {
  if (!manifest) return {};
  const document = parser.parse(manifest) as { MPD?: { Period?: XmlNode | XmlNode[] } };
  const periods = toArray(document.MPD?.Period);
  const sets = periods.flatMap((period) => toArray(period.AdaptationSet as XmlNode | XmlNode[] | undefined));

  let video: XmlNode | undefined;
  let audio: XmlNode | undefined;
  for (const set of sets) {
    const representations = toArray(set.Representation as XmlNode | XmlNode[] | undefined);
    const best = [...representations].sort((a, b) => contentLength(b) - contentLength(a))[0];
    if (!best) continue;
    if (isAudioSet(set, representations)) {
      if (!audio || contentLength(best) > contentLength(audio)) audio = best;
    } else if (!video || contentLength(best) > contentLength(video)) {
      video = best;
    }
  }

  const result: Partial<DashSources> = {};
  const videoStream = video && toStream("video", video);
  const audioStream = audio && toStream("audio", audio);
  if (videoStream) result.video = videoStream;
  if (audioStream) result.audio = audioStream;
  return result;
}

/** Both streams, or undefined when either is missing. */
export function getHighestSources(manifest: string | null | undefined): DashSources | undefined {
  const { video, audio } = parseDashManifest(manifest);
  return video && audio ? { video, audio } : undefined;
}
