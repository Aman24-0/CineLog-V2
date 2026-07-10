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
}

/**
 * TimelineEngine — universal timeline supporting all 5 viewing orders and 3 providers.
 *
 * Modes:
 *   - chronological: sorted by release_date (default)
 *   - release: same data, explicit "release order" label
 *   - saga: grouped by phase field
 *   - story: grouped by storyYear with year-range headers
 *   - custom: sorted by customOrder, respecting user overrides
 *
 * Sorting + grouping logic lives in `timelineSort.ts`. The TimelineEntry
 * row component lives in `TimelineEntry.tsx`. This file owns the
 * orchestration: merge overrides → sort+enrich → group → render.
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
  const renderMode = createMemo<"story" | "saga" | "flat">(() => {
    if (props.order === "story" && groupedByStoryYear()) return "story";
    if (props.order === "saga" && groupedByPhase()) return "saga";
    return "flat";
  });

  const label = () =>
    props.order === "saga"
      ? "By Phase"
      : props.order === "release"
        ? "Release Order"
        : props.order === "story"
          ? "Story Timeline"
          : props.order === "custom"
            ? "Custom Order"
            : "Timeline";

  return (
    <div class="universe-timeline-section">
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
                        onOpen={() => props.onOpenEntry(item.entry)}
                        titleOf={titleOf}
                        yearOf={yearOf}
                      />
                    )}
                  </For>
                </div>
              </div>
            </div>
          )}
        </For>
      </Show>

      {/* Saga mode */}
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
                        onOpen={() => props.onOpenEntry(item.entry)}
                        titleOf={titleOf}
                        yearOf={yearOf}
                      />
                    )}
                  </For>
                </div>
              </div>
            </div>
          )}
        </For>
      </Show>

      {/* Flat timeline mode (chronological, release, custom) */}
      <Show when={renderMode() === "flat"}>
        <div class="universe-timeline-wrap">
          <div class="universe-timeline-rail" aria-hidden="true" />
          <div class="universe-timeline timeline-stagger" role="list">
            <For each={sortedEntries()}>
              {(item, i) => (
                <TimelineEntry
                  item={item}
                  index={i() + 1}
                  onOpen={() => props.onOpenEntry(item.entry)}
                  titleOf={titleOf}
                  yearOf={yearOf}
                />
              )}
            </For>
          </div>
        </div>
      </Show>
    </div>
  );
}
