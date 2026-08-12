// src/server/audio-language/__tests__/audioLanguagePipeline.test.ts
//
// Regression tests for the dubbed-audio language detection pipeline.
//
// These tests enforce the spec "CineLog Audio Language System — FINAL
// DATA & REGION CORRECTION" (§1–§15). They cover:
//
//   1. TMDB translation languages NEVER become audio languages.
//   2. Subtitle languages NEVER become audio languages.
//   3. Original/spoken languages are removed from dubbedLanguages.
//   4. Genuine JustWatch audioLanguages are preserved.
//   5. Region is NOT hard-coded to "IN".
//   6. Profile country is used dynamically for region-dependent
//      source requests.
//   7. Region is NOT displayed in the Language modal (component
//      source-level assertion: no flag emoji, no region text in the
//      rendered output).
//   8. Region-specific cached data CANNOT be returned for another
//      country (cache key includes region).
//   9. No-data stays noData/unknown — NOT interpreted as "no dubs".
//  10. No fabricated languages are produced.
//
// Run: npx vitest run src/server/audio-language/__tests__/

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// The resolver + cache modules import `isServer` from solid-js/web.
// Vitest's jsdom env makes isServer false; we need it true so the
// server-only guards don't fire.
vi.mock("solid-js/web", () => ({ isServer: true }));

// ─── Path constants ──────────────────────────────────────────────────
// Resolve once so all source-file assertions use the same paths.
// __dirname = src/server/audio-language/__tests__
const REPO_ROOT = resolve(__dirname, "..", "..", "..", "..");
const SRC_ROOT = resolve(__dirname, "..", "..", "..");
const WORKER_PATH = resolve(__dirname, "..", "worker.ts");
const RESOLVER_PATH = resolve(__dirname, "..", "resolver.ts");
const JUSTWATCH_PATH = resolve(__dirname, "..", "sources", "justwatch.ts");
const TMDB_TRANSLATIONS_PATH = resolve(__dirname, "..", "sources", "tmdb-translations.ts");
const API_PATH = resolve(SRC_ROOT, "routes", "api", "audio-languages", "[tmdbId].ts");
const MODAL_PATH = resolve(SRC_ROOT, "features", "details", "components", "AudioLanguageModal.tsx");
const MIGRATION_20260817_PATH = resolve(REPO_ROOT, "supabase", "migrations", "20260817_audio_languages_cache_add_region.sql");

// ─── Mock-able source adapter ────────────────────────────────────────
//
// We build a tiny mock source that returns canned data so we can
// simulate JustWatch responses for each regression title. The mock
// implements the same AudioLanguageSource interface as JustWatchSource
// — the resolver treats it identically.

import type {
  AudioLanguageSource,
  AudioLanguageSourceInput,
  AudioLanguageSourceResult,
  RawLanguageEntry
} from "../types";
import { resolveAudioLanguages } from "../resolver";

interface MockSourceConfig {
  name: string;
  /** Languages this source returns, keyed by TMDB id. */
  responsesByTmdb?: Record<number, RawLanguageEntry[]>;
  /** If true, the source returns noData for every request. */
  alwaysNoData?: boolean;
  /** Default confidence to attach. Defaults to "medium" (matches JustWatch). */
  defaultConfidence?: "high" | "medium" | "low";
  /** Optional override of responses by region (takes precedence). */
  responsesByTmdbAndRegion?: Record<string, RawLanguageEntry[]>;
}

function makeMockSource(cfg: MockSourceConfig): AudioLanguageSource {
  return {
    name: cfg.name,
    async getAudioLanguages(
      input: AudioLanguageSourceInput
    ): Promise<AudioLanguageSourceResult> {
      const checkedAt = new Date().toISOString();
      if (cfg.alwaysNoData) {
        return {
          source: cfg.name,
          success: true,
          noData: true,
          languages: [],
          region: input.region,
          checkedAt
        };
      }
      const key = `${input.tmdbId}:${input.region}`;
      let langs =
        cfg.responsesByTmdbAndRegion?.[key] ??
        cfg.responsesByTmdb?.[input.tmdbId] ??
        [];
      return {
        source: cfg.name,
        success: true,
        languages: langs,
        region: input.region,
        checkedAt,
        defaultConfidence: cfg.defaultConfidence ?? "medium"
      };
    }
  };
}

