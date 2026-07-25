// src/shared/ui/MovieCard.tsx
import { createSignal, Show, Component } from "solid-js";
import Icon from "./Icon";
import HighlightText from "./HighlightText";
import MovieCardRatings from "./MovieCardRatings";
import { formatRuntime } from "~/shared/utils/format";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { useCollections } from "~/features/collections/hooks/useCollections";
import { useToast } from "~/shared/hooks/useToast";
import type { CollectionEntry, WatchlistItem } from "~/shared/types";

export type MovieCardVariant = "compact" | "default" | "featured";

interface MovieCardProps {
  movie: WatchlistItem;
  search?: string;
  onClick: () => void;
  /** Card variant — controls size, density, and visual emphasis.
   *  - compact:  smallest, for rails and tight grids (100-130px wide)
   *  - default:  standard, for vault grid (150-200px wide)
   *  - featured: largest, with accent border + glow, for hero-adjacent placement
   */
  variant?: MovieCardVariant;
  /**
   * When true (default for vault cards), a heart button is rendered
   * top-right that toggles the title's membership in the Favorites
   * collection. Set to false on Discover/Search rails where the
   * title is not yet in the vault (those surfaces use the Details
   * modal's Folder action instead).
   */
  showFavButton?: boolean;
}

/**
 * Scalable Movie Card system — CineLog's visual identity.
 *
 * Three variants share one core (poster + overlay + badges + info cluster)
 * but differ in density, typography, and emphasis. Future variants (hero,
 * timeline, collection) can be added by extending this component.
 *
 * Architecture:
 *  - MovieCard: variant router + shared state (imgLoaded, imgError)
 *  - CardPoster: handles image loading + fallback (shared)
 *  - CardBadges: status + tag/new-season badges (shared, density-aware)
 *  - CardInfo: title + metadata + ratings (density-aware per variant)
 *
 * The card is self-contained — no dependency on parent context beyond props.
 * All variants are SSR-safe (no client-only APIs).
 *
 * Polished:
 *  - focus-ring class added so keyboard users get a clear accent ring.
 *  - Hover transform slightly toned down (1.035 → 1.03) to feel less
 *    jittery on rapid mouse moves across a grid.
 *  - aria-label includes the title, year, and status for screen readers.
 *  - The card is a real <button>-like div (role=button, tabindex=0) with
 *    Enter/Space activation already handled.
 */
