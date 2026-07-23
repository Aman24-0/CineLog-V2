// src/features/collections/components/ListView.tsx
import { For, Show, createMemo } from "solid-js";
import { useVault } from "~/features/watchlist/useVault";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { findInVault } from "~/shared/utils/vaultMatch";
import type {
  Collection,
  CollectionEntry,
  ViewingOrder,
  TimelineProvider,
} from "~/shared/types";
import { sortAndEnrich, groupByFranchise, type TimelineItem } from "./timelineSort";

interface ListViewProps {
  collection: Collection;
  order: ViewingOrder;
  provider?: TimelineProvider;
  onOpenEntry: (entry: CollectionEntry) => void;
  /** Batch select mode — mirrors TimelineEngine's API. */
  selectMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelected?: (entry: CollectionEntry) => void;
}

/**
 * ListView — the "List" view mode for a collection detail page.
 *
 * Companion to TimelineEngine. Same sort + grouping logic, but rendered
 * as a denser, rail-less stacked list:
 *   - For "franchise" order: a header row per franchise followed by its
 *     entries (no vertical rail, no numbered nodes).
 *   - For all other orders: a single flat list.
 *
 * This is intentional: the user explicitly asked for "two views —
 * Timeline view and List view". Timeline view keeps the rail + numbered
 * nodes; List view drops both for a more compact, scannable layout.
 *
 * Naming: the header label is ALWAYS "List" (mirroring TimelineEngine's
 * always-"Timeline" label). The active sort is conveyed by the order
 * switcher above.
 */
export default function ListView(props: ListViewProps) {
  const { watchlist } = useVault();

  const mergedEntries = createMemo(() =>
    (props.collection.entries ?? []).filter((e) => !e.isHidden),
  );

  const sortedEntries = createMemo<TimelineItem[]>(() =>
    sortAndEnrich(mergedEntries(), watchlist(), props.order),
  );

  /** Group entries for franchise mode. */
  const groupedByFranchise = createMemo(() =>
    groupByFranchise(sortedEntries(), props.order),
  );

  const titleOf = (e: CollectionEntry) => e.title || e.name || "Untitled";
  const yearOf = (e: CollectionEntry) =>
    (e.release_date || e.first_air_date || "").split("-")[0] || "";

  const isSelected = (entry: CollectionEntry): boolean => {
    if (!props.selectedIds) return false;
    return props.selectedIds.has(`${entry.media_type}:${entry.id}`);
  };

  /** Render a single entry as a compact list row. */
  const renderRow = (item: TimelineItem, index: number) => {
    const inVault = item.inVault;
    const status = item.status;
    // Status colour mirror of TimelineEntry's node colours:
    //   Completed   → green
    //   Watching    → blue
    //   in vault    → accent
    //   not in vault→ dim
    const dotColor = status === "Completed"
      ? "#4ade80"
      : status === "Watching"
        ? "#60a5fa"
        : inVault
          ? "var(--p)"
          : "var(--text-dim)";

    return (
      <div
        role="button"
        tabindex={0}
        class="universe-list-row"
        data-selected={props.selectMode && isSelected(item.entry) ? "true" : undefined}
        onClick={() => {
          if (props.selectMode) {
            props.onToggleSelected?.(item.entry);
          } else {
            props.onOpenEntry(item.entry);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (props.selectMode) props.onToggleSelected?.(item.entry);
            else props.onOpenEntry(item.entry);
          }
        }}
        aria-label={`${titleOf(item.entry)}${yearOf(item.entry) ? ` (${yearOf(item.entry)})` : ""}`}
      >
        <Show when={props.selectMode}>
          <div class="universe-list-check" aria-hidden="true">
            <Show when={isSelected(item.entry)}>
              <span class="material-symbols-outlined" style={{ "font-size": "16px", color: "var(--p)" }} aria-hidden="true">
                check_circle
              </span>
            </Show>
            <Show when={!isSelected(item.entry)}>
              <span class="material-symbols-outlined" style={{ "font-size": "16px", color: "var(--text-dim)" }} aria-hidden="true">
                radio_button_unchecked
              </span>
            </Show>
          </div>
        </Show>

        <span class="universe-list-index" style={{ color: dotColor }} aria-hidden="true">
          {index + 1}
        </span>

        <Show when={item.entry.poster_path}>
          <img
            src={tmdbImage(item.entry.poster_path, "w92")}
            class="universe-list-poster"
            loading="lazy"
            decoding="async"
            alt=""
            aria-hidden="true"
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
        </Show>

        <div class="universe-list-info">
          <p class="universe-list-title">{titleOf(item.entry)}</p>
          <p class="universe-list-meta">
            <Show when={yearOf(item.entry)}>
              <span>{yearOf(item.entry)}</span>
            </Show>
            <Show when={item.entry.entryType ?? (item.entry.media_type === "tv" ? "Series" : "Movie")}>
              <span> · {item.entry.entryType ?? (item.entry.media_type === "tv" ? "Series" : "Movie")}</span>
            </Show>
            <Show when={item.rating}>
              <span> · ★ {item.rating}</span>
            </Show>
          </p>
          <Show when={item.entry.userNote}>
            <p class="universe-list-note">{item.entry.userNote}</p>
          </Show>
        </div>

        <Show when={!inVault}>
          <span class="universe-list-missing-badge" aria-label="Not in watchlist">
            <span class="material-symbols-outlined" style={{ "font-size": "14px" }} aria-hidden="true">add</span>
          </span>
        </Show>
      </div>
    );
  };

  return (
    <div class="universe-list-section">
      <div class="universe-timeline-header">
        <div class="universe-timeline-label">
          <span
            class="material-symbols-outlined"
            style={{ "font-size": "12px", color: "var(--p)" }}
            aria-hidden="true"
          >
            list
          </span>
          List
        </div>
      </div>

      <Show
        when={props.order === "franchise" && groupedByFranchise()}
        fallback={
          <div class="universe-list-flat" role="list">
            <For each={sortedEntries()}>
              {(item, i) => (
                <div role="listitem">{renderRow(item, i())}</div>
              )}
            </For>
          </div>
        }
      >
        <For each={groupedByFranchise()!}>
          {(group) => (
            <div class="universe-list-group">
              <div class="universe-list-group-header">
                <span class="universe-list-group-name">{group.franchise}</span>
                <span class="universe-list-group-count">
                  {group.items.length} {group.items.length === 1 ? "title" : "titles"}
                </span>
              </div>
              <div class="universe-list-flat" role="list">
                <For each={group.items}>
                  {(item, i) => (
                    <div role="listitem">{renderRow(item, i())}</div>
                  )}
                </For>
              </div>
            </div>
          )}
        </For>
      </Show>
    </div>
  );
}
