// src/features/discover/components/TrajectoryCard.tsx
import { For, Show, createSignal, Component } from "solid-js";
import { tmdbImage } from "~/core/tmdb/tmdb";
import type { Trajectory, TMDBTitle, WatchlistItem } from "~/shared/types";
import RelationshipPill from "./RelationshipPill";

interface TrajectoryCardProps {
  trajectory: Trajectory;
  vault: WatchlistItem[];
  onOpenTitle: (title: TMDBTitle) => void;
  onAddToVault: (title: TMDBTitle) => void;
}

/**
 * TrajectoryCard — an intent-based cluster in Fold 1.
 *
 * Layout (collapsed):
 *   [intent sentence + subtitle]
 *   [hero poster — large, 2:3]   [3 supporting posters — smaller, stacked]
 *
 * Layout (expanded, on tap):
 *   [intent sentence + subtitle]
 *   [hero poster]   [3 supporting]   [3 more from `expanded`]
 *
 * The card expands INLINE — it never navigates away. This keeps the
 * user in the Discover mindset: they're browsing, not committing.
 *
 * Tapping any poster opens the Details modal (onOpenTitle). Tapping
 * the card body (not a poster) toggles expand/collapse.
 *
 * The intent sentence is the hook — it's why the user cares. The
 * subtitle adds count context ("3 hidden picks").
 */
const TrajectoryCard: Component<TrajectoryCardProps> = (props) => {
  const [expanded, setExpanded] = createSignal(false);

  const allTitles = () => {
    const t = props.trajectory;
    const list = [t.hero, ...t.supporting];
    if (expanded() && t.expanded) list.push(...t.expanded);
    return list;
  };

  const heroTitle = () => props.trajectory.hero.title || props.trajectory.hero.name || "Untitled";
  const heroYear = () =>
    (props.trajectory.hero.release_date || props.trajectory.hero.first_air_date || "").split("-")[0] || "";
  const heroImdb = () =>
    props.trajectory.hero.vote_average ? props.trajectory.hero.vote_average.toFixed(1) : null;

  const supportingTitle = (t: TMDBTitle) => t.title || t.name || "Untitled";
  const supportingYear = (t: TMDBTitle) =>
    (t.release_date || t.first_air_date || "").split("-")[0] || "";
  const supportingImdb = (t: TMDBTitle) =>
    t.vote_average ? t.vote_average.toFixed(1) : null;

  return (
    <article class="trajectory-card animate-fade-up" aria-label={props.trajectory.intent}>
      {/* Header — intent + subtitle + expand toggle */}
      <header class="trajectory-header">
        <div class="trajectory-header-text">
          <p class="trajectory-intent">
            <span class="material-symbols-outlined trajectory-icon" aria-hidden="true">
              {props.trajectory.icon}
            </span>
            {props.trajectory.intent}
          </p>
          <p class="trajectory-subtitle">{props.trajectory.subtitle}</p>
        </div>
      </header>

      {/* Hero + supporting grid */}
      <div class="trajectory-body">
        {/* Hero — large poster with title/meta */}
        <button
          type="button"
          class="trajectory-hero"
          onClick={() => props.onOpenTitle(props.trajectory.hero)}
          aria-label={`${heroTitle()}${heroYear() ? `, ${heroYear()}` : ""} — open details`}
        >
          <Show
            when={props.trajectory.hero.poster_path || props.trajectory.hero.backdrop_path}
            fallback={<div class="trajectory-hero-fallback" aria-hidden="true"><span class="material-symbols-outlined" style="font-size: 32px; color: var(--text-dim)">movie</span></div>}
          >
            <img
              src={tmdbImage(props.trajectory.hero.poster_path || props.trajectory.hero.backdrop_path, "w342")}
              class="trajectory-hero-img"
              loading="lazy"
              decoding="async"
              alt=""
              aria-hidden="true"
            />
          </Show>

          <div class="trajectory-hero-info">
            <p class="trajectory-hero-title">{heroTitle()}</p>
            <div class="trajectory-hero-meta">
              <Show when={heroYear()}><span>{heroYear()}</span></Show>
              <Show when={heroImdb()}><span style="color: #f5c518">★ {heroImdb()}</span></Show>
            </div>
          </div>

          {/* Relationship pill — vault-aware */}
          <RelationshipPill item={props.trajectory.hero} vault={props.vault} />
        </button>

        {/* Supporting — 3 small posters */}
        <div class="trajectory-supporting" role="list">
          <For each={props.trajectory.supporting}>
            {(t) => (
              <button
                type="button"
                class="trajectory-supporting-item"
                role="listitem"
                onClick={() => props.onOpenTitle(t)}
                aria-label={`${supportingTitle(t)}${supportingYear(t) ? `, ${supportingYear(t)}` : ""} — open details`}
              >
                <Show
                  when={t.poster_path || t.backdrop_path}
                  fallback={<div class="trajectory-supporting-fallback" aria-hidden="true"><span class="material-symbols-outlined" style="font-size: 18px; color: var(--text-dim)">movie</span></div>}
                >
                  <img
                    src={tmdbImage(t.poster_path || t.backdrop_path, "w185")}
                    class="trajectory-supporting-img"
                    loading="lazy"
                    decoding="async"
                    alt=""
                    aria-hidden="true"
                  />
                </Show>
                <div class="trajectory-supporting-info">
                  <p class="trajectory-supporting-title">{supportingTitle(t)}</p>
                  <div class="trajectory-supporting-meta">
                    <Show when={supportingYear(t)}><span>{supportingYear(t)}</span></Show>
                    <Show when={supportingImdb(t)}><span style="color: #f5c518">★ {supportingImdb(t)}</span></Show>
                  </div>
                </div>
                <RelationshipPill item={t} vault={props.vault} compact />
              </button>
            )}
          </For>
        </div>
      </div>
    </article>
  );
};

export default TrajectoryCard;
