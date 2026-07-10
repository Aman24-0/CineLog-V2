// src/features/collections/components/CollectionsHeader.tsx
import { Show, createMemo, type Accessor } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { tmdbImage } from "~/core/tmdb/tmdb";
import type { Collection } from "~/shared/types";

/**
 * CollectionsHeader — page eyebrow + Featured Universe hero.
 *
 * The featured universe rotates daily (one curated collection per day).
 * The hero shows the backdrop, name, description, progress ring, and
 * an "Enter Universe" CTA.
 */
export interface CollectionsHeaderProps {
  curatedCollections: Accessor<Collection[]>;
  watchlist: Accessor<import("~/shared/types").WatchlistItem[]>;
  getCollectionProgress: (
    col: Collection,
    vault: import("~/shared/types").WatchlistItem[],
  ) => { owned: number; total: number; pct: number };
}

export default function CollectionsHeader(props: CollectionsHeaderProps) {
  const navigate = useNavigate();

  const featured = createMemo(() => {
    const curated = props.curatedCollections();
    if (curated.length === 0) return null;
    const dayOfYear = Math.floor(Date.now() / 86400000);
    return curated[dayOfYear % curated.length];
  });

  const featuredProgress = createMemo(() => {
    const f = featured();
    return f ? props.getCollectionProgress(f, props.watchlist()) : { owned: 0, total: 0, pct: 0 };
  });

  const featuredBackdrop = createMemo(() => {
    const f = featured();
    return f?.backdrop_path ? tmdbImage(f.backdrop_path, "w1280") : "";
  });

  return (
    <>
      {/* Page eyebrow */}
      <div class="collections-eyebrow-block">
        <p class="collections-eyebrow">Collections</p>
        <h1 class="collections-page-title">Cinematic Universes</h1>
        <p class="collections-page-subtitle">
          Explore interconnected sagas, curated timelines, and your personal collections.
        </p>
      </div>

      {/* === FEATURED UNIVERSE HERO === */}
      <Show when={featured()}>
        <section
          class="universe-hero animate-fade-in"
          role="region"
          aria-label={`Featured universe: ${featured()!.name}`}
        >
          <Show when={featuredBackdrop()}>
            <img
              onError={(e) => { e.currentTarget.style.display = "none"; }}
              src={featuredBackdrop()}
              class="universe-hero-backdrop"
              loading="eager"
              decoding="async"
              {...({ fetchpriority: "high" } as Record<string, string>)}
              alt=""
              aria-hidden="true"
            />
          </Show>
          <div class="universe-hero-overlay" aria-hidden="true" />

          <div class="universe-hero-badge" aria-label="Featured Universe">
            <span
              class="material-symbols-outlined"
              style={{ "font-size": "12px", color: "var(--p)" }}
              aria-hidden="true"
            >
              auto_awesome
            </span>
            Featured Universe
          </div>

          <div class="universe-hero-content">
            <h2 class="universe-hero-title">{featured()!.name}</h2>
            <Show when={featured()!.description}>
              <p class="universe-hero-description">{featured()!.description}</p>
            </Show>

            <div class="universe-hero-footer">
              <div class="universe-hero-progress">
                <div
                  class="universe-hero-ring"
                  style={{ "--progress": `${featuredProgress().pct}%` }}
                >
                  <span class="universe-hero-ring-pct">{featuredProgress().pct}%</span>
                </div>
                <div class="universe-hero-progress-text">
                  <span class="universe-hero-progress-owned">
                    {featuredProgress().owned} of {featuredProgress().total}
                  </span>
                  <span class="universe-hero-progress-label">in your vault</span>
                </div>
              </div>
              <button
                type="button"
                class="btn-primary"
                onClick={() => navigate(`/collections/${featured()!.id}`)}
                aria-label={`Enter ${featured()!.name}`}
              >
                <span
                  class="material-symbols-outlined"
                  style={{"font-size":"16px"}}
                  aria-hidden="true"
                >
                  arrow_forward
                </span>
                Enter Universe
              </button>
            </div>
          </div>
        </section>
      </Show>
    </>
  );
}
