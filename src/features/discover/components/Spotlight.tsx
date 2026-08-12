// src/features/discover/components/Spotlight.tsx
import { Show, For, createSignal, createMemo, Component } from "solid-js";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { formatRating } from "~/core/preferences";
import { Button } from "~/shared/ui/primitives";
import { findInVault } from "~/shared/utils/vaultMatch";
import SpotlightSkeleton from "./SpotlightSkeleton";
import type { SpotlightPick, WatchlistItem } from "~/shared/types";

interface SpotlightProps {
  pick: () => SpotlightPick | null;
  loading: boolean;
  /** Human-readable error string. When non-null AND no pick is available, the error UI shows. */
  error: () => string | null;
  isGuest: boolean;
  vault: WatchlistItem[];
  onDetails: (title: SpotlightPick["title"]) => void;
  onAddToVault: (title: SpotlightPick["title"]) => void;
  /** Shuffle — record the current pick as seen and fetch a new one. */
  onShuffle: () => void;
  /** Retry — re-run the fetcher after an error. */
  onRetry: () => void;
}

/**
 * Spotlight — the signature fold of Discover V2.
 *
 * One title. Hand-picked from the user's taste graph. Full-bleed
 * cinematic. Three actions:
 *   - Details (primary) — opens the Details modal
 *   - Add to Vault (primary, secondary emphasis) — one-tap save
 *   - Shuffle (ghost) — records the current pick as seen and
 *     fetches a new one. The skipped title won't reappear for 30 days.
 *
 * REFINEMENTS (Personalized-Discovery v3):
 *   • Loading state — renders `<SpotlightSkeleton />` (the SAME shell
 *     as a populated Spotlight with shimmering bars) instead of the
 *     old "Try Again" message. The skeleton renders on SSR + initial
 *     client paint, so the user never sees a flash of the error UI
 *     during the brief initial fetch.
 *   • Error state — only shows when the fetcher genuinely fails to
 *     find any eligible title (all candidates in vault or seen in the
 *     last 30 days). Includes a Retry button.
 *   • Daily rotation + 30-day no-repeat + shuffle — driven by the
 *     `useSpotlight` hook; this component is purely presentational.
 *
 * Visual language inherited from the Details page CinematicHero + the
 * Dashboard DashboardHero: full-bleed backdrop, multi-layer gradient
 * overlay, Bebas Neue display title, v2-pill quick meta, btn-primary
 * + btn-ghost actions.
 *
 * Shuffle animation: backdrop crossfades, title slides up. The motion
 * says "we thought about this, here's the next one" — never a slot-
 * machine spin.
 */
