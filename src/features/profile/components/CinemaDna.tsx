// src/features/profile/components/CinemaDna.tsx
//
// Sprint 2C — NEW FILE.
// A computed insight card that derives the user's "viewer archetype"
// from their watchlist genre distribution.
//
// Logic:
//   1. Count genres in watchlist
//   2. Find dominant genre
//   3. Map to archetype name
//   4. Compute percentile insight
//   5. CTA navigates to /profile/stats

import { createMemo, type Component } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { GlassSurface, GlassSectionHeader, GlassButton } from "~/shared/ui/glass";
// Genre utilities are used by the genre counting logic inline
// hasGenre and collectGenres patterns are applied manually for archetype mapping
import type { WatchlistItem } from "~/shared/types";

interface CinemaDnaProps {
  watchlist: () => WatchlistItem[];
}

// ── Archetype Map ──────────────────────────────────────────────

const ARCHETYPE_MAP: Record<string, { name: string; icon: string }> = {
  "sci-fi": { name: "World Builder", icon: "rocket_launch" },
  "horror": { name: "Night Owl", icon: "ghost" },
  "drama": { name: "Story Seeker", icon: "theater_comedy" },
  "comedy": { name: "Joy Finder", icon: "sentiment_very_satisfied" },
  "action": { name: "Thrill Chaser", icon: "bolt" },
  "animation": { name: "Dream Weaver", icon: "animation" },
  "documentary": { name: "Truth Hunter", icon: "fact_check" },
  "romance": { name: "Heart Explorer", icon: "favorite" },
  "thriller": { name: "Shadow Walker", icon: "visibility" },
  "fantasy": { name: "Realm Seeker", icon: "auto_awesome" },
  "mystery": { name: "Puzzle Solver", icon: "extension" },
  "crime": { name: "Case Cracker", icon: "gavel" },
  "adventure": { name: "Trailblazer", icon: "explore" },
  "war": { name: "Chronicle Keeper", icon: "shield" },
  "history": { name: "Time Witness", icon: "history_edu" },
  "music": { name: "Melody Seeker", icon: "music_note" },
  "family": { name: "Heartbeat Keeper", icon: "diversity_3" },
  "western": { name: "Frontier Spirit", icon: "landscape" },
};

const DEFAULT_ARCHETYPE = { name: "Cinema Explorer", icon: "movie" };

// Genre substring matchers — maps normalized genre names to archetype keys
const GENRE_MATCHERS: [string, string][] = [
  ["sci", "sci-fi"],
  ["horror", "horror"],
  ["drama", "drama"],
  ["comedy", "comedy"],
  ["action", "action"],
  ["anim", "animation"],
  ["document", "documentary"],
  ["romance", "romance"],
  ["thriller", "thriller"],
  ["fantasy", "fantasy"],
  ["mystery", "mystery"],
  ["crime", "crime"],
  ["adventure", "adventure"],
  ["war", "war"],
  ["history", "history"],
  ["music", "music"],
  ["family", "family"],
  ["western", "western"],
];

// ── Component ──────────────────────────────────────────────────

const CinemaDna: Component<CinemaDnaProps> = (props) => {
  const navigate = useNavigate();

  /** Count genres across the watchlist, returning a map of genre → count */
  const genreCounts = createMemo(() => {
    const list = props.watchlist();
    const counts = new Map<string, number>();

    for (const item of list) {
      if (!item.genresList || !Array.isArray(item.genresList)) continue;
      for (const rawGenre of item.genresList) {
        const g = typeof rawGenre === "string"
          ? rawGenre.trim().toLowerCase()
          : typeof rawGenre === "object" && rawGenre !== null && "name" in rawGenre
            ? String((rawGenre as { name: unknown }).name).trim().toLowerCase()
            : "";
        if (!g) continue;

        // Normalize to archetype key via substring matchers
        let matched = false;
        for (const [substr, key] of GENRE_MATCHERS) {
          if (g.includes(substr)) {
            counts.set(key, (counts.get(key) ?? 0) + 1);
            matched = true;
            break;
          }
        }
        if (!matched) {
          // Store as-is for unmatched genres
          counts.set(g, (counts.get(g) ?? 0) + 1);
        }
      }
    }
    return counts;
  });

  /** Find the dominant genre archetype */
  const archetype = createMemo(() => {
    const counts = genreCounts();
    if (counts.size === 0) return DEFAULT_ARCHETYPE;

    let topKey = "";
    let topCount = 0;
    for (const [key, count] of counts) {
      if (count > topCount) {
        topCount = count;
        topKey = key;
      }
    }

    return ARCHETYPE_MAP[topKey] ?? DEFAULT_ARCHETYPE;
  });

  /** Compute the dominant genre count for percentile insight */
  const dominantCount = createMemo(() => {
    const counts = genreCounts();
    let max = 0;
    for (const count of counts.values()) {
      if (count > max) max = count;
    }
    return max;
  });

  /** Percentile insight text */
  const insight = createMemo((): string => {
    const count = dominantCount();
    const list = props.watchlist();

    if (list.length === 0) return "Start watching to discover your archetype";

    if (count > 20) return `More devoted than 90% of cinephiles`;
    if (count > 10) return `More dedicated than 80% of viewers`;
    if (count > 5) return `More passionate than 70% of watchers`;
    if (count > 2) return `Your taste is taking shape`;
    return `Every great journey starts with one title`;
  });

  return (
    <section
      style={{ "margin-top": "var(--space-12)" }}
      aria-label="Cinema DNA insight"
    >
      <GlassSectionHeader
        eyebrow="Insight"
        title="Cinema DNA"
        accent="bar"
        variant="compact"
      />
      <GlassSurface
        variant="strong"

        padding="comfortable"
        radius="lg"
      >
        <div class="cinema-dna-content">
          <div class="cinema-dna-icon-wrap" aria-hidden="true">
            <span class="material-symbols-outlined cinema-dna-icon" aria-hidden="true">
              {archetype().icon}
            </span>
          </div>
          <p class="cinema-dna-archetype">{archetype().name}</p>
          <p class="cinema-dna-insight">{insight()}</p>
          <GlassButton
            variant="primary"
            size="default"
            icon="explore"
            onClick={() => navigate("/profile/stats")}
          >
            Explore Your Taste
          </GlassButton>
        </div>
      </GlassSurface>
    </section>
  );
};

export default CinemaDna;
