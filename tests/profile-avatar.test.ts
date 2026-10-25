import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchProfileAvatar } from "@/inject/app/ig/profile-avatar";

const { readRelayRecord, fetchUserInfo } = vi.hoisted(() => ({
  readRelayRecord: vi.fn(),
  fetchUserInfo: vi.fn(),
}));
vi.mock("@/inject/app/env", () => ({ getHook: () => ({ readRelayRecord }) }));
vi.mock("@/inject/app/ig/instapi", () => ({ fetchUserInfo }));

beforeEach(() => {
  readRelayRecord.mockReset();
  fetchUserInfo.mockReset();
});

describe("fetchProfileAvatar", () => {
  it("downloads an HD picture from component props without calling the rate-limited API", async () => {
    fetchUserInfo.mockRejectedValue({ statusCode: 429 });
    expect(
      await fetchProfileAvatar("123", {
        username: "someone",
        full_name: "Some One",
        profile_pic_url: "small.jpg",
        hd_profile_pic_url_info: { url: "hd.jpg" },
      }),
    ).toEqual({ url: "hd.jpg", folderName: "Some One" });
    expect(fetchUserInfo).not.toHaveBeenCalled();
  });

  it("picks the largest HD version without mutating the profile data", async () => {
    const versions = [
      { url: "small.jpg", width: 150, height: 150 },
      { url: "large.jpg", width: 1080, height: 1080 },
      { url: "medium.jpg", width: 320, height: 320 },
    ];
    expect(await fetchProfileAvatar("123", { username: "someone", hd_profile_pic_versions: versions })).toEqual({
      url: "large.jpg",
      folderName: "someone",
    });
    expect(versions.map((image) => image.url)).toEqual(["small.jpg", "large.jpg", "medium.jpg"]);
    expect(fetchUserInfo).not.toHaveBeenCalled();
  });

  it("prefers an HD picture in Relay over a thumbnail in component props", async () => {
    readRelayRecord.mockImplementation((id: string, path: string) => {
      if (id !== "XDTUserDict:123") throw new Error("Wrong profile");
      if (path === "^hd_profile_pic_url_info.url") return "cached-hd.jpg";
      if (path === "full_name") return "Cached Name";
    });
    expect(await fetchProfileAvatar("123", { profile_pic_url: "thumbnail.jpg" })).toEqual({
      url: "cached-hd.jpg",
      folderName: "Cached Name",
    });
    expect(fetchUserInfo).not.toHaveBeenCalled();
  });

  it("uses the normal loaded picture when HD is unavailable, without making an API request", async () => {
    expect(await fetchProfileAvatar("123", { profile_pic_url: "loaded.jpg" })).toEqual({
      url: "loaded.jpg",
      folderName: "123",
    });
    expect(fetchUserInfo).not.toHaveBeenCalled();
  });

  it("can load the picture and username entirely from Relay", async () => {
    readRelayRecord.mockImplementation((_id: string, path: string) => {
      if (path === "profile_pic_url") return "cached.jpg";
      if (path === "username") return "cached_user";
    });
    expect(await fetchProfileAvatar("123")).toEqual({ url: "cached.jpg", folderName: "cached_user" });
    expect(fetchUserInfo).not.toHaveBeenCalled();
  });

  it("uses the displayed profile picture when component fields and Relay are unavailable", async () => {
    expect(await fetchProfileAvatar("123", {}, "displayed.jpg")).toEqual({
      url: "displayed.jpg",
      folderName: "123",
    });
    expect(fetchUserInfo).not.toHaveBeenCalled();
  });

  it("uses the user-info API when no loaded picture is available", async () => {
    fetchUserInfo.mockResolvedValue({
      pk: "123",
      username: "someone",
      full_name: "Some One",
      profile_pic_url_hd: "api-hd.jpg",
    });
    expect(await fetchProfileAvatar("123")).toEqual({ url: "api-hd.jpg", folderName: "Some One" });
    expect(fetchUserInfo).toHaveBeenCalledExactlyOnceWith("123");
  });

  it("works from component props if the Relay store cannot be read", async () => {
    readRelayRecord.mockImplementation(() => {
      throw new Error("Relay unavailable");
    });
    expect(await fetchProfileAvatar("123", { username: "someone", profile_pic_url: "loaded.jpg" })).toEqual({
      url: "loaded.jpg",
      folderName: "someone",
    });
    expect(fetchUserInfo).not.toHaveBeenCalled();
  });

  it("surfaces a 429 without retrying when no cached picture exists", async () => {
    const error = Object.assign(new Error(""), { name: "AjaxError", statusCode: 429 });
    fetchUserInfo.mockRejectedValue(error);
    await expect(fetchProfileAvatar("123")).rejects.toBe(error);
    expect(fetchUserInfo).toHaveBeenCalledExactlyOnceWith("123");
  });

  it("returns no avatar when the API has no picture", async () => {
    fetchUserInfo.mockResolvedValue({ pk: "123", username: "someone" });
    expect(await fetchProfileAvatar("123")).toBeUndefined();
  });

  it.each(["✨🔥", "...", "CON"])(
    "falls back to username when full_name (%j) sanitizes to an empty folder name",
    async (fullName) => {
      expect(
        await fetchProfileAvatar("123", {
          username: "someone",
          full_name: fullName,
          profile_pic_url: "loaded.jpg",
        }),
      ).toEqual({
        url: "loaded.jpg",
        folderName: "someone",
      });
    },
  );
});
