// src/features/watchlist/components/WatchlistGrid.tsx
import { For, Show, type Accessor } from "solid-js";
import Icon from "~/shared/ui/Icon";
import { resolveTimelineDate } from "~/shared/utils/date";
import type { WatchlistItem } from "~/shared/types";
import VaultShelf from "./VaultShelf";
import VaultCard from "./VaultCard";
import EmptyState from "./EmptyState";
import type { VaultSection } from "../useVaultSections";

/**
 * WatchlistGrid — the grid + timeline content area of the Vault page.
 *
 * Two view modes:
 *   - "grid": adaptive shelves (default) OR flat grid (search/filter mode)
 *   - "timeline": completed titles grouped by month, with a vertical rail
 *
 * Empty states:
 *   - Guest + empty vault → "Sign In to Begin" CTA
 *   - Authenticated + no matches → "Clear Filters" CTA
 *   - Timeline + no dated titles → "No Dates Found" with "Clear Filters"
 */
export interface WatchlistGridProps {
  viewMode: Accessor<"grid" | "timeline">;
  loading: Accessor<boolean>;
  error: Accessor<string | null>;
  isGuest: Accessor<boolean>;
  filtered: Accessor<WatchlistItem[]>;
  sections: Accessor<VaultSection[]>;
  search: Accessor<string>;
  isFlatMode: Accessor<boolean>;
  displayLimit: Accessor<number>;
  expandedShelves: Accessor<Set<string>>;
  onToggleShelf: (id: string) => void;
  onOpenMovie: (id: string) => void;
  onLogin: () => void;
  onClearFilters: () => void;
  onReload: () => void;
}

export default function WatchlistGrid(props: WatchlistGridProps) {
  return (
    <Show
      when={props.viewMode() === "timeline"}
      fallback={
        <Show
          when={props.filtered().length > 0}
          fallback={
            <EmptyState
              isGuest={props.isGuest()}
              onLogin={props.onLogin}
              title={props.isGuest() ? "Vault is Empty" : "No Matches"}
              message={
                props.isGuest()
                  ? "Sign in to start tracking movies and series."
                  : "No titles match your current filters. Try adjusting or clearing them."
              }
              actionText={props.isGuest() ? "Sign In to Begin" : "Clear Filters"}
              onAction={props.isGuest() ? props.onLogin : props.onClearFilters}
            />
          }
        >
          {/* Adaptive shelves (default) or flat grid (search/filter mode) */}
          <For each={props.sections()}>
            {(section) => (
              <VaultShelf
                section={section}
                search={props.search}
                onOpenMovie={props.onOpenMovie}
                expanded={props.expandedShelves().has(section.id)}
                onToggleExpand={() => props.onToggleShelf(section.id)}
              />
            )}
          </For>

          {/* Infinite scroll indicator (flat mode only) */}
          <Show when={props.isFlatMode() && props.filtered().length > props.displayLimit()}>
            <div
              class="flex items-center justify-center gap-2 py-8 type-caption"
              style="color: var(--p)"
            >
              <Icon name="progress_activity" class="animate-spin text-sm" aria-hidden="true" />
              <span>Loading more titles…</span>
            </div>
          </Show>
        </Show>
      }
    >
      <TimelineView
        filtered={props.filtered}
        displayLimit={props.displayLimit}
        isGuest={props.isGuest}
        onLogin={props.onLogin}
        onClearFilters={props.onClearFilters}
        onOpenMovie={props.onOpenMovie}
      />
    </Show>
  );
}

/** Inner timeline view — extracted to keep the parent under 250 lines. */
interface TimelineViewProps {
  filtered: Accessor<WatchlistItem[]>;
  displayLimit: Accessor<number>;
  isGuest: Accessor<boolean>;
  onLogin: () => void;
  onClearFilters: () => void;
  onOpenMovie: (id: string) => void;
}

function TimelineView(props: TimelineViewProps) {
  const timelineItems = () =>
    props.filtered().filter(
      (m) => m.status === "Completed" && resolveTimelineDate(m) !== null,
    );

  const groupedTimeline = () => {
    const list = timelineItems().slice(0, props.displayLimit());
    const groups: { label: string; items: WatchlistItem[] }[] = [];
    let currentGroup: { label: string; items: WatchlistItem[] } | null = null;
    list.forEach((m) => {
      const dateObj = resolveTimelineDate(m);
      const monthYear = !dateObj
        ? "Unknown Date"
        : dateObj.toLocaleString("en-US", { month: "long", year: "numeric" });
      if (!currentGroup || currentGroup.label !== monthYear) {
        currentGroup = { label: monthYear, items: [] };
        groups.push(currentGroup);
      }
      currentGroup.items.push(m);
    });
    return groups;
  };

  return (
    <Show
      when={timelineItems().length > 0}
      fallback={
        <EmptyState
          isGuest={props.isGuest()}
          onLogin={props.onLogin}
          title="No Dates Found"
          message="Timeline shows completed titles with a Watch Date set. Add dates in the edit panel."
          actionText="Clear Filters"
          onAction={props.onClearFilters}
        />
      }
    >
      <div
        class="relative space-y-8 animate-fade-in pb-10"
        role="feed"
        aria-label="Watch history timeline"
      >
        <div class="timeline-rail" aria-hidden="true" />
        <For each={groupedTimeline()}>
          {(group) => (
            <div class="relative" role="group" aria-label={group.label}>
              <div class="timeline-month-pill">
                <Icon
                  name="event"
                  style="font-size: 14px; color: var(--active-text)"
                  aria-hidden="true"
                />
                {group.label}
              </div>
              <div class="space-y-3 timeline-stagger">
                <For each={group.items}>
                  {(m) => (
                    <VaultCard
                      item={m}
                      date={resolveTimelineDate(m)}
                      onOpenMovie={props.onOpenMovie}
                    />
                  )}
                </For>
              </div>
            </div>
          )}
        </For>
      </div>
    </Show>
  );
}
