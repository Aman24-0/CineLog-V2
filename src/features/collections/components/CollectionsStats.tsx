// src/features/collections/components/CollectionsStats.tsx
import { For, Show, createMemo, type Accessor, ParentComponent } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { findInVault } from "~/shared/utils/vaultMatch";
import type { Collection, CollectionEntry, WatchlistItem } from "~/shared/types";

/**
 * CollectionsStats — progress-based rails above the folder grid.
 *
 * Two sections, both optional (rendered only when they have content):
 *   1. Pinned Universes — quick-access chips for curated collections the
 *      user has pinned (managed via universePreferencesAdapter).
 *   2. Continue Your Universe — curated collections the user has started
 *      but not completed, sorted by completion percentage (desc).
 *
 * REACTIVITY NOTE:
 *   Each rail item is rendered by a dedicated child component
 *   (PinnedUniverseCard / ContinueUniverseCard) instead of an inline
 *   `<For>` callback with `createMemo` inside. The inline-memo pattern
 *   is a known SolidJS anti-pattern that can trigger
 *   "Cannot read properties of null (reading 'firstChild')" during
 *   hydration when the memoized value is accessed before the
 *   component's reactive scope is established. Extracting the card
 *   into its own component gives each item a stable reactive owner.
 */
export interface CollectionsStatsProps {
  curatedCollections: Accessor<Collection[]>;
  pinnedUniverses: Accessor<Collection[]>;
  watchlist: Accessor<WatchlistItem[]>;
  getCollectionProgress: (
    col: Collection,
    vault: WatchlistItem[],
  ) => { owned: number; total: number; pct: number };
}

/** Single pinned-universe chip — extracted to give each item its own reactive owner. */
const PinnedUniverseCard: ParentComponent<{
  col: Collection;
  watchlist: Accessor<WatchlistItem[]>;
  getProgress: CollectionsStatsProps["getCollectionProgress"];
  onNavigate: (id: string) => void;
}> = (props) => {
  const progress = createMemo(() =>
    props.getProgress(props.col, props.watchlist()),
  );
  return (
    <button
      type="button"
      class="universe-pinned-card"
      role="listitem"
      onClick={() => props.onNavigate(props.col.id)}
      aria-label={`Open ${props.col.name}`}
    >
      <Show when={props.col.backdrop_path}>
        <img
          onError={(e) => { e.currentTarget.style.display = "none"; }}
          src={tmdbImage(props.col.backdrop_path, "w92")}
          style={{
            width: "32px",
            height: "20px",
            "object-fit": "cover",
            "border-radius": "4px",
          }}
          loading="lazy"
          decoding="async"
          alt=""
          aria-hidden="true"
        />
      </Show>
      <span class="universe-pinned-name">{props.col.name}</span>
      <span
        style={{
          "font-size": "0.4375rem",
          color: "var(--text-muted)",
          "font-family": "'Azeret Mono', monospace",
        }}
      >
        {progress().pct}%
      </span>
    </button>
  );
};

/** Single continue-universe card — extracted for the same reason as above. */
const ContinueUniverseCard: ParentComponent<{
  col: Collection;
  pct: number;
  watchlist: Accessor<WatchlistItem[]>;
  onNavigate: (id: string) => void;
}> = (props) => {
  const titleOf = (e: CollectionEntry) => e.title || e.name || "Untitled";

  const next = createMemo((): CollectionEntry | null => {
    return (
      (props.col.entries ?? []).find(
        (e) => !findInVault(props.watchlist(), { id: e.id, media_type: e.media_type }),
      ) ?? null
    );
  });

  return (
    <button
      type="button"
      class="universe-continue-card"
      role="listitem"
      onClick={() => props.onNavigate(props.col.id)}
      aria-label={`Continue ${props.col.name} — ${props.pct}% complete`}
      style={{ "scroll-snap-align": "start" }}
    >
      <div class="universe-continue-poster">
        <Show when={props.col.backdrop_path}>
          <img
            onError={(e) => { e.currentTarget.style.display = "none"; }}
            src={tmdbImage(props.col.backdrop_path, "w500")}
            class="universe-continue-img"
            loading="lazy"
            decoding="async"
            alt=""
            aria-hidden="true"
          />
        </Show>
        <div class="universe-continue-overlay" aria-hidden="true" />
        <div
          class="universe-continue-ring"
          style={{ "--progress": `${props.pct}%` }}
        >
          <span class="universe-continue-ring-pct">{props.pct}%</span>
        </div>
      </div>
      <div class="universe-continue-info">
        <p class="universe-continue-name">{props.col.name}</p>
        <Show when={next()}>
          <p class="universe-continue-next">Next: {titleOf(next()!)}</p>
        </Show>
      </div>
    </button>
  );
};

export default function CollectionsStats(props: CollectionsStatsProps) {
  const navigate = useNavigate();

  // Continue Your Universe — curated collections the user has started but not completed
  const inProgressUniverses = createMemo(() => {
    return props
      .curatedCollections()
      .map((col) => ({ col, progress: props.getCollectionProgress(col, props.watchlist()) }))
      .filter(({ progress }) => progress.owned > 0 && progress.pct < 100)
      .sort((a, b) => b.progress.pct - a.progress.pct);
  });

  const goToCollection = (id: string) => navigate(`/collections/${id}`);

  return (
    <>
      {/* === PINNED UNIVERSES === */}
      <Show when={props.pinnedUniverses().length > 0}>
        <section class="collections-fold">
          <div class="collections-fold-label">
            <span
              class="material-symbols-outlined"
              style={{"font-size":"12px","color":"var(--p)"}}
              aria-hidden="true"
            >
              push_pin
            </span>
            Pinned
          </div>
          <div class="universe-pinned-rail hide-scrollbar" role="list">
            <For each={props.pinnedUniverses()}>
              {(col) => (
                <PinnedUniverseCard
                  col={col}
                  watchlist={props.watchlist}
                  getProgress={props.getCollectionProgress}
                  onNavigate={goToCollection}
                />
              )}
            </For>
          </div>
        </section>
      </Show>

      {/* === CONTINUE YOUR UNIVERSE === */}
      <Show when={inProgressUniverses().length > 0}>
        <section class="collections-fold">
          <div class="collections-fold-label">
            <span
              class="material-symbols-outlined"
              style={{"font-size":"12px","color":"var(--p)"}}
              aria-hidden="true"
            >
              play_circle
            </span>
            Continue Your Universe
          </div>
          <div class="universe-continue-rail hide-scrollbar" role="list">
            <For each={inProgressUniverses().slice(0, 6)}>
              {({ col, progress }) => (
                <ContinueUniverseCard
                  col={col}
                  pct={progress.pct}
                  watchlist={props.watchlist}
                  onNavigate={goToCollection}
                />
              )}
            </For>
          </div>
        </section>
      </Show>
    </>
  );
}
