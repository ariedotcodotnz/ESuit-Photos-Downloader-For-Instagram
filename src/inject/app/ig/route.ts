import { sanitizeFolderName } from "@/shared/filename";
import type { IgRouteContextValue } from "./modules";

/**
 * Instagram's current route, captured from `CometRouterRouteContext` by the
 * navigation item (which is always mounted).
 */
let currentRoute: IgRouteContextValue | null = null;

export function setCurrentRoute(route: IgRouteContextValue | null): void {
  currentRoute = route;
}

export function getCurrentRoute(): IgRouteContextValue | null {
  return currentRoute;
}

/** Instagram's logging name of a page, e.g. `profilePage`, `SavedCollectionPage`. */
export function getPageName(route: IgRouteContextValue | null = currentRoute): string | undefined {
  return route?.rootView?.props?.page_logging?.name;
}

export interface HighlightInfo {
  /** e.g. `highlight:17890000000000000` */
  id: string;
  name?: string;
}

/** The highlight reel currently being bulk-downloaded (for folder names). */
export const highlightState: { current: HighlightInfo | null; currentItemId?: string } = { current: null };

/** Sub-folders used by "Split-Folder": posts / reels / tagged / saved / highlights. */
export function getSplitFolderSegments(): string[] {
  const { href } = window.location;
  if (href.includes("/highlights/")) {
    const highlight = highlightState.current;
    let name = sanitizeFolderName(highlight?.name ?? "");
    if (!name.trim()) name = (highlight?.id ?? "").replace("highlight", "");
    return ["highlights", name];
  }
  if (href.includes("/stories/")) return ["highlights", "latest"];
  const tab = currentRoute?.params?.tab;
  return tab ? [tab] : ["posts"];
}
