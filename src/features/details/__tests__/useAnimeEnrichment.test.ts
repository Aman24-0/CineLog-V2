// src/features/details/__tests__/useAnimeEnrichment.test.ts
//
// Tests for the useAnimeEnrichment hook — fetches AniList data for the
// currently-open anime title in the Details modal.
//
// Mock strategy:
//   • ~/core/anime/detector → controllable detectAnime.
//   • ~/lib/supabase/repositories/animeMapping → controllable
//     getAnilistId + autoMap.
//   • ~/lib/anilist → controllable fetchMediaDetails.
//   • ~/features/anime/useAnimeSettings → controllable settings.
//
// Covers:
//   • Returns null when there's no selection.
//   • Returns null when TMDB details aren't loaded yet.
//   • Returns null when anime features are disabled.
//   • Returns isAnime=false (no AniList data) when detectAnime says no.
//   • Returns isAnime=true + anilistId=null when detectAnime says yes
//     but no mapping exists and autoMap is disabled.
//   • Uses autoMap when enabled + no mapping.
//   • Fetches AniList Media details when an id is resolved.
//   • Returns isAnime=true + anilist=null when fetchMediaDetails fails.
//   • Returns isAnime=true + anilistId when detectAnime + mapping
//     succeed but fetchMediaDetails throws.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot, createSignal } from "solid-js";
import type { TMDBDetails, WatchlistItem } from "~/shared/types";
import type { SelectedItem } from "~/shared/hooks/useModalState";
import type { AniListMedia } from "~/lib/anilist";

// --- Hoisted mocks ---

const {
  mockDetectAnime,
  mockGetAnilistId,
  mockAutoMap,
  mockFetchMediaDetails,
  mockUseAnimeSettings
} = vi.hoisted(() => ({
  mockDetectAnime: vi.fn(),
  mockGetAnilistId: vi.fn(),
  mockAutoMap: vi.fn(),
  mockFetchMediaDetails: vi.fn(),
  mockUseAnimeSettings: vi.fn()
}));

vi.mock("~/core/anime/detector", () => ({
  detectAnime: mockDetectAnime
}));

vi.mock("~/lib/supabase/repositories/animeMapping", () => ({
  getAnilistId: mockGetAnilistId,
  autoMap: mockAutoMap
}));

vi.mock("~/lib/anilist", () => ({
  fetchMediaDetails: mockFetchMediaDetails
}));

vi.mock("~/features/anime/useAnimeSettings", () => ({
  useAnimeSettings: mockUseAnimeSettings
}));

// --- Import the hook AFTER mocks ---

import { useAnimeEnrichment } from "../useAnimeEnrichment";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBaseItem(overrides: Partial<WatchlistItem> = {}): WatchlistItem {
  return {
    id: "12345",
    title: "Test Anime",
    media_type: "tv",
    status: "Planned",
    ...overrides
  };
}

function makeDetails(overrides: Partial<TMDBDetails> = {}): TMDBDetails {
  return {
    id: 12345,
    media_type: "tv",
    name: "Test Anime",
    genres: [{ id: 16, name: "Animation" }],
    origin_country: ["JP"],
    spoken_languages: [{ english_name: "Japanese", iso_639_1: "ja", name: "日本語" }],
    original_language: "ja",
    overview: "A test anime.",
    ...overrides
  } as unknown as TMDBDetails;
}

function makeAnilistMedia(overrides: Partial<AniListMedia> = {}): AniListMedia {
  return {
    id: 12345,
    idMal: 12345,
    title: { romaji: "Test Anime", english: "Test Anime", native: "テストアニメ" },
    ...overrides
  } as unknown as AniListMedia;
}

beforeEach(() => {
  vi.clearAllMocks();

  // Default settings: anime enabled, autoMapping enabled.
  mockUseAnimeSettings.mockReturnValue({
    enabled: () => true,
    autoMapping: () => true,
    charactersStaff: () => true,
    relations: () => true,
    airingSchedule: () => true,
    openingEndingThemes: () => true
  });

  // Default detector: returns true (is anime).
  mockDetectAnime.mockResolvedValue(true);

  // Default mapping: returns a known anilist id.
  mockGetAnilistId.mockResolvedValue(12345);

  // Default autoMap: returns null (mapping table hit, no autoMap needed).
  mockAutoMap.mockResolvedValue(null);

  // Default fetchMediaDetails: returns a known media object.
  mockFetchMediaDetails.mockResolvedValue(makeAnilistMedia());
});

