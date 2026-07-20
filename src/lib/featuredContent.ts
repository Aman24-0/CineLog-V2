// src/lib/featuredContent.ts
//
// CineLog V2 — Featured Content Hook (Client)
// ---------------------------------------------------------------------
// Fetches admin-curated featured content from /api/featured-content
// (public endpoint). Cached in-memory for 5 minutes.
//
// Slots:
//   hero         — full-bleed cinematic hero (overrides Spotlight)
//   spotlight    — overrides the random Spotlight pick
//   rail         — admin-curated rail (rendered between sections)
//   pinned       — sticky pinned title (reserved for future use)
//   editor_pick  — editor's pick (rendered as inline editorial card)
//
// Usage in DiscoverPage:
//   const featured = useFeaturedContent();
//   const heroOverride = featured.slot("hero")[0];
//   const railItems = featured.slot("rail");
//
// Empty slots fall back to [] — caller is responsible for the fallback.

import { createSignal, onMount } from "solid-js";

export type FeaturedSlot = "hero" | "spotlight" | "rail" | "pinned" | "editor_pick";

export interface FeaturedItem {
  id: string;
  slot: FeaturedSlot;
  tmdb_id: number;
  media_type: "movie" | "tv";
  title_override: string | null;
  tagline: string | null;
  position: number;
  starts_at: string | null;
  ends_at: string | null;
}

type GroupedFeatured = Record<FeaturedSlot, FeaturedItem[]>;

const EMPTY: GroupedFeatured = {
  hero: [],
  spotlight: [],
  rail: [],
  pinned: [],
  editor_pick: [],
};

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let cachedFeatured: GroupedFeatured | null = null;
let cachedAt = 0;
let inflightPromise: Promise<GroupedFeatured> | null = null;

async function fetchFeatured(): Promise<GroupedFeatured> {
  if (cachedFeatured && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedFeatured;
  }
  if (inflightPromise) return inflightPromise;

  inflightPromise = (async () => {
    try {
      const resp = await fetch("/api/featured-content");
      if (!resp.ok) return cachedFeatured ?? EMPTY;
      const data = (await resp.json()) as { featured: GroupedFeatured | FeaturedItem[] };
      // Endpoint returns either grouped (no slot param) or flat array (slot param)
      if (Array.isArray(data.featured)) {
        // Re-group by slot
        const grouped: GroupedFeatured = { ...EMPTY };
        for (const item of data.featured) {
          if (grouped[item.slot]) grouped[item.slot].push(item);
        }
        cachedFeatured = grouped;
      } else {
        cachedFeatured = { ...EMPTY, ...data.featured };
      }
      cachedAt = Date.now();
      return cachedFeatured;
    } catch {
      return cachedFeatured ?? EMPTY;
    } finally {
      inflightPromise = null;
    }
  })();
  return inflightPromise;
}

export function useFeaturedContent() {
  const [featured, setFeatured] = createSignal<GroupedFeatured>(cachedFeatured ?? EMPTY);

  onMount(async () => {
    const f = await fetchFeatured();
    setFeatured(f);
  });

  const slot = (s: FeaturedSlot): FeaturedItem[] => featured()[s] ?? [];
  const hasAny = (): boolean => Object.values(featured()).some((arr) => arr.length > 0);

  const refresh = async () => {
    cachedFeatured = null;
    cachedAt = 0;
    const f = await fetchFeatured();
    setFeatured(f);
  };

  return { featured, slot, hasAny, refresh };
}
