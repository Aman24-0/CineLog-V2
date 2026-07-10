// src/features/collections/components/UniverseDashboard.tsx
import { Show, createMemo } from "solid-js";
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
}

/**
 * UniverseDashboard — the enhanced hero/stats section for a universe detail page.
 *
 * Shows:
 *   - Cinematic hero with backdrop + accent gradient
 *   - Animated progress ring
 *   - Stats strip (total, owned, completed, watching, missing, runtime)
 *   - Continue card (next missing title)
 *   - Provider + Order selector
 *   - Quick actions (Edit Timeline, Pin)
 */
export default function UniverseDashboard(props: UniverseDashboardProps) {
  const navigate = useNavigate();
  const { watchlist } = useVault();
  const { getCollectionProgress, getUniversePrefs, pinUniverseInPrefs, unpinUniverseInPrefs } = useCollections();

  const progress = createMemo(() => getCollectionProgress(props.collection, watchlist()));
  const prefs = createMemo(() => getUniversePrefs(props.collection.id));
  const isPinned = createMemo(() => prefs()?.isPinned ?? false);

  const backdropUrl = createMemo(() => {
    if (props.collection.backdrop_path) return tmdbImage(props.collection.backdrop_path, "w1280");
    return "";
  });

  const accentStyle = createMemo(() => {
    const accent = props.collection.accentColor;
    if (!accent) return {};
    return {
      "--universe-accent": accent
    };
  });

  /** Find the next missing entry for the "Continue" card */
  const nextMissing = createMemo((): CollectionEntry | null => {
    return (props.collection.entries ?? []).find(
      (e) => !findInVault(watchlist(), { id: e.id, media_type: e.media_type })
    ) ?? null;
  });

  const titleOf = (e: CollectionEntry) => e.title || e.name || "Untitled";

  const availableOrders = createMemo(() => props.collection.viewingOrders ?? []);

  const togglePin = () => {
    if (isPinned()) {
      unpinUniverseInPrefs(props.collection.id);
    } else {
      pinUniverseInPrefs(props.collection.id);
    }
  };

  return (
    <div class="universe-dashboard" style={accentStyle()}>
      {/* Hero backdrop */}
      <div class="universe-detail-hero">
        <Show when={backdropUrl()}>
          <img
            onError={(e) => { e.currentTarget.style.display = "none"; }}
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

      {/* Continue card — next missing title */}
      <Show when={nextMissing()}>
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

      {/* Provider + Order selector */}
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

      {/* Quick actions */}
      <div class="universe-dashboard-actions">
        <button
          type="button"
          class="universe-dashboard-action-btn"
          onClick={() => navigate(`/collections/${props.collection.id}/edit`)}
          aria-label="Edit Timeline"
        >
          <span class="material-symbols-outlined" style={{"font-size":"16px"}} aria-hidden="true">edit</span>
          Edit
        </button>
        <button
          type="button"
          class={`universe-dashboard-action-btn${isPinned() ? " universe-dashboard-action-active" : ""}`}
          onClick={togglePin}
          aria-label={isPinned() ? "Unpin universe" : "Pin universe"}
        >
          <span class="material-symbols-outlined" style={{"font-size":"16px"}} aria-hidden="true">push_pin</span>
          {isPinned() ? "Pinned" : "Pin"}
        </button>
      </div>
    </div>
  );
}

import { For } from "solid-js";