const Spotlight: Component<SpotlightProps> = (props) => {
  const [backdropLoaded, setBackdropLoaded] = createSignal(false);
  const [rerollFade, setRerollFade] = createSignal(false);

  // Reset backdrop load state when the pick id changes (shuffle)
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
    (pick()?.title.release_date || pick()?.title.first_air_date || "").split(
      "-"
    )[0] || "";
  const mediaLabel = () =>
    pick()?.title.media_type === "tv" ? "Series" : "Movie";
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

  // ── Render: skeleton → error → content ────────────────────────────
  //
  // Order of precedence:
  //   1. If we have a pick → render the populated Spotlight.
  //   2. Else if loading → render the skeleton (no error message).
  //   3. Else (no pick + not loading) → render the error/empty state
  //      with a Retry button. The error string comes from the hook;
  //      if it's null we fall back to a generic message.
  //
  // IMPORTANT: the skeleton is rendered as the FIRST fallback so that
  // the brief initial fetch (50-300ms typical) never shows the error
  // UI. The error UI only appears when the fetcher genuinely fails.

  const errorMessage = () =>
    props.error() ??
    "We couldn't pick a Spotlight right now. Try again in a moment.";

  return (
    <Show
      when={pick()}
      fallback={
        <Show
          when={props.loading}
          fallback={
            // Error / empty state — only shown when there's no pick AND
            // we're not loading. This is the genuine "no eligible title"
            // case, not the brief initial-load flash.
            <section
              class="spotlight"
              role="region"
              aria-label="Spotlight — unavailable"
            >
              <div class="spotlight-backdrop-fallback" aria-hidden="true" />
              <div class="spotlight-overlay" aria-hidden="true" />
              <div class="spotlight-badge">
                <span class="material-symbols-outlined" aria-hidden="true">
                  auto_awesome
                </span>
                Spotlight
              </div>
              <div class="spotlight-content">
                <div class="spotlight-empty">
                  <p
                    class="type-body-soft"
                    style={{ "text-align": "center", "max-width": "280px" }}
                  >
                    {errorMessage()}
                  </p>
                  <Button
                    variant="ghost"
                    size="md"
                    icon="refresh"
                    onClick={props.onRetry}
                  >
                    Try Again
                  </Button>
                </div>
              </div>
            </section>
          }
        >
          <SpotlightSkeleton />
        </Show>
      }
    >
      <section
        class={`spotlight animate-fade-in${rerollFade() ? " spotlight-rerolling" : ""}`}
        role="region"
        aria-label="Spotlight — one title picked for you"
        aria-busy={props.loading}
      >
        {/* Backdrop */}
        <Show
          when={backdropUrl()}
          fallback={
            <div class="spotlight-backdrop-fallback" aria-hidden="true" />
          }
        >
          <img
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
            src={backdropUrl()}
            class={`spotlight-backdrop${backdropLoaded() ? " img-loaded" : ""}`}
            loading="eager"
            decoding="async"
            {...({ fetchpriority: "high" } as Record<string, string>)}
            onLoad={() => setBackdropLoaded(true)}
            alt={`${title()} backdrop`}
          />
        </Show>

        {/* Multi-layer gradient overlay (5 layers — see CSS for details) */}
        <div class="spotlight-overlay" aria-hidden="true" />

        {/* Top-left badge — the fold identity */}
        <div class="spotlight-badge">
          <span class="material-symbols-outlined" aria-hidden="true">
            auto_awesome
          </span>
          Spotlight
        </div>

        {/* Content cluster */}
        <div class="spotlight-content">
          {/* Title — no attribution/reason text per the refined spec.
              The hero focuses purely on artwork + title + overview +
              rating + CTAs. */}
          <h2 class="spotlight-title">{title()}</h2>

          {/* Quick meta pills — two-line compact layout on mobile.
              Line 1: year • type • rating • vault status
              Line 2: genre pills (inline, same container)
              Desktop: same flex-wrap layout, all pills in one flow. */}
          <div class="spotlight-meta">
            <Show when={year()}>
              <span class="v2-pill">{year()}</span>
            </Show>
            <span class="v2-pill">{mediaLabel()}</span>
            <Show when={imdb()}>
              <span class="v2-pill" data-rating-display="true">
                <span
                  class="material-symbols-outlined"
                  style={{
                    "font-size": "10px",
                    "font-variation-settings":
                      "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 20"
                  }}
                  aria-hidden="true"
                >
                  star
                </span>
                {formatRating(pick()?.title.vote_average)}
              </span>
            </Show>
            <Show when={director()}>
              <span class="v2-pill">
                <span
                  class="material-symbols-outlined"
                  style={{
                    "font-size": "10px",
                    "font-variation-settings":
                      "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 20"
                  }}
                  aria-hidden="true"
                >
                  person
                </span>
                {director()}
              </span>
            </Show>
            <Show when={vaultStatusLabel()}>
              <span class="v2-pill v2-pill-accent">{vaultStatusLabel()}</span>
            </Show>
            {/* Genre pills inline — they wrap naturally on mobile,
                creating a second line of genres below the meta row */}
            <For each={genres().slice(0, 3)}>
              {(genre) => <span class="spotlight-genre-pill">{genre}</span>}
            </For>
          </div>

          {/* Overview excerpt — 2-3 readable lines on mobile, 2 on desktop */}
          <Show when={overview()}>
            <p class="spotlight-overview">{overview()}</p>
          </Show>

          {/* Actions — MOBILE RESTRUCTURE:
              Primary row: [Details] + [Add to Vault] side by side (flex-row).
              Secondary: [Shuffle] is a compact icon+text link below,
              NOT a giant third pill button. This keeps the backdrop artwork
              visible on mobile instead of covering it with 3 stacked buttons.
              Desktop keeps the original inline layout via the CSS media query. */}
          <div class="spotlight-actions">
            {/* Primary row — Details + Add to Vault side by side */}
            <div class="spotlight-actions-primary">
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
                    "box-shadow":
                      "0 0 0 1px rgba(255,255,255,0.22), 0 2px 8px rgba(0,0,0,0.4)",
                    "backdrop-filter": "blur(12px)"
                  }}
                >
                  Add to Vault
                </Button>
              </Show>
            </div>

            {/* Secondary — "Shuffle" as a compact icon+text link.
                On mobile this is a subtle text link below the primary row;
                on desktop it sits inline with the primary buttons (via CSS).
                Clicking it records the current pick as seen (30-day cooldown)
                and fetches a new one. */}
            <button
              type="button"
              class="spotlight-reroll focus-ring"
              onClick={() => props.onShuffle()}
              aria-label="Shuffle — show me a different Spotlight"
              disabled={props.loading}
            >
              <span class="material-symbols-outlined" aria-hidden="true">
                shuffle
              </span>
              <span class="spotlight-reroll-label">
                {props.loading ? "Finding…" : "Shuffle"}
              </span>
            </button>
          </div>
        </div>
      </section>
    </Show>
  );
};

export default Spotlight;
