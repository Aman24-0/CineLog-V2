// src/features/discover/components/CosmosView.tsx
import { For, Show, createSignal, Component } from "solid-js";
import { tmdbImage } from "~/core/tmdb/tmdb";
import type { CosmosCluster, TMDBTitle, WatchlistItem } from "~/shared/types";
import RelationshipPill from "./RelationshipPill";

interface CosmosViewProps {
  clusters: () => CosmosCluster[] | undefined;
  loading: boolean;
  vault: WatchlistItem[];
  onOpenTitle: (title: TMDBTitle) => void;
}

/**
 * CosmosView — Fold 3 of Discover.
 *
 * The Cosmos is the only "browse" surface in Discover, and it's
 * intentionally reframed as "the wider universe around your taste"
 * rather than "TMDB categories". Each cluster is a themed ambient
 * node; tapping a cluster expands it inline into a focused rail.
 *
 * Visual language: each cluster is a glass card with a theme title,
 * a narrative hook, and a horizontal rail of posters. The cluster
 * cards are larger and more ambient than TrajectoryCards — they
 * invite exploration rather than decision.
 *
 * This is the experimental fold. If it doesn't feel right after
 * implementation, it can be refined or replaced without touching
 * the rest of Discover — it's fully modular.
 */
const CosmosView: Component<CosmosViewProps> = (props) => {
  const [expandedId, setExpandedId] = createSignal<string | null>(null);

  const titleOf = (t: TMDBTitle) => t.title || t.name || "Untitled";
  const yearOf = (t: TMDBTitle) =>
    (t.release_date || t.first_air_date || "").split("-")[0] || "";
  const imdbOf = (t: TMDBTitle) =>
    t.vote_average ? t.vote_average.toFixed(1) : null;

  return (
    <section class="cosmos-view" aria-label="The wider universe around your taste">
      {/* Section header — accent-bar pattern, but with a softer "eyebrow" treatment */}
      <div class="cosmos-header">
        <p class="cosmos-eyebrow">Explore further</p>
        <h2 class="cosmos-title">The wider universe</h2>
        <p class="cosmos-subtitle">
          Themed clusters from across cinema — tap any to expand.
        </p>
      </div>

      <Show when={!props.loading} fallback={<CosmosSkeleton />}>
        <Show when={(props.clusters()?.length ?? 0) > 0} fallback={
          <p class="type-body-soft" style={{ "text-align": "center", padding: "var(--sp-8)" }}>
            The cosmos is quiet right now. Try again in a moment.
          </p>
        }>
          <div class="cosmos-grid">
            <For each={props.clusters()}>
              {(cluster) => {
                const isExpanded = () => expandedId() === cluster.id;
                const visibleItems = () =>
                  isExpanded() ? cluster.items : cluster.items.slice(0, 6);

                return (
                  <article class={`cosmos-cluster${isExpanded() ? " cosmos-cluster-expanded" : ""}`}>
                    <button
                      type="button"
                      class="cosmos-cluster-header"
                      onClick={() => setExpandedId(isExpanded() ? null : cluster.id)}
                      aria-expanded={isExpanded()}
                      aria-label={`${isExpanded() ? "Collapse" : "Expand"} cluster: ${cluster.theme}`}
                    >
                      <span class="material-symbols-outlined cosmos-cluster-icon" aria-hidden="true">
                        {cluster.icon}
                      </span>
                      <div class="cosmos-cluster-text">
                        <p class="cosmos-cluster-theme">{cluster.theme}</p>
                        <p class="cosmos-cluster-hook">{cluster.hook}</p>
                      </div>
                      <span
                        class="material-symbols-outlined cosmos-cluster-chevron"
                        style={{ transform: isExpanded() ? "rotate(180deg)" : "none" }}
                        aria-hidden="true"
                      >
                        expand_more
                      </span>
                    </button>

                    <Show when={isExpanded()}>
                      <div class="cosmos-cluster-rail" role="list">
                        <For each={visibleItems()}>
                          {(t) => (
                            <button
                              type="button"
                              class="cosmos-card"
                              role="listitem"
                              onClick={() => props.onOpenTitle(t)}
                              aria-label={`${titleOf(t)}${yearOf(t) ? `, ${yearOf(t)}` : ""} — open details`}
                            >
                              <div class="cosmos-card-poster">
                                <Show
                                  when={t.poster_path || t.backdrop_path}
                                  fallback={
                                    <div class="cosmos-card-fallback" aria-hidden="true">
                                      <span class="material-symbols-outlined" style={{"font-size":"24px","color":"var(--text-dim)"}}>movie</span>
                                    </div>
                                  }
                                >
                                  <img
                                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                                    src={tmdbImage(t.poster_path || t.backdrop_path, "w342")}
                                    class="cosmos-card-img"
                                    loading="lazy"
                                    decoding="async"
                                    alt=""
                                    aria-hidden="true"
                                  />
                                </Show>
                                <div class="cosmos-card-pill">
                                  <RelationshipPill item={t} vault={props.vault} compact />
                                </div>
                              </div>
                              <div class="cosmos-card-info">
                                <p class="cosmos-card-title">{titleOf(t)}</p>
                                <p class="cosmos-card-meta">
                                  {yearOf(t) ? `${yearOf(t)} · ` : ""}
                                  {t.media_type === "tv" ? "Series" : "Movie"}
                                  <Show when={imdbOf(t)}>
                                    {" · "}<span style={{"color":"#f5c518"}}>★ {imdbOf(t)}</span>
                                  </Show>
                                </p>
                              </div>
                            </button>
                          )}
                        </For>
                      </div>
                    </Show>
                  </article>
                );
              }}
            </For>
          </div>
        </Show>
      </Show>
    </section>
  );
};

/** Loading skeleton for the Cosmos fold. */
const CosmosSkeleton: Component = () => (
  <div class="cosmos-skeleton" aria-hidden="true">
    <For each={[1, 2, 3]}>
      {() => (
        <div class="cosmos-skeleton-cluster">
          <div class="cosmos-skeleton-header" />
          <div class="cosmos-skeleton-rail">
            <For each={[1, 2, 3, 4, 5, 6]}>
              {() => <div class="cosmos-skeleton-card" />}
            </For>
          </div>
        </div>
      )}
    </For>
  </div>
);

export default CosmosView;
