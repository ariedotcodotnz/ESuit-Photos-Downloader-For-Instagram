import type { SegmentBase } from "../media/types";
import { closeProgressSoon, showProgress } from "./toast";

/** Number of segment requests issued in parallel. */
const SEGMENT_BATCH_SIZE = 10;

export interface ByteRange {
  byteOffset: number;
  /** Omitted for an open-ended range. */
  byteLength?: number;
}

export interface MediaSegment {
  mediaFileByteRange: Required<ByteRange>;
  /** Start/end in seconds, relative to the first segment. */
  mediaTimeRange: [number, number];
}

/** `"831-1234"` → `{ byteOffset: 831, byteLength: 404 }` */
export function parseByteRange(range: string): Required<ByteRange> {
  const [start = 0, end = 0] = range.split("-").map((part) => parseInt(part, 10));
  return { byteOffset: start, byteLength: end - start + 1 };
}

/** Instagram's CDN serves byte ranges through `bytestart`/`byteend` query parameters. */
export function buildRangeUrl(uri: string, { byteOffset, byteLength }: ByteRange): string {
  const end = byteLength != null ? byteOffset + byteLength - 1 : null;
  return `${uri}${uri.includes("?") ? "&" : "?"}bytestart=${byteOffset}${end != null ? `&byteend=${end}` : ""}`;
}

async function fetchRange(uri: string, range: ByteRange): Promise<ArrayBuffer> {
  const response = await fetch(buildRangeUrl(uri, range));
  if (!response.ok) throw new Error(`Segment request failed: HTTP ${response.status}`);
  return response.arrayBuffer();
}

/** Sequential big-endian reader over a DataView (as used by MP4 boxes). */
export class DataViewReader {
  private cursor = 0;

  constructor(private readonly view: DataView) {}

  skip(bytes: number): number {
    const position = this.cursor;
    this.cursor += bytes;
    return position;
  }

  readUint8(): number {
    return this.view.getUint8(this.skip(1));
  }

  readUint16(): number {
    return this.view.getUint16(this.skip(2));
  }

  readUint32(): number {
    return this.view.getUint32(this.skip(4));
  }

  readUint64(): number {
    const high = this.readUint32();
    const low = this.readUint32();
    // Beyond 2^53 the value cannot be represented exactly as a JS number.
    if (high > 0x1fffff) throw new RangeError("Overflow reading 64-bit value.");
    return high * 2 ** 32 + low;
  }
}

/**
 * Parses an ISO-BMFF `sidx` (segment index) box into the byte ranges of the
 * media segments that follow it. `sidxOffset` is the absolute file offset of
 * the box, because segment offsets are relative to its end.
 */
export function parseSidx(bytes: Uint8Array, sidxOffset: number): MediaSegment[] {
  const reader = new DataViewReader(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength));

  let boxSize = reader.readUint32();
  reader.readUint32(); // box type, "sidx"
  if (boxSize === 1) boxSize = reader.readUint64();

  const version = reader.readUint8();
  reader.skip(3); // flags
  reader.skip(4); // reference_ID
  const timescale = reader.readUint32();
  let presentationTime = version === 0 ? reader.readUint32() : reader.readUint64();
  const firstOffset = version === 0 ? reader.readUint32() : reader.readUint64();
  reader.skip(2); // reserved
  const referenceCount = reader.readUint16();

  let offset = sidxOffset + boxSize + firstOffset;
  let baseTime = 0;
  const segments: MediaSegment[] = [];
  for (let i = 0; i < referenceCount; i++) {
    const referencedSize = reader.readUint32() & 0x7fffffff; // top bit: reference_type
    const duration = reader.readUint32();
    reader.readUint32(); // SAP info
    const start = presentationTime / timescale;
    const end = (presentationTime + duration) / timescale;
    if (i === 0) baseTime = start;
    segments.push({
      mediaFileByteRange: { byteOffset: offset, byteLength: referencedSize },
      mediaTimeRange: [start - baseTime, end - baseTime],
    });
    presentationTime += duration;
    offset += referencedSize;
  }
  return segments;
}

/**
 * Downloads a single-file DASH representation piece by piece: the init
 * segment, the segment index, then every media segment, returned in order so
 * the parts can be concatenated into a playable fragmented MP4.
 */
export async function downloadDashStream(
  uri: string,
  segmentBase: SegmentBase,
  kind: "video" | "audio",
): Promise<ArrayBuffer[]> {
  const { indexRange, Initialization } = segmentBase;
  if (!indexRange || !Initialization.range) throw new Error(`DASH ${kind} stream has no segment index`);

  const indexByteRange = parseByteRange(indexRange);
  const [init, index] = await Promise.all([
    fetchRange(uri, parseByteRange(Initialization.range)),
    fetchRange(uri, indexByteRange),
  ]);
  const segments = parseSidx(new Uint8Array(index), indexByteRange.byteOffset);

  const parts: ArrayBuffer[] = new Array<ArrayBuffer>(segments.length);
  let completed = 0;
  for (let i = 0; i < segments.length; i += SEGMENT_BATCH_SIZE) {
    const batch = segments.slice(i, i + SEGMENT_BATCH_SIZE);
    await Promise.all(
      batch.map(async (segment, j) => {
        parts[i + j] = await fetchRange(uri, segment.mediaFileByteRange);
        completed++;
        if (kind === "video") showProgress(`Downloading video ${((completed / segments.length) * 100).toFixed(2)}%`);
      }),
    );
  }
  if (kind === "video") closeProgressSoon();
  return [init, index, ...parts];
}
