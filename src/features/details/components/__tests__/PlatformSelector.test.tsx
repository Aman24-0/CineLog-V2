// src/features/details/components/__tests__/PlatformSelector.test.tsx
//
// Tests for the "Other / Outside OTT" platform tile added to
// PlatformSelector inside DetailsEditForm (2026-09-02 Task 3).
//
// The bug these guard against: prior to 2026-09-02, PlatformSelector
// rendered only "None" + the published JustWatch/Supabase providers.
// There was no way for a user to record that they watched a title
// OUTSIDE the OTT catalogue (a pirated stream, a downloaded file, a
// physical disc, etc.). The fix added a special "other" tile (pirate
// flag 🏴‍☠️) BEFORE the catalogue providers. It is a UI-only sentinel —
// NOT added to the Supabase justwatch_provider_catalog table. Clicking
// it persists the stable value "other" to vault.watch_platform. Clicking
// it again clears the platform (matching every other tile).
//
// These tests render DetailsEditForm with a mocked provider catalogue
// and verify the "other" tile:
//   - is rendered before the catalogue providers
//   - has the pirate flag emoji
//   - has aria-label "Other / Outside OTT"
//   - clicking it sets watchPlatform to "other"
//   - clicking it when already selected clears watchPlatform to ""
//   - when watchPlatform === "other", the tile is marked aria-pressed
//     (so the read-back correctly highlights the pirate tile after Save)

import { render, fireEvent } from "@solidjs/testing-library";
import { describe, expect, it, vi, beforeEach } from "vitest";
import DetailsEditForm from "../DetailsEditForm";
import type { Accessor } from "solid-js";

// ── Mocks ─────────────────────────────────────────────────────────────

const mockCatalog = vi.fn();

vi.mock("~/features/watchlist/hooks/usePublishedProviderCatalog", () => ({
  usePublishedProviderCatalog: () => ({
    catalog: mockCatalog,
    loading: () => false,
    error: () => false,
    country: () => "IN"
  })
}));

vi.mock("~/features/watchlist/hooks/useWatchlistOttAvailability", () => ({
  buildJustWatchIconUrl: (icon: string | null | undefined) =>
    icon ? `https://images.justwatch.com/${icon}` : undefined
}));

vi.mock("~/features/watchlist/tagStore", () => ({
  readTagDefinitions: () => []
}));

vi.mock("~/shared/ui/Icon", () => ({
  default: () => null
}));

vi.mock("~/shared/ui/ReactionPicker", () => ({
  default: () => null
}));

// ── Helpers ───────────────────────────────────────────────────────────

interface FormShape {
  status: string;
  rating: string;
  watchDate: string;
  notes: string;
  rewatchCount: string;
  rewatchDates: string[];
  seasonDates: Record<string, { start: string; end: string }>;
  seasonRewatchCount: string;
  seasonRewatchDates: Record<string, { start: string; end: string }>[];
  tag: string;
  reaction: string;
  watchDevice: string;
  watchPlatform: string;
  favoriteCharacterId: string;
  favoriteCharacterName: string;
  favoriteCharacterProfile: string;
}

function makeForm(overrides: Partial<FormShape> = {}): FormShape {
  return {
    status: "Planned",
    rating: "",
    watchDate: "",
    notes: "",
    rewatchCount: "0",
    rewatchDates: [] as string[],
    seasonDates: {} as Record<string, { start: string; end: string }>,
    seasonRewatchCount: "0",
    seasonRewatchDates: [] as Record<string, { start: string; end: string }>[],
    tag: "",
    reaction: "",
    watchDevice: "",
    watchPlatform: "",
    favoriteCharacterId: "",
    favoriteCharacterName: "",
    favoriteCharacterProfile: "",
    ...overrides
  };
}