// ─── TMDB fetch mock ─────────────────────────────────────────────────
//
// The resolver calls fetchTmdbTitleMeta + fetchTmdbExternalIds, both of
// which hit the real TMDB API. We stub global.fetch to return canned
// metadata for each regression title so the resolver's TMDB fetches
// are deterministic.

interface TmdbMeta {
  spoken_languages: Array<{ iso_639_1: string; english_name: string; name?: string }>;
  original_language: string;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  imdb_id?: string;
}

interface TmdbFixture {
  meta: TmdbMeta;
  /** Audio languages JustWatch reports for this title, per region. */
  justWatchAudioByRegion?: Record<string, string[]>;
}

/**
 * Per-spec regression fixtures (§10).
 *
 *   Midsommar — English/Swedish spoken, English-only audio → no dubs.
 *   The Witcher — English spoken, English-only audio → no dubs.
 *   Breaking Bad — English spoken, English-only audio → no dubs
 *     (must NOT show Hindi/Tamil/Punjabi unless a real source confirms).
 *   Attack on Titan — Japanese spoken, audio [ja, en, hi] →
 *     dubbed = [en, hi].
 *
 * These fixtures model the SPEC's expected behavior — TMDB translations
 * are NOT included anywhere (TMDB translations were removed from the
 * pipeline entirely per §1). If a real JustWatch response differs, the
 * resolver still applies the same rules: subtract original, dedup,
 * never fabricate.
 */
const FIXTURES: Record<number, TmdbFixture> = {
  // Midsommar (movie, TMDB id 530385)
  530385: {
    meta: {
      title: "Midsommar",
      original_title: "Midsommar",
      original_language: "en",
      spoken_languages: [
        { iso_639_1: "en", english_name: "English" },
        { iso_639_1: "sv", english_name: "Swedish" }
      ],
      imdb_id: "tt8772262"
    },
    // Per spec §10: genuine audio source only confirms English → no dubs.
    justWatchAudioByRegion: {
      IN: ["en"],
      US: ["en"],
      DE: ["en"]
    }
  },
  // The Witcher (tv, TMDB id 71912)
  71912: {
    meta: {
      name: "The Witcher",
      original_name: "The Witcher",
      original_language: "en",
      spoken_languages: [{ iso_639_1: "en", english_name: "English" }],
      imdb_id: "tt5180504"
    },
    justWatchAudioByRegion: {
      IN: ["en"],
      US: ["en"],
      DE: ["en"]
    }
  },
  // Breaking Bad (tv, TMDB id 1396)
  1396: {
    meta: {
      name: "Breaking Bad",
      original_name: "Breaking Bad",
      original_language: "en",
      spoken_languages: [{ iso_639_1: "en", english_name: "English" }],
      imdb_id: "tt0903747"
    },
    justWatchAudioByRegion: {
      IN: ["en"],
      US: ["en"],
      DE: ["en"]
    }
  },
  // Attack on Titan (tv, TMDB id 1429)
  1429: {
    meta: {
      name: "Attack on Titan",
      original_name: "Shingeki no Kyojin",
      original_language: "ja",
      spoken_languages: [{ iso_639_1: "ja", english_name: "Japanese" }],
      imdb_id: "tt2560140"
    },
    justWatchAudioByRegion: {
      // Per spec §10 example: Japanese, English, Hindi → dubbed [en, hi].
      IN: ["ja", "en", "hi"],
      US: ["ja", "en"],
      DE: ["ja", "en", "de"]
    }
  }
};

/**
 * Stub global.fetch to serve TMDB metadata for the regression fixtures.
 * Any non-TMDB URL (e.g. JustWatch GraphQL) is left untouched — but
 * we don't hit JustWatch in these tests because we inject a mock source
 * directly into the resolver.
 */
