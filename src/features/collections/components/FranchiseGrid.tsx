// src/features/collections/components/FranchiseGrid.tsx
import { For, Show, createSignal, createMemo } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { useVault } from "~/features/watchlist/useVault";
import { useCollections } from "../hooks/useCollections";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { FRANCHISE_HIERARCHY } from "~/shared/data/franchises";
import ProgressRing from "./ProgressRing";
import type { Franchise } from "~/shared/types";

/**
 * FranchiseGrid — the Franchise → Universe hierarchy display.
 *
 * Shows expandable franchise groups, each containing its child universes.
 * Replaces the flat "All Universes" grid with a richer, structured view.
 */
export default function FranchiseGrid() {
  const navigate = useNavigate();
  const { watchlist } = useVault();
  const { curatedCollections, getCollectionProgress, addUniverseToPrefs } = useCollections();

  const [expandedFranchise, setExpandedFranchise] = createSignal<string | null>(null);

  const toggleFranchise = (id: string) => {
    setExpandedFranchise((prev) => prev === id ? null : id);
  };

  /** Find the curated collection for a universe reference */
  const findCollection = (collectionId?: string) => {
    if (!collectionId) return null;
    return curatedCollections().find((c) => c.id === collectionId) ?? null;
  };

  /** Compute overall franchise progress across all its curated universes */
  const franchiseProgress = (franchise: Franchise) => {
    let totalOwned = 0;
    let totalEntries = 0;
    for (const uni of franchise.universes) {
      const col = findCollection(uni.collectionId);
      if (col) {
        const p = getCollectionProgress(col, watchlist());
        totalOwned += p.owned;
        totalEntries += p.total;
      }
    }
    const pct = totalEntries > 0 ? Math.round((totalOwned / totalEntries) * 100) : 0;
    return { owned: totalOwned, total: totalEntries, pct };
  };

  return (
    <div class="franchise-grid">
      <For each={FRANCHISE_HIERARCHY}>
        {(franchise) => {
          const isExpanded = createMemo(() => expandedFranchise() === franchise.id);
          const progress = createMemo(() => franchiseProgress(franchise));

          return (
            <div class="franchise-card">
              {/* Franchise header — clickable to expand */}
              <button
                type="button"
                class="franchise-card-header"
                onClick={() => toggleFranchise(franchise.id)}
                aria-expanded={isExpanded()}
                aria-label={`${franchise.name} — ${progress().total} titles`}
              >
                <div class="franchise-card-left">
                  <Show when={franchise.backdrop_path}>
                    <img
                      onError={(e) => { e.currentTarget.style.display = "none"; }}
                      src={tmdbImage(franchise.backdrop_path, "w342")}
                      class="franchise-card-thumb"
                      loading="lazy"
                      decoding="async"
                      alt=""
                      aria-hidden="true"
                    />
                  </Show>
                  <div class="franchise-card-info">
                    <p class="franchise-card-name">{franchise.name}</p>
                    <p class="franchise-card-meta">
                      {franchise.universes.length} universe{franchise.universes.length !== 1 ? "s" : ""}
                      <Show when={progress().total > 0}>
                        <span> · {progress().pct}% complete</span>
                      </Show>
                    </p>
                  </div>
                </div>
                <div class="franchise-card-right">
                  <Show when={progress().total > 0}>
                    <ProgressRing pct={progress().pct} size="sm" />
                  </Show>
                  <span
                    class="material-symbols-outlined franchise-card-chevron"
                    style={{
                      "font-size": "20px",
                      transition: "transform var(--dur-base) var(--ease-smooth)",
                      transform: isExpanded() ? "rotate(180deg)" : "rotate(0deg)",
                      color: "var(--text-soft)"
                    }}
                    aria-hidden="true"
                  >
                    expand_more
                  </span>
                </div>
              </button>

              {/* Expanded universes */}
              <Show when={isExpanded()}>
                <div class="franchise-universe-list animate-fade-in">
                  <For each={franchise.universes}>
                    {(uni) => {
                      const col = createMemo(() => findCollection(uni.collectionId));
                      const uniProgress = createMemo(() =>
                        col() ? getCollectionProgress(col()!, watchlist()) : { owned: 0, total: 0, pct: 0, missing: 0 }
                      );
                      const hasCollection = createMemo(() => col() !== null);

                      return (
                        <div class="franchise-universe-row">
                          <Show when={hasCollection()} fallback={
                            <button
                              type="button"
                              class="franchise-universe-chip franchise-universe-suggested"
                              onClick={() => addUniverseToPrefs(uni.id)}
                              aria-label={`Add ${uni.name} to your universes`}
                            >
                              <span class="material-symbols-outlined" style={{"font-size":"16px","color":"var(--p)"}} aria-hidden="true">add</span>
                              <span>{uni.name}</span>
                            </button>
                          }>
                            <button
                              type="button"
                              class="franchise-universe-chip"
                              onClick={() => navigate(`/collections/${col()!.id}`)}
                              aria-label={`Open ${uni.name}`}
                            >
                              <ProgressRing pct={uniProgress().pct} size="sm" />
                              <div class="franchise-universe-chip-info">
                                <span class="franchise-universe-chip-name">{uni.name}</span>
                                <span class="franchise-universe-chip-meta">
                                  {uniProgress().total} titles
                                  <Show when={uniProgress().owned > 0}>
                                    <span> · {uniProgress().pct}%</span>
                                  </Show>
                                </span>
                              </div>
                            </button>
                          </Show>
                        </div>
                      );
                    }}
                  </For>
                </div>
              </Show>
            </div>
          );
        }}
      </For>
    </div>
  );
}
