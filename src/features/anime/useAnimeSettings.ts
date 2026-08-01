// src/features/anime/useAnimeSettings.ts
//
// useAnimeSettings — SolidJS hook that fetches the admin-controlled
// anime integration settings from /api/anime-settings (public).
//
// Shape (mirrors the migration default):
//   {
//     enabled: true,
//     seasonal_carousel: true,
//     characters_staff: true,
//     relations: true,
//     airing_schedule: true,
//     opening_ending_themes: true,
//     auto_mapping: true,
//     api_timeout_ms: 10000,
//     cache_ttl_details_hours: 24,
//     cache_ttl_trending_hours: 6,
//     cache_ttl_seasonal_hours: 6,
//     cache_ttl_upcoming_hours: 12,
//     rate_limit_buffer_percent: 10
//   }
//
// Caching: 5 minutes in-memory, shared across all callers in the tab.
// Falls back to DEFAULT_ANIME_SETTINGS if the fetch fails — the app
// should still work even if the admin endpoint is down.
//
// Usage:
//   const settings = useAnimeSettings();
//   <Show when={settings.enabled() && settings.charactersStaff()}>

import { createSignal, onMount } from "solid-js";

export interface AnimeSettings {
  enabled: boolean;
  seasonalCarousel: boolean;
  charactersStaff: boolean;
  relations: boolean;
  airingSchedule: boolean;
  openingEndingThemes: boolean;
  autoMapping: boolean;
  apiTimeoutMs: number;
  cacheTtlDetailsHours: number;
  cacheTtlTrendingHours: number;
  cacheTtlSeasonalHours: number;
  cacheTtlUpcomingHours: number;
  rateLimitBufferPercent: number;
}

export const DEFAULT_ANIME_SETTINGS: AnimeSettings = {
  enabled: true,
  seasonalCarousel: true,
  charactersStaff: true,
  relations: true,
  airingSchedule: true,
  openingEndingThemes: true,
  autoMapping: true,
  apiTimeoutMs: 10_000,
  cacheTtlDetailsHours: 24,
  cacheTtlTrendingHours: 6,
  cacheTtlSeasonalHours: 6,
  cacheTtlUpcomingHours: 12,
  rateLimitBufferPercent: 10
};

const CACHE_TTL_MS = 5 * 60 * 1000;

let cached: AnimeSettings | null = null;
let cachedAt = 0;
let inflight: Promise<AnimeSettings> | null = null;

interface RawServerShape {
  enabled?: boolean;
  seasonal_carousel?: boolean;
  characters_staff?: boolean;
  relations?: boolean;
  airing_schedule?: boolean;
  opening_ending_themes?: boolean;
  auto_mapping?: boolean;
  api_timeout_ms?: number;
  cache_ttl_details_hours?: number;
  cache_ttl_trending_hours?: number;
  cache_ttl_seasonal_hours?: number;
  cache_ttl_upcoming_hours?: number;
  rate_limit_buffer_percent?: number;
}

function normalize(raw: RawServerShape | null | undefined): AnimeSettings {
  if (!raw) return DEFAULT_ANIME_SETTINGS;
  return {
    enabled: raw.enabled ?? DEFAULT_ANIME_SETTINGS.enabled,
    seasonalCarousel: raw.seasonal_carousel ?? DEFAULT_ANIME_SETTINGS.seasonalCarousel,
    charactersStaff: raw.characters_staff ?? DEFAULT_ANIME_SETTINGS.charactersStaff,
    relations: raw.relations ?? DEFAULT_ANIME_SETTINGS.relations,
    airingSchedule: raw.airing_schedule ?? DEFAULT_ANIME_SETTINGS.airingSchedule,
    openingEndingThemes: raw.opening_ending_themes ?? DEFAULT_ANIME_SETTINGS.openingEndingThemes,
    autoMapping: raw.auto_mapping ?? DEFAULT_ANIME_SETTINGS.autoMapping,
    apiTimeoutMs: raw.api_timeout_ms ?? DEFAULT_ANIME_SETTINGS.apiTimeoutMs,
    cacheTtlDetailsHours: raw.cache_ttl_details_hours ?? DEFAULT_ANIME_SETTINGS.cacheTtlDetailsHours,
    cacheTtlTrendingHours: raw.cache_ttl_trending_hours ?? DEFAULT_ANIME_SETTINGS.cacheTtlTrendingHours,
    cacheTtlSeasonalHours: raw.cache_ttl_seasonal_hours ?? DEFAULT_ANIME_SETTINGS.cacheTtlSeasonalHours,
    cacheTtlUpcomingHours: raw.cache_ttl_upcoming_hours ?? DEFAULT_ANIME_SETTINGS.cacheTtlUpcomingHours,
    rateLimitBufferPercent: raw.rate_limit_buffer_percent ?? DEFAULT_ANIME_SETTINGS.rateLimitBufferPercent
  };
}

async function fetchSettings(): Promise<AnimeSettings> {
  if (cached && Date.now() - cachedAt < CACHE_TTL_MS) return cached;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const resp = await fetch("/api/anime-settings");
      if (!resp.ok) return cached ?? DEFAULT_ANIME_SETTINGS;
      const data = (await resp.json()) as { settings?: RawServerShape };
      cached = normalize(data.settings);
      cachedAt = Date.now();
      return cached;
    } catch {
      return cached ?? DEFAULT_ANIME_SETTINGS;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function useAnimeSettings() {
  const [settings, setSettings] = createSignal<AnimeSettings>(
    cached ?? DEFAULT_ANIME_SETTINGS
  );

  onMount(async () => {
    const s = await fetchSettings();
    setSettings(s);
  });

  return {
    enabled: () => settings().enabled,
    seasonalCarousel: () => settings().seasonalCarousel,
    charactersStaff: () => settings().charactersStaff,
    relations: () => settings().relations,
    airingSchedule: () => settings().airingSchedule,
    openingEndingThemes: () => settings().openingEndingThemes,
    autoMapping: () => settings().autoMapping,
    apiTimeoutMs: () => settings().apiTimeoutMs,
    cacheTtlDetailsHours: () => settings().cacheTtlDetailsHours,
    cacheTtlTrendingHours: () => settings().cacheTtlTrendingHours,
    cacheTtlSeasonalHours: () => settings().cacheTtlSeasonalHours,
    cacheTtlUpcomingHours: () => settings().cacheTtlUpcomingHours,
    rateLimitBufferPercent: () => settings().rateLimitBufferPercent,
    raw: settings,
    refresh: async () => {
      cached = null;
      cachedAt = 0;
      const s = await fetchSettings();
      setSettings(s);
    }
  };
}
