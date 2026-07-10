// src/features/details/components/MetadataGrid.tsx
import { For, Show, createMemo } from "solid-js";
import { formatRuntime } from "~/shared/utils/format";
import type { WatchlistItem, TMDBDetails, OMDbRatings } from "~/shared/types";

interface MetadataGridProps {
  /** TMDB identity — always present */
  baseItem: WatchlistItem | null;
  details: TMDBDetails | null;
  omdb: OMDbRatings | null;
  /**
   * User-owned vault item — null when the title is NOT in the vault.
   * The "Your Status" cell only renders when this is present.
   */
  vaultItem?: WatchlistItem | null;
}

interface MetaCell {
  label: string;
  value: string;
}

/**
 * MetadataGrid — responsive grid of metadata cells.
 *
 * Shows only fields that exist — missing data is hidden gracefully.
 * Grid: 2 columns on mobile, 3 columns on sm+.
 *
 * OWNERSHIP BOUNDARY:
 *   The "Your Status" cell is user-owned — it only renders when
 *   `vaultItem` is present. All other cells are TMDB-sourced and
 *   always allowed.
 *
 * Data sources:
 *  - Year (from release_date / first_air_date)
 *  - Runtime (from details.runtime or episode_run_time)
 *  - Type (Movie / Series)
 *  - Status (Released / Ended / Returning Series — from TMDB)
 *  - Seasons (TV only — from number_of_seasons)
 *  - Episodes (TV only — from number_of_episodes)
 *  - Certification (from OMDb rated)
 *  - Language (from spoken_languages)
 *  - Country (from origin_country / production_countries)
 *  - Network (TV only — from networks)
 *  - Studio (Movie — from production_companies)
 *  - TMDB Score (from vote_average)
 *  - Your Status (from vaultItem — user-owned, vault-only)
 */
export default function MetadataGrid(props: MetadataGridProps) {
  const cells = createMemo<MetaCell[]>(() => {
    const d = props.details;
    const b = props.baseItem;
    const o = props.omdb;
    const _v = props.vaultItem;
    const list: MetaCell[] = [];

    // Year
    const year = (d?.release_date || d?.first_air_date || b?.release_date || b?.first_air_date || "").split("-")[0];
    if (year) list.push({ label: "Year", value: year });

    // Type
    const isTv = b?.media_type === "tv" || d?.media_type === "tv";
    list.push({ label: "Type", value: isTv ? "Series" : "Movie" });

    // Runtime
    const runtime = d?.runtime || d?.episode_run_time?.[0] || b?.runtime;
    if (runtime && runtime > 0) {
      list.push({ label: "Runtime", value: formatRuntime(runtime) || `${runtime}m` });
    }

    // Status (TMDB)
    if (d?.status) {
      list.push({ label: "Status", value: d.status });
    }

    // TV-specific
    if (isTv) {
      if (d?.number_of_seasons) {
        list.push({ label: "Seasons", value: String(d.number_of_seasons) });
      }
      if (d?.number_of_episodes) {
        list.push({ label: "Episodes", value: String(d.number_of_episodes) });
      }
      if (d?.networks && d.networks.length > 0) {
        list.push({ label: "Network", value: d.networks.map((n) => n.name).join(", ") });
      }
    }

    // Movie-specific
    if (!isTv && d?.production_companies && d.production_companies.length > 0) {
      list.push({ label: "Studio", value: d.production_companies.slice(0, 2).map((p) => p.name).join(", ") });
    }

    // Certification (OMDb)
    if (o?.rated && o.rated !== "N/A") {
      list.push({ label: "Rated", value: o.rated });
    }

    // Language
    if (d?.spoken_languages && d.spoken_languages.length > 0) {
      const langs = d.spoken_languages.map((l) => l.english_name).filter(Boolean);
      if (langs.length > 0) {
        list.push({ label: "Language", value: langs.slice(0, 2).join(", ") });
      }
    }

    // Country
    const countries = d?.origin_country || d?.production_countries?.map((c) => c.iso_3166_1);
    if (countries && countries.length > 0) {
      list.push({ label: "Country", value: countries.slice(0, 2).join(", ") });
    }

    // TMDB Score
    if (d?.vote_average && d.vote_average > 0) {
      list.push({ label: "TMDB Score", value: d.vote_average.toFixed(1) });
    }

    // NOTE: "Your Status" used to live here but has been moved to the
    // YourActivityCard — the dedicated user-owned section above the
    // MetadataGrid. This keeps TMDB metadata (this grid) cleanly
    // separated from user-owned data (the activity card).

    return list;
  });

  return (
    <Show when={cells().length > 0}>
      <div class="metadata-grid">
        <For each={cells()}>
          {(cell) => (
            <div class="metadata-cell">
              <span class="metadata-cell-label">{cell.label}</span>
              <span class="metadata-cell-value">{cell.value}</span>
            </div>
          )}
        </For>
      </div>
    </Show>
  );
}
