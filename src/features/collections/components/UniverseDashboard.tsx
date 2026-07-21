// src/features/collections/components/UniverseDashboard.tsx
import { Show, createMemo, For } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { useVault } from "~/features/watchlist/useVault";
import { useCollections } from "../hooks/useCollections";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { findInVault } from "~/shared/utils/vaultMatch";
import { formatRuntime } from "~/shared/utils/format";
import ProgressRing from "./ProgressRing";
import type { Collection, CollectionEntry, ViewingOrder, TimelineProvider } from "~/shared/types";

interface UniverseDashboardProps {
  collection: Collection;
  activeOrder: ViewingOrder;
  activeProvider: TimelineProvider;
  onOrderChange: (order: ViewingOrder) => void;
  onProviderChange: (provider: TimelineProvider) => void;
  // ── Batch Select Mode (v2.1) ──
  selectMode?: boolean;
  selectedCount?: number;
  onToggleSelectMode?: () => void;
  onBatchRemove?: () => void;
  onOpenMoveDialog?: () => void;
}

/**
 * UniverseDashboard — the enhanced hero/stats section for a universe detail page.
 *
 * Shows:
 *   - Cinematic hero with backdrop + accent gradient
 *   - Animated progress ring
 *   - Stats strip (total, owned, completed, watching, missing, runtime)
 *   - Continue card (next missing title) — ONLY for curated universes
 *   - Order selector (Storyline / Release Year / Franchise)
 *   - Quick actions: Select (batch mode), Remove, Move (in select mode)
 *
 * v3 changes (per user request):
 *   - View-mode toggle (Timeline/List) REMOVED. There is only one view now.
 *   - The TimelineEngine below always renders; no List alternative.
 */