function renderForm(initialPlatform: string) {
  const setForm = vi.fn();
  // Keep a local mirror of the form so the rendered component reflects
  // setForm calls (Solid is reactive — we manually update the signal
  // when setForm is invoked so the UI updates for the next assertion).
  let formState = makeForm({ watchPlatform: initialPlatform });
  const form: Accessor<FormShape> = () => formState;
  const setFormWrapper = (key: string, value: string) => {
    setForm(key, value);
    formState = { ...formState, [key]: value };
  };
  const utils = render(() => (
    <DetailsEditForm
      form={form}
      setForm={setFormWrapper}
      onSave={vi.fn()}
      onCancel={vi.fn()}
      isSaving={false}
      isDirty={false}
      details={() => null}
      isSeries={() => false}
    />
  ));
  return { ...utils, setForm, form };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("PlatformSelector — 'Other / Outside OTT' pirate tile (2026-09-02 Task 3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: a small catalogue with Netflix + Prime so we can verify
    // the pirate tile appears BEFORE the catalogue providers.
    mockCatalog.mockReturnValue([
      {
        technicalName: "netflix",
        clearName: "Netflix",
        icon: "icon/netflix{profile}?format={format}",
        count: 0
      },
      {
        technicalName: "prime",
        clearName: "Amazon Prime Video",
        icon: "icon/prime{profile}?format={format}",
        count: 0
      }
    ]);
  });

  it("renders the pirate flag tile with the correct aria-label", () => {
    const { getByRole } = renderForm("");
    const pirateButton = getByRole("button", {
      name: "Other / Outside OTT"
    });
    expect(pirateButton).toBeTruthy();
    // The pirate flag emoji is rendered inside the button.
    expect(pirateButton.textContent).toContain("🏴‍☠️");
  });

  it("renders the pirate tile BEFORE the catalogue providers (after None)", () => {
    // We verify the DOM order: the "None" tile, then the pirate tile,
    // then the catalogue providers.
    const { container } = renderForm("");
    const tiles = container.querySelectorAll(".platform-logo-tile");
    expect(tiles.length).toBeGreaterThanOrEqual(3); // None + pirate + at least 1 catalogue
    // Tile 0: None (has the block icon)
    expect(tiles[0]?.querySelector(".material-symbols-outlined")?.textContent).toContain("block");
    // Tile 1: pirate flag
    expect(tiles[1]?.textContent).toContain("🏴‍☠️");
    // Tile 2: first catalogue provider (Netflix)
    expect(tiles[2]?.querySelector("img")?.getAttribute("src")).toContain(
      "images.justwatch.com"
    );
  });

  it("clicking the pirate tile sets watchPlatform to 'other'", () => {
    const { getByRole, setForm } = renderForm("");
    const pirateButton = getByRole("button", {
      name: "Other / Outside OTT"
    });
    fireEvent.click(pirateButton);
    expect(setForm).toHaveBeenCalledWith("watchPlatform", "other");
  });

  it("clicking the pirate tile when already selected clears watchPlatform", () => {
    // The tile behaves like every other platform tile — clicking the
    // already-selected tile clears the selection.
    const { getByRole, setForm } = renderForm("other");
    const pirateButton = getByRole("button", {
      name: "Other / Outside OTT"
    });
    // aria-pressed should be true initially (the tile is selected).
    expect(pirateButton.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(pirateButton);
    expect(setForm).toHaveBeenCalledWith("watchPlatform", "");
  });

  it("when watchPlatform === 'other', the pirate tile is marked aria-pressed='true' (read-back)", () => {
    // This is the read-back verification: when the Edit modal reopens
    // after the user saved watchPlatform = "other", the pirate tile
    // must highlight as selected so the user can see their previous choice.
    const { getByRole } = renderForm("other");
    const pirateButton = getByRole("button", {
      name: "Other / Outside OTT"
    });
    expect(pirateButton.getAttribute("aria-pressed")).toBe("true");
  });

  it("when watchPlatform is unset, the pirate tile is NOT pressed (None is pressed instead)", () => {
    const { getByRole } = renderForm("");
    const pirateButton = getByRole("button", {
      name: "Other / Outside OTT"
    });
    expect(pirateButton.getAttribute("aria-pressed")).toBe("false");
    // The "None" tile IS pressed.
    const noneButton = getByRole("button", { name: "No platform" });
    expect(noneButton.getAttribute("aria-pressed")).toBe("true");
  });

  it("when watchPlatform is a normal catalogue platform, the pirate tile is NOT pressed", () => {
    const { getByRole } = renderForm("netflix");
    const pirateButton = getByRole("button", {
      name: "Other / Outside OTT"
    });
    expect(pirateButton.getAttribute("aria-pressed")).toBe("false");
    // The Netflix tile IS pressed.
    const netflixButton = getByRole("button", { name: "Netflix" });
    expect(netflixButton.getAttribute("aria-pressed")).toBe("true");
  });

  it("still renders the 'None' tile alongside the pirate tile", () => {
    const { getByRole } = renderForm("");
    expect(getByRole("button", { name: "No platform" })).toBeTruthy();
    expect(getByRole("button", { name: "Other / Outside OTT" })).toBeTruthy();
  });

  it("still renders all published catalogue providers alongside the pirate tile", () => {
    const { getByRole } = renderForm("");
    expect(getByRole("button", { name: "Netflix" })).toBeTruthy();
    expect(getByRole("button", { name: "Amazon Prime Video" })).toBeTruthy();
  });
});