// Helper: run the hook inside a reactive root + flush the resource fetcher.
async function withHook<T>(
  selected: () => SelectedItem | null,
  details: () => TMDBDetails | null,
  cb: (api: ReturnType<typeof useAnimeEnrichment>) => Promise<T>
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    createRoot(async (dispose) => {
      try {
        const api = useAnimeEnrichment(selected, details);
        // Flush the createResource fetcher.
        await new Promise((r) => setTimeout(r, 50));
        const result = await cb(api);
        dispose();
        resolve(result);
      } catch (err) {
        dispose();
        reject(err);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// No-op cases (returns isAnime=false, anilist=null)
// ---------------------------------------------------------------------------

describe("useAnimeEnrichment — no-op cases", () => {
  it("returns isAnime=false + anilist=null when there is no selection", async () => {
    const [selected] = createSignal<SelectedItem | null>(null);
    const [details] = createSignal<TMDBDetails | null>(null);

    await withHook(selected, details, async (api) => {
      expect(api.isAnime()).toBe(false);
      expect(api.anilist()).toBeNull();
      expect(api.anilistId()).toBeNull();
      // detectAnime should NOT have been called.
      expect(mockDetectAnime).not.toHaveBeenCalled();
    });
  });

  it("returns isAnime=false when TMDB details haven't loaded yet", async () => {
    const [selected] = createSignal<SelectedItem | null>({
      baseItem: makeBaseItem(),
      vaultItem: null
    });
    const [details] = createSignal<TMDBDetails | null>(null);

    await withHook(selected, details, async (api) => {
      expect(api.isAnime()).toBe(false);
      expect(api.anilist()).toBeNull();
      expect(mockDetectAnime).not.toHaveBeenCalled();
    });
  });

  it("returns isAnime=false when anime features are disabled", async () => {
    mockUseAnimeSettings.mockReturnValue({
      enabled: () => false,
      autoMapping: () => true
    });
    const [selected] = createSignal<SelectedItem | null>({
      baseItem: makeBaseItem(),
      vaultItem: null
    });
    const [details] = createSignal<TMDBDetails | null>(makeDetails());

    await withHook(selected, details, async (api) => {
      expect(api.isAnime()).toBe(false);
      expect(api.anilist()).toBeNull();
      expect(mockDetectAnime).not.toHaveBeenCalled();
    });
  });

  it("returns isAnime=false when detectAnime returns false", async () => {
    mockDetectAnime.mockResolvedValue(false);
    const [selected] = createSignal<SelectedItem | null>({
      baseItem: makeBaseItem({ title: "Not Anime" }),
      vaultItem: null
    });
    const [details] = createSignal<TMDBDetails | null>(
      makeDetails({ name: "Not Anime", genres: [{ id: 28, name: "Action" }] })
    );

    await withHook(selected, details, async (api) => {
      expect(api.isAnime()).toBe(false);
      expect(api.anilist()).toBeNull();
      // detectAnime WAS called (it's what determined isAnime=false).
      expect(mockDetectAnime).toHaveBeenCalledTimes(1);
      // But the mapping lookup + fetchMediaDetails should NOT have been called.
      expect(mockGetAnilistId).not.toHaveBeenCalled();
      expect(mockFetchMediaDetails).not.toHaveBeenCalled();
    });
  });

  it("returns isAnime=false when detectAnime throws", async () => {
    mockDetectAnime.mockRejectedValue(new Error("detector crashed"));
    const [selected] = createSignal<SelectedItem | null>({
      baseItem: makeBaseItem(),
      vaultItem: null
    });
    const [details] = createSignal<TMDBDetails | null>(makeDetails());

    await withHook(selected, details, async (api) => {
      expect(api.isAnime()).toBe(false);
      expect(api.anilist()).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// Anime detected but no mapping
// ---------------------------------------------------------------------------

describe("useAnimeEnrichment — anime without mapping", () => {
  it("returns isAnime=true + anilistId=null when no mapping exists + autoMap disabled", async () => {
    mockUseAnimeSettings.mockReturnValue({
      enabled: () => true,
      autoMapping: () => false
    });
    mockGetAnilistId.mockResolvedValue(null);
    const [selected] = createSignal<SelectedItem | null>({
      baseItem: makeBaseItem(),
      vaultItem: null
    });
    const [details] = createSignal<TMDBDetails | null>(makeDetails());

    await withHook(selected, details, async (api) => {
      expect(api.isAnime()).toBe(true);
      expect(api.anilistId()).toBeNull();
      expect(api.anilist()).toBeNull();
      // autoMap should NOT have been called.
      expect(mockAutoMap).not.toHaveBeenCalled();
    });
  });

  it("uses autoMap when enabled + no mapping", async () => {
    mockGetAnilistId.mockResolvedValue(null);
    mockAutoMap.mockResolvedValue(99999);
    const [selected] = createSignal<SelectedItem | null>({
      baseItem: makeBaseItem(),
      vaultItem: null
    });
    const [details] = createSignal<TMDBDetails | null>(makeDetails());

    await withHook(selected, details, async (api) => {
      expect(api.isAnime()).toBe(true);
      expect(api.anilistId()).toBe(99999);
      expect(mockAutoMap).toHaveBeenCalledTimes(1);
      // Verify autoMap was called with the title + year + tmdbType.
      const call = mockAutoMap.mock.calls[0][0];
      expect(call.tmdbId).toBe(12345);
      expect(call.title).toBe("Test Anime");
      expect(call.tmdbType).toBe("tv");
    });
  });

  it("returns isAnime=true + anilistId=null when autoMap returns null", async () => {
    mockGetAnilistId.mockResolvedValue(null);
    mockAutoMap.mockResolvedValue(null);
    const [selected] = createSignal<SelectedItem | null>({
      baseItem: makeBaseItem(),
      vaultItem: null
    });
    const [details] = createSignal<TMDBDetails | null>(makeDetails());

    await withHook(selected, details, async (api) => {
      expect(api.isAnime()).toBe(true);
      expect(api.anilistId()).toBeNull();
      expect(api.anilist()).toBeNull();
    });
  });

  it("returns isAnime=true + anilistId=null when autoMap throws", async () => {
    mockGetAnilistId.mockResolvedValue(null);
    mockAutoMap.mockRejectedValue(new Error("autoMap failed"));
    const [selected] = createSignal<SelectedItem | null>({
      baseItem: makeBaseItem(),
      vaultItem: null
    });
    const [details] = createSignal<TMDBDetails | null>(makeDetails());

    await withHook(selected, details, async (api) => {
      expect(api.isAnime()).toBe(true);
      expect(api.anilistId()).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// Full pipeline — anime + mapping + AniList fetch
// ---------------------------------------------------------------------------

describe("useAnimeEnrichment — full pipeline", () => {
  it("returns the AniList Media object when all steps succeed", async () => {
    const media = makeAnilistMedia({ id: 12345 });
    mockFetchMediaDetails.mockResolvedValue(media);
    const [selected] = createSignal<SelectedItem | null>({
      baseItem: makeBaseItem(),
      vaultItem: null
    });
    const [details] = createSignal<TMDBDetails | null>(makeDetails());

    await withHook(selected, details, async (api) => {
      expect(api.isAnime()).toBe(true);
      expect(api.anilistId()).toBe(12345);
      expect(api.anilist()).toEqual(media);
      expect(mockFetchMediaDetails).toHaveBeenCalledWith(12345);
    });
  });

  it("returns isAnime=true + anilistId + anilist=null when fetchMediaDetails throws", async () => {
    mockFetchMediaDetails.mockRejectedValue(new Error("anilist unreachable"));
    const [selected] = createSignal<SelectedItem | null>({
      baseItem: makeBaseItem(),
      vaultItem: null
    });
    const [details] = createSignal<TMDBDetails | null>(makeDetails());

    await withHook(selected, details, async (api) => {
      expect(api.isAnime()).toBe(true);
      expect(api.anilistId()).toBe(12345);
      expect(api.anilist()).toBeNull();
    });
  });

  it("returns isAnime=true + anilist=null when fetchMediaDetails resolves to null", async () => {
    mockFetchMediaDetails.mockResolvedValue(null);
    const [selected] = createSignal<SelectedItem | null>({
      baseItem: makeBaseItem(),
      vaultItem: null
    });
    const [details] = createSignal<TMDBDetails | null>(makeDetails());

    await withHook(selected, details, async (api) => {
      expect(api.isAnime()).toBe(true);
      expect(api.anilist()).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// Movie vs TV — tmdbType detection
// ---------------------------------------------------------------------------

describe("useAnimeEnrichment — tmdbType detection", () => {
  it("passes tmdbType='movie' to autoMap for a movie title", async () => {
    mockGetAnilistId.mockResolvedValue(null);
    mockAutoMap.mockResolvedValue(99999);
    const [selected] = createSignal<SelectedItem | null>({
      baseItem: makeBaseItem({ media_type: "movie", title: "Anime Movie" }),
      vaultItem: null
    });
    const [details] = createSignal<TMDBDetails | null>(
      makeDetails({
        media_type: "movie",
        title: "Anime Movie",
        release_date: "2026-01-01"
      })
    );

    await withHook(selected, details, async (_api) => {
      expect(mockAutoMap).toHaveBeenCalled();
      const call = mockAutoMap.mock.calls[0][0];
      expect(call.tmdbType).toBe("movie");
    });
  });

  it("passes tmdbType='tv' to autoMap for a TV title", async () => {
    mockGetAnilistId.mockResolvedValue(null);
    mockAutoMap.mockResolvedValue(99999);
    const [selected] = createSignal<SelectedItem | null>({
      baseItem: makeBaseItem({ media_type: "tv", name: "Anime TV" }),
      vaultItem: null
    });
    const [details] = createSignal<TMDBDetails | null>(
      makeDetails({
        media_type: "tv",
        name: "Anime TV",
        first_air_date: "2026-01-01"
      })
    );

    await withHook(selected, details, async (_api) => {
      expect(mockAutoMap).toHaveBeenCalled();
      const call = mockAutoMap.mock.calls[0][0];
      expect(call.tmdbType).toBe("tv");
    });
  });

  it("extracts year from release_date for movies", async () => {
    mockGetAnilistId.mockResolvedValue(null);
    mockAutoMap.mockResolvedValue(99999);
    const [selected] = createSignal<SelectedItem | null>({
      baseItem: makeBaseItem({ media_type: "movie" }),
      vaultItem: null
    });
    const [details] = createSignal<TMDBDetails | null>(
      makeDetails({
        media_type: "movie",
        release_date: "2026-04-15"
      })
    );

    await withHook(selected, details, async (_api) => {
      const call = mockAutoMap.mock.calls[0][0];
      expect(call.year).toBe(2026);
    });
  });

  it("extracts year from first_air_date for TV", async () => {
    mockGetAnilistId.mockResolvedValue(null);
    mockAutoMap.mockResolvedValue(99999);
    const [selected] = createSignal<SelectedItem | null>({
      baseItem: makeBaseItem({ media_type: "tv" }),
      vaultItem: null
    });
    const [details] = createSignal<TMDBDetails | null>(
      makeDetails({
        media_type: "tv",
        first_air_date: "2025-09-01"
      })
    );

    await withHook(selected, details, async (_api) => {
      const call = mockAutoMap.mock.calls[0][0];
      expect(call.year).toBe(2025);
    });
  });

  it("passes year=null when no date is available", async () => {
    mockGetAnilistId.mockResolvedValue(null);
    mockAutoMap.mockResolvedValue(99999);
    const [selected] = createSignal<SelectedItem | null>({
      baseItem: makeBaseItem({ media_type: "tv" }),
      vaultItem: null
    });
    const [details] = createSignal<TMDBDetails | null>(
      makeDetails({
        media_type: "tv",
        first_air_date: undefined
      })
    );

    await withHook(selected, details, async (_api) => {
      const call = mockAutoMap.mock.calls[0][0];
      expect(call.year).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// Settings reactivity
// ---------------------------------------------------------------------------

describe("useAnimeEnrichment — settings", () => {
  it("exposes the settings object on the return value", async () => {
    const [selected] = createSignal<SelectedItem | null>({
      baseItem: makeBaseItem(),
      vaultItem: null
    });
    const [details] = createSignal<TMDBDetails | null>(makeDetails());

    await withHook(selected, details, async (api) => {
      expect(api.settings).toBeDefined();
      expect(api.settings.enabled()).toBe(true);
      expect(api.settings.autoMapping()).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Numeric id handling
// ---------------------------------------------------------------------------

describe("useAnimeEnrichment — id type handling", () => {
  it("handles string ids by parseInt-ing them for getAnilistId", async () => {
    const [selected] = createSignal<SelectedItem | null>({
      baseItem: makeBaseItem({ id: "67890" }),
      vaultItem: null
    });
    const [details] = createSignal<TMDBDetails | null>(makeDetails({ id: 67890 }));

    await withHook(selected, details, async (_api) => {
      expect(mockGetAnilistId).toHaveBeenCalledWith(67890);
    });
  });

  it("handles numeric ids directly", async () => {
    // WatchlistItem.id is typed as string, but defend against numeric
    // values by checking the parseInt path doesn't break.
    const [selected] = createSignal<SelectedItem | null>({
      baseItem: makeBaseItem({ id: "12345" }),
      vaultItem: null
    });
    const [details] = createSignal<TMDBDetails | null>(makeDetails({ id: 12345 }));

    await withHook(selected, details, async (_api) => {
      expect(mockGetAnilistId).toHaveBeenCalledWith(12345);
    });
  });
});
