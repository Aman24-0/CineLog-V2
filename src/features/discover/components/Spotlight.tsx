// src/features/discover/components/Spotlight.tsx
import { Show, createSignal, createMemo, Component } from "solid-js";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { Button } from "~/shared/ui/primitives";
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

  // Vault relationship — is this title already in the vault?
  const vaultItem = createMemo(() =>
    props.vault.find((m) => String(m.id) === String(pick()?.title.id))
  );
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
          src={backdropUrl()}
          class={`spotlight-backdrop${backdropLoaded() ? " img-loaded" : ""}`}
          loading="eager"
          decoding="async"
          {...{ fetchpriority: "high" } as any}
          onLoad={() => setBackdropLoaded(true)}
          alt=""
          aria-hidden="true"
        />
      </Show>

      {/* Multi-layer gradient overlay (inherited from CinematicHero) */}
      <div class="spotlight-overlay" aria-hidden="true" />

      {/* Top-left badge — the fold identity */}
      <div class="spotlight-badge" aria-label="Spotlight">
        <span class="material-symbols-outlined" style={{ "font-size": "12px", color: "var(--p)" }} aria-hidden="true">
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

          {/* Quick meta pills — year, type, IMDb */}
          <div class="spotlight-meta">
            <Show when={year()}>
              <span class="v2-pill">{year()}</span>
            </Show>
            <span class="v2-pill">{mediaLabel()}</span>
            <Show when={imdb()}>
              <span class="v2-pill" style={{ color: "#f5c518", "border-color": "rgba(245,197,24,0.25)" }}>
                ★ {imdb()}
              </span>
            </Show>
            <Show when={vaultStatusLabel()}>
              <span class="v2-pill v2-pill-accent">{vaultStatusLabel()}</span>
            </Show>
          </div>

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
                     but still clearly a primary action (not ghost). */
                  background: "rgba(255,255,255,0.06)",
                  color: "var(--text-strong)",
                  "box-shadow": "0 0 0 1px var(--hairline-3), 0 2px 8px rgba(0,0,0,0.4)",
                  "backdrop-filter": "blur(12px)"
                }}
              >
                Add to Vault
              </Button>
            </Show>

            {/* Not in the mood — re-rolls the Spotlight, secondary placement */}
            <button
              type="button"
              class="spotlight-reroll"
              onClick={props.onReroll}
              aria-label="Not in the mood — show me a different Spotlight"
            >
              <span class="material-symbols-outlined" style={{ "font-size": "16px" }} aria-hidden="true">
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
