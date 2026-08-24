import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import ProfileBanner from "../ProfileBanner";
import type { ProfileData } from "../../useProfileData";

const STORAGE_BANNER =
  "https://vyckwoivdmlvbvsufuus.supabase.co/storage/v1/object/public/banners/user/banner.jpg";
const UPDATED_AT = "2026-08-25T12:00:00.000Z";

function profileData(
  bannerType: "upload" | "url" | "favorite_movie" | "default",
  bannerUrl: string | null = null
): ProfileData {
  return {
    profile: {
      banner_type: bannerType,
      banner_url: bannerUrl,
      updated_at: UPDATED_AT
    } as ProfileData["profile"],
    favoriteMovie: null,
    favoriteSeries: null,
    favoriteDirector: null
  };
}

afterEach(() => cleanup());

describe("ProfileBanner source and recovery behavior", () => {
  it("renders an uploaded Storage banner with the profile update version", () => {
    const { container } = render(() => (
      <ProfileBanner
        data={profileData("upload", STORAGE_BANNER)}
        isEditing={false}
      />
    ));

    const image = container.querySelector("img");
    expect(image).not.toBeNull();
    expect(new URL(image!.src).searchParams.get("v")).toBe(UPDATED_AT);
  });

  it("renders a pasted external URL without adding a Storage cache token", () => {
    const external = "https://images.example.com/new-banner.jpg";
    const { container } = render(() => (
      <ProfileBanner data={profileData("url", external)} isEditing={false} />
    ));

    expect(container.querySelector("img")?.getAttribute("src")).toBe(external);
  });

  it("uses the favorite movie backdrop for Automatic mode", () => {
    const data = profileData("favorite_movie");
    data.favoriteMovie = { backdrop_path: "/movie-backdrop.jpg" } as never;

    const { container } = render(() => (
      <ProfileBanner data={data} isEditing={false} />
    ));

    expect(container.querySelector("img")?.getAttribute("src")).toContain(
      "/t/p/w1280/movie-backdrop.jpg"
    );
  });

  it("falls back to the favorite series backdrop when no movie exists", () => {
    const data = profileData("favorite_movie");
    data.favoriteSeries = { backdrop_path: "/series-backdrop.jpg" } as never;

    const { container } = render(() => (
      <ProfileBanner data={data} isEditing={false} />
    ));

    expect(container.querySelector("img")?.getAttribute("src")).toContain(
      "/t/p/w1280/series-backdrop.jpg"
    );
  });

  it("renders the gradient for Default mode", () => {
    const { container } = render(() => (
      <ProfileBanner data={profileData("default")} isEditing={false} />
    ));

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".profile-banner-gradient")).not.toBeNull();
  });

  it("moves from a failed custom image to favorite artwork and then gradient", () => {
    const data = profileData("url", "https://images.example.com/broken.jpg");
    data.favoriteMovie = { backdrop_path: "/fallback.jpg" } as never;
    const { container } = render(() => (
      <ProfileBanner data={data} isEditing={false} />
    ));

    let image = container.querySelector("img");
    expect(image?.getAttribute("src")).toBe(
      "https://images.example.com/broken.jpg"
    );

    fireEvent.error(image!);
    image = container.querySelector("img");
    expect(image?.getAttribute("src")).toContain("/t/p/w1280/fallback.jpg");

    fireEvent.error(image!);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".profile-banner-gradient")).not.toBeNull();
  });
});
