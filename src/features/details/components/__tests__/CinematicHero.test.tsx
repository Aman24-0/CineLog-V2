import { render, fireEvent } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import CinematicHero from "../CinematicHero";
import type { TMDBDetails, WatchlistItem } from "~/shared/types";

const baseItem: WatchlistItem = {
  id: "101",
  media_type: "movie",
  title: "House of the Dragon",
  poster_path: "/poster.jpg",
  backdrop_path: "/backdrop.jpg",
  release_date: "2022-01-01",
  status: "Planned",
  newSeasonAvailable: false
};

const details = {
  ...baseItem,
  id: 101,
  title: "House of the Dragon",
  media_type: "movie",
  tagline: "Win or die.",
  backdrop_path: "/backdrop.jpg",
  poster_path: "/poster.jpg"
} as unknown as TMDBDetails;

function renderHero(
  overrides: Partial<Parameters<typeof CinematicHero>[0]> = {}
) {
  return render(() => (
    <CinematicHero
      baseItem={baseItem}
      details={details}
      onClose={vi.fn()}
      trailerActive={false}
      trailerKey="abc123"
      hasTrailer={true}
      onPlayTrailer={vi.fn()}
      onCloseTrailer={vi.fn()}
      pageMode={true}
      {...overrides}
    />
  ));
}

describe("CinematicHero", () => {
  it("renders the dedicated page Back control and backdrop CTA without the legacy toggle", () => {
    const onClose = vi.fn();
    const { container, getByRole, queryByText } = render(() => (
      <CinematicHero
        baseItem={baseItem}
        details={details}
        onClose={onClose}
        trailerActive={false}
        trailerKey="abc123"
        hasTrailer={true}
        onPlayTrailer={vi.fn()}
        onCloseTrailer={vi.fn()}
        pageMode={true}
      />
    ));

    expect(getByRole("button", { name: "Back to previous page" })).toBeTruthy();
    expect(getByRole("button", { name: "Watch trailer" })).toBeTruthy();
    expect(queryByText("Trailer Off")).toBeNull();
    expect(queryByText("Trailer On")).toBeNull();
    expect(container.querySelector(".cinematic-backdrop")).toBeTruthy();

    fireEvent.click(getByRole("button", { name: "Back to previous page" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("swaps the CTA for the same hero-box player and exposes a close-trailer control", () => {
    const onCloseTrailer = vi.fn();
    const { container, getByRole, queryByRole } = render(() => (
      <CinematicHero
        baseItem={baseItem}
        details={details}
        onClose={vi.fn()}
        trailerActive={true}
        trailerKey="abc123"
        hasTrailer={true}
        onPlayTrailer={vi.fn()}
        onCloseTrailer={onCloseTrailer}
        pageMode={true}
      />
    ));

    expect(container.querySelector(".cinematic-hero-media")).toBeTruthy();
    expect(container.querySelector(".cinematic-trailer-player")).toBeTruthy();
    expect(container.querySelector(".cinematic-trailer-iframe")).toBeTruthy();
    expect(container.querySelector(".cinematic-backdrop")).toBeNull();
    expect(queryByRole("button", { name: "Watch trailer" })).toBeNull();

    const closeButton = getByRole("button", { name: "Close trailer" });
    fireEvent.click(closeButton);
    expect(onCloseTrailer).toHaveBeenCalledTimes(1);
  });

  it("does not render a trailer CTA when no trailer is available", () => {
    const { queryByRole } = renderHero({
      hasTrailer: false,
      trailerKey: null
    });

    expect(queryByRole("button", { name: "Watch trailer" })).toBeNull();
  });

  it("keeps the modal-compatible hero free of the dedicated page Back control", () => {
    const { queryByRole } = renderHero({ pageMode: false });

    expect(queryByRole("button", { name: "Back to previous page" })).toBeNull();
    expect(queryByRole("button", { name: "Watch trailer" })).toBeTruthy();
  });
});
