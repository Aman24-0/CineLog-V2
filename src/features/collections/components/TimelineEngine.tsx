// src/features/collections/components/TimelineEngine.tsx
import { For, Show, createMemo } from "solid-js";
import { useVault } from "~/features/watchlist/useVault";
import type {
  Collection,
  CollectionEntry,
  ViewingOrder,
  TimelineProvider,
} from "~/shared/types";
import TimelineEntry from "./TimelineEntry";
import {
  sortAndEnrich,
  groupByFranchise,
  groupByPhase,
  groupByStoryYear,
  type TimelineItem,
} from "./timelineSort";

interface TimelineEngineProps {
  collection: Collection;
  order: ViewingOrder;
  provider?: TimelineProvider;
  overrides?: Record<string, Partial<CollectionEntry>>;
  onOpenEntry: (entry: CollectionEntry) => void;
  // ── Batch Select Mode (v2.1) ──
  selectMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelected?: (entry: CollectionEntry) => void;
  onEdit?: () => void;
}

/**
 * TimelineEngine — universal timeline supporting the 3 unified viewing
 * orders: Storyline, Release Year, Franchise.
 *
 * Naming (single source of truth, v3):
 *   - The header label MATCHES the active sort label so the user sees
 *     the same word in the filter pills above and in the section header.
 *     This removes the previous inconsistency where the order button
 *     said "Chronological" but the section header said "Timeline" for
 *     the same concept.
 *   - The header label is derived from `props.collection.viewingOrders`
 *     (same data the UniverseDashboard order-switcher uses).
 */
