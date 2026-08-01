// src/lib/anilist/queries.ts
//
// AniList GraphQL fragments + query definitions.
// ---------------------------------------------------------------------
// All queries are stored as exported string constants so they can be
// unit-tested without hitting the network, and so the dedup key in
// client.ts is stable across calls.
//
// FRAGMENTS:
//   - MEDIA_CARD_FRAGMENT  — minimal fields for a poster card
//   - MEDIA_DETAILS_FRAGMENT — full enrichment fields for the Details page
//   - CHARACTER_FRAGMENT   — character + voice actor pair
//   - RELATION_FRAGMENT    — relation edge (prequel/sequel/spin-off/etc.)
//
// QUERIES:
//   - QUERY_MEDIA_DETAILS   — fetch one Media by AniList id (full enrichment)
//   - QUERY_TRENDING        — Trending Now (Page.media, sort: trending_desc)
//   - QUERY_SEASONAL        — Current season + year
//   - QUERY_UPCOMING        — Not yet aired or next episode airing
//   - QUERY_TOP_RATED       — sort: score_desc, score >= 80
//   - QUERY_POPULAR         — sort: popularity_desc
//   - QUERY_HIDDEN_GEMS     — high score, low popularity
//   - QUERY_MOVIES          — format: MOVIE only (best anime films)
//   - QUERY_SEARCH          — search by title (used for auto-mapping)
//   - QUERY_RECOMMENDATIONS — Media.recommendations connection
//   - QUERY_CURRENTLY_AIRING— status: RELEASING (for smart collections)
//   - QUERY_FINISHED        — status: FINISHED (for smart collections)
//
// PAGINATION:
//   All list queries accept (page, perPage) and return a Page object
//   with pageInfo.hasNextPage. Default perPage is 20 (AniList max is 50).

// ─── Fragments ──────────────────────────────────────────────────────

export const MEDIA_CARD_FRAGMENT = `
fragment MediaCard on Media {
  id
  idMal
  type
  format
  season
  seasonYear
  episodes
  averageScore
  popularity
  title { romaji english native userPreferred }
  coverImage { large medium extraLarge color }
  startDate { year month day }
  status
  countryOfOrigin
}
`;

export const CHARACTER_FRAGMENT = `
fragment CharacterFragment on Character {
  id
  name { full native alternative }
  image { large medium }
  description(asHtml: false)
}
`;

export const STAFF_FRAGMENT = `
fragment StaffFragment on Staff {
  id
  name { full native alternative }
  image { large medium }
  languageV2
  primaryOccupations
}
`;

export const RELATION_FRAGMENT = `
fragment RelationFragment on Media {
  id
  type
  format
  title { romaji english native }
  coverImage { large medium }
  averageScore
  startDate { year month day }
  status
}
`;

/**
 * Full details fragment — pulls every field the Details page needs.
 *
 * Note: openings/endings are top-level fields on Media (not nested
 * connections), so we read them directly. AniList's theme data is
 * community-moderated and may be missing for less-popular titles;
 * callers should always treat these arrays as possibly empty.
 */
export const MEDIA_DETAILS_FRAGMENT = `
fragment MediaDetails on Media {
  id
  idMal
  type
  format
  status
  season
  seasonYear
  seasonInt
  episodes
  duration
  averageScore
  meanScore
  popularity
  favourites
  source
  countryOfOrigin
  isAdult
  hashtag
  siteUrl
  title { romaji english native userPreferred }
  coverImage { large medium extraLarge color }
  bannerImage
  startDate { year month day }
  endDate { year month day }
  description(asHtml: false)
  genres
  synonyms
  trailer { id site }
  nextAiringEpisode {
    id
    airingAt
    timeUntilAiring
    episode
  }
  studios(isMain: true) {
    edges { isMain node { id name isAnimationStudio } }
  }
  characters(sort: ROLE, perPage: 12) {
    edges {
      role
      node { ...CharacterFragment }
      voiceActors(language: JAPANESE, sort: RELEVANCE) {
        id
        name { full native }
        image { large medium }
      }
    }
  }
  relations {
    edges {
      relationType(version: 2)
      node { ...RelationFragment }
    }
  }
  recommendations(sort: RATING_DESC, perPage: 12) {
    nodes {
      id
      rating
      mediaRecommendation {
        id
        type
        format
        title { romaji english native userPreferred }
        coverImage { large medium }
        averageScore
      }
    }
  }
  openings { text group episodes }
  endings { text group episodes }
  externalLinks { id url site type icon color }
  rankings { id rank type allTime season year }
}
`;

