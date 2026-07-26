// src/features/discover/components/Spotlight.tsx
import { Show, For, createSignal, createMemo, Component } from "solid-js";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { formatRating } from "~/core/preferences";
import { Button } from "~/shared/ui/primitives";
import { findInVault } from "~/shared/utils/vaultMatch";
import type { SpotlightPick, WatchlistItem } from "~/shared/types";

interface SpotlightProps {
  pick: () => SpotlightPick | null | undefined;
  loading: boolean;
  isGuest: boolean;
  vault: WatchlistItem[];
  onDetails: (title: SpotlightPick["title"]) => void;
  onAddToVault: (title: SpotlightPick["title"]) => void;
  onReroll: () => void;
}

/**
 * Spotlight — the signature fold of Discover V2.
 *
 * One title. Hand-picked from the user's taste graph. Full-bleed
 * cinematic. Three actions:
 *   - Details (primary) — opens the Details modal
 *   - Add to Vault (primary, secondary emphasis) — one-tap save
 *   - Not in the mood (ghost) — re-rolls the Spotlight
 *
 * Premium Phase 4 upgrade:
 *   - Larger hero (560px mobile / 640px desktop)
 *   - Deeper layered gradients (5 layers including gold + cool accents)
 *   - Bigger Bebas Neue title (3rem mobile / 4rem desktop)
 *   - Premium glass metadata pills with backdrop blur + gold tint
 *   - Overview excerpt (1-line clamp) below the meta pills
 *   - Genre pills row (when available)
 *   - Premium CTA layout with frosted "Add to Vault" + gold "Details"
 *   - Premium "Not in the mood" frosted glass pill
 *
 * Visual language inherited from the Details page CinematicHero + the
 * Dashboard DashboardHero: full-bleed backdrop, multi-layer gradient
 * overlay, Bebas Neue display title, v2-pill quick meta, btn-primary
 * + btn-ghost actions. The "Because you…" reason sits in the eyebrow
 * position — it's the first thing the user reads.
 *
 * Re-roll animation: backdrop crossfades, title slides up. The motion
 * says "we thought about this, here's the next one" — never a slot-
 * machine spin.
 */
