export interface PatchTargetOptions {
  /** Lower runs first when several components patch the same module. */
  order?: number;
  /** Render only this injected component, ignoring the others registered for the module. */
  skipOthers?: boolean;
  /**
   * Where the component lives among the module factory's arguments. Meta
   * factories are called as `(global, require, importDefault, importNamespace,
   * requireLazy, module, exports, ...)`, so `[6].default` is `exports.default`.
   * Memoised components expose the render function on `.type`.
   */
  definerPath?: string;
}

/**
 * Instagram (codename "Polaris") React components the extension wraps. They
 * must be registered before Instagram defines them, so the hook registers
 * this list at document_start; the app attaches the actual components later.
 */
export const PATCH_TARGETS = {
  // Stories & highlights viewer
  "PolarisStoriesV3Media.react": {},
  "PolarisStoriesV3ReelPlayerContainer.react": {},
  "PolarisStoriesV3HighlightsRoot.react": {},
  // Action bar under posts and reels (save button)
  "PolarisMediaSaveButton.react": {},
  "PolarisSaveButton.react": {},
  // Left navigation sidebar
  "PolarisFeedNavItem.react": {},
  // Grid items and media (select mode checkboxes)
  "PolarisDynamicExploreGridItem.react": {},
  "PolarisPostsGridItem.next.react": {},
  "PolarisPostsGridItem.react": {},
  "PolarisPost.react": { definerPath: "[6].default.type" },
  "PolarisMedia.react": {},
  "PolarisClipsGridItem.react": {},
  "PolarisClipsGridItem.next.react": {},
  "PolarisClipsDesktopVideoPlayer.react": {},
  // Carousel dots (used to find the visible carousel slide)
  "PolarisStepIndicator.react": {},
  // Profile picture
  "PolarisProfileAvatar.next.react": {},
} as const satisfies Record<string, PatchTargetOptions>;

export type PatchTargetName = keyof typeof PATCH_TARGETS;
