// src/shared/ui/MovieCard.tsx
import {
  Component,
  Show,
  createSignal,
  createEffect,
  batch,
  createMemo,
  type JSX
} from "solid-js";
import Icon from "./Icon";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { useLazyImdbRating } from "~/shared/hooks/useLazyImdbRating";
import type { WatchlistItem, CollectionEntry } from "~/shared/types";
import { formatRuntime } from "~/shared/utils/format";
import { getEpisodeProgress } from "~/shared/utils/progress";
import MovieCardRatings from "./MovieCardRatings";
import { useCollections } from "~/features/collections/hooks/useCollections";
import { useToast } from "~/shared/hooks/useToast";
import HighlightText from "./HighlightText";
import { GlassCard } from "~/shared/ui/glass";

// Prefetch trigger — call to start downloading the DetailsModal chunk.
// Only fires once per hover session; subsequent hovers are no-ops
// because the chunk is already cached by the browser.
let prefetchTriggered = false;
const prefetchDetailsModal = () => {
  if (prefetchTriggered) return;
  prefetchTriggered = true;
  void import("~/features/details/DetailsModal");
};

// ─── Module-level style constants ────────────────────────────────────
// Extracted from JSX so each MovieCard instance doesn't allocate its
// own style-object literals on mount. With ~100 cards per page (Vault /
// Discover / Collections), this saves ~1000 small object allocations
// per page mount. Purely static — these styles never vary per card.
const LOADING_SPINNER_STYLE: JSX.CSSProperties = {
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  display: "flex",
  "flex-direction": "column",
  "align-items": "center",
  gap: "8px",
  opacity: "0.10"
};
const LOADING_ICON_STYLE: JSX.CSSProperties = {
  "font-size": "28px",
  color: "white",
  "pointer-events": "none"
};
const FALLBACK_POSTER_STYLE: JSX.CSSProperties = {
  background: "linear-gradient(145deg, var(--glass-bg), var(--glass-bg))",
  "z-index": "1"
};
const FALLBACK_ICON_STYLE: JSX.CSSProperties = {
  color: "var(--text-dim)",
  "font-size": "36px"
};
const NO_POSTER_TEXT_STYLE: JSX.CSSProperties = {
  color: "var(--text-dim)",
  "font-size": "8px",
  "font-weight": 700,
  "letter-spacing": "0.1em",
  "text-transform": "uppercase",
  "font-family": "'Azeret Mono', monospace"
};
const STATUS_BADGE_STYLE: JSX.CSSProperties = {
  "z-index": "3",
  "max-width": "calc(100% - 60px)",
  overflow: "hidden",
  "text-overflow": "ellipsis",
  "white-space": "nowrap"
};
const CHECK_ICON_STYLE: JSX.CSSProperties = {
  "font-size": "20px",
  color: "var(--on-primary, #0a0a0a)"
};
const NEW_SEASON_BADGE_STYLE: JSX.CSSProperties = {
  "z-index": "3",
  "white-space": "nowrap",
  "max-width": "none",
  "font-size": "7px",
  padding: "3px 8px"
};
const EPISODE_PROGRESS_TRACK_STYLE: JSX.CSSProperties = {
  background: "rgba(0,0,0,0.5)"
};
const EPISODE_PROGRESS_FILL_STYLE: JSX.CSSProperties = {
  background: "var(--p, #e8b74a)",
  transition: "width 400ms ease-out"
};
const TITLE_STYLE: JSX.CSSProperties = {
  display: "-webkit-box",
  "-webkit-line-clamp": "2",
  "-webkit-box-orient": "vertical",
  overflow: "hidden",
  "line-height": "1.25",
  "min-height": "1.7em"
};
const COMPACT_RATING_DOT_STYLE: JSX.CSSProperties = {
  color: "var(--text-dim)"
};
const COMPACT_RATING_STAR_STYLE: JSX.CSSProperties = { color: "#f5c518" };
const COMPACT_EPISODE_LABEL_STYLE: JSX.CSSProperties = {
  color: "var(--p)",
  "font-weight": 600
};
const COMPACT_EPISODE_DOT_STYLE: JSX.CSSProperties = {
  color: "var(--text-dim)"
};
const COMPACT_EPISODE_FRACTION_STYLE: JSX.CSSProperties = {
  color: "var(--text-muted)"
};
// Selection-mode button base style. The selected/unselected variants
// differ only in `background` + `border`, so we keep the shared props
// here and merge per-state.
const SELECTION_BUTTON_BASE_STYLE: JSX.CSSProperties = {
  width: "44px",
  height: "44px",
  "backdrop-filter": "blur(8px)",
  "-webkit-backdrop-filter": "blur(8px)",
  transition: "background 150ms ease-out, border-color 150ms ease-out"
};
const SELECTION_BUTTON_SELECTED_STYLE: JSX.CSSProperties = {
  ...SELECTION_BUTTON_BASE_STYLE,
  background: "var(--p)",
  border: "none"
};
const SELECTION_BUTTON_UNSELECTED_STYLE: JSX.CSSProperties = {
  ...SELECTION_BUTTON_BASE_STYLE,
  background: "rgba(0,0,0,0.5)",
  border: "2px solid rgba(255,255,255,0.3)"
};
const BOTTOM_INFO_COMPACT_PADDING: JSX.CSSProperties = {
  "z-index": 3,
  padding: "0.5rem"
};
const BOTTOM_INFO_DEFAULT_PADDING: JSX.CSSProperties = {
  "z-index": 3,
  padding: "0.625rem"
};

