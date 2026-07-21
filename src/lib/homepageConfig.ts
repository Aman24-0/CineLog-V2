// src/lib/homepageConfig.ts
//
// CineLog V2 — Homepage Config Hook (Client)
// ---------------------------------------------------------------------
// Fetches admin-controlled homepage section config from
// /api/homepage-config (public endpoint). Cached in-memory for 5 minutes.
//
// Shape:
//   {
//     sections: {
//       "genre_explorer": { enabled: true, order: 1 },
//       "spotlight":      { enabled: true, order: 2 },
//       ...
//     }
//   }
//
// Usage in DiscoverPage:
//   const cfg = useHomepageConfig();
//   const sectionEnabled = (key: string) => cfg.isEnabled(key);
//   const sortedSectionKeys = cfg.orderedKeys();
//
// Unknown section keys default to enabled:true, order:999.

import { createSignal, onMount, createMemo } from "solid-js";

export interface SectionConfig {
  enabled: boolean;
  order: number;
}

interface HomepageConfig {
  sections: Record<string, SectionConfig>;
}

const DEFAULT_CONFIG: HomepageConfig = {
  sections: {
    genre_explorer: { enabled: true, order: 1 },
    spotlight: { enabled: true, order: 2 },
    continue_universes: { enabled: true, order: 3 },
    insight_strip: { enabled: true, order: 4 },
    trending: { enabled: true, order: 5 },
    theatres: { enabled: true, order: 6 },
    because_you_love: { enabled: true, order: 7 },
    surprise_me: { enabled: true, order: 8 },
    weekend_picks: { enabled: true, order: 9 },
    step_outside: { enabled: true, order: 10 },
    hidden_gems: { enabled: true, order: 11 },
    top_rated_movies: { enabled: true, order: 12 },
    top_rated_series: { enabled: true, order: 13 },
    new_on_ott: { enabled: true, order: 14 },
    new_seasons: { enabled: true, order: 15 },
    coming_soon: { enabled: true, order: 16 },
  },
};

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Module-level cache shared across all instances
let cachedConfig: HomepageConfig | null = null;
let cachedAt = 0;
let inflightPromise: Promise<HomepageConfig> | null = null;

async function fetchConfig(): Promise<HomepageConfig> {
  if (cachedConfig && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedConfig;
  }
  if (inflightPromise) return inflightPromise;

  inflightPromise = (async () => {
    try {
      const resp = await fetch("/api/homepage-config");
      if (!resp.ok) return cachedConfig ?? DEFAULT_CONFIG;
      const data = (await resp.json()) as { config: HomepageConfig };
      cachedConfig = {
        sections: { ...DEFAULT_CONFIG.sections, ...(data.config.sections ?? {}) },
      };
      cachedAt = Date.now();
      return cachedConfig;
    } catch {
      return cachedConfig ?? DEFAULT_CONFIG;
    } finally {
      inflightPromise = null;
    }
  })();
  return inflightPromise;
}

export function useHomepageConfig() {
  const [config, setConfig] = createSignal<HomepageConfig>(cachedConfig ?? DEFAULT_CONFIG);

  onMount(async () => {
    const cfg = await fetchConfig();
    setConfig(cfg);
  });

  const isEnabled = (key: string): boolean => {
    const sec = config().sections[key];
    return sec?.enabled ?? true;
  };

  const orderedKeys = createMemo(() => {
    const cfg = config();
    return Object.keys(cfg.sections)
      .filter((k) => cfg.sections[k].enabled)
      .sort((a, b) => (cfg.sections[a]?.order ?? 999) - (cfg.sections[b]?.order ?? 999));
  });

  // For debugging / admin UI testing: force-refresh
  const refresh = async () => {
    cachedConfig = null;
    cachedAt = 0;
    const cfg = await fetchConfig();
    setConfig(cfg);
  };

  return { config, isEnabled, orderedKeys, refresh };
}
