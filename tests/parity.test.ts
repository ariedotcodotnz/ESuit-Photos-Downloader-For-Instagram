/**
 * Compares the rewrite with the original extension's implementations, which
 * are extracted from the minified bundle in reference/original-build.
 */
import dayjs from "dayjs";
import { describe, expect, it } from "vitest";
import { parseSidx } from "@/inject/app/download/dash";
import { shortcodeFromUrl, shortcodeToMediaId } from "@/inject/app/ig/shortcode";
import { pickLargest, pickThumbnail, type IgImageCandidate } from "@/inject/app/media/parse-media";
import { sanitizeFilename, sanitizeFolderName } from "@/shared/filename";
import {
  FILENAME_EXAMPLE_DATA,
  normalizeFilenameTemplate,
  renderFilenameTemplate,
  type FilenameTemplateData,
} from "@/shared/filename-template";
import { FILENAME_PRESETS } from "@/shared/settings";
import { between, evaluate, functionSource, initializerSource } from "./helpers/original-bundle";

type Fn<A extends unknown[], R> = (...args: A) => R;

interface Original {
  St: Fn<[string], string>;
  Tt: Fn<[string], string>;
  wn: Fn<[{ rule: string; fields: unknown; data: FilenameTemplateData; ext?: string }], string>;
  xn: Fn<[string], string>;
  An: unknown;
  Tp: Fn<[string], string>;
  Sp: Fn<[string], string | null>;
  P: Fn<[Uint8Array, number], unknown>;
  _o: Fn<[IgImageCandidate[]], string>;
  bo: Fn<[IgImageCandidate[]], string>;
}

const original = evaluate<Original>(
  [
    between("let yt=", "function St("),
    functionSource("St"),
    functionSource("Tt"),
    functionSource("se"),
    functionSource("le"),
    functionSource("ue"),
    'const mn="-**",vn="**-"',
    functionSource("yn"),
    functionSource("wn"),
    functionSource("xn"),
    functionSource("bn"),
    initializerSource("const An="),
    functionSource("Tp"),
    functionSource("Sp"),
    initializerSource("let R=class"),
    functionSource("P"),
    functionSource("_o"),
    functionSource("bo"),
  ],
  ["St", "Tt", "wn", "xn", "An", "Tp", "Sp", "P", "_o", "bo"],
  { s: dayjs },
);

const char = (code: number) => String.fromCharCode(code);

const NAMES = [
  "  Hello World  ",
  'a/b\\c:d*e?f"g<h>i|j',
  "con",
  "CON.txt",
  "lpt1.log",
  "...",
  "file..name",
  "emoji 😀 test ✨ done",
  "tab\tand\nnewline",
  "~tilde~",
  "x".repeat(300),
  "Ünïcödé façade",
  "日本語のファイル名",
  "name. ᴥ end",
  `${char(0x378)}unassigned${char(0x9f)}`,
  `zero${char(0x200b)}width`,
  "a  b   c",
  ".hidden.",
];

describe("filename sanitising matches the original", () => {
  it.each(NAMES)("sanitizeFilename(%j)", (name) => {
    expect(sanitizeFilename(name)).toBe(original.St(name));
  });

  it.each(NAMES)("sanitizeFolderName(%j)", (name) => {
    expect(sanitizeFolderName(name)).toBe(original.Tt(name));
  });
});

const TEMPLATES = [
  ...FILENAME_PRESETS,
  '-**{"value":"date"}**-_photo',
  "prefix -**unknown field**- suffix",
  "-**0index**-_-**00index**-_-**000index**-_-**file no**-",
  "-**date us**-",
  "-**years**-/-**months**-/-**days**- -**hours**-.-**minutes**-.-**seconds**- -**time**-",
  "-**audio title**- - -**user display name**-",
  "plain text only",
];

