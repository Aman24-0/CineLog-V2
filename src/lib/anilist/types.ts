// src/lib/anilist/types.ts
//
// AniList GraphQL response types.
// ---------------------------------------------------------------------
// These types cover ONLY the fields CineLog actually consumes from
// AniList. The full AniList schema is enormous (hundreds of fields
// per Media); pulling the entire schema in would bloat the bundle
// and force us to maintain types we never use.
//
// All types are structural (interfaces, not classes) so they survive
// JSON serialization without reviver functions.
//
// Naming follows AniList's GraphQL schema (PascalCase for types,
// camelCase for fields) so the GraphQL queries map 1:1 to the type
// properties. This makes it easy to copy a query from the AniList
// Explorer and have TypeScript validate the response.

// ─── Primitives ─────────────────────────────────────────────────────

export interface AniListImage {
  large?: string | null;
  medium?: string | null;
  extraLarge?: string | null;
  color?: string | null;
}

export interface AniListFuzzyDate {
  year?: number | null;
  month?: number | null;
  day?: number | null;
}

export type AniListMediaFormat =
  | "TV"
  | "TV_SHORT"
  | "MOVIE"
  | "SPECIAL"
  | "OVA"
  | "ONA"
  | "MUSIC"
  | "MANGA"
  | "NOVEL"
  | "ONE_SHOT";

export type AniListMediaStatus =
  | "FINISHED"
  | "RELEASING"
  | "NOT_YET_RELEASED"
  | "CANCELLED"
  | "HIATUS";

export type AniListSeason = "WINTER" | "SPRING" | "SUMMER" | "FALL";

export type AniListMediaType = "ANIME" | "MANGA";

export type AniListSource =
  | "ORIGINAL"
  | "MANGA"
  | "LIGHT_NOVEL"
  | "VISUAL_NOVEL"
  | "VIDEO_GAME"
  | "OTHER"
  | "NOVEL"
  | "DOUJINSHI"
  | "ANIME"
  | "WEB_NOVEL"
  | "LIVE_ACTION"
  | "GAME"
  | "COMIC"
  | "MULTIMEDIA_PROJECT"
  | "PICTURE_BOOK";

// ─── Studios ────────────────────────────────────────────────────────

export interface AniListStudio {
  id: number;
  name: string;
  isAnimationStudio: boolean;
}

// ─── Staff / Voice Actors ───────────────────────────────────────────

export interface AniListStaffName {
  full?: string | null;
  native?: string | null;
  alternative?: string[] | null;
}

export interface AniListStaff {
  id: number;
  name: AniListStaffName;
  image?: AniListImage | null;
  language?: string | null; // "Japanese", "English", etc.
}

// ─── Characters ─────────────────────────────────────────────────────

export interface AniListCharacterName {
  full?: string | null;
  native?: string | null;
  alternative?: string[] | null;
}

export interface AniListCharacter {
  id: number;
  name: AniListCharacterName;
  image?: AniListImage | null;
  description?: string | null;
}

export interface AniListCharacterEdge {
  role?: string | null; // "MAIN", "SUPPORTING", "BACKGROUND"
  node: AniListCharacter;
  voiceActors?: AniListStaff[];
}

// ─── Relations ──────────────────────────────────────────────────────

export type AniListRelationType =
  | "ADAPTATION"
  | "PREQUEL"
  | "SEQUEL"
  | "PARENT"
  | "SIDE_STORY"
  | "CHARACTER"
  | "SUMMARY"
  | "ALTERNATIVE"
  | "SPIN_OFF"
  | "OTHER"
  | "SOURCE"
  | "COMPILATION"
  | "CONTAINS";

export interface AniListRelationEdge {
  relationType: AniListRelationType | string; // AniList may add new types
  node: {
    id: number;
    type: AniListMediaType | string;
    format?: AniListMediaFormat | string | null;
    title?: { romaji?: string | null; english?: string | null; native?: string | null } | null;
    coverImage?: AniListImage | null;
    averageScore?: number | null;
    startDate?: AniListFuzzyDate | null;
  };
}

// ─── Opening / Ending Themes ────────────────────────────────────────

export interface AniListThemeEntry {
  text?: string | null;
  group?: string | null;
  episodes?: string | null;
}

// ─── Airing Schedule ────────────────────────────────────────────────

export interface AniListAiringSchedule {
  id: number;
  airingAt: number; // unix seconds
  timeUntilAiring: number; // seconds
  episode: number;
}

// ─── Media (the core entity) ────────────────────────────────────────

export interface AniListMediaTitle {
  romaji?: string | null;
  english?: string | null;
  native?: string | null;
  userPreferred?: string | null;
}

export interface AniListMedia {
  id: number;
  idMal?: number | null;
  type?: AniListMediaType | string | null;
  format?: AniListMediaFormat | string | null;
  status?: AniListMediaStatus | string | null;
  season?: AniListSeason | string | null;
  seasonYear?: number | null;
  seasonInt?: number | null;
  episodes?: number | null;
  duration?: number | null;
  averageScore?: number | null;
  meanScore?: number | null;
  popularity?: number | null;
  favourites?: number | null;
  source?: AniListSource | string | null;
  countryOfOrigin?: string | null;
  isAdult?: boolean | null;
  hashtag?: string | null;
  siteUrl?: string | null;
  title?: AniListMediaTitle | null;
  coverImage?: AniListImage | null;
  bannerImage?: string | null;
  startDate?: AniListFuzzyDate | null;
  endDate?: AniListFuzzyDate | null;
  description?: string | null;
  genres?: string[] | null;
  synonyms?: string[] | null;
  studios?:
    | {
        edges?: Array<{ isMain?: boolean | null; node: AniListStudio }> | null;
      }
    | null;
  characters?:
    | {
        edges?: AniListCharacterEdge[] | null;
        pageInfo?: { total?: number | null };
      }
    | null;
  relations?:
    | {
        edges?: AniListRelationEdge[] | null;
      }
    | null;
  recommendations?:
    | {
        nodes?: Array<{
          id: number;
          rating?: number | null;
          mediaRecommendation?: {
            id: number;
            title?: AniListMediaTitle | null;
            coverImage?: AniListImage | null;
            averageScore?: number | null;
            format?: AniListMediaFormat | string | null;
            type?: AniListMediaType | string | null;
          } | null;
        }> | null;
      }
    | null;
  airingSchedule?:
    | {
        nodes?: AniListAiringSchedule[] | null;
      }
    | null;
  nextAiringEpisode?: AniListAiringSchedule | null;
  openings?: AniListThemeEntry[] | null;
  endings?: AniListThemeEntry[] | null;
  trailer?: { id: string | null; site: string | null } | null;
  externalLinks?:
    | Array<{
        id: number;
        url: string;
        site: string;
        type?: string | null;
        icon?: string | null;
        color?: string | null;
      }>
    | null;
  rankings?:
    | Array<{
        id: number;
        rank: number;
        type: "RATED" | "POPULAR" | string;
        allTime?: boolean | null;
        season?: AniListSeason | string | null;
        year?: number | null;
      }>
    | null;
}

// ─── Page response (paginated queries) ──────────────────────────────

export interface AniListPage<T> {
  Page?: {
    pageInfo: { total: number; currentPage: number; lastPage: number; perPage: number; hasNextPage: boolean };
    media: T[];
  } | null;
}

// ─── Top-level response shape ───────────────────────────────────────

export interface AniListResponse<T> {
  data?: T | null;
  errors?: Array<{
    message: string;
    status?: number | null;
    locations?: Array<{ line: number; column: number }>;
  }> | null;
}
