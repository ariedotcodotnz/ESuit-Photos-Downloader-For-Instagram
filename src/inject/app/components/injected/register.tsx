import type { ReactNode } from "react";
import type { InjectedComponentProps } from "@/inject/shared/hook-api";
import type { PatchTargetName } from "@/inject/shared/patch-targets";
import { getHook } from "../../env";
import type { IgUserInfo } from "../../ig/instapi";
import { highlightState } from "../../ig/route";
import { AudioDownloadButton } from "./AudioDownloadButton";
import { AvatarDownloadButton } from "./AvatarDownloadButton";
import { NavDownloaderItem } from "./NavDownloaderItem";
import { PostDownloadButton, STEP_INDICATOR_CLASS } from "./PostDownloadButton";
import { createSelectableMedia } from "./SelectableMedia";
import { HighlightsDownloadButton, StoryDownloadButton } from "./StoryDownloadButtons";

type Props<P> = InjectedComponentProps<P>;

/** Attaches the extension's UI to each patched Instagram component. */
export function registerInjectedComponents(): void {
  const register = <P,>(name: PatchTargetName, component: (props: Props<P>) => ReactNode) =>
    getHook().registerComponent<P>(name, component);

  // Story viewer: remember the visible item, add a download button to the player.
  register<{ media?: { __id?: string } }>("PolarisStoriesV3Media.react", ({ payload, lastElement }) => {
    highlightState.currentItemId = payload?.media?.__id?.replace("XDTMediaDict:", "");
    return lastElement;
  });

  register<{ reel?: { __id?: string } }>("PolarisStoriesV3ReelPlayerContainer.react", ({ payload, lastElement }) => {
    const reelId = payload?.reel?.__id?.replace("XDTReelDict:", "");
    if (!reelId) return lastElement;
    return (
      <div style={{ width: "100%", height: "100%", position: "relative" }}>
        <StoryDownloadButton reelId={reelId} />
        {lastElement}
      </div>
    );
  });

  register<{ queries?: { query?: { variables?: { reel_ids?: string[] } } } }>(
    "PolarisStoriesV3HighlightsRoot.react",
    ({ payload, lastElement }) => {
      const highlightIds = payload?.queries?.query?.variables?.reel_ids;
      if (!highlightIds?.length) return lastElement;
      return (
        <>
          <HighlightsDownloadButton highlightIds={highlightIds} />
          {lastElement}
        </>
      );
    },
  );

  // Post/reel action bars.
  register<{ mediaFragmentKey?: { pk?: string; media_type?: number } }>(
    "PolarisMediaSaveButton.react",
    ({ payload, lastElement }) => {
      const postId = payload?.mediaFragmentKey?.pk;
      if (!postId) return lastElement;
      const onReelsPage = window.location.href.includes("/reels/");
      const isVideo = onReelsPage || payload?.mediaFragmentKey?.media_type === 2;
      const spacing = { marginTop: onReelsPage ? 24 : 0 };
      return (
        <div style={{ display: "flex", flexDirection: onReelsPage ? "column" : "row", alignItems: "center" }}>
          {lastElement}
          <div style={spacing}>
            <PostDownloadButton postId={postId} isReel={isVideo} />
          </div>
          {isVideo && (
            <div style={spacing}>
              <AudioDownloadButton postId={postId} />
            </div>
          )}
        </div>
      );
    },
  );

  register<{ postId?: string }>("PolarisSaveButton.react", ({ payload, lastElement }) => {
    const postId = payload?.postId;
    if (!postId) return lastElement;
    return (
      <div style={{ display: "flex", flexDirection: "row", alignItems: "center" }}>
        {lastElement}
        <PostDownloadButton postId={postId} />
        <AudioDownloadButton postId={postId} />
      </div>
    );
  });

  register("PolarisFeedNavItem.react", ({ lastElement }) => (
    <>
      <NavDownloaderItem />
      {lastElement}
    </>
  ));

  // Marks the carousel dots so the visible slide can be found in the DOM.
  register("PolarisStepIndicator.react", ({ lastElement }) => (
    <div className={STEP_INDICATOR_CLASS}>{lastElement}</div>
  ));

  register<{ user?: Partial<IgUserInfo> }>("PolarisProfileAvatar.next.react", ({ payload, lastElement }) => {
    const userId = payload?.user?.pk;
    return userId ? (
      <AvatarDownloadButton userId={userId} user={payload?.user}>
        {lastElement}
      </AvatarDownloadButton>
    ) : (
      lastElement
    );
  });

  // Selection checkboxes on every kind of grid item.
  const selectable = createSelectableMedia();
  for (const name of [
    "PolarisDynamicExploreGridItem.react",
    "PolarisPostsGridItem.react",
    "PolarisPostsGridItem.next.react",
    "PolarisMedia.react",
    "PolarisClipsGridItem.react",
    "PolarisClipsGridItem.next.react",
    "PolarisClipsDesktopVideoPlayer.react",
  ] as const) {
    getHook().registerComponent(name, selectable);
  }
  getHook().registerComponent("PolarisPost.react", createSelectableMedia(60));
}
