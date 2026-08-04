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
      "avengers",
      "iron man",
      "captain america",
      "thor",
      "black panther",
      "doctor strange",
      "spider-man",
      "guardians of the galaxy",
      "black widow",
      "hawkeye",
      "eternals",
      "shang-chi",
      "ant-man",
      "captain marvel",
      "the marvels",
      "wakanda forever",
      "multiverse of madness",
      "no way home",
      "far from home",
      "homecoming",
      "ragnarok",
      "love and thunder",
      "winter soldier",
      "civil war",
      "endgame",
      "infinity war"
    ],
    sagas: [
      {
        name: "Phase 1",
        keywords: [
          "iron man",
          "incredible hulk",
          "thor",
          "captain america",
          "avengers"
        ]
      },
      {
        name: "Phase 2",
        keywords: [
          "iron man 3",
          "dark world",
          "winter soldier",
          "guardians",
          "age of ultron",
          "ant-man"
        ]
      },
      {
        name: "Phase 3",
        keywords: [
          "civil war",
          "doctor strange",
          "homecoming",
          "ragnarok",
          "black panther",
          "infinity war",
          "ant-man and the wasp",
          "captain marvel",
          "endgame",
          "far from home"
        ]
      },
      {
        name: "Phase 4",
        keywords: [
          "black widow",
          "shang-chi",
          "eternals",
          "no way home",
          "multiverse of madness",
          "love and thunder",
          "wakanda forever"
        ]
      },
      {
        name: "Phase 5",
        keywords: ["quantumania", "guardians of the galaxy vol", "the marvels"]
      }
    ]
  },
  {
    name: "DC Extended Universe",
    keywords: [
      "batman",
      "superman",
      "wonder woman",
      "aquaman",
      "flash",
      "justice league",
      "suicide squad",
      "man of steel",
      "black adam",
      "shazam",
      "black canary",
      "peacemaker"
    ]
  },
  {
    name: "Harry Potter",
    keywords: [
      "harry potter",
      "deathly hallows",
      "philosopher's stone",
      "chamber of secrets",
      "prisoner of azkaban",
      "goblet of fire",
      "order of the phoenix",
      "half-blood prince",
      "fantastic beasts"
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
    keywords: [
      "fast and furious",
      "fast & furious",
      "furious",
      "tokyo drift",
      "fast x"
    ],
    tmdbCollectionId: 948485
  },
  {
    name: "Star Wars",
    keywords: [
      "star wars",
      "empire strikes back",
      "return of the jedi",
      "force awakens",
      "last jedi",
      "rise of skywalker",
      "rogue one",
      "solo",
      "mandalorian",
      "andor",
      "ahsoka",
      "book of boba fett"
    ]
  },
  {
    name: "Lord of the Rings",
    keywords: [
      "lord of the rings",
      "hobbit",
      "fellowship of the ring",
      "two towers",
      "return of the king",
      "rings of power"
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
    keywords: [
      "james bond",
      "007",
      "no time to die",
      "skyfall",
      "spectre",
      "casino royale",
      "quantum of solace"
    ]
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
    keywords: [
      "planet of the apes",
      "dawn of the planet",
      "war for the planet",
      "kingdom of the planet"
    ]
  },
  {
    name: "The Matrix",
    keywords: [
      "the matrix",
      "matrix reloaded",
      "matrix revolutions",
      "matrix resurrections"
    ],
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
    keywords: [
      "indiana jones",
      "raiders of the lost ark",
      "temple of doom",
      "last crusade",
      "dial of destiny"
    ],
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

/* ============================================================
   FRANCHISE → UNIVERSE HIERARCHY
   The permanent hierarchy powering the Collections experience.
   Franchise > Universe > Timeline > Title
   ============================================================ */

import type { Franchise as FranchiseHierarchy } from "~/shared/types";

export const FRANCHISE_HIERARCHY: FranchiseHierarchy[] = [
  {
    id: "marvel",
    name: "Marvel",
    icon: "shield",
    backdrop_path: "/9BBtojrJ1JyKr3t4mCMzYsBa9eT.jpg",
    accentColor: "#E62429",
    universes: [
      {
        id: "mcu",
        name: "MCU",
        type: "curated",
        collectionId: "mcu-chronological"
      },
      {
        id: "sony-spider-verse",
        name: "Sony Spider-Verse",
        type: "official",
        tmdbCollectionId: 531770
      },
      { id: "x-men", name: "X-Men", type: "official", tmdbCollectionId: 748 },
      {
        id: "fantastic-four",
        name: "Fantastic Four",
        type: "official",
        tmdbCollectionId: 1676
      },
      { id: "blade", name: "Blade", type: "official", tmdbCollectionId: 9771 }
    ]
  },
  {
    id: "dc",
    name: "DC",
    icon: "flash",
    backdrop_path: "/5SUpUS6MRMwApH6UqxxFfS3xGYq.jpg",
    accentColor: "#0078D7",
    universes: [
      { id: "dceu", name: "DCEU", type: "curated", collectionId: "dceu" },
      { id: "dcu", name: "DCU", type: "curated", collectionId: "dcu" },
      {
        id: "batman-universe",
        name: "Batman Universe",
        type: "curated",
        collectionId: "batman-universe"
      },
      {
        id: "dark-knight-trilogy",
        name: "Dark Knight Trilogy",
        type: "curated",
        collectionId: "dark-knight-trilogy"
      },
      {
        id: "arrowverse",
        name: "Arrowverse",
        type: "curated",
        collectionId: "arrowverse"
      },
      {
        id: "dc-animated",
        name: "DC Animated",
        type: "curated",
        collectionId: "dc-animated"
      }
    ]
  },
  {
    id: "star-wars",
    name: "Star Wars",
    icon: "rocket_launch",
    backdrop_path: "/d8duYyyC9J5T825Hg7grmaabfxQ.jpg",
    accentColor: "#FFE81F",
    universes: [
      {
        id: "skywalker-saga",
        name: "Skywalker Saga",
        type: "curated",
        collectionId: "star-wars-timeline"
      },
      {
        id: "mandoverse",
        name: "Mandoverse",
        type: "curated",
        collectionId: "mandoverse"
      },
      {
        id: "star-wars-legends",
        name: "Legends",
        type: "curated",
        collectionId: "star-wars-legends"
      }
    ]
  },
  {
    id: "middle-earth",
    name: "Middle Earth",
    icon: "landscape",
    backdrop_path: "/9deGfFCcrun4q3OFCb4zOhmRJ6P.jpg",
    accentColor: "#8B6914",
    universes: [
      {
        id: "lotr",
        name: "The Lord of the Rings",
        type: "curated",
        collectionId: "middle-earth"
      },
      {
        id: "the-hobbit",
        name: "The Hobbit",
        type: "official",
        tmdbCollectionId: 121938
      }
    ]
  },
  {
    id: "wizarding-world",
    name: "Wizarding World",
    icon: "auto_fix_high",
    backdrop_path: "/8NG2cq1Z7x2wbe2fNJxfgMgx9I7.jpg",
    accentColor: "#7B5EA7",
    universes: [
      {
        id: "harry-potter",
        name: "Harry Potter",
        type: "curated",
        collectionId: "harry-potter"
      },
      {
        id: "fantastic-beasts",
        name: "Fantastic Beasts",
        type: "official",
        tmdbCollectionId: 413639
      }
    ]
  },
  {
    id: "spy-thriller",
    name: "Spy & Thriller",
    icon: "person",
    backdrop_path: null,
    universes: [
      {
        id: "james-bond",
        name: "James Bond",
        type: "curated",
        collectionId: "james-bond"
      },
      {
        id: "mission-impossible",
        name: "Mission: Impossible",
        type: "official",
        tmdbCollectionId: 537
      },
      {
        id: "bourne",
        name: "Bourne",
        type: "official",
        tmdbCollectionId: 2422
      },
      {
        id: "john-wick",
        name: "John Wick",
        type: "curated",
        collectionId: "john-wick"
      }
    ]
  },
  {
    id: "sci-fi-saga",
    name: "Sci-Fi Sagas",
    icon: "science_fiction",
    backdrop_path: null,
    universes: [
      { id: "dune", name: "Dune", type: "official", tmdbCollectionId: 886484 },
      {
        id: "the-matrix",
        name: "The Matrix",
        type: "official",
        tmdbCollectionId: 2344
      },
      {
        id: "avatar",
        name: "Avatar",
        type: "official",
        tmdbCollectionId: 858363
      },
      {
        id: "planet-of-the-apes",
        name: "Planet of the Apes",
        type: "official",
        tmdbCollectionId: 173855
      },
      { id: "alien", name: "Alien", type: "official", tmdbCollectionId: 8091 }
    ]
  },
  {
    id: "adventure",
    name: "Adventure",
    icon: "explore",
    backdrop_path: null,
    universes: [
      {
        id: "indiana-jones",
        name: "Indiana Jones",
        type: "official",
        tmdbCollectionId: 84
      },
      {
        id: "jurassic-park",
        name: "Jurassic Park",
        type: "official",
        tmdbCollectionId: 328
      },
      {
        id: "pirates-caribbean",
        name: "Pirates of the Caribbean",
        type: "official",
        tmdbCollectionId: 295
      },
      {
        id: "transformers",
        name: "Transformers",
        type: "official",
        tmdbCollectionId: 86038
      }
    ]
  },
  {
    id: "horror",
    name: "Horror Universes",
    icon: "horror",
    backdrop_path: null,
    universes: [
      {
        id: "conjuring",
        name: "The Conjuring Universe",
        type: "official",
        tmdbCollectionId: 313086
      },
      {
        id: "monsterverse",
        name: "MonsterVerse",
        type: "official",
        tmdbCollectionId: 578261
      },
      {
        id: "alien-vs-predator",
        name: "Alien vs Predator",
        type: "official",
        tmdbCollectionId: 158140
      }
    ]
  },
  {
    id: "fast-saga",
    name: "Fast Saga",
    icon: "speed",
    backdrop_path: null,
    universes: [
      {
        id: "fast-furious",
        name: "Fast & Furious",
        type: "official",
        tmdbCollectionId: 948485
      }
    ]
  }
];