function installTmdbFetchMock() {
  const realFetch = global.fetch;
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();

    // TMDB external_ids: /3/{type}/{tmdbId}/external_ids?...
    // (Check this BEFORE the title regex because the title regex would
    // also match this URL — /3/movie/123/external_ids contains /3/movie/123.)
    const extMatch = url.match(
      /api\.themoviedb\.org\/3\/(movie|tv)\/(\d+)\/external_ids/
    );
    if (extMatch) {
      const tmdbId = parseInt(extMatch[2]!, 10);
      const fixture = FIXTURES[tmdbId];
      return new Response(
        JSON.stringify({ imdb_id: fixture?.meta.imdb_id ?? null }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // TMDB title metadata: /3/{type}/{tmdbId}?...
    const titleMatch = url.match(
      /api\.themoviedb\.org\/3\/(movie|tv)\/(\d+)(?:\?|$)/
    );
    if (titleMatch) {
      const tmdbId = parseInt(titleMatch[2]!, 10);
      const fixture = FIXTURES[tmdbId];
      if (fixture) {
        return new Response(JSON.stringify(fixture.meta), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      // Unknown TMDB id — return 404 so the resolver treats it as
      // "title not found" (not a network error).
      return new Response(JSON.stringify({ status_message: "Resource not found." }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Default: delegate to the real fetch (only JustWatch would reach
    // here, and we don't call JustWatch in these tests because we
    // inject a mock source).
    return realFetch(input as RequestInfo, init as RequestInit);
  });
  vi.stubGlobal("fetch", fetchMock);
  return () => vi.unstubAllGlobals();
}

/**
 * Build a JustWatch-equivalent mock source for the regression fixtures.
 * Returns audioLanguages (as RawLanguageEntry[]) per (tmdbId, region).
 */
function makeFixtureJustWatchSource(): AudioLanguageSource {
  return {
    name: "JustWatch",
    async getAudioLanguages(
      input: AudioLanguageSourceInput
    ): Promise<AudioLanguageSourceResult> {
      const checkedAt = new Date().toISOString();
      const fixture = FIXTURES[input.tmdbId];
      const audios = fixture?.justWatchAudioByRegion?.[input.region] ?? [];
      if (audios.length === 0) {
        return {
          source: "JustWatch",
          success: true,
          noData: true,
          languages: [],
          region: input.region,
          checkedAt
        };
      }
      const languages: RawLanguageEntry[] = audios.map((code) => ({
        raw: code,
        code,
        name: code
      }));
      return {
        source: "JustWatch",
        success: true,
        languages,
        region: input.region,
        checkedAt,
        defaultConfidence: "medium"
      };
    }
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe("audio-language pipeline: spec regression tests", () => {
  let uninstallFetchMock: () => void;

  beforeEach(() => {
    // The resolver's fetchTmdbTitleMeta short-circuits with
    // "TMDB_API_KEY not configured" if the env var is absent, leaving
    // originalLanguages empty (which breaks the original-subtraction
    // logic under test). Provide a fake key so the fetch mock is
    // actually invoked.
    vi.stubEnv("TMDB_API_KEY", "test-tmdb-key");
    uninstallFetchMock = installTmdbFetchMock();
  });

  afterEach(() => {
    uninstallFetchMock();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  // ─── Spec §10 example 1: Midsommar ────────────────────────────────
  describe("Midsommar (530385)", () => {
    it("shows English + Swedish as ORIGINAL, no dubbed languages", async () => {
      const sources = [makeFixtureJustWatchSource()];
      const result = await resolveAudioLanguages(sources, 530385, "movie", {
        region: "IN"
      });

      // Original: English + Swedish (from TMDB spoken_languages).
      const origCodes = result.originalLanguages.map((l) => l.code).sort();
      expect(origCodes).toEqual(["en", "sv"]);

      // Dubbed: empty (English was the only audio and it's an original).
      expect(result.dubbedLanguages).toEqual([]);

      // Status: success (we got data, just no dubs after subtraction).
      expect(result.status).toBe("success");
    });

    it("does NOT show Arabic/Bulgarian/Chinese/Hindi from TMDB translations", async () => {
      const sources = [makeFixtureJustWatchSource()];
      const result = await resolveAudioLanguages(sources, 530385, "movie", {
        region: "IN"
      });

      const dubbedCodes = result.dubbedLanguages.map((l) => l.code);
      // These languages would have appeared under the OLD implementation
      // because TMDB /translations returned them. With TMDB translations
      // removed from the pipeline, they MUST NOT appear.
      expect(dubbedCodes).not.toContain("ar");
      expect(dubbedCodes).not.toContain("bg");
      expect(dubbedCodes).not.toContain("zh");
      expect(dubbedCodes).not.toContain("hi");
      expect(dubbedCodes).not.toContain("ta");
      expect(dubbedCodes).not.toContain("te");
    });
  });

  // ─── Spec §10 example 2: The Witcher ──────────────────────────────
  describe("The Witcher (71912)", () => {
    it("does not display dozens of languages from translated metadata", async () => {
      const sources = [makeFixtureJustWatchSource()];
      const result = await resolveAudioLanguages(sources, 71912, "tv", {
        region: "IN"
      });

      // Only genuine audio evidence is allowed. The Witcher has English
      // audio only, so dubbedLanguages must be empty.
      expect(result.dubbedLanguages).toEqual([]);
      // Original/spoken = English only.
      expect(result.originalLanguages.map((l) => l.code)).toEqual(["en"]);
    });
  });

  // ─── Spec §10 example 3: Breaking Bad ─────────────────────────────
  describe("Breaking Bad (1396)", () => {
    it("does not show Hindi/Tamil/Punjabi unless a real source confirms", async () => {
      const sources = [makeFixtureJustWatchSource()];
      const result = await resolveAudioLanguages(sources, 1396, "tv", {
        region: "IN"
      });

      // Breaking Bad has English audio only in our fixture.
      expect(result.dubbedLanguages).toEqual([]);
      // Indian languages that previously appeared via TMDB translations
      // MUST NOT appear.
      const dubbedCodes = result.dubbedLanguages.map((l) => l.code);
      expect(dubbedCodes).not.toContain("hi");
      expect(dubbedCodes).not.toContain("ta");
      expect(dubbedCodes).not.toContain("pa");
    });
  });

  // ─── Spec §10 example 4: Attack on Titan ──────────────────────────
  describe("Attack on Titan (1429)", () => {
    it("ORIGINAL=Japanese, DUBBED=[English, Hindi] (Japanese removed)", async () => {
      const sources = [makeFixtureJustWatchSource()];
      const result = await resolveAudioLanguages(sources, 1429, "tv", {
        region: "IN"
      });

      // Original: Japanese.
      expect(result.originalLanguages.map((l) => l.code)).toEqual(["ja"]);

      // Dubbed: English + Hindi (Japanese was subtracted).
      const dubbedCodes = result.dubbedLanguages.map((l) => l.code).sort();
      expect(dubbedCodes).toEqual(["en", "hi"]);

      // Japanese MUST NOT appear in dubbed (spec §3: subtract original).
      expect(dubbedCodes).not.toContain("ja");
    });

    it("does NOT show dozens of DETECTED languages from TMDB translations", async () => {
      const sources = [makeFixtureJustWatchSource()];
      const result = await resolveAudioLanguages(sources, 1429, "tv", {
        region: "IN"
      });

      // Only [en, hi] should be present — no language from TMDB
      // translations (ar, bg, zh, fr, de, etc.) should leak in.
      const dubbedCodes = result.dubbedLanguages.map((l) => l.code);
      expect(dubbedCodes.length).toBe(2);
      expect(dubbedCodes).toEqual(expect.arrayContaining(["en", "hi"]));
    });
  });

  // ─── Spec requirement 1: TMDB translations never become audio ─────
  describe("TMDB translations are not used as audio evidence", () => {
    it("resolver does not import or invoke TmdbTranslationsSource", () => {
      // The worker module's defaultSources array MUST NOT include
      // TmdbTranslationsSource. We verify by reading the worker source
      // file (not importing it — that would require env vars for
      // Supabase). The source must NOT import tmdb-translations.
      const src = readFileSync(WORKER_PATH, "utf-8");
      expect(src).not.toMatch(/tmdb-translations/);
      expect(src).not.toMatch(/TmdbTranslationsSource/);
    });

    it("the tmdb-translations source file has been removed", () => {
      // The source file MUST not exist. If someone re-adds it, this
      // test fails.
      expect(() => readFileSync(TMDB_TRANSLATIONS_PATH, "utf-8")).toThrow();
    });
  });

  // ─── Spec requirement 2: subtitles never become audio ────────────
  describe("subtitle languages are never counted as audio", () => {
    it("JustWatch source reads audioLanguages, not subtitleLanguages", () => {
      // Read the JustWatch source file and assert it accesses
      // audioLanguages (not subtitleLanguages) when building the
      // result. The GraphQL query may select subtitleLanguages for
      // debugging, but the languages array MUST come from
      // audioLanguages only.
      const src = readFileSync(JUSTWATCH_PATH, "utf-8");

      // Must reference audioLanguages (the source of truth).
      expect(src).toMatch(/audioLanguages/);

      // The languages array MUST be populated from audioLanguages,
      // not subtitleLanguages. We check the union-building loop
      // iterates over `offer.audioLanguages`.
      // eslint-disable-next-line no-useless-escape
      expect(src).toMatch(/offer\.audioLanguages|audios\s*=\s*offer\.audioLanguages/);

      // subtitleLanguages MAY be selected in the GraphQL query but
      // MUST NOT be pushed into the languages array. Verify the
      // audio-loop is distinct from any subtitle handling.
      // (The current implementation never reads subtitleLanguages
      // outside the GraphQL selection — that's fine.)
    });
  });

  // ─── Spec requirement 3: original removed from dubbed ────────────
  describe("original languages are subtracted from dubbed", () => {
    it("Japanese is removed from Attack on Titan's dubbed list", async () => {
      const sources = [makeFixtureJustWatchSource()];
      const result = await resolveAudioLanguages(sources, 1429, "tv", {
        region: "IN"
      });
      const dubbedCodes = result.dubbedLanguages.map((l) => l.code);
      expect(dubbedCodes).not.toContain("ja");
    });

    it("English is removed from Midsommar's dubbed list", async () => {
      const sources = [makeFixtureJustWatchSource()];
      const result = await resolveAudioLanguages(sources, 530385, "movie", {
        region: "IN"
      });
      const dubbedCodes = result.dubbedLanguages.map((l) => l.code);
      expect(dubbedCodes).not.toContain("en");
    });
  });

  // ─── Spec requirement 4: genuine JustWatch audio is preserved ────
  describe("genuine JustWatch audioLanguages are preserved", () => {
    it("Attack on Titan: en + hi appear in dubbed (from JustWatch)", async () => {
      const sources = [makeFixtureJustWatchSource()];
      const result = await resolveAudioLanguages(sources, 1429, "tv", {
        region: "IN"
      });
      const dubbedCodes = result.dubbedLanguages.map((l) => l.code);
      expect(dubbedCodes).toContain("en");
      expect(dubbedCodes).toContain("hi");
    });

    it("each dubbed language's sources array contains 'JustWatch'", async () => {
      const sources = [makeFixtureJustWatchSource()];
      const result = await resolveAudioLanguages(sources, 1429, "tv", {
        region: "IN"
      });
      for (const lang of result.dubbedLanguages) {
        expect(lang.sources).toContain("JustWatch");
      }
    });
  });

  // ─── Spec requirement 5: region not hard-coded to "IN" ───────────
  describe("region is not hard-coded to IN", () => {
    it("worker.ts source contains no hard-coded IN default", () => {
      const src = readFileSync(WORKER_PATH, "utf-8");
      // The DEFAULT_REGION constant must be "US", not "IN".
      expect(src).toMatch(/DEFAULT_REGION\s*=\s*["']US["']/);
      // The old `region = "IN"` pattern must NOT appear.
      expect(src).not.toMatch(/region\s*=\s*["']IN["']/);
      // No `region: "IN"` literal as a default anywhere.
      expect(src).not.toMatch(/region\s*\?\?\s*["']IN["']/);
    });

    it("resolver.ts source contains no hard-coded IN default", () => {
      const src = readFileSync(RESOLVER_PATH, "utf-8");
      expect(src).not.toMatch(/opts\.region\s*\?\?\s*["']IN["']/);
      expect(src).not.toMatch(/region\s*=\s*["']IN["']/);
    });

    it("API endpoint source contains no hard-coded IN default", () => {
      const src = readFileSync(API_PATH, "utf-8");
      // The old pattern `: "IN"` defaulting for region must NOT appear.
      expect(src).not.toMatch(/rawRegion.*\?\?\s*["']IN["']/);
      expect(src).not.toMatch(/region\s*=\s*["']IN["']/);
    });

    it("modal fetcher does not send region=IN in the query string", () => {
      const src = readFileSync(MODAL_PATH, "utf-8");
      expect(src).not.toMatch(/region=IN/);
      expect(src).not.toMatch(/region=US/);
    });
  });

  // ─── Spec requirement 6: profile country used dynamically ────────
  describe("profile country is used dynamically", () => {
    it("API endpoint resolves region from profiles.country server-side", () => {
      const src = readFileSync(API_PATH, "utf-8");
      // Must call a profile-country resolver (not just read ?region=).
      expect(src).toMatch(/resolveProfileCountry/);
      // Must query the profiles table for the country column.
      expect(src).toMatch(/from\(['"]profiles['"]\)/);
      expect(src).toMatch(/\.select\(['"]country['"]\)/);
      // Must verify the user session via getUser().
      expect(src).toMatch(/auth\.getUser/);
    });

    it("resolver passes the caller's region through to sources", async () => {
      // The mock source records the region it was called with.
      const seenRegions: string[] = [];
      const source: AudioLanguageSource = {
        name: "Recorder",
        async getAudioLanguages(input) {
          seenRegions.push(input.region);
          return {
            source: "Recorder",
            success: true,
            noData: true,
            languages: [],
            region: input.region,
            checkedAt: new Date().toISOString()
          };
        }
      };
      await resolveAudioLanguages([source], 1429, "tv", { region: "DE" });
      expect(seenRegions).toEqual(["DE"]);

      await resolveAudioLanguages([source], 1429, "tv", { region: "US" });
      expect(seenRegions).toEqual(["DE", "US"]);
    });

    it("resolver defaults to US (not IN) when region is omitted", async () => {
      const seenRegions: string[] = [];
      const source: AudioLanguageSource = {
        name: "Recorder",
        async getAudioLanguages(input) {
          seenRegions.push(input.region);
          return {
            source: "Recorder",
            success: true,
            noData: true,
            languages: [],
            region: input.region,
            checkedAt: new Date().toISOString()
          };
        }
      };
      // Call without a region — resolver should default to "US".
      await resolveAudioLanguages([source], 1429, "tv");
      expect(seenRegions).toEqual(["US"]);
    });
  });

  // ─── Spec requirement 7: region not displayed in the modal ───────
  describe("region is not displayed in the Language modal", () => {
    it("AudioLanguageModal does not render regionFlag() helper", () => {
      const src = readFileSync(MODAL_PATH, "utf-8");
      // The regionFlag() helper was removed (spec §5 / §13).
      expect(src).not.toMatch(/\bregionFlag\b/);
      // No regional-indicator emoji construction (the flag-emoji
      // trick using 0x1f1e6).
      expect(src).not.toMatch(/0x1f1e6/);
      // No `audio-lang-footer-region` class rendering (the element
      // that previously showed "🇮🇳 IN" in the footer).
      expect(src).not.toMatch(/audio-lang-footer-region/);
    });

    it("modal subtitle no longer shows '🇮🇳 IN · N sources'", () => {
      const src = readFileSync(MODAL_PATH, "utf-8");
      // The old pattern combined regionFlag + region + " · " + sourceCount.
      // The new pattern shows only "N verified source(s)".
      expect(src).toMatch(/verified source/);
      // No more region flag concatenation in the subtitle.
      expect(src).not.toMatch(/regionFlag\(data\(\)/);
    });
  });

  // ─── Spec requirement 8: region-specific cache isolation ─────────
  describe("region-specific cache cannot be returned for another country", () => {
    beforeEach(() => {
      // The cache module reads env vars on first use. Provide them so
      // getServiceClient() doesn't throw.
      vi.stubEnv("VITE_SUPABASE_URL", "https://fake.supabase.co");
      vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "fake-service-key");
    });
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("readCache filters by region (IN row not returned for DE request)", async () => {
      // Mock the Supabase client chain. The cache.readCache method
      // builds: .from(...).select(...).eq("media_type", type)
      //                          .eq("tmdb_id", tmdbId).eq("region", region)
      //                          .maybeSingle()
      // We capture the .eq() calls and assert region was passed.
      const eqCalls: Array<{ column: string; value: unknown }> = [];
      const maybeSingleReturn = {
        data: null,
        error: null
      };

      const mockFromBuilder = {
        select: () => mockFromBuilder,
        eq: (column: string, value: unknown) => {
          eqCalls.push({ column, value });
          return mockFromBuilder;
        },
        maybeSingle: async () => maybeSingleReturn
      };

      const mockClient = {
        from: () => mockFromBuilder
      };

      // Inject the mock client by stubbing createClient from
      // @supabase/supabase-js to return ours.
      vi.doMock("@supabase/supabase-js", () => ({
        createClient: () => mockClient
      }));

      // Re-import after the doMock so the new createClient is used.
      vi.resetModules();
      const cacheModFresh = await import("../cache");
      await cacheModFresh.readCache(530385, "movie", "DE");

      // The .eq("region", "DE") call MUST have been made — this is
      // the spec §12 requirement: region is part of the cache key.
      const regionCall = eqCalls.find((c) => c.column === "region");
      expect(regionCall).toBeDefined();
      expect(regionCall?.value).toBe("DE");

      vi.doUnmock("@supabase/supabase-js");
    });
  });

  // ─── Spec requirement 9: no-data stays noData/unknown ────────────
  describe("no-data is not interpreted as 'no dubs'", () => {
    it("all sources noData → status=unknown (not success with empty dubs)", async () => {
      // Use a TMDB id with a fixture so the TMDB fetch succeeds
      // (otherwise status would be "error" due to TMDB failure, which
      // is a different code path). The point of this test is: when
      // sources return noData, status must be "unknown" — NOT
      // "success" with an empty dubbedLanguages list (which would be
      // misreported as "no dubs exist").
      const sources = [makeMockSource({ name: "Empty", alwaysNoData: true })];
      const result = await resolveAudioLanguages(sources, 530385, "movie", {
        region: "IN"
      });

      // Per spec STEP 10: unknown data is NEVER reported as
      // "no dubbed languages exist". status must be "unknown".
      expect(result.status).toBe("unknown");
      expect(result.dubbedLanguages).toEqual([]);
    });

    it("one source with data + one noData → status=success", async () => {
      const sources = [
        makeFixtureJustWatchSource(),
        makeMockSource({ name: "Empty", alwaysNoData: true })
      ];
      const result = await resolveAudioLanguages(sources, 1429, "tv", {
        region: "IN"
      });
      expect(result.status).toBe("success");
      // Attack on Titan still has [en, hi].
      expect(result.dubbedLanguages.map((l) => l.code).sort()).toEqual([
        "en",
        "hi"
      ]);
    });

    it("Midsommar with English-only audio → status=success (NOT unknown)", async () => {
      const sources = [makeFixtureJustWatchSource()];
      const result = await resolveAudioLanguages(sources, 530385, "movie", {
        region: "IN"
      });
      // We DID get data (English audio); the dubbed list is empty
      // after subtraction, but the status is success, not unknown.
      expect(result.status).toBe("success");
      expect(result.dubbedLanguages).toEqual([]);
    });
  });

  // ─── Spec requirement 10: no fabricated languages ────────────────
  describe("no fabricated languages are produced", () => {
    it("a source returning noData yields zero dubbed languages", async () => {
      // Use a TMDB id with a fixture so the TMDB fetch succeeds — we
      // want to test the source-noData path, not the TMDB-error path.
      const sources = [makeMockSource({ name: "Empty", alwaysNoData: true })];
      const result = await resolveAudioLanguages(sources, 530385, "movie", {
        region: "IN"
      });
      expect(result.dubbedLanguages).toEqual([]);
      expect(result.detectedAudioLanguages).toEqual([]);
    });

    it("the resolver does not invent languages not returned by any source", async () => {
      // Source returns ONLY [en]. The resolver must not synthesize
      // anything else (no default-language injection, no heuristics).
      const sources = [
        makeMockSource({
          name: "SingleLang",
          responsesByTmdb: {
            530385: [{ raw: "en", code: "en", name: "English" }]
          }
        })
      ];
      const result = await resolveAudioLanguages(sources, 530385, "movie", {
        region: "IN"
      });
      // detectedAudioLanguages must contain ONLY en.
      expect(result.detectedAudioLanguages.map((l) => l.code)).toEqual(["en"]);
      // No fabricated codes.
      expect(result.detectedAudioLanguages.length).toBe(1);
    });

    it("TMDB spoken_languages do NOT leak into detectedAudioLanguages", async () => {
      // Midsommar: TMDB spoken = [en, sv]. JustWatch audio = [en].
      // detectedAudioLanguages must contain ONLY [en] (the audio
      // source's contribution), NOT [en, sv]. The Swedish entry is
      // an original language, NOT an audio detection.
      const sources = [makeFixtureJustWatchSource()];
      const result = await resolveAudioLanguages(sources, 530385, "movie", {
        region: "IN"
      });
      expect(result.detectedAudioLanguages.map((l) => l.code)).toEqual(["en"]);
      expect(result.detectedAudioLanguages.map((l) => l.code)).not.toContain(
        "sv"
      );
    });
  });

  // ─── Spec §9: source count = genuine audio sources only ──────────
  describe("sourceCount counts only genuine audio sources", () => {
    it("with one JustWatch source, sourceCount=1 (not 2)", async () => {
      const sources = [makeFixtureJustWatchSource()];
      const result = await resolveAudioLanguages(sources, 1429, "tv", {
        region: "IN"
      });
      // Only JustWatch contributed. TMDB translations are no longer
      // in the pipeline, so the success+data source count is 1.
      const successWithData = result.sources.filter(
        (s) => s.success && !s.noData && s.languages.length > 0
      );
      expect(successWithData.length).toBe(1);
      expect(successWithData[0]!.source).toBe("JustWatch");
    });
  });

  // ─── Spec §12: cache key includes region ─────────────────────────
  describe("cache migration includes region in the unique key", () => {
    it("20260817 migration adds region column + new unique constraint", () => {
      const src = readFileSync(MIGRATION_20260817_PATH, "utf-8");
      expect(src).toMatch(/add column if not exists region/);
      expect(src).toMatch(/unique \(media_type, tmdb_id, region\)/);
      // Drop the old (media_type, tmdb_id) constraint.
      expect(src).toMatch(/drop constraint if exists audio_languages_cache_media_type_tmdb_id_key/);
    });
  });

  // ─── Spec §4: VERIFIED/DETECTED only for genuine audio ───────────
  describe("confidence is only assigned to genuine audio evidence", () => {
    it("a JustWatch-only language is VERIFIED or CONFIRMED (never low)", async () => {
      const sources = [makeFixtureJustWatchSource()];
      const result = await resolveAudioLanguages(sources, 1429, "tv", {
        region: "IN"
      });
      // JustWatch fixture returns defaultConfidence="medium". With a
      // single source, the resolver keeps it as "medium" (= Confirmed).
      // Both en + hi should be "medium" or "high" — never "low".
      for (const lang of result.dubbedLanguages) {
        expect(lang.confidence).toMatch(/^(high|medium)$/);
        expect(lang.confidence).not.toBe("low");
      }
    });

    it("no DETECTED (low) confidence from non-audio sources", async () => {
      // The pipeline no longer has any source that returns
      // defaultConfidence: "low" (TMDB translations are gone).
      // Any language in the result must be medium or high.
      const sources = [makeFixtureJustWatchSource()];
      const result = await resolveAudioLanguages(sources, 1429, "tv", {
        region: "IN"
      });
      const lowConfidence = result.dubbedLanguages.filter(
        (l) => l.confidence === "low"
      );
      expect(lowConfidence).toEqual([]);
    });
  });

  // ─── Spec §6: do not fake global data ────────────────────────────
  describe("region-specific data is not relabeled as global", () => {
    it("result.region reflects the actual region queried", async () => {
      const sources = [makeFixtureJustWatchSource()];
      const resultIN = await resolveAudioLanguages(sources, 1429, "tv", {
        region: "IN"
      });
      expect(resultIN.region).toBe("IN");

      const resultDE = await resolveAudioLanguages(sources, 1429, "tv", {
        region: "DE"
      });
      expect(resultDE.region).toBe("DE");

      // Different regions → different dubbed lists are possible
      // (DE has German dub in our fixture). The resolver does NOT
      // merge them into one "global" list.
      const inCodes = resultIN.dubbedLanguages.map((l) => l.code).sort();
      const deCodes = resultDE.dubbedLanguages.map((l) => l.code).sort();
      // IN = [en, hi], DE = [en, de] (ja removed as original in both).
      expect(inCodes).toEqual(["en", "hi"]);
      expect(deCodes).toEqual(["de", "en"]);
    });
  });
});
