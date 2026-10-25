import { describe, expect, it } from "vitest";
import { getHighestSources, parseDashManifest } from "@/inject/app/media/dash-manifest";
import { MediaType, toMediaItems, withAuthor, type IgMedia } from "@/inject/app/media/parse-media";

const MANIFEST = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static">
  <Period>
    <AdaptationSet id="0" contentType="video">
      <Representation id="v1" bandwidth="500000" codecs="avc1.4d401e" FBQualityLabel="480p" FBContentLength="1000">
        <BaseURL>https://scontent.cdninstagram.com/v/480.mp4?a=1&amp;b=2</BaseURL>
        <SegmentBase indexRange="820-1003" timescale="15360"><Initialization range="0-819"/></SegmentBase>
      </Representation>
      <Representation id="v2" bandwidth="2000000" codecs="avc1.640028" FBQualityLabel="1080p" FBContentLength="5000">
        <BaseURL>https://scontent.cdninstagram.com/v/1080.mp4</BaseURL>
        <SegmentBase indexRange="830-1013" timescale="15360"><Initialization range="0-829"/></SegmentBase>
      </Representation>
    </AdaptationSet>
    <AdaptationSet id="1" contentType="audio">
      <Representation id="a1" bandwidth="128000" codecs="mp4a.40.2" FBContentLength="300">
        <AudioChannelConfiguration schemeIdUri="urn:mpeg:dash:23003:3:audio_channel_configuration:2011" value="2"/>
        <BaseURL>https://scontent.cdninstagram.com/v/audio.mp4</BaseURL>
        <SegmentBase indexRange="700-850" timescale="44100"><Initialization range="0-699"/></SegmentBase>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

describe("parseDashManifest", () => {
  it("picks the largest video and the audio stream", () => {
    const { video, audio } = parseDashManifest(MANIFEST);
    expect(video).toMatchObject({
      type: "video",
      uri: "https://scontent.cdninstagram.com/v/1080.mp4",
      label: "1080p",
      codec: "avc1.640028",
      segmentBase: { indexRange: "830-1013", Initialization: { range: "0-829" } },
    });
    expect(audio).toMatchObject({
      type: "audio",
      uri: "https://scontent.cdninstagram.com/v/audio.mp4",
      codec: "mp4a.40.2",
    });
  });

  it("decodes XML entities in URLs", () => {
    const withSmallVideoOnly = MANIFEST.replace(/<Representation id="v2"[\s\S]*?<\/Representation>/, "");
    expect(parseDashManifest(withSmallVideoOnly).video?.uri).toBe(
      "https://scontent.cdninstagram.com/v/480.mp4?a=1&b=2",
    );
  });

  it("returns nothing for missing manifests and requires both streams", () => {
    expect(parseDashManifest(null)).toEqual({});
    const videoOnly = MANIFEST.replace(/<AdaptationSet id="1"[\s\S]*?<\/AdaptationSet>/, "");
    expect(getHighestSources(videoOnly)).toBeUndefined();
    expect(getHighestSources(MANIFEST)).toBeDefined();
  });
});

const image = (pk: string): IgMedia => ({
  pk,
  code: `code${pk}`,
  media_type: MediaType.IMAGE,
  taken_at: 1_700_000_000,
  image_versions2: {
    candidates: [
      { url: `${pk}-small-square`, width: 150, height: 150 },
      { url: `${pk}-full`, width: 1080, height: 1350 },
    ],
  },
  user: { username: "someone", full_name: "Some One" },
});

describe("toMediaItems", () => {
  it("converts an image post", () => {
    const [item] = toMediaItems([withAuthor(image("1"))]);
    expect(item).toMatchObject({
      id: "1",
      uri: "1-full",
      thumbnail: "1-small-square",
      isVideo: false,
      authorName: "someone",
      fullName: "Some One",
      code: "code1",
      createdAt: 1_700_000_000,
      status: "waiting",
      carouselIndex: 1,
    });
  });

  it("converts a video with its reel audio", () => {
    const video: IgMedia = {
      ...image("2"),
      media_type: MediaType.VIDEO,
      video_versions: [
        { url: "low.mp4", width: 480, height: 854 },
        { url: "high.mp4", width: 720, height: 1280 },
      ],
      video_dash_manifest: MANIFEST,
      clips_metadata: {
        original_sound_info: { progressive_download_url: "sound.m4a", original_audio_title: "Original audio" },
      },
    };
    const [item] = toMediaItems([withAuthor(video)]);
    expect(item).toMatchObject({
      isVideo: true,
      uri: "high.mp4",
      thumbnail: "2-full",
      audioUrl: "sound.m4a",
      audioTitle: "Original audio",
    });
    expect(item?.highestSource?.video.label).toBe("1080p");
  });

  it("extracts audio metadata from music_metadata and story_music_stickers when clips_metadata is absent", () => {
    const postWithMusicMetadata: IgMedia = {
      ...image("2m"),
      media_type: MediaType.VIDEO,
      video_versions: [{ url: "video.mp4", width: 720, height: 1280 }],
      music_metadata: {
        music_info: { music_asset_info: { progressive_download_url: "post-music.m4a", title: "Post Song" } },
      },
    };
    const storyWithSticker: IgMedia = {
      ...image("2s"),
      media_type: MediaType.VIDEO,
      video_versions: [{ url: "story.mp4", width: 720, height: 1280 }],
      story_music_stickers: [
        { music_asset_info: { progressive_download_url: "story-music.m4a", title: "Story Song" } },
      ],
    };
    const [postItem, storyItem] = toMediaItems([withAuthor(postWithMusicMetadata), withAuthor(storyWithSticker)]);
    expect(postItem).toMatchObject({ audioUrl: "post-music.m4a", audioTitle: "Post Song" });
    expect(storyItem).toMatchObject({ audioUrl: "story-music.m4a", audioTitle: "Story Song" });
  });

  it("expands carousels, inheriting the post's code and timestamp", () => {
    const carousel: IgMedia = {
      pk: "3",
      code: "carousel",
      media_type: MediaType.CAROUSEL,
      taken_at: 1_600_000_000,
      user: { username: "author" },
      carousel_media: [
        { ...image("3a"), code: undefined, taken_at: 0 },
        { ...image("3b"), code: undefined, taken_at: 0 },
      ],
    };
    const items = toMediaItems([withAuthor(carousel)]);
    expect(items.map((i) => [i.id, i.carouselIndex, i.code, i.createdAt, i.authorName])).toEqual([
      ["3a", 1, "carousel", 1_600_000_000, "author"],
      ["3b", 2, "carousel", 1_600_000_000, "author"],
    ]);
  });

  it("skips media without images and unknown types", () => {
    expect(toMediaItems([withAuthor({ ...image("4"), image_versions2: { candidates: [] } })])).toEqual([]);
    expect(toMediaItems([withAuthor({ ...image("5"), media_type: 99 })])).toEqual([]);
  });
});
