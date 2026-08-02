// src/features/trash/components/TrashItemCard.tsx
//
// TrashItemCard — a single row in the trash list.
//
// Layout (horizontal):
//   ┌─────────────────────────────────────────────────────────────┐
//   │ ┌──────┐                                                     │
//   │ │      │  Title (bold)                              [Movie] │
//   │ │ POST │  Deleted Jul 14, 2026                                │
//   │ │  ER  │  ⏱ Auto-deletes in 18 days                          │
//   │ └──────┘                                                     │
//   │            [↩ Restore]            [🗑 Delete Forever]        │
//   └─────────────────────────────────────────────────────────────┘
//
// Variants:
//   • Vault item   — shows poster thumbnail (or fallback icon), title,
//                    year, media-type badge, deletion date, auto-delete
//                    countdown, Restore + Delete Forever buttons.
//   • Collection   — shows folder icon, name, entry count, deletion
//                    date, auto-delete countdown, same two buttons.
//
// Both buttons trigger confirmation dialogs (handled by the parent).
// The Restore button is primary (gold); the Delete Forever button is
// danger (red) and labeled explicitly so the user knows it's permanent.
//
// Poster fallback:
//   • If poster_path is null/missing, show a glass tile with the
//     title's first letter (large, dimmed) so the row has visual
//     weight even without an image.
//   • If the <img> errors (404, network), swap to the same fallback
//     via the onError handler.
//

import { Component, Show, createMemo, createSignal, type JSX } from "solid-js";
// (no For import needed — groups render children directly)
import { GlassCard, GlassBadge, GlassButton } from "~/shared/ui/glass";
import { tmdbImage } from "~/core/tmdb/tmdb";
import type {
  TrashedVaultItem,
  TrashedCollection
} from "~/features/trash/trashAdapter";

// ── Shared helpers ─────────────────────────────────────────────

/** Format an ISO date as "Jul 14, 2026". */
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