const DATA: FilenameTemplateData[] = [
  FILENAME_EXAMPLE_DATA,
  { ...FILENAME_EXAMPLE_DATA, fullName: "Ünïcödé 😀 Näme", audioTitle: "Song: Remix?" },
  { ...FILENAME_EXAMPLE_DATA, fullName: undefined, index: 123, carouselIndex: undefined },
];

describe("filename templates match the original", () => {
  for (const [i, data] of DATA.entries()) {
    it.each(TEMPLATES)(`renderFilenameTemplate(%j) with data #${i}`, (rule) => {
      expect(renderFilenameTemplate({ rule, data, ext: ".jpg" })).toBe(
        original.wn({ rule, fields: original.An, data, ext: ".jpg" }),
      );
    });
  }

  it.each(TEMPLATES)("normalizeFilenameTemplate(%j)", (rule) => {
    expect(normalizeFilenameTemplate(rule)).toBe(original.xn(rule));
  });
});

describe("shortcodes match the original", () => {
  const codes = ["CsyUsrKAsnR", "B", "-_AZaz09", `CsyUsrKAsnR${"x".repeat(28)}`, "DAbc123_-xyZ"];
  it.each(codes)("shortcodeToMediaId(%j)", (code) => {
    expect(shortcodeToMediaId(code)).toBe(original.Tp(code));
  });

  const urls = [
    "https://www.instagram.com/p/CsyUsrKAsnR/",
    "https://www.instagram.com/reel/Abc_-123/?igsh=1",
    "https://www.instagram.com/reels/Xyz789/",
    "https://www.instagram.com/stories/someone/123/",
    "https://www.instagram.com/someone/",
  ];
  it.each(urls)("shortcodeFromUrl(%j)", (url) => {
    expect(shortcodeFromUrl(url)).toBe(original.Sp(url));
  });
});

function buildSidxV0(
  timescale: number,
  firstOffset: number,
  references: [size: number, duration: number][],
): Uint8Array {
  const size = 32 + references.length * 12;
  const view = new DataView(new ArrayBuffer(size));
  view.setUint32(0, size);
  view.setUint32(4, 0x73696478); // "sidx"
  view.setUint8(8, 0); // version
  view.setUint32(12, 1); // reference_ID
  view.setUint32(16, timescale);
  view.setUint32(20, 1234); // earliest_presentation_time
  view.setUint32(24, firstOffset);
  view.setUint16(30, references.length);
  references.forEach(([referenceSize, duration], i) => {
    view.setUint32(32 + i * 12, referenceSize);
    view.setUint32(36 + i * 12, duration);
    view.setUint32(40 + i * 12, 0x90000000);
  });
  return new Uint8Array(view.buffer);
}

describe("DASH segment index parsing matches the original", () => {
  it("parses a version 0 sidx box", () => {
    const sidx = buildSidxV0(15360, 0, [
      [50_000, 30720],
      [42_000, 30720],
      [10_500, 15360],
    ]);
    expect(parseSidx(sidx, 862)).toEqual(original.P(sidx, 862));
  });

  it("honours first_offset", () => {
    const sidx = buildSidxV0(1000, 128, [[100, 2000]]);
    expect(parseSidx(sidx, 0)).toEqual(original.P(sidx, 0));
  });
});

describe("image candidate selection matches the original", () => {
  const sets: IgImageCandidate[][] = [
    [
      { url: "square-small", width: 150, height: 150 },
      { url: "square-big", width: 1080, height: 1080 },
      { url: "portrait-big", width: 1080, height: 1350 },
      { url: "portrait-small", width: 640, height: 800 },
    ],
    [
      { url: "a", width: 320, height: 320 },
      { url: "b", width: 640, height: 640 },
    ],
    [
      { url: "landscape", width: 1080, height: 566 },
      { url: "landscape-small", width: 480, height: 251 },
    ],
  ];
  it.each(sets)("pickLargest / pickThumbnail (set %#)", (...candidates) => {
    expect(pickLargest(candidates)).toBe(original._o([...candidates]));
    expect(pickThumbnail(candidates)).toBe(original.bo([...candidates]));
  });
});