export default function UniverseDashboard(props: UniverseDashboardProps) {
  const navigate = useNavigate();
  const { watchlist } = useVault();
  const { getCollectionProgress } = useCollections();

  const progress = createMemo(() => getCollectionProgress(props.collection, watchlist()));

  const backdropUrl = createMemo(() => {
    // Prefer the collection's own backdrop (banner_url in Supabase).
    // Supports both raw http(s) URLs (user-uploaded/custom) and TMDB paths.
    if (props.collection.backdrop_path) {
      const p = props.collection.backdrop_path;
      if (p.startsWith("http")) return p;
      return tmdbImage(p, "w1280");
    }
    // Fallback: use the first entry that has a backdrop. This ensures
    // user-created folders (including Favorites) show a cinematic
    // backdrop instead of an empty black hero when no banner is set.
    const entries = props.collection.entries ?? [];
    const firstWithBackdrop = entries.find((e) => e.backdrop_path);
    if (firstWithBackdrop?.backdrop_path) {
      return tmdbImage(firstWithBackdrop.backdrop_path, "w1280");
    }
    return "";
  });

  const accentStyle = createMemo(() => {
    const accent = props.collection.accentColor;
    if (!accent) return {};
    return {
      "--universe-accent": accent
    };
  });

  // "Continue This Universe" is only shown for curated universes.
  // User folders + favorites skip it — after hero, timeline starts.
  const showContinueCard = createMemo(() => {
    return props.collection.type === "curated";
  });

  /** Find the next missing entry for the "Continue" card */
  const nextMissing = createMemo((): CollectionEntry | null => {
    if (!showContinueCard()) return null;
    return (props.collection.entries ?? []).find(
      (e) => !findInVault(watchlist(), { id: e.id, media_type: e.media_type })
    ) ?? null;
  });

  const titleOf = (e: CollectionEntry) => e.title || e.name || "Untitled";

  const availableOrders = createMemo(() => props.collection.viewingOrders ?? []);

  return (
    <div class="universe-dashboard" style={accentStyle()}>
      {/* Hero backdrop */}
      <div class="universe-detail-hero">
        <Show when={backdropUrl()}>
          <img
            onError={(e) => { e.currentTarget.style.display = "none"; }}
            onLoad={(e) => {
              // The CSS for .universe-detail-hero-backdrop starts at
              // opacity:0 + scale(1.08) and only becomes visible when
              // the .img-loaded class is added. Without this onLoad
              // handler the image loads but stays invisible, leaving
              // the hero solid black — the bug behind "favourite folder
              // cover image only shows black when folder is open".
              e.currentTarget.classList.add("img-loaded");
            }}
            src={backdropUrl()}
            class="universe-detail-hero-backdrop"
            loading="eager"
            decoding="async"
            {...({ fetchpriority: "high" } as Record<string, string>)}
            alt=""
            aria-hidden="true"
          />
        </Show>
        <div class="universe-detail-hero-overlay" aria-hidden="true" />
        <Show when={props.collection.accentColor}>
          <div
            class="universe-dashboard-accent-bar"
            style={{ background: `linear-gradient(180deg, transparent, ${props.collection.accentColor}40)` }}
            aria-hidden="true"
          />
        </Show>

        <button
          type="button"
          class="universe-detail-back-btn"
          onClick={() => navigate("/collections")}
          aria-label="Back to Collections"
        >
          <span class="material-symbols-outlined" style={{"font-size":"18px"}} aria-hidden="true">arrow_back</span>
        </button>

        <div class="universe-detail-hero-content">
          <p class="universe-detail-hero-eyebrow">
            {props.collection.type === "curated" ? "Cinematic Universe" :
             props.collection.type === "user" ? "Your Collection" : "Official Collection"}
          </p>
          <h1 class="universe-detail-hero-title">{props.collection.name}</h1>
          <Show when={props.collection.description}>
            <p class="universe-detail-hero-description">{props.collection.description}</p>
          </Show>

          {/* Progress ring + stats */}
          <div class="universe-detail-hero-stats">
            <ProgressRing pct={progress().pct} size="lg" />
            <div class="universe-detail-stat-strip">
              <div class="universe-detail-stat-cell">
                <span class="universe-detail-stat-value">{progress().total}</span>
                <span class="universe-detail-stat-label">Total</span>
              </div>
              <div class="universe-detail-stat-cell">
                <span class="universe-detail-stat-value" style={{ color: "var(--p)" }}>{progress().owned}</span>
                <span class="universe-detail-stat-label">Owned</span>
              </div>
              <div class="universe-detail-stat-cell">
                <span class="universe-detail-stat-value" style={{ color: "#4ade80" }}>{progress().completed}</span>
                <span class="universe-detail-stat-label">Completed</span>
              </div>
              <div class="universe-detail-stat-cell">
                <span class="universe-detail-stat-value" style={{ color: "#60a5fa" }}>{progress().watching}</span>
                <span class="universe-detail-stat-label">Watching</span>
              </div>
              <Show when={progress().missing > 0}>
                <div class="universe-detail-stat-cell">
                  <span class="universe-detail-stat-value" style={{ color: "var(--text-soft)" }}>{progress().missing}</span>
                  <span class="universe-detail-stat-label">Missing</span>
                </div>
              </Show>
              <Show when={progress().totalRuntime > 0}>
                <div class="universe-detail-stat-cell">
                  <span class="universe-detail-stat-value" style={{ color: "var(--text-soft)" }}>{formatRuntime(progress().totalRuntime)}</span>
                  <span class="universe-detail-stat-label">Runtime</span>
                </div>
              </Show>
            </div>
          </div>
        </div>
      </div>

      {/* Continue card — ONLY for curated universes.
          User folders + favorites skip this — timeline starts right
          after the hero (per user request v2.1). */}
      <Show when={showContinueCard() && nextMissing()}>
        <div class="universe-dashboard-continue animate-fade-up">
          <div class="universe-dashboard-continue-label">
            <span class="material-symbols-outlined" style={{"font-size":"14px","color":"var(--p)"}} aria-hidden="true">play_circle</span>
            Continue this universe
          </div>
          <div class="universe-dashboard-continue-card">
            <Show when={nextMissing()!.poster_path}>
              <img
                onError={(e) => { e.currentTarget.style.display = "none"; }}
                src={tmdbImage(nextMissing()!.poster_path, "w92")}
                class="universe-dashboard-continue-poster"
                loading="lazy"
                decoding="async"
                alt=""
                aria-hidden="true"
              />
            </Show>
            <div class="universe-dashboard-continue-info">
              <p class="universe-dashboard-continue-title">{titleOf(nextMissing()!)}</p>
              <p class="universe-dashboard-continue-meta">
                {nextMissing()!.entryType ?? (nextMissing()!.media_type === "tv" ? "Series" : "Movie")}
                <Show when={nextMissing()!.release_date || nextMissing()!.first_air_date}>
                  <span> · {(nextMissing()!.release_date || nextMissing()!.first_air_date || "").split("-")[0]}</span>
                </Show>
              </p>
            </div>
            <span class="universe-timeline-missing-badge" aria-label="Not in watchlist">
              <span class="material-symbols-outlined" style={{"font-size":"16px"}} aria-hidden="true">add</span>
            </span>
          </div>
        </div>
      </Show>

      {/* Order selector — Storyline / Release Year / Franchise.
          The order switcher only renders when there's more than one
          order available. (View-mode toggle was removed in v3 — there's
          only one view now.) */}
      <div class="universe-dashboard-controls">
        <Show when={availableOrders().length > 1}>
          <div class="universe-order-switch">
            <For each={availableOrders()}>
              {(order) => (
                <button
                  type="button"
                  class="universe-order-btn"
                  data-active={props.activeOrder === order.id}
                  onClick={() => props.onOrderChange(order.id)}
                  aria-label={order.description ?? order.label}
                  aria-pressed={props.activeOrder === order.id}
                >
                  {order.label}
                </button>
              )}
            </For>
          </div>
        </Show>
      </div>

      {/* Quick actions — Select mode toggle + batch actions.
          Edit button is now in the Timeline header (right-aligned
          with the "Timeline" label). Pin button removed (v2.1). */}
      <Show when={props.onToggleSelectMode}>
        <div class="universe-dashboard-actions">
          {/* Select toggle button */}
          <button
            type="button"
            class={`universe-dashboard-action-btn${props.selectMode ? " universe-dashboard-action-active" : ""}`}
            onClick={() => props.onToggleSelectMode!()}
            aria-label={props.selectMode ? "Exit select mode" : "Select titles"}
            aria-pressed={props.selectMode ?? false}
          >
            <span class="material-symbols-outlined" style={{"font-size":"16px"}} aria-hidden="true">
              {props.selectMode ? "close" : "checklist"}
            </span>
            {props.selectMode ? "Cancel" : "Select"}
          </button>

          {/* Batch actions — only visible in select mode.
              Disabled until at least one entry is selected. */}
          <Show when={props.selectMode}>
            <button
              type="button"
              class="universe-dashboard-action-btn universe-dashboard-action-danger"
              onClick={() => props.onBatchRemove?.()}
              disabled={(props.selectedCount ?? 0) === 0}
              aria-label="Remove selected titles from this folder"
            >
              <span class="material-symbols-outlined" style={{"font-size":"16px"}} aria-hidden="true">delete</span>
              Remove{(props.selectedCount ?? 0) > 0 ? ` (${props.selectedCount})` : ""}
            </button>
            <button
              type="button"
              class="universe-dashboard-action-btn"
              onClick={() => props.onOpenMoveDialog?.()}
              disabled={(props.selectedCount ?? 0) === 0}
              aria-label="Move selected titles to another folder"
            >
              <span class="material-symbols-outlined" style={{"font-size":"16px"}} aria-hidden="true">drive_file_move</span>
              Move{(props.selectedCount ?? 0) > 0 ? ` (${props.selectedCount})` : ""}
            </button>
          </Show>
        </div>
      </Show>
    </div>
  );
}