const Spotlight: Component<SpotlightProps> = (props) => {
  const [backdropLoaded, setBackdropLoaded] = createSignal(false);
  const [rerollFade, setRerollFade] = createSignal(false);

  // Reset backdrop load state when the pick id changes (re-roll)
  let lastId: number | null = null;
  const pick = createMemo(() => {
    const p = props.pick();
    if (p && p.title.id !== lastId) {
      lastId = p.title.id;
      setBackdropLoaded(false);
      setRerollFade(true);
      // Brief fade-in for the re-roll motion
      setTimeout(() => setRerollFade(false), 50);
    }
    return p;
  });

  const backdropUrl = () => {
    const p = pick();
    if (!p) return "";
    const path = p.title.backdrop_path || p.title.poster_path;
    return path ? tmdbImage(path, "w1280") : "";
  };

  const title = () => pick()?.title.title || pick()?.title.name || "Untitled";
  const year = () =>
    (pick()?.title.release_date || pick()?.title.first_air_date || "").split("-")[0] || "";
  const mediaLabel = () => (pick()?.title.media_type === "tv" ? "Series" : "Movie");
  const imdb = () =>
    pick()?.title.vote_average ? pick()!.title.vote_average!.toFixed(1) : null;
  const overview = () => pick()?.title.overview ?? "";
  const genres = () => pick()?.title.genres ?? [];
  const director = () => pick()?.title.director ?? "";

  // Vault relationship — is this title already in the vault?
  // Uses findInVault (matches on id AND media_type) to avoid TMDB namespace
  // collisions (movie/1398 vs tv/1398 are different titles).
  const vaultItem = createMemo(() => {
    const p = pick();
    return p ? findInVault(props.vault, p.title) : null;
  });
  const inVault = () => !!vaultItem();
  const vaultStatusLabel = () => {
    const s = vaultItem()?.status;
    if (s === "Watching") return "Watching";
    if (s === "Completed") return "Completed";
    if (s === "Planned" || s === "Plan to Watch") return "Planned";
    return null;
  };

  // Empty / loading / error states
  return (
    <section
      class={`spotlight animate-fade-in${rerollFade() ? " spotlight-rerolling" : ""}`}
      role="region"
      aria-label="Spotlight — one title picked for you"
      aria-busy={props.loading}
    >
      {/* Backdrop */}
      <Show when={backdropUrl()} fallback={<div class="spotlight-backdrop-fallback" aria-hidden="true" />}>
        <img
          onError={(e) => { e.currentTarget.style.display = "none"; }}
          src={backdropUrl()}
          class={`spotlight-backdrop${backdropLoaded() ? " img-loaded" : ""}`}
          loading="eager"
          decoding="async"
          {...({ fetchpriority: "high" } as Record<string, string>)}
          onLoad={() => setBackdropLoaded(true)}
          alt=""
          aria-hidden="true"
        />
      </Show>

      {/* Multi-layer gradient overlay (5 layers — see CSS for details) */}
      <div class="spotlight-overlay" aria-hidden="true" />

      {/* Top-left badge — the fold identity */}
      <div class="spotlight-badge" aria-label="Spotlight">
        <span class="material-symbols-outlined" aria-hidden="true">
          auto_awesome
        </span>
        Spotlight
      </div>

      {/* Content cluster */}
      <div class="spotlight-content">
        <Show when={pick()} fallback={
          <Show when={props.loading} fallback={
            <div class="spotlight-empty">
              <p class="type-body-soft" style={{ "text-align": "center", "max-width": "280px" }}>
                We couldn't pick a Spotlight right now. Try again in a moment.
              </p>
              <Button variant="ghost" size="md" icon="refresh" onClick={props.onReroll}>
                Try Again
              </Button>
            </div>
          }>
            <div class="spotlight-skeleton" aria-hidden="true">
              <div class="spotlight-skeleton-reason" />
              <div class="spotlight-skeleton-title" />
              <div class="spotlight-skeleton-meta" />
              <div class="spotlight-skeleton-actions" />
            </div>
          </Show>
        }>
          {/* "Because you…" — the reason sentence. First thing the user reads. */}
          <p class="spotlight-reason">{pick()!.reason}</p>

          {/* Title */}
          <h2 class="spotlight-title">{title()}</h2>

          {/* Quick meta pills — year, type, IMDb, vault status */}
          <div class="spotlight-meta">
            <Show when={year()}>
              <span class="v2-pill">{year()}</span>
            </Show>
            <span class="v2-pill">{mediaLabel()}</span>
            <Show when={imdb()}>
              <span class="v2-pill" data-rating-display="true">
                <span class="material-symbols-outlined" style={{ "font-size": "10px", "font-variation-settings": "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 20" }} aria-hidden="true">star</span>
                {formatRating(pick()?.title.vote_average)}
              </span>
            </Show>
            <Show when={director()}>
              <span class="v2-pill">
                <span class="material-symbols-outlined" style={{ "font-size": "10px", "font-variation-settings": "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 20" }} aria-hidden="true">person</span>
                {director()}
              </span>
            </Show>
            <Show when={vaultStatusLabel()}>
              <span class="v2-pill v2-pill-accent">{vaultStatusLabel()}</span>
            </Show>
          </div>

          {/* Genre pills (when available) */}
          <Show when={genres().length > 0}>
            <div class="spotlight-genres">
              <For each={genres().slice(0, 3)}>
                {(genre) => (
                  <span class="spotlight-genre-pill">{genre}</span>
                )}
              </For>
            </div>
          </Show>

          {/* Overview excerpt — 2-line clamp for cinematic feel */}
          <Show when={overview()}>
            <p class="spotlight-overview">{overview()}</p>
          </Show>

          {/* Actions — Details + Add to Vault are primary; Not in the mood is secondary */}
          <div class="spotlight-actions">
            <Button
              variant="primary"
              size="md"
              icon="info"
              onClick={() => pick() && props.onDetails(pick()!.title)}
              aria-label={`View details for ${title()}`}
            >
              Details
            </Button>

            <Show
              when={!inVault()}
              fallback={
                <Button
                  variant="ghost"
                  size="md"
                  icon="check"
                  iconFill
                  disabled
                  aria-label={`${title()} is already in your vault`}
                >
                  In Vault
                </Button>
              }
            >
              <Button
                variant="primary"
                size="md"
                icon="add"
                onClick={() => pick() && props.onAddToVault(pick()!.title)}
                aria-label={`Add ${title()} to your vault`}
                style={{
                  /* Slightly de-emphasized vs. Details so Details stays primary CTA,
                     but still clearly a primary action (not ghost).
                     IMPORTANT: this button sits on the Spotlight's dark cinematic
                     backdrop (brightness(0.62) + dark gradient overlay) in BOTH
                     themes — so we use fixed light values, NOT var(--text-strong),
                     which would become dark ink in light mode and disappear. */
                  background: "rgba(255,255,255,0.12)",
                  color: "#FFFFFF",
                  "box-shadow": "0 0 0 1px rgba(255,255,255,0.22), 0 2px 8px rgba(0,0,0,0.4)",
                  "backdrop-filter": "blur(12px)"
                }}
              >
                Add to Vault
              </Button>
            </Show>

            {/* Not in the mood — re-rolls the Spotlight, secondary placement */}
            <button
              type="button"
              class="spotlight-reroll focus-ring"
              onClick={props.onReroll}
              aria-label="Not in the mood — show me a different Spotlight"
            >
              <span class="material-symbols-outlined" aria-hidden="true">
                shuffle
              </span>
              <span class="spotlight-reroll-label">Not in the mood</span>
            </button>
          </div>
        </Show>
      </div>
    </section>
  );
};

export default Spotlight;