/** Days remaining until auto-purge. Returns "Today" if <= 0. */
function daysRemaining(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
  if (days <= 0) return "Today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

// ── Vault item card ────────────────────────────────────────────

export interface TrashVaultItemCardProps {
  item: TrashedVaultItem;
  busy: boolean;
  onRestore: (item: TrashedVaultItem) => void;
  onDeleteForever: (item: TrashedVaultItem) => void;
}

export const TrashVaultItemCard: Component<TrashVaultItemCardProps> = (
  props
) => {
  const title = createMemo(
    () => props.item.title || props.item.name || "Untitled"
  );
  const year = createMemo(() => {
    const d = props.item.release_date || props.item.first_air_date || "";
    return d.slice(0, 4);
  });
  const mediaLabel = createMemo(() =>
    props.item.media_type === "tv" ? "Series" : "Movie"
  );
  const mediaIcon = createMemo(() =>
    props.item.media_type === "tv" ? "tv" : "movie"
  );
  const placeholderInitial = createMemo(() => {
    const t = title();
    return t ? t.charAt(0).toUpperCase() : "?";
  });

  // Poster fallback state — when the <img> errors, swap to the
  // initial-letter fallback. We also start in fallback mode when
  // there's no poster_path at all.
  const [posterBroken, setPosterBroken] = createSignal(false);
  const showPoster = createMemo(
    () => !!props.item.poster_path && !posterBroken()
  );

  return (
    <GlassCard variant="glass" size="default" hoverable class="trash-item-card">
      <div class="trash-item-card-row">
        {/* Poster thumbnail (or fallback) */}
        <div class="trash-item-card-poster" aria-hidden="true">
          <Show
            when={showPoster()}
            fallback={
              <div class="trash-item-card-poster-fallback">
                <span class="trash-item-card-poster-initial">
                  {placeholderInitial()}
                </span>
              </div>
            }
          >
            <img
              src={tmdbImage(props.item.poster_path, "w92")}
              class="trash-item-card-poster-img"
              loading="lazy"
              decoding="async"
              alt=""
              onError={() => setPosterBroken(true)}
            />
          </Show>
        </div>

        {/* Info column */}
        <div class="trash-item-card-info">
          <div class="trash-item-card-title-row">
            <h3 class="trash-item-card-title">{title()}</h3>
            <Show when={year()}>
              <span class="trash-item-card-year">{year()}</span>
            </Show>
          </div>

          <div class="trash-item-card-meta-row">
            <GlassBadge
              intent="default"
              size="compact"
              icon={mediaIcon()}
              label={mediaLabel()}
            />
            <span class="trash-item-card-meta-dot">·</span>
            <span class="trash-item-card-meta-text">
              Deleted {formatDate(props.item.deletedAt)}
            </span>
          </div>

          <p class="trash-item-card-expiry">
            <span class="material-symbols-outlined" aria-hidden="true">
              schedule
            </span>
            Auto-deletes in {daysRemaining(props.item.expiresAt)}
          </p>
        </div>
      </div>

      {/* Action buttons — full-width row below the info */}
      <div class="trash-item-card-actions">
        <GlassButton
          variant="secondary"
          size="compact"
          fullWidth
          icon="restore"
          disabled={props.busy}
          onClick={() => props.onRestore(props.item)}
          aria-label={`Restore ${title()}`}
          class="trash-item-card-restore"
        >
          Restore
        </GlassButton>
        <GlassButton
          variant="danger"
          size="compact"
          fullWidth
          icon="delete_forever"
          disabled={props.busy}
          onClick={() => props.onDeleteForever(props.item)}
          aria-label={`Permanently delete ${title()}`}
          class="trash-item-card-delete"
        >
          Delete Forever
        </GlassButton>
      </div>
    </GlassCard>
  );
};

// ── Collection card ────────────────────────────────────────────

export interface TrashCollectionCardProps {
  collection: TrashedCollection;
  busy: boolean;
  onRestore: (col: TrashedCollection) => void;
  onDeleteForever: (col: TrashedCollection) => void;
}

export const TrashCollectionCard: Component<TrashCollectionCardProps> = (
  props
) => {
  const entryLabel = createMemo(() =>
    props.collection.entryCount === 1
      ? "1 title"
      : `${props.collection.entryCount} titles`
  );

  return (
    <GlassCard
      variant="glass"
      size="default"
      hoverable
      class="trash-item-card trash-item-card-collection"
    >
      <div class="trash-item-card-row">
        {/* Folder icon thumbnail */}
        <div
          class="trash-item-card-poster trash-item-card-poster-folder"
          aria-hidden="true"
        >
          <div class="trash-item-card-poster-fallback">
            <span class="material-symbols-outlined" aria-hidden="true">
              folder
            </span>
          </div>
        </div>

        {/* Info column */}
        <div class="trash-item-card-info">
          <div class="trash-item-card-title-row">
            <h3 class="trash-item-card-title">{props.collection.name}</h3>
          </div>

          <div class="trash-item-card-meta-row">
            <GlassBadge
              intent="default"
              size="compact"
              icon="folder"
              label="Collection"
            />
            <span class="trash-item-card-meta-dot">·</span>
            <span class="trash-item-card-meta-text">{entryLabel()}</span>
            <span class="trash-item-card-meta-dot">·</span>
            <span class="trash-item-card-meta-text">
              Deleted {formatDate(props.collection.deletedAt)}
            </span>
          </div>

          <p class="trash-item-card-expiry">
            <span class="material-symbols-outlined" aria-hidden="true">
              schedule
            </span>
            Auto-deletes in {daysRemaining(props.collection.expiresAt)}
          </p>
        </div>
      </div>

      {/* Action buttons */}
      <div class="trash-item-card-actions">
        <GlassButton
          variant="secondary"
          size="compact"
          fullWidth
          icon="restore"
          disabled={props.busy}
          onClick={() => props.onRestore(props.collection)}
          aria-label={`Restore ${props.collection.name}`}
          class="trash-item-card-restore"
        >
          Restore
        </GlassButton>
        <GlassButton
          variant="danger"
          size="compact"
          fullWidth
          icon="delete_forever"
          disabled={props.busy}
          onClick={() => props.onDeleteForever(props.collection)}
          aria-label={`Permanently delete ${props.collection.name}`}
          class="trash-item-card-delete"
        >
          Delete Forever
        </GlassButton>
      </div>
    </GlassCard>
  );
};

// ── Skeleton card (loading state) ──────────────────────────────

export const TrashItemCardSkeleton: Component = () => {
  return (
    <div class="trash-item-card trash-item-card-skeleton" aria-hidden="true">
      <div class="trash-item-card-row">
        <div class="trash-skeleton-poster" />
        <div class="trash-item-card-info">
          <div class="trash-skeleton-line trash-skeleton-line-title" />
          <div class="trash-skeleton-line trash-skeleton-line-meta" />
          <div class="trash-skeleton-line trash-skeleton-line-expiry" />
        </div>
      </div>
      <div class="trash-item-card-actions">
        <div class="trash-skeleton-btn" />
        <div class="trash-skeleton-btn" />
      </div>
    </div>
  );
};

// ── Group container (renders a labeled bucket of cards) ────────

export interface TrashGroupRendererProps {
  label: string;
  count: number;
  children: JSX.Element;
}

export const TrashGroupRenderer: Component<TrashGroupRendererProps> = (
  props
) => {
  return (
    <section class="trash-group">
      <div class="trash-group-header">
        <span class="trash-group-label">{props.label}</span>
        <span class="trash-group-count">{props.count}</span>
      </div>
      <div class="trash-group-list">{props.children}</div>
    </section>
  );
};

export default TrashVaultItemCard;