// ─── Queries ────────────────────────────────────────────────────────

export const QUERY_MEDIA_DETAILS = `
${CHARACTER_FRAGMENT}
${RELATION_FRAGMENT}
${MEDIA_DETAILS_FRAGMENT}
query MediaDetails($id: Int!) {
  Media(id: $id, type: ANIME) {
    ...MediaDetails
  }
}
`;

export const QUERY_TRENDING = `
${MEDIA_CARD_FRAGMENT}
query TrendingAnime($page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { total currentPage lastPage perPage hasNextPage }
    media(sort: TRENDING_DESC, type: ANIME, isAdult: false) {
      ...MediaCard
    }
  }
}
`;

export const QUERY_SEASONAL = `
${MEDIA_CARD_FRAGMENT}
query SeasonalAnime($season: MediaSeason!, $year: Int, $page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { total currentPage lastPage perPage hasNextPage }
    media(season: $season, seasonYear: $year, type: ANIME, sort: POPULARITY_DESC, isAdult: false) {
      ...MediaCard
    }
  }
}
`;

export const QUERY_UPCOMING = `
${MEDIA_CARD_FRAGMENT}
query UpcomingAnime($page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { total currentPage lastPage perPage hasNextPage }
    media(type: ANIME, status: NOT_YET_RELEASED, sort: START_DATE_DESC, isAdult: false) {
      ...MediaCard
    }
  }
}
`;

export const QUERY_TOP_RATED = `
${MEDIA_CARD_FRAGMENT}
query TopRatedAnime($page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { total currentPage lastPage perPage hasNextPage }
    media(type: ANIME, sort: SCORE_DESC, averageScore_greater: 80, isAdult: false) {
      ...MediaCard
    }
  }
}
`;

export const QUERY_POPULAR = `
${MEDIA_CARD_FRAGMENT}
query PopularAnime($page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { total currentPage lastPage perPage hasNextPage }
    media(type: ANIME, sort: POPULARITY_DESC, isAdult: false) {
      ...MediaCard
    }
  }
}
`;

export const QUERY_HIDDEN_GEMS = `
${MEDIA_CARD_FRAGMENT}
query HiddenGems($page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { total currentPage lastPage perPage hasNextPage }
    media(type: ANIME, sort: SCORE_DESC, averageScore_greater: 75, popularity_lesser: 50000, isAdult: false) {
      ...MediaCard
    }
  }
}
`;

export const QUERY_MOVIES = `
${MEDIA_CARD_FRAGMENT}
query AnimeMovies($page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { total currentPage lastPage perPage hasNextPage }
    media(type: ANIME, format: MOVIE, sort: SCORE_DESC, isAdult: false) {
      ...MediaCard
    }
  }
}
`;

export const QUERY_SEARCH = `
${MEDIA_CARD_FRAGMENT}
query SearchAnime($search: String!, $page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { total currentPage lastPage perPage hasNextPage }
    media(type: ANIME, search: $search, sort: SEARCH_MATCH, isAdult: false) {
      ...MediaCard
    }
  }
}
`;

export const QUERY_RECOMMENDATIONS = `
${MEDIA_CARD_FRAGMENT}
query AnimeRecommendations($id: Int!, $page: Int, $perPage: Int) {
  Media(id: $id, type: ANIME) {
    recommendations(sort: RATING_DESC, page: $page, perPage: $perPage) {
      nodes {
        id
        rating
        mediaRecommendation {
          ...MediaCard
        }
      }
    }
  }
}
`;

export const QUERY_CURRENTLY_AIRING = `
${MEDIA_CARD_FRAGMENT}
query CurrentlyAiring($page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { total currentPage lastPage perPage hasNextPage }
    media(type: ANIME, status: RELEASING, sort: POPULARITY_DESC, isAdult: false) {
      ...MediaCard
    }
  }
}
`;

export const QUERY_FINISHED = `
${MEDIA_CARD_FRAGMENT}
query FinishedAnime($page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { total currentPage lastPage perPage hasNextPage }
    media(type: ANIME, status: FINISHED, sort: SCORE_DESC, isAdult: false) {
      ...MediaCard
    }
  }
}
`;

