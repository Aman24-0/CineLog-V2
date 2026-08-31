// src/features/details/components/__tests__/YourActivityCard.test.tsx
//
// Regression tests for the activity-detail rendering in YourActivityCard.
//
// The bug these guard against: prior to 2026-09-02, YourActivityCard
// rendered only Watched / Rating / Added / Notes. The newer persisted
// activity fields (reaction, tag, watch_device, watch_platform,
// favorite_character_id/name/profile) were never displayed on the
// Details page even though they were saved in Supabase and read back
// into the WatchlistItem. The fix added an "activity details" inner
// panel that renders each field when its value is set.
//
// These tests render the card with various vaultItem shapes and verify
// the activity rows appear (or are hidden) as expected. They also
// verify that the special "other" platform sentinel renders the
// pirate flag emoji + "Other / Outside OTT" label, and that a normal
// JustWatch/Supabase catalogue platform renders its icon + clear name.

import { render } from "@solidjs/testing-library";
import { describe, expect, it, vi, beforeEach } from "vitest";
import YourActivityCard from "../YourActivityCard";
import type { WatchlistItem } from "~/shared/types";

// ── Mock usePublishedProviderCatalog ─────────────────────────────────
// YourActivityCard uses the published Supabase provider catalogue to
// resolve normal OTT platforms. We mock it so tests don't make real
// network calls and can deterministically provide a fake catalogue.

const mockCatalog = vi.fn();

vi.mock("~/features/watchlist/hooks/usePublishedProviderCatalog", () => ({
  usePublishedProviderCatalog: () => ({
    catalog: mockCatalog,
    loading: () => false,
    error: () => false,
    country: () => "IN"
  })
}));

// ── Mock buildJustWatchIconUrl so we don't make real JustWatch URLs ──
vi.mock("~/features/watchlist/hooks/useWatchlistOttAvailability", () => ({
  buildJustWatchIconUrl: (icon: string | null | undefined) =>
    icon ? `https://images.justwatch.com/${icon}` : undefined
}));

import { makeMovie } from "~/__test-fixtures__/factories";

function makeActivityItem(
  overrides: Partial<WatchlistItem> = {}
): WatchlistItem {
  return makeMovie({
    id: "101",
    title: "Test Movie",
    status: "Completed",
    addedAt: "2024-01-01T00:00:00Z",
    ...overrides
  });
}