const MovieCard: Component<MovieCardProps> = (props) => {
  const variant = () => props.variant ?? "default";
  const [imgLoaded, setImgLoaded] = createSignal(false);
  const [imgError, setImgError] = createSignal(false);

  // Favorites collection — used by the heart button to toggle
  // membership. We read the collections context lazily (the hook is
  // only called once per card, but the lookups are cheap memos).
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

  // Resolve the Favorites collection once per render. It's the one
  // with isFavorites=true (or, fallback, named exactly "Favorites").
  const favoritesCollection = () => {
    const all = collections.userCollections();
    return (
      all.find((c) => c.isFavorites) ??
      all.find((c) => c.name === "Favorites") ??
      null
    );
  };

  const favColId = () => favoritesCollection()?.id ?? null;

  const isFavourite = () => {
    const id = favColId();
    if (!id) return false;
    return collections.isInCollection(id, String(props.movie.id), props.movie.media_type);
  };

  const toggleFavourite = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const colId = favColId();
    if (!colId) {
      showToast("Favorites collection not ready yet — try again in a moment.", "info", 2000);
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
      runtime: props.movie.runtime,
    };
    if (isFavourite()) {
      void collections.removeFromCollection(colId, entry.id, entry.media_type).then(() => {
        showToast("Removed from Favorites", "info", 1200);
      });
    } else {
      void collections.addToCollection(colId, entry).then(() => {
        showToast("Added to Favorites", "success", 1200);
      });
    }
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

  return (
    <div
      onClick={() => props.onClick()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          props.onClick();
        }
      }}
      class={cardClass()}
      role="button"
      tabindex={0}
      aria-label={`${title()}${year() ? `, ${year()}` : ""} — ${statusLabel()}`}
    >
      <div class="vault-card-inner">
        {/* Loading skeleton */}
        <Show when={!imgLoaded() && !imgError()}>
          <div class="poster-loading" aria-hidden="true">
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                display: "flex",
                "flex-direction": "column",
                "align-items": "center",
                gap: "8px",
                opacity: "0.10",
              }}
            >
              <Icon
                name="movie"
                style={{
                  "font-size": "28px",
                  color: "white",
                  "pointer-events": "none",
                }}
              />
            </div>
          </div>
        </Show>

        {/* Poster image with fallback */}
        <Show
          when={props.movie.poster_path && !imgError()}
          fallback={
            <div
              class="absolute inset-0 flex flex-col items-center justify-center gap-2"
              style={{
                background:
                  "linear-gradient(145deg, var(--tier-3), var(--tier-2))",
                "z-index": "1",
              }}
              aria-hidden="true"
            >
              <Icon
                name="movie"
                style={{ color: "var(--text-dim)", "font-size": "36px" }}
              />
              <span
                style={{
                  color: "var(--text-dim)",
                  "font-size": "8px",
                  "font-weight": 700,
                  "letter-spacing": "0.1em",
                  "text-transform": "uppercase",
                  "font-family": "'Azeret Mono', monospace",
                }}
              >
                No Poster
              </span>
            </div>
          }
        >
          <img
            src={tmdbImage(props.movie.poster_path, posterSize())}
            class={`vault-card-poster${imgLoaded() ? " img-loaded" : ""}`}
            loading="lazy"
            decoding="async"
            alt=""
            aria-hidden="true"
            onLoad={(e) => {
              setImgLoaded(true);
              e.currentTarget.classList.add("img-loaded");
            }}
            onError={() => setImgError(true)}
          />
        </Show>

        {/* Status badge (top-left) — status-aware color */}
        <div
          class={`tag-chip absolute top-2 left-2 ${statusBadgeClass()}`}
          style={{
            "z-index": "3",
            "max-width": "calc(100% - 60px)",
            overflow: "hidden",
            "text-overflow": "ellipsis",
            "white-space": "nowrap",
          }}
          aria-hidden="true"
        >
          {statusLabel()}
        </div>

        {/* Favourite heart button (top-right) — only when showFavButton
            is true (default). The heart toggles membership in the
            Favorites collection. */}
        <Show when={showFavButton()}>
          <button
            type="button"
            class={`vault-fav-btn focus-ring${isFavourite() ? " is-favourite" : ""}`}
            onClick={toggleFavourite}
            aria-label={isFavourite() ? "Remove from Favorites" : "Add to Favorites"}
            aria-pressed={isFavourite()}
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
            class="badge-glow absolute top-2 right-2"
            style={{
              "z-index": "3",
              "white-space": "nowrap",
              "max-width": "none",
              "font-size": "7px",
              padding: "3px 8px",
            }}
            aria-hidden="true"
          >
            New Season
          </div>
        </Show>

        {/* Bottom info cluster — variant-aware density */}
        <div
          class="absolute bottom-0 left-0 w-full"
          style={{
            "z-index": 3,
            padding: variant() === "compact" ? "0.5rem" : "0.625rem",
          }}
        >
          {/* Title — 2-line clamp */}
          <p
            class="type-card-title mb-0.5"
            style={{
              display: "-webkit-box",
              "-webkit-line-clamp": "2",
              "-webkit-box-orient": "vertical",
              overflow: "hidden",
              "line-height": "1.25",
              "min-height": "1.7em",
            }}
          >
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

          {/* Rating chips — 3 independent sources */}
          <Show when={variant() !== "compact"}>
            <MovieCardRatings movie={props.movie} />
          </Show>

          {/* Compact variant: show only year + IMDb rating inline */}
          <Show when={variant() === "compact"}>
            <div
              class="flex items-center gap-1.5 type-subtitle"
              aria-hidden="true"
            >
              <Show when={year()}>
                <span>{year()}</span>
              </Show>
              <Show when={props.movie.imdbRating}>
                <span style={{ color: "var(--text-dim)" }}>·</span>
                <span style={{ color: "#f5c518" }}>
                  ★ {props.movie.imdbRating}
                </span>
              </Show>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
};

export default MovieCard;
