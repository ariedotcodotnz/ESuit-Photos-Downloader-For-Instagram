import { sanitizeFolderName } from "@/shared/filename";
import { getHook } from "../env";
import { fetchUserInfo, type IgUserInfo } from "./instapi";

export interface ProfileAvatar {
  url: string;
  folderName: string;
}

/** First candidate that still has characters after folder-name sanitising. */
function pickFolderName(...candidates: (string | undefined)[]): string {
  for (const candidate of candidates) {
    const clean = candidate ? sanitizeFolderName(candidate) : "";
    if (clean) return clean;
  }
  return "avatar";
}

/** Best HD picture supplied by the profile component or the user-info API. */
function hdPictureUrl(user: Partial<IgUserInfo>): string | undefined {
  const versions = [...(user.hd_profile_pic_versions ?? [])].filter((image) => image.url);
  versions.sort((a, b) => b.width * b.height - a.width * a.height);
  return user.hd_profile_pic_url_info?.url || user.profile_pic_url_hd || versions[0]?.url;
}

/** Reads only this user's cached profile, even when another profile is on screen. */
function readProfileField(userId: string, path: string): string | undefined {
  try {
    const value = getHook().readRelayRecord(`XDTUserDict:${userId}`, path);
    return typeof value === "string" && value.trim() ? value : undefined;
  } catch {
    // The Relay store is optional; component props and the API still work if
    // Instagram changes how the store is captured.
    return undefined;
  }
}

/**
 * Reuses the picture Instagram already loaded so an avatar download doesn't
 * depend on the rate-limited user-info endpoint. Prefer HD when available.
 */
export async function fetchProfileAvatar(
  userId: string,
  loadedUser: Partial<IgUserInfo> = {},
  displayedUrl?: string,
): Promise<ProfileAvatar | undefined> {
  const cachedHd =
    readProfileField(userId, "^hd_profile_pic_url_info.url") || readProfileField(userId, "profile_pic_url_hd");
  const url =
    hdPictureUrl(loadedUser) ||
    cachedHd ||
    loadedUser.profile_pic_url ||
    readProfileField(userId, "profile_pic_url") ||
    displayedUrl;
  const folderName = pickFolderName(
    loadedUser.full_name,
    readProfileField(userId, "full_name"),
    loadedUser.username,
    readProfileField(userId, "username"),
    userId,
  );
  if (url) return { url, folderName };

  // No loaded image is available. Make one request and let failures (including
  // HTTP 429) reach the UI without retries or requests to another endpoint.
  const user = await fetchUserInfo(userId);
  const fetchedUrl = user && (hdPictureUrl(user) || user.profile_pic_url);
  return fetchedUrl
    ? { url: fetchedUrl, folderName: pickFolderName(user?.full_name, user?.username, folderName) }
    : undefined;
}
