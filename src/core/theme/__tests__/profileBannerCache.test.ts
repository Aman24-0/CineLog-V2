import { afterEach, describe, expect, it } from "vitest";
import {
  getProfileBannerSignature,
  readCachedProfileBanner,
  writeCachedProfileBanner
} from "../profileBannerCache";
import { DEFAULT_PROFILE_THEME } from "../profileBannerThemeUtils";

const UID = "profile-cache-test-user";
const profile = {
  banner_type: "upload",
  banner_url: "https://example.com/banner.jpg",
  favorite_movie_id: "movie-1",
  favorite_series_id: "series-1",
  updated_at: "2026-08-25T12:00:00.000Z"
};

afterEach(() => {
  window.localStorage.clear();
});

describe("profile banner cache", () => {
  it("round-trips a last-good banner and theme for a user", () => {
    const profileSignature = getProfileBannerSignature(profile);
    writeCachedProfileBanner(UID, {
      bannerUrl: "https://cdn.example.com/banner.jpg",
      theme: DEFAULT_PROFILE_THEME,
      profileSignature
    });

    expect(readCachedProfileBanner(UID, profileSignature)).toMatchObject({
      bannerUrl: "https://cdn.example.com/banner.jpg",
      theme: DEFAULT_PROFILE_THEME,
      profileSignature
    });
  });

  it("keeps the cache valid when only updated_at changes", () => {
    const profileSignature = getProfileBannerSignature(profile);
    writeCachedProfileBanner(UID, {
      bannerUrl: "https://cdn.example.com/banner.jpg",
      theme: DEFAULT_PROFILE_THEME,
      profileSignature
    });

    const afterBioEdit = {
      ...profile,
      updated_at: "2026-08-25T12:05:00.000Z"
    };
    expect(
      readCachedProfileBanner(UID, getProfileBannerSignature(afterBioEdit))
    ).not.toBeNull();
  });

  it("does not reuse the cache after the selected banner changes", () => {
    const profileSignature = getProfileBannerSignature(profile);
    writeCachedProfileBanner(UID, {
      bannerUrl: "https://cdn.example.com/banner.jpg",
      theme: DEFAULT_PROFILE_THEME,
      profileSignature
    });

    expect(
      readCachedProfileBanner(
        UID,
        getProfileBannerSignature({ ...profile, banner_type: "default" })
      )
    ).toBeNull();
  });
});
