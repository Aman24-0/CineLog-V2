// src/features/collections/components/TimelineEngine.tsx
import { For, Show, createMemo, createSignal } from "solid-js";
import { useVault } from "~/features/watchlist/useVault";
import { useModalState } from "~/shared/hooks/useModalState";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { findInVault } from "~/shared/utils/vaultMatch";
import type { Collection, CollectionEntry, ViewingOrder, TimelineProvider, WatchlistItem, UniversePreferences } from "~/shared/types";

interface TimelineEngineProps {
  collection: Collection;
  order: ViewingOrder;
  provider?: TimelineProvider;
  overrides?: Record<string, Partial<CollectionEntry>>;
  onOpenEntry: (entry: CollectionEntry) => void;
}

interface TimelineItem {
  entry: CollectionEntry;
  vaultItem: WatchlistItem | null;
  inVault: boolean;
  status: string | null;
  rating: number | null;
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
 */
export default function TimelineEngine(props: TimelineEngineProps) {
  const { watchlist } = useVault();

  /** Apply user overrides to entries */
  const mergedEntries = createMemo(() => {
    const overrides = props.overrides ?? {};
    return props.collection.entries.map((e) => {
      const override = overrides[`${e.media_type}/${e.id}`];
      if (!override) return e;
      return { ...e, ...override };
    }).filter((e) => !e.isHidden);
  });

  /** Sort entries based on current viewing order */
  const sortedEntries = createMemo<TimelineItem[]>(() => {
    const entries = mergedEntries();
    const vault = watchlist();
    const order = props.order;

    const sorted = [...entries];

    switch (order) {
      case "release":
        sorted.sort((a, b) => {
          const dateA = a.release_date || a.first_air_date || "";
          const dateB = b.release_date || b.first_air_date || "";
          return dateA.localeCompare(dateB);
        });
        break;
      case "chronological":
        // Use the curated order (default from data)
        sorted.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        break;
      case "saga":
        sorted.sort((a, b) => {
          const phaseA = a.phase ?? "Other";
          const phaseB = b.phase ?? "Other";
          if (phaseA !== phaseB) return phaseA.localeCompare(phaseB);
          return (a.order ?? 0) - (b.order ?? 0);
        });
        break;
      case "story":
        sorted.sort((a, b) => {
          const yearA = a.storyYear ?? 9999;
          const yearB = b.storyYear ?? 9999;
          if (yearA !== yearB) return yearA - yearB;
          return (a.order ?? 0) - (b.order ?? 0);
        });
        break;
      case "custom":
        sorted.sort((a, b) => {
          // Pinned items first
          if (a.isPinned && !b.isPinned) return -1;
          if (!a.isPinned && b.isPinned) return 1;
          return (a.customOrder ?? a.order ?? 0) - (b.customOrder ?? b.order ?? 0);
        });
        break;
    }

    return sorted.map((e) => {
      const vaultItem = findInVault(vault, { id: e.id, media_type: e.media_type });
      return {
        entry: e,
        vaultItem,
        inVault: vaultItem !== null,
        status: vaultItem?.status ?? null,
        rating: vaultItem?.rating ?? null
      };
    });
  });

  /** Group entries for saga/phase mode */
  const groupedByPhase = createMemo(() => {
    if (props.order !== "saga") return null;
    const items = sortedEntries();
    const groups: { phase: string; items: TimelineItem[] }[] = [];
    let current: { phase: string; items: TimelineItem[] } | null = null;
    for (const item of items) {
      const phase = item.entry.phase ?? "Other";
      if (!current || current.phase !== phase) {
        current = { phase, items: [] };
        groups.push(current);
      }
      current.items.push(item);
    }
    return groups;
  });

  /** Group entries for story/year mode */
  const groupedByStoryYear = createMemo(() => {
    if (props.order !== "story") return null;
    const items = sortedEntries();
    const groups: { yearLabel: string; items: TimelineItem[] }[] = [];
    let current: { yearLabel: string; items: TimelineItem[] } | null = null;
    for (const item of items) {
      const sy = item.entry.storyYear;
      let yearLabel: string;
      if (sy === undefined || sy === null) {
        yearLabel = "Unknown";
      } else if (sy < 0) {
        yearLabel = `${Math.abs(sy)} BBY`;
      } else if (sy === 0) {
        yearLabel = "0 BBY / ABY";
      } else {
        yearLabel = `${sy} ABY`;
      }
      // For non-Star-Wars, use regular year format
      if (sy !== undefined && sy !== null && sy > 1800) {
        yearLabel = `${sy}`;
      }
      if (!current || current.yearLabel !== yearLabel) {
        current = { yearLabel, items: [] };
        groups.push(current);
      }
      current.items.push(item);
    }
    return groups;
  });

  const titleOf = (e: CollectionEntry) => e.title || e.name || "Untitled";
  const yearOf = (e: CollectionEntry) => (e.release_date || e.first_air_date || "").split("-")[0] || "";

  /** Determine which render mode to use */
  const renderMode = createMemo<"story" | "saga" | "flat">(() => {
    if (props.order === "story" && groupedByStoryYear()) return "story";
    if (props.order === "saga" && groupedByPhase()) return "saga";
    return "flat";
  });

  return (
    <div class="universe-timeline-section">
      <div class="universe-timeline-label">
        <span class="material-symbols-outlined" style="font-size: 12px; color: var(--p)" aria-hidden="true">timeline</span>
        {props.order === "saga" ? "By Phase" : props.order === "release" ? "Release Order" : props.order === "story" ? "Story Timeline" : props.order === "custom" ? "Custom Order" : "Timeline"}
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

/* ---------- Timeline Entry Component ---------- */
interface TimelineEntryProps {
  item: {
    entry: CollectionEntry;
    inVault: boolean;
    status: string | null;
    rating: number | null;
  };
  index: number;
  onOpen: () => void;
  titleOf: (e: CollectionEntry) => string;
  yearOf: (e: CollectionEntry) => string;
}

function TimelineEntry(props: TimelineEntryProps) {
  return (
    <button
      type="button"
      class={`universe-timeline-item${!props.item.inVault ? " universe-timeline-missing" : ""}${props.item.entry.isPinned ? " universe-timeline-pinned" : ""}`}
      role="listitem"
      onClick={() => props.onOpen()}
      aria-label={`${props.titleOf(props.item.entry)}${props.yearOf(props.item.entry) ? `, ${props.yearOf(props.item.entry)}` : ""} — open details`}
    >
      <div class={`universe-timeline-node${props.item.status === "Completed" ? " universe-timeline-node-completed" : ""}${props.item.status === "Watching" ? " universe-timeline-node-watching" : ""}`}>
        {props.index}
      </div>

      <div class="universe-timeline-poster">
        <Show
          when={props.item.entry.poster_path}
          fallback={
            <div class="universe-timeline-poster-fallback" aria-hidden="true">
              <span class="material-symbols-outlined" style="font-size: 20px; color: var(--text-dim)" aria-hidden="true">movie</span>
            </div>
          }
        >
          <img
            src={tmdbImage(props.item.entry.poster_path, "w185")}
            class="universe-timeline-poster-img"
            loading="lazy"
            decoding="async"
            alt=""
            aria-hidden="true"
          />
        </Show>
        <Show when={props.item.status === "Completed"}>
          <span class="universe-timeline-status universe-timeline-status-completed" aria-label="Completed">
            <span class="material-symbols-outlined" style="font-size: 10px" aria-hidden="true">check</span>
          </span>
        </Show>
        <Show when={props.item.status === "Watching"}>
          <span class="universe-timeline-status universe-timeline-status-watching" aria-label="Watching" />
        </Show>
      </div>

      <div class="universe-timeline-info">
        <p class="universe-timeline-title">{props.titleOf(props.item.entry)}</p>
        <div class="universe-timeline-meta-row">
          <span class="universe-timeline-meta">
            {props.yearOf(props.item.entry) ? `${props.yearOf(props.item.entry)} · ` : ""}
            {props.item.entry.media_type === "tv" ? "Series" : "Movie"}
          </span>
          <Show when={props.item.entry.entryType}>
            <span class="universe-timeline-entry-type">{props.item.entry.entryType}</span>
          </Show>
          <Show when={props.item.entry.isPinned}>
            <span class="universe-timeline-pinned-badge" aria-label="Pinned">
              <span class="material-symbols-outlined" style="font-size: 12px; color: var(--p)" aria-hidden="true">push_pin</span>
            </span>
          </Show>
        </div>
        <Show when={props.item.rating && props.item.rating > 0}>
          <p class="universe-timeline-user-rating">
            <span style="color: var(--p)">★ Your {props.item.rating}</span>
          </p>
        </Show>
        <Show when={props.item.entry.userNote}>
          <p class="universe-timeline-note">{props.item.entry.userNote}</p>
        </Show>
      </div>

      <Show when={!props.item.inVault}>
        <span class="universe-timeline-missing-badge" aria-label="Not in vault">
          <span class="material-symbols-outlined" style="font-size: 14px" aria-hidden="true">add</span>
        </span>
      </Show>
    </button>
  );
}
