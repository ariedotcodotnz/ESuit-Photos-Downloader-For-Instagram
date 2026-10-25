import { sanitizeFolderName } from "@/shared/filename";
import type { HighlightInfo } from "../media/types";
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

/** The visible story item, captured by the story player hook. */
export const highlightState: { currentItemId?: string } = {};

/** Sub-folders used by "Split-Folder": posts / reels / tagged / saved / highlights. */
export function getSplitFolderSegments(highlight?: HighlightInfo): string[] {
  const { href } = window.location;
  if (highlight || href.includes("/highlights/")) {
    const id = highlight?.id ?? href.match(/\/highlights\/([^/?#]+)/)?.[1] ?? "";
    const name =
      sanitizeFolderName(highlight?.name ?? "") || sanitizeFolderName(id.replace(/^highlight:/, "")) || "untitled";
    return ["highlights", name];
  }
  if (href.includes("/stories/")) return ["highlights", "latest"];
  const tab = currentRoute?.params?.tab;
  return tab ? [tab] : ["posts"];
}