// ─── Query functions (typed wrappers) ───────────────────────────────

import { anilistRequest } from "./client";
import type {
  AniListMedia,
  AniListPage,
  AniListAiringSchedule
} from "./types";

/** Helper to run a Page query and return the media array + pageInfo. */
async function fetchPage(
  query: string,
  variables: Record<string, unknown> = {},
  page = 1,
  perPage = 20
): Promise<{ media: AniListMedia[]; hasNextPage: boolean }> {
  const data = await anilistRequest<AniListPage<AniListMedia>>(query, {
    page,
    perPage,
    ...variables
  });
  const p = data?.Page;
  return {
    media: p?.media ?? [],
    hasNextPage: p?.pageInfo?.hasNextPage ?? false
  };
}

export const fetchMediaDetails = (id: number, opts?: { cacheTtlMs?: number }) =>
  anilistRequest<{ Media: AniListMedia | null }>(
    QUERY_MEDIA_DETAILS,
    { id },
    { cacheTtlMs: opts?.cacheTtlMs ?? 30 * 60 * 1000 /* 30 min for details */ }
  ).then((r) => r.Media ?? null);

export const fetchTrendingAnime = (page = 1, perPage = 20) =>
  fetchPage(QUERY_TRENDING, {}, page, perPage);

export const fetchSeasonalAnime = (
  season: "WINTER" | "SPRING" | "SUMMER" | "FALL",
  year: number,
  page = 1,
  perPage = 20
) => fetchPage(QUERY_SEASONAL, { season, year }, page, perPage);

export const fetchUpcomingAnime = (page = 1, perPage = 20) =>
  fetchPage(QUERY_UPCOMING, {}, page, perPage);

export const fetchTopRatedAnime = (page = 1, perPage = 20) =>
  fetchPage(QUERY_TOP_RATED, {}, page, perPage);

export const fetchPopularAnime = (page = 1, perPage = 20) =>
  fetchPage(QUERY_POPULAR, {}, page, perPage);

export const fetchHiddenGemsAnime = (page = 1, perPage = 20) =>
  fetchPage(QUERY_HIDDEN_GEMS, {}, page, perPage);

export const fetchAnimeMovies = (page = 1, perPage = 20) =>
  fetchPage(QUERY_MOVIES, {}, page, perPage);

export const searchAnime = (search: string, page = 1, perPage = 20) =>
  fetchPage(QUERY_SEARCH, { search }, page, perPage);

export const fetchCurrentlyAiring = (page = 1, perPage = 20) =>
  fetchPage(QUERY_CURRENTLY_AIRING, {}, page, perPage);

export const fetchFinishedAnime = (page = 1, perPage = 20) =>
  fetchPage(QUERY_FINISHED, {}, page, perPage);

export const fetchAnimeRecommendations = async (
  anilistId: number,
  page = 1,
  perPage = 12
): Promise<AniListMedia[]> => {
  const data = await anilistRequest<{
    Media: {
      recommendations: {
        nodes: Array<{
          id: number;
          rating?: number | null;
          mediaRecommendation?: AniListMedia | null;
        }> | null;
      } | null;
    } | null;
  }>(QUERY_RECOMMENDATIONS, { id: anilistId, page, perPage });
  const nodes = data?.Media?.recommendations?.nodes ?? [];
  return nodes
    .map((n) => n.mediaRecommendation)
    .filter((m): m is AniListMedia => m != null);
};

// ─── Season helpers ─────────────────────────────────────────────────

/**
 * Compute the current AniList season name + year based on the date.
 * AniList seasons follow calendar quarters:
 *   WINTER  = Jan, Feb, Mar
 *   SPRING  = Apr, May, Jun
 *   SUMMER  = Jul, Aug, Sep
 *   FALL    = Oct, Nov, Dec
 *
 * When the current month is Jan/Feb/Mar, the "season year" is the
 * current calendar year. (AniList sometimes shows winter anime from
 * the previous December, but the season field is still WINTER <year>.)
 */
export function currentAniListSeason(date = new Date()): {
  season: "WINTER" | "SPRING" | "SUMMER" | "FALL";
  year: number;
} {
  const month = date.getMonth(); // 0-11
  const year = date.getFullYear();
  if (month <= 2) return { season: "WINTER", year };
  if (month <= 5) return { season: "SPRING", year };
  if (month <= 8) return { season: "SUMMER", year };
  return { season: "FALL", year };
}