export default function TimelineEngine(props: TimelineEngineProps) {
  const { watchlist } = useVault();

  /** Apply user overrides to entries, then filter hidden. */
  const mergedEntries = createMemo(() => {
    const overrides = props.overrides ?? {};
    return (props.collection.entries ?? [])
      .map((e) => {
        const override = overrides[`${e.media_type}/${e.id}`];
        if (!override) return e;
        return { ...e, ...override };
      })
      .filter((e) => !e.isHidden);
  });

  /** Sort entries based on current viewing order, enrich with vault status. */
  const sortedEntries = createMemo<TimelineItem[]>(() =>
    sortAndEnrich(mergedEntries(), watchlist(), props.order),
  );

  /** Group entries for franchise mode. */
  const groupedByFranchise = createMemo(() =>
    groupByFranchise(sortedEntries(), props.order),
  );

  /** Group entries for saga/phase mode. */
  const groupedByPhase = createMemo(() =>
    groupByPhase(sortedEntries(), props.order),
  );

  /** Group entries for story/year mode. */
  const groupedByStoryYear = createMemo(() =>
    groupByStoryYear(sortedEntries(), props.order),
  );

  const titleOf = (e: CollectionEntry) => e.title || e.name || "Untitled";
  const yearOf = (e: CollectionEntry) =>
    (e.release_date || e.first_air_date || "").split("-")[0] || "";

  /** Determine which render mode to use. */
  const renderMode = createMemo<"franchise" | "story" | "saga" | "flat">(() => {
    if (props.order === "franchise" && groupedByFranchise()) return "franchise";
    if (props.order === "story" && groupedByStoryYear()) return "story";
    if (props.order === "saga" && groupedByPhase()) return "saga";
    return "flat";
  });

  // Section header label — matches the active sort label exactly so the
  // user sees the same word in the order-switch pills and the section
  // header. Falls back to "Timeline" only when no matching order is found
  // (e.g. for legacy user collections without viewingOrders).
  const label = createMemo(() => {
    const orders = props.collection.viewingOrders ?? [];
    const match = orders.find((o) => o.id === props.order);
    if (match) return match.label;
    // Legacy fallbacks for old user collections.
    if (props.order === "chronological") return "Storyline";
    if (props.order === "release") return "Release Year";
    if (props.order === "franchise") return "Franchise";
    return "Timeline";
  });

  // The active sort decides what to show on the LEFT side of each entry.
  // For "story" we show the incident_year (the in-universe year the
  // movie takes place). For all other sorts we show the 1-based index.
  const useIncidentYear = createMemo(() => props.order === "story");

  const isSelected = (entry: CollectionEntry): boolean => {
    if (!props.selectedIds) return false;
    return props.selectedIds.has(`${entry.media_type}:${entry.id}`);
  };

  return (
    <div class="universe-timeline-section">
      {/* Header row: section label (matches the active sort, e.g.
          "Storyline" / "Release Year" / "Franchise") + Edit button (right) */}
      <div class="universe-timeline-header">
        <div class="universe-timeline-label">
          <span
            class="material-symbols-outlined"
            style={{"font-size":"12px","color":"var(--p)"}}
            aria-hidden="true"
          >
            timeline
          </span>
          {label()}
        </div>
        <Show when={props.onEdit}>
          <button
            type="button"
            class="universe-timeline-edit-btn focus-ring"
            onClick={() => props.onEdit!()}
            aria-label="Edit timeline"
          >
            <span class="material-symbols-outlined" style={{"font-size":"14px"}} aria-hidden="true">edit</span>
            Edit
          </button>
        </Show>
      </div>

      {/* Franchise mode — group by movie series (Iron Man, Thor, etc.) */}
      <Show when={renderMode() === "franchise"}>
        <For each={groupedByFranchise()!}>
          {(group) => (
            <div class="universe-phase-group">
              <div class="universe-phase-header">
                <span class="universe-phase-name">{group.franchise}</span>
                <span class="universe-phase-count">{group.items.length} {group.items.length === 1 ? "title" : "titles"}</span>
              </div>
              <div class="universe-timeline-wrap">
                <div class="universe-timeline-rail" aria-hidden="true" />
                <div class="universe-timeline timeline-stagger" role="list">
                  <For each={group.items}>
                    {(item, i) => (
                      <TimelineEntry
                        item={item}
                        index={i() + 1}
                        showIncidentYear={useIncidentYear()}
                        onOpen={() => props.onOpenEntry(item.entry)}
                        titleOf={titleOf}
                        yearOf={yearOf}
                        selectMode={props.selectMode}
                        selected={isSelected(item.entry)}
                        onToggleSelect={() => props.onToggleSelected?.(item.entry)}
                      />
                    )}
                  </For>
                </div>
              </div>
            </div>
          )}
        </For>
      </Show>

      {/* Story mode */}
      <Show when={renderMode() === "story"}>
        <For each={groupedByStoryYear()!}>
          {(group) => (
            <div class="universe-story-group">
              <div class="universe-story-year-header">
                <span class="universe-story-year-label">{group.yearLabel}</span>
                <span class="universe-story-year-count">{group.items.length}</span>
              </div>
              <div class="universe-timeline-wrap">
                <div class="universe-timeline-rail" aria-hidden="true" />
                <div class="universe-timeline timeline-stagger" role="list">
                  <For each={group.items}>
                    {(item, i) => (
                      <TimelineEntry
                        item={item}
                        index={i() + 1}
                        showIncidentYear={useIncidentYear()}
                        onOpen={() => props.onOpenEntry(item.entry)}
                        titleOf={titleOf}
                        yearOf={yearOf}
                        selectMode={props.selectMode}
                        selected={isSelected(item.entry)}
                        onToggleSelect={() => props.onToggleSelected?.(item.entry)}
                      />
                    )}
                  </For>
                </div>
              </div>
            </div>
          )}
        </For>
      </Show>

      {/* Saga mode (legacy) */}
      <Show when={renderMode() === "saga"}>
        <For each={groupedByPhase()!}>
          {(group) => (
            <div class="universe-phase-group">
              <div class="universe-phase-header">
                <span class="universe-phase-name">{group.phase}</span>
                <span class="universe-phase-count">{group.items.length} titles</span>
              </div>
              <div class="universe-timeline-wrap">
                <div class="universe-timeline-rail" aria-hidden="true" />
                <div class="universe-timeline timeline-stagger" role="list">
                  <For each={group.items}>
                    {(item, i) => (
                      <TimelineEntry
                        item={item}
                        index={i() + 1}
                        showIncidentYear={useIncidentYear()}
                        onOpen={() => props.onOpenEntry(item.entry)}
                        titleOf={titleOf}
                        yearOf={yearOf}
                        selectMode={props.selectMode}
                        selected={isSelected(item.entry)}
                        onToggleSelect={() => props.onToggleSelected?.(item.entry)}
                      />
                    )}
                  </For>
                </div>
              </div>
            </div>
          )}
        </For>
      </Show>

      {/* Flat timeline mode (storyline without year grouping, release, custom) */}
      <Show when={renderMode() === "flat"}>
        <div class="universe-timeline-wrap">
          <div class="universe-timeline-rail" aria-hidden="true" />
          <div class="universe-timeline timeline-stagger" role="list">
            <For each={sortedEntries()}>
              {(item, i) => (
                <TimelineEntry
                  item={item}
                  index={i() + 1}
                  showIncidentYear={useIncidentYear()}
                  onOpen={() => props.onOpenEntry(item.entry)}
                  titleOf={titleOf}
                  yearOf={yearOf}
                  selectMode={props.selectMode}
                  selected={isSelected(item.entry)}
                  onToggleSelect={() => props.onToggleSelected?.(item.entry)}
                />
              )}
            </For>
          </div>
        </div>
      </Show>
    </div>
  );
}