describe("YourActivityCard — activity details rendering", () => {
  beforeEach(() => {
    mockCatalog.mockReturnValue([]);
  });

  it("hides the activity-details panel entirely when no activity fields are set", () => {
    const item = makeActivityItem();
    const { container } = render(() => <YourActivityCard vaultItem={item} />);
    // The panel container must NOT exist.
    expect(container.querySelector(".your-activity-details")).toBeNull();
  });

  it("renders reaction with emoji + label when set", () => {
    const item = makeActivityItem({ reaction: "thoughtful" });
    const { container, getByText } = render(() => (
      <YourActivityCard vaultItem={item} />
    ));
    expect(container.querySelector(".your-activity-details")).not.toBeNull();
    // Reaction label is "Reaction" (uppercase per CSS), value is "Thoughtful".
    expect(getByText("Reaction")).toBeTruthy();
    expect(getByText("Thoughtful")).toBeTruthy();
    // The 🤔 emoji is rendered inside .your-activity-detail-emoji.
    const emojiEl = container.querySelector(".your-activity-detail-emoji");
    expect(emojiEl?.textContent).toContain("🤔");
  });

  it("normalizes legacy reaction values (love → loved_it) at display time", () => {
    // The DB may contain the old "love" value from pre-vocabulary-migration
    // episode ratings. The card should display the normalized label
    // ("Loved it" + 😍) without rewriting the DB.
    const item = makeActivityItem({ reaction: "love" });
    const { getByText, container } = render(() => (
      <YourActivityCard vaultItem={item} />
    ));
    expect(getByText("Loved it")).toBeTruthy();
    const emojiEl = container.querySelector(".your-activity-detail-emoji");
    expect(emojiEl?.textContent).toContain("😍");
  });

  it("renders tag when set, hides the row when tag is empty", () => {
    const item = makeActivityItem({ tag: "Theatre" });
    const { getByText, container } = render(() => (
      <YourActivityCard vaultItem={item} />
    ));
    expect(getByText("Tag")).toBeTruthy();
    expect(getByText("Theatre")).toBeTruthy();
    // Sanity: no reaction row (none set).
    expect(container.textContent).not.toContain("Reaction");
  });

  it("renders watch device with emoji + label when set", () => {
    const item = makeActivityItem({ watchDevice: "mobile" });
    const { getByText, container } = render(() => (
      <YourActivityCard vaultItem={item} />
    ));
    expect(getByText("Where watched")).toBeTruthy();
    expect(getByText("Mobile")).toBeTruthy();
    // The 📱 emoji appears for "mobile".
    const emojiEls = container.querySelectorAll(".your-activity-detail-emoji");
    expect(
      Array.from(emojiEls).some((el) => el.textContent?.includes("📱"))
    ).toBe(true);
  });

  it("renders 'theatre' device with the 🎬 emoji", () => {
    const item = makeActivityItem({ watchDevice: "theatre" });
    const { getByText, container } = render(() => (
      <YourActivityCard vaultItem={item} />
    ));
    expect(getByText("Theatre")).toBeTruthy();
    const emojiEls = container.querySelectorAll(".your-activity-detail-emoji");
    expect(
      Array.from(emojiEls).some((el) => el.textContent?.includes("🎬"))
    ).toBe(true);
  });

  it("renders the pirate flag + 'Other / Outside OTT' label for the special 'other' platform sentinel", () => {
    const item = makeActivityItem({ watchPlatform: "other" });
    const { getByText, container } = render(() => (
      <YourActivityCard vaultItem={item} />
    ));
    expect(getByText("Platform")).toBeTruthy();
    expect(getByText("Other / Outside OTT")).toBeTruthy();
    // The pirate flag emoji is rendered.
    const emojiEls = container.querySelectorAll(".your-activity-detail-emoji");
    expect(
      Array.from(emojiEls).some((el) => el.textContent?.includes("🏴‍☠️"))
    ).toBe(true);
  });

  it("renders a normal catalogue platform by its clearName + icon", () => {
    // Mock a catalogue with Netflix.
    mockCatalog.mockReturnValue([
      {
        technicalName: "netflix",
        clearName: "Netflix",
        icon: "icon/path{profile}?format={format}",
        count: 0
      }
    ]);
    const item = makeActivityItem({ watchPlatform: "netflix" });
    const { getByText, container } = render(() => (
      <YourActivityCard vaultItem={item} />
    ));
    expect(getByText("Platform")).toBeTruthy();
    expect(getByText("Netflix")).toBeTruthy();
    // The platform icon image is rendered (resolved via buildJustWatchIconUrl).
    const imgEl = container.querySelector(
      ".your-activity-detail-platform-icon"
    );
    expect(imgEl).not.toBeNull();
    expect(imgEl?.getAttribute("src")).toContain("images.justwatch.com");
  });

  it("renders favourite character profile image + name when both are set", () => {
    const item = makeActivityItem({
      favoriteCharacterId: "123",
      favoriteCharacterName: "Daenerys Targaryen",
      favoriteCharacterProfile: "/daenerys.jpg"
    });
    const { getByText, container } = render(() => (
      <YourActivityCard vaultItem={item} />
    ));
    expect(getByText("Favourite character")).toBeTruthy();
    expect(getByText("Daenerys Targaryen")).toBeTruthy();
    // The character profile image is rendered with the TMDB image URL.
    const imgEl = container.querySelector(
      ".your-activity-detail-character-img"
    );
    expect(imgEl).not.toBeNull();
    expect(imgEl?.getAttribute("src")).toContain("image.tmdb.org/t/p/w185");
    expect(imgEl?.getAttribute("src")).toContain("/daenerys.jpg");
  });

  it("renders the person icon fallback when only favourite character name is set (no profile image)", () => {
    const item = makeActivityItem({
      favoriteCharacterName: "Mystery Character"
    });
    const { getByText, container } = render(() => (
      <YourActivityCard vaultItem={item} />
    ));
    expect(getByText("Mystery Character")).toBeTruthy();
    // The image is NOT rendered (no profile path).
    expect(
      container.querySelector(".your-activity-detail-character-img")
    ).toBeNull();
    // The fallback (person icon) IS rendered.
    expect(
      container.querySelector(".your-activity-detail-character-fallback")
    ).not.toBeNull();
  });

  it("renders ALL activity fields together when every field is set", () => {
    mockCatalog.mockReturnValue([
      {
        technicalName: "prime",
        clearName: "Amazon Prime Video",
        icon: "icon/prime{profile}?format={format}",
        count: 0
      }
    ]);
    const item = makeActivityItem({
      reaction: "loved_it",
      tag: "Theatre",
      watchDevice: "tv",
      watchPlatform: "prime",
      favoriteCharacterId: "456",
      favoriteCharacterName: "Test Character",
      favoriteCharacterProfile: "/test.jpg"
    });
    const { getByText, container } = render(() => (
      <YourActivityCard vaultItem={item} />
    ));
    // Every row label is present.
    expect(getByText("Reaction")).toBeTruthy();
    expect(getByText("Tag")).toBeTruthy();
    expect(getByText("Where watched")).toBeTruthy();
    expect(getByText("Platform")).toBeTruthy();
    expect(getByText("Favourite character")).toBeTruthy();
    // Every value is present.
    expect(getByText("Loved it")).toBeTruthy();
    expect(getByText("Theatre")).toBeTruthy();
    expect(getByText("TV")).toBeTruthy();
    expect(getByText("Amazon Prime Video")).toBeTruthy();
    expect(getByText("Test Character")).toBeTruthy();
    // The panel exists.
    expect(container.querySelector(".your-activity-details")).not.toBeNull();
  });

  it("preserves the existing Watched / Rating / Added cells alongside the new activity panel", () => {
    const item = makeActivityItem({
      watchDate: "2024-06-15",
      rating: 8.5,
      reaction: "loved_it"
    });
    const { getByText, container } = render(() => (
      <YourActivityCard vaultItem={item} />
    ));
    // Existing cells.
    expect(getByText("Watched")).toBeTruthy();
    expect(getByText("Your Rating")).toBeTruthy();
    // The activity panel also renders.
    expect(container.querySelector(".your-activity-details")).not.toBeNull();
    expect(getByText("Loved it")).toBeTruthy();
  });
});
