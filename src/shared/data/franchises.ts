// src/shared/data/franchises.ts
/**
 * Franchise definitions — the SINGLE source of truth for all franchise
 * detection across CineLog.
 *
 * Previously this table was duplicated in 4+ files:
 *   - FranchiseInfo.tsx
 *   - useDiscoverTaste.ts
 *   - useTrajectories.ts
 *   - useTasteSurfaces.ts
 *   - RelationshipPill.tsx
 *
 * Now every consumer imports from HERE. Adding a new franchise is a
 * one-file change that immediately affects Details, Discover, Search,
 * and the Collection modal.
 *
 * DATA MODEL:
 *   Each franchise has:
 *     - name:          display name (e.g. "Marvel Cinematic Universe")
 *     - keywords:      title-matching keywords for detection
 *     - tmdbCollectionId: optional TMDB /collection/{id} for movie
 *                        collections (null for TV-only or cross-media
 *                        franchises that TMDB doesn't group as a collection)
 *     - sagas:         optional grouping for large franchises (e.g. MCU phases)
 *
 * TMDB COLLECTION vs KEYWORD DETECTION:
 *   For movie franchises where TMDB has a /collection endpoint (e.g. "The
 *   Avengers Collection" id=86311), we use tmdbCollectionId to fetch the
 *   authoritative list of parts. This is the most accurate source.
 *
 *   For franchises that span movies AND TV (MCU, Star Wars) or that TMDB
 *   doesn't group (John Wick, Mission Impossible), we fall back to keyword
 *   detection + TMDB search/multi to find all entries.
 *
 *   The CollectionModal tries tmdbCollectionId first, then falls back to
 *   keyword-based search. This hybrid approach covers every franchise.
 */

export interface FranchiseSaga {
  name: string;
  keywords: string[];
}

export interface FranchiseDefinition {
  name: string;
  keywords: string[];
  /** TMDB /collection/{id} — null when no TMDB collection exists */
  tmdbCollectionId?: number;
  /** Optional saga grouping for large franchises */
  sagas?: FranchiseSaga[];
}

export const FRANCHISES: FranchiseDefinition[] = [
  {
    name: "Marvel Cinematic Universe",
    keywords: [
      "avengers", "iron man", "captain america", "thor", "black panther",
      "doctor strange", "spider-man", "guardians of the galaxy", "black widow",
      "hawkeye", "eternals", "shang-chi", "ant-man", "captain marvel",
      "the marvels", "wakanda forever", "multiverse of madness", "no way home",
      "far from home", "homecoming", "ragnarok", "love and thunder",
      "winter soldier", "civil war", "endgame", "infinity war"
    ],
    sagas: [
      { name: "Phase 1", keywords: ["iron man", "incredible hulk", "thor", "captain america", "avengers"] },
      { name: "Phase 2", keywords: ["iron man 3", "dark world", "winter soldier", "guardians", "age of ultron", "ant-man"] },
      { name: "Phase 3", keywords: ["civil war", "doctor strange", "homecoming", "ragnarok", "black panther", "infinity war", "ant-man and the wasp", "captain marvel", "endgame", "far from home"] },
      { name: "Phase 4", keywords: ["black widow", "shang-chi", "eternals", "no way home", "multiverse of madness", "love and thunder", "wakanda forever"] },
      { name: "Phase 5", keywords: ["quantumania", "guardians of the galaxy vol", "the marvels"] }
    ]
  },
  {
    name: "DC Extended Universe",
    keywords: [
      "batman", "superman", "wonder woman", "aquaman", "flash",
      "justice league", "suicide squad", "man of steel", "black adam",
      "shazam", "black canary", "peacemaker"
    ]
  },
  {
    name: "Harry Potter",
    keywords: [
      "harry potter", "deathly hallows", "philosopher's stone",
      "chamber of secrets", "prisoner of azkaban", "goblet of fire",
      "order of the phoenix", "half-blood prince", "fantastic beasts"
    ],
    tmdbCollectionId: 1241
  },
  {
    name: "Mission Impossible",
    keywords: ["mission impossible"],
    tmdbCollectionId: 537
  },
  {
    name: "John Wick",
    keywords: ["john wick"]
  },
  {
    name: "Fast & Furious",
    keywords: ["fast and furious", "fast & furious", "furious", "tokyo drift", "fast x"],
    tmdbCollectionId: 948485
  },
  {
    name: "Star Wars",
    keywords: [
      "star wars", "empire strikes back", "return of the jedi",
      "force awakens", "last jedi", "rise of skywalker",
      "rogue one", "solo", "mandalorian", "andor", "ahsoka", "book of boba fett"
    ]
  },
  {
    name: "Lord of the Rings",
    keywords: [
      "lord of the rings", "hobbit", "fellowship of the ring",
      "two towers", "return of the king", "rings of power"
    ],
    tmdbCollectionId: 119
  },
  {
    name: "The Dark Knight",
    keywords: ["dark knight", "batman begins"],
    tmdbCollectionId: 263
  },
  {
    name: "Jurassic Park",
    keywords: ["jurassic park", "jurassic world", "fallen kingdom", "dominion"],
    tmdbCollectionId: 328
  },
  {
    name: "James Bond",
    keywords: ["james bond", "007", "no time to die", "skyfall", "spectre", "casino royale", "quantum of solace"]
  },
  {
    name: "Dune",
    keywords: ["dune"]
  },
  {
    name: "Avatar",
    keywords: ["avatar", "way of water", "fire and ash"],
    tmdbCollectionId: 858363
  },
  {
    name: "Planet of the Apes",
    keywords: ["planet of the apes", "dawn of the planet", "war for the planet", "kingdom of the planet"]
  },
  {
    name: "The Matrix",
    keywords: ["the matrix", "matrix reloaded", "matrix revolutions", "matrix resurrections"],
    tmdbCollectionId: 2344
  },
  {
    name: "Pirates of the Caribbean",
    keywords: ["pirates of the caribbean"],
    tmdbCollectionId: 295
  },
  {
    name: "Transformers",
    keywords: ["transformers"],
    tmdbCollectionId: 86038
  },
  {
    name: "Indiana Jones",
    keywords: ["indiana jones", "raiders of the lost ark", "temple of doom", "last crusade", "dial of destiny"],
    tmdbCollectionId: 84
  }
];

/**
 * detectFranchise — find which franchise a title belongs to.
 * Returns the FranchiseDefinition or null.
 *
 * Detection is keyword-based: the title (lowercased) is checked against
 * each franchise's keyword list. The first match wins (franchises are
 * ordered by specificity — more specific ones first).
 */
export function detectFranchise(title: string): FranchiseDefinition | null {
  const lower = title.toLowerCase();
  for (const f of FRANCHISES) {
    if (f.keywords.some((k) => lower.includes(k))) return f;
  }
  return null;
}

/**
 * findFranchiseByName — look up a franchise by its display name.
 * Used by hooks that store the franchise name (e.g. useDiscoverTaste).
 */
export function findFranchiseByName(name: string): FranchiseDefinition | null {
  return FRANCHISES.find((f) => f.name === name) ?? null;
}