export function shouldShowCompactEpisodeMeta(
  variant: "default" | "compact" | "featured",
  showCompactEpisodeMeta?: boolean
): boolean {
  return variant === "compact" && showCompactEpisodeMeta !== false;
}

interface MovieCardProps {
  movie: WatchlistItem;
  variant?: "default" | "compact" | "featured";
  onClick: () => void;
  showFavButton?: boolean;
  search?: string;
  /**
   * SELECTION MODE (future batch management) — when true, the card shows
   * a checkbox overlay instead of the favorite button, and clicking the
   * card toggles selection instead of opening details. The parent owns
   * the selection state; this prop just controls the visual mode.
   * Default: false (normal mode).
   */
  isSelectionMode?: boolean;
  /** Whether this card is currently selected (only relevant in selection mode) */
  isSelected?: boolean;
  /** Called when the card is tapped in selection mode */
  onToggleSelect?: () => void;
  /** Hide compact TV episode metadata when a shelf supplies its own badge. */
  showCompactEpisodeMeta?: boolean;
}

const MovieCard: Component<MovieCardProps> = (props) => {
  const variant = () => props.variant ?? "default";
  const [imgLoaded, setImgLoaded] = createSignal(false);
  const [imgError, setImgError] = createSignal(false);

  // Favorites — uses O(1) Set lookup (Performance Sprint 1, Task 3).
  // The provider-level `favoritesSet` is a Set<"media_type/id"> built
  // reactively from the Favorites collection entries. This replaces the
  // old per-card collection scan (find + some) that was O(n + m).
  const collections = useCollections();
  const { showToast } = useToast();

  const title = () => props.movie.title || props.movie.name || "Untitled";
  const year = () =>
    (props.movie.release_date || props.movie.first_air_date || "").split(
      "-"
    )[0] || "";

  const statusLabel = () => {
    const s = props.movie.status;
    if (s === "Plan to Watch" || s === "Planned") return "Planned";
    if (s === "Watching") return "Watching";
    if (s === "Completed") return "Completed";
    return s || "New";
  };

  const statusBadgeClass = () => {
    const s = props.movie.status;
    if (s === "Plan to Watch" || s === "Planned") return "status-badge-planned";
    if (s === "Watching") return "status-badge-watching";
    if (s === "Completed") return "status-badge-completed";
    return "status-badge-planned";
  };

  const firstPlatform = () => props.movie.platformsList?.[0];

  // O(1) favorites lookup via provider-level Set.
  // favoritesCollectionId is derived once in the CollectionsProvider,
  // eliminating per-card .find() scans over the collections array.
  const favColId = () => collections.favoritesCollectionId();

  const isFavourite = () => {
    if (!favColId()) return false;
    const key = `${props.movie.media_type}/${props.movie.id}`;
    return collections.favoritesSet().has(key);
  };

  // ─── Localized favorite signal (INP optimization) ───────────────────
  //
  // The favorite button used to read `isFavourite()` directly in its
  // class/aria-label/aria-pressed bindings. Because `isFavourite()`
  // depends on `userCollections()` (via `favoritesCollection()` and
  // `isInCollection()`), ANY mutation to the collections signal —
  // including `addToCollection`/`removeFromCollection` on a single
  // card — would re-evaluate `isFavourite()` in EVERY mounted card
  // (100+ in a typical vault). Each re-evaluation runs a `find()` over
  // all collections + a `some()` over the Favorites collection's
  // entries, costing O(n + m) per card. With 100 cards this produced
  // 800ms+ main-thread blocks (Vercel INP audit).
  //
  // Fix: keep a LOCAL signal `localIsFav` that is the ONLY reactive
  // dependency for the button's class/aria-label/aria-pressed. The
  // signal is:
  //   1. Initialized from `isFavourite()` on mount.
  //   2. Synced from `isFavourite()` via `createEffect` — but only
  //      `setLocalIsFav` when the value actually changed, so cards
  //      whose favorite status didn't change don't trigger a re-render
  //      of their button.
  //   3. Updated OPTIMISTICALLY in `toggleFavourite` so the user sees
  //      instant feedback (<5ms) without waiting for the collections
  //      signal to update and propagate.
  //
  // The `createEffect` still runs for every card when `userCollections()`
  // changes, but it's a cheap boolean comparison. The expensive DOM
  // update only happens for the card whose favorite status actually
  // changed — exactly what SolidJS's fine-grained reactivity is designed
  // for.
  const [localIsFav, setLocalIsFav] = createSignal<boolean>(isFavourite());
  createEffect(() => {
    const next = isFavourite();
    // Only update the local signal when the value actually changed.
    // This prevents a re-render of the button for every card on every
    // collections mutation.
    setLocalIsFav((prev) => (prev === next ? prev : next));
  });

  const toggleFavourite = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const colId = favColId();
    if (!colId) {
      showToast(
        "Favorites collection not ready yet — try again in a moment.",
        "info",
        2000
      );
      return;
    }
    const entry: CollectionEntry = {
      id: String(props.movie.id),
      media_type: props.movie.media_type,
      title: props.movie.title,
      name: props.movie.name,
      poster_path: props.movie.poster_path ?? null,
      backdrop_path: props.movie.backdrop_path ?? null,
      release_date: props.movie.release_date,
      first_air_date: props.movie.first_air_date,
      runtime: props.movie.runtime
    };
    // Optimistic local update — flip the local signal IMMEDIATELY so
    // the user sees instant feedback. The collections signal updates
    // in the background; the createEffect above will reconcile if the
    // server-side state disagrees (e.g., on rollback).
    const nextFav = !localIsFav();
    setLocalIsFav(nextFav);
    // batch() wraps reactive state updates so SolidJS batches them
    // into a single render cycle, reducing INP by avoiding double
    // re-renders (collection signal + toast signal triggering
    // separate reactive updates).
    batch(() => {
      if (!nextFav) {
        void collections
          .removeFromCollection(colId, entry.id, entry.media_type)
          .then(() => {
            showToast("Removed from Favorites", "info", 1200);
          });
      } else {
        void collections.addToCollection(colId, entry).then(() => {
          showToast("Added to Favorites", "success", 1200);
        });
      }
    });
  };

  // Variant-aware class
  const cardClass = () => {
    const base = "glass-card animate-fade-up touch-ripple focus-ring";
    if (variant() === "featured") return `${base} v2-card-featured`;
    return base;
  };

  // Variant-aware poster image size
  const posterSize = () => {
    if (variant() === "compact") return "w342";
    return "w500";
  };

  const showFavButton = () => props.showFavButton !== false;

  // LAZY IMDb RATING — uses IntersectionObserver so the fetch only
  // fires when this card scrolls into view. Falls back to the
  // WatchlistItem's imdbRating (or tmdbRating) while loading or
  // if MDBList returns null. This keeps card badges consistent with
  // the MDBList rating shown in the Details modal.
  let cardRef: HTMLDivElement | undefined;
  const { rating: lazyImdbRating } = useLazyImdbRating(
    () => props.movie.id,
    () => props.movie.media_type,
    () => cardRef
  );
  // The effective IMDb rating: MDBList score when available, then
  // imdbRating, then tmdbRating as last resort.
  const effectiveImdbRating = () =>
    lazyImdbRating() ??
    props.movie.imdbRating ??
    props.movie.tmdbRating ??
    null;

  // TV EPISODE PROGRESS — for TV shows with status "Watching", compute
  // the series-wide episode progress using the shared progress engine.
  // The compact variant shows the progress text (S{season} E{episode} •
  // {watched}/{total} Eps) AND a thin progress bar at the bottom edge
  // of the poster. Non-watching or non-TV titles show the normal
  // year + rating metadata.
  const episodeProgress = () => {
    if (props.movie.media_type !== "tv") return null;
    if (props.movie.status !== "Watching") return null;
    return getEpisodeProgress(props.movie);
  };
  const hasEpisodeProgress = () => episodeProgress() !== null;

  // ─── Memoized reactive styles ─────────────────────────────────────
  // These objects depend on signals, so they need to re-create when
  // their inputs change. Wrapping in createMemo ensures SolidJS only
  // re-evaluates them when the deps actually change, AND it gives the
  // resulting object a stable identity between unrelated reactive
  // updates (e.g., a collections mutation won't re-allocate these).
  const selectionButtonStyle = createMemo(() =>
    props.isSelected
      ? SELECTION_BUTTON_SELECTED_STYLE
      : SELECTION_BUTTON_UNSELECTED_STYLE
  );
  const episodeProgressFillStyle = createMemo(() => ({
    ...EPISODE_PROGRESS_FILL_STYLE,
    width: `${episodeProgress()?.pct ?? 0}%`
  }));

  return (
    <GlassCard
      ref={cardRef}
      onClick={() => {
        // In selection mode, tapping the card toggles selection
        // instead of opening details.
        if (props.isSelectionMode) {
          props.onToggleSelect?.();
        } else {
          props.onClick();
        }
      }}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          props.onClick();
        }
      }}
      onMouseEnter={prefetchDetailsModal}
      onTouchStart={prefetchDetailsModal}
      onFocus={prefetchDetailsModal}
      variant={variant() === "featured" ? "accent" : "glass"}
      // padding="none" + size="compact" + border="none" — the MovieCard's
      // .vault-card-inner already manages its own border, shadow, padding,
      // and aspect ratio (2:3). The previous default GlassCard padding
      // (p-4 gap-3) was shrinking the poster by 16px on every side,
      // which is why "movie cards became smaller after previous fixes".
      padding="none"
      size="compact"
      border="none"
      class={cardClass()}
      role="button"
      tabindex={0}
    >
      <div class="vault-card-inner">
        {/* Loading skeleton */}
        <Show when={!imgLoaded() && !imgError()}>
          <div class="poster-loading" aria-hidden="true">
            <div style={LOADING_SPINNER_STYLE}>
              <Icon name="movie" style={LOADING_ICON_STYLE} />
            </div>
          </div>
        </Show>

        {/* Poster image with fallback */}
        <Show
          when={props.movie.poster_path && !imgError()}
          fallback={
            <div
              class="absolute inset-0 flex flex-col items-center justify-center gap-2"
              style={FALLBACK_POSTER_STYLE}
              aria-hidden="true"
            >
              <Icon name="movie" style={FALLBACK_ICON_STYLE} />
              <span style={NO_POSTER_TEXT_STYLE}>No Poster</span>
            </div>
          }
        >
          <img
            src={tmdbImage(props.movie.poster_path, posterSize())}
            class={`vault-card-poster${imgLoaded() ? " img-loaded" : ""}`}
            loading="lazy"
            decoding="async"
            width={posterSize() === "w342" ? 342 : 500}
            height={posterSize() === "w342" ? 513 : 750}
            alt={props.movie.title || props.movie.name || "Movie poster"}
            onLoad={(e) => {
              setImgLoaded(true);
              e.currentTarget.classList.add("img-loaded");
            }}
            onError={() => setImgError(true)}
          />
        </Show>

        {/* Status badge (top-left) — status-aware color.
            The badge is exposed to AT via role="status" + aria-label so
            screen-reader users hear "Status: Watching" rather than the
            old behaviour where aria-hidden="true" made the badge
            completely invisible to AT (the user would have to infer
            status from surrounding context). The visible text remains
            the same (statusLabel()). */}
        <div
          class={`tag-chip absolute left-2 top-2 ${statusBadgeClass()}`}
          style={STATUS_BADGE_STYLE}
          role="status"
          aria-label={`Status: ${statusLabel()}`}
        >
          {statusLabel()}
        </div>

        {/* Selection mode checkbox overlay — replaces the favorite button
            when isSelectionMode is true. A circular checkbox that fills
            with the accent color when selected. Touch target ≥ 44×44px
            (the button has w-11 h-11 = 44px). */}
        <Show when={props.isSelectionMode}>
          <button
            type="button"
            class="focus-ring absolute right-2 top-2 z-[4] flex items-center justify-center rounded-full"
            style={selectionButtonStyle()}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              props.onToggleSelect?.();
            }}
            aria-label={
              props.isSelected ? `Deselect ${title()}` : `Select ${title()}`
            }
            aria-pressed={props.isSelected}
          >
            <Show when={props.isSelected}>
              <span
                class="material-symbols-outlined"
                style={CHECK_ICON_STYLE}
                aria-hidden="true"
              >
                check
              </span>
            </Show>
          </button>
        </Show>

        {/* Favourite heart button (top-right) — only when showFavButton
            is true (default) AND NOT in selection mode. The heart toggles
            membership in the Favorites collection. The button reads
            `localIsFav()` (a local signal) instead of `isFavourite()` so
            only this card's button re-renders on toggle, not the entire
            grid. aria-label is REQUIRED because the button's only content
            is an aria-hidden icon (no visible text for screen readers). */}
        <Show when={showFavButton() && !props.isSelectionMode}>
          <button
            type="button"
            class={`vault-fav-btn focus-ring${localIsFav() ? " is-favourite" : ""}`}
            onClick={toggleFavourite}
            aria-label={
              localIsFav() ? "Remove from Favorites" : "Add to Favorites"
            }
            aria-pressed={localIsFav()}
          >
            <span class="material-symbols-outlined" aria-hidden="true">
              favorite
            </span>
          </button>
        </Show>

        {/* Tag / New Season badge (top-right) — hidden when the
            favourite button is showing so they don't overlap */}
        <Show when={!showFavButton() && props.movie.newSeasonAvailable}>
          <div
            class="badge-glow absolute right-2 top-2"
            style={NEW_SEASON_BADGE_STYLE}
            aria-hidden="true"
          >
            New Season
          </div>
        </Show>

        {/* TV Episode Progress Bar — thin bar at the bottom edge of the
            poster, ONLY for TV shows with status "Watching". Shows the
            series-wide completion percentage. Uses a dark track
            (bg-black/50) so the accent fill is visible against any
            poster artwork. z-20 keeps it above the poster image but
            below the info cluster. */}
        <Show when={hasEpisodeProgress()}>
          <div
            class="absolute bottom-0 left-0 z-20 h-1.5 w-full"
            style={EPISODE_PROGRESS_TRACK_STYLE}
            aria-hidden="true"
          >
            <div class="h-full" style={episodeProgressFillStyle()} />
          </div>
        </Show>

        {/* Bottom info cluster — variant-aware density */}
        <div
          class="absolute bottom-0 left-0 w-full"
          style={
            variant() === "compact"
              ? BOTTOM_INFO_COMPACT_PADDING
              : BOTTOM_INFO_DEFAULT_PADDING
          }
        >
          {/* Title — 2-line clamp */}
          <p class="type-card-title mb-0.5" style={TITLE_STYLE}>
            <HighlightText text={title()} search={props.search} />
          </p>

          {/* Metadata row — hidden on compact for density */}
          <Show when={variant() !== "compact"}>
            <p class="type-subtitle mb-1.5" aria-hidden="true">
              {year()}
              {year() ? " · " : ""}
              {props.movie.media_type === "tv" ? "Series" : "Movie"}
              <Show when={props.movie.runtime && props.movie.runtime > 0}>
                {" · "}
                {formatRuntime(props.movie.runtime)}
              </Show>
              <Show when={firstPlatform()}>
                {" · "}
                {firstPlatform()}
              </Show>
            </p>
          </Show>

          {/* Rating chips — 3 independent sources.
              Passes the lazy MDBList IMDb score as an override so the
              IMDb chip matches the Details modal. */}
          <Show when={variant() !== "compact"}>
            <MovieCardRatings
              movie={props.movie}
              overrideImdbRating={lazyImdbRating()}
            />
          </Show>

          {/* Compact variant: show year + IMDb rating inline OR episode
              progress for TV shows with status "Watching".
              Uses the lazy MDBList IMDb score (falls back to TMDB
              while loading) so the badge matches the Details modal. */}
          <Show
            when={shouldShowCompactEpisodeMeta(
              variant(),
              props.showCompactEpisodeMeta
            )}
          >
            <Show
              when={hasEpisodeProgress()}
              fallback={
                <div
                  class="type-subtitle flex items-center gap-1.5"
                  aria-hidden="true"
                >
                  <Show when={year()}>
                    <span>{year()}</span>
                  </Show>
                  <Show when={effectiveImdbRating()}>
                    <span style={COMPACT_RATING_DOT_STYLE}>·</span>
                    <span style={COMPACT_RATING_STAR_STYLE}>
                      ★ {effectiveImdbRating()}
                    </span>
                  </Show>
                </div>
              }
            >
              {/* TV episode progress — replaces year/rating for watching TV shows.
                  Format: S{season} E{episode} • {watched}/{total} Eps
                  When totalEps is 0 (no season data cached), show ONLY
                  S{season} E{episode} (no fraction) to avoid "0/0 Eps". */}
              <div
                class="type-subtitle flex items-center gap-1.5"
                aria-hidden="true"
              >
                <span style={COMPACT_EPISODE_LABEL_STYLE}>
                  S{episodeProgress()!.season} E{episodeProgress()!.episode}
                </span>
                <Show when={episodeProgress()!.seriesTotalEps > 0}>
                  <span style={COMPACT_EPISODE_DOT_STYLE}>·</span>
                  <span style={COMPACT_EPISODE_FRACTION_STYLE}>
                    {episodeProgress()!.seriesCompletedEps}/
                    {episodeProgress()!.seriesTotalEps} Eps
                  </span>
                </Show>
              </div>
            </Show>
          </Show>
        </div>
      </div>
    </GlassCard>
  );
};

export default MovieCard;
