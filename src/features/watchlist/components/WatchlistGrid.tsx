// src/features/watchlist/components/WatchlistGrid.tsx
import { For, Show, type Accessor } from "solid-js";
import Icon from "~/shared/ui/Icon";
import MovieCard from "~/shared/ui/MovieCard";
import { resolveTimelineDate } from "~/shared/utils/date";
import type { WatchlistItem } from "~/shared/types";
import VaultShelf from "./VaultShelf";
import VaultCard from "./VaultCard";
import EmptyState from "./EmptyState";
import type { VaultSection } from "../useVaultSections";

/**
 * WatchlistGrid — the grid + timeline content area of the Vault page.
 *
 * DYNAMIC LAYOUT ENGINE (v2):
 *   - Dashboard mode (status = "all", no search/filters): renders
 *     adaptive shelves (Continue Watching, Planned, Recently Completed,
 *     Dropped). Each shelf has a "See All ▾" button that switches the
 *     active status chip to that category.
 *   - Single-status mode (e.g. "Watching", "Dropped"): hides all
 *     sectional headers and renders a single flat grid containing ONLY
 *     items matching that status.
 *   - Timeline mode: grouped by Month/Year with sleek sticky glass
 *     headers (no individual day bubbles).
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
  /** The active status tab — used to switch between dashboard and single-status modes */
  activeStatusTab: Accessor<string>;
  /** Called when a "See All" button is tapped — switches the active status chip */
  onSelectStatusTab: (status: string) => void;
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
              title={props.isGuest() ? "Watchlist is Empty" : "No Matches"}
              message={
                props.isGuest()
                  ? "Sign in to start tracking movies and series."
                  : "No titles match your current filters. Try adjusting or clearing them."
              }
              actionText={
                props.isGuest() ? "Sign In to Begin" : "Clear Filters"
              }
              onAction={props.isGuest() ? props.onLogin : props.onClearFilters}
            />
          }
        >
          {/* FLAT MODE: render ONLY the raw grid of cards — no section
              headers, no "See All" buttons. The flat section from
              useVaultSections has id "all" and contains every filtered
              item. We render the grid directly without the VaultShelf
              wrapper so there's zero header chrome. */}
          <Show when={props.isFlatMode()}>
            <For each={props.sections()}>
              {(section) => (
                <div class="vault-shelf-grid" role="list">
                  <For each={section.items.slice(0, props.displayLimit())}>
                    {(m) => (
                      <div role="listitem">
                        <MovieCard
                          movie={m}
                          variant="compact"
                          search={props.search()}
                          onClick={() => props.onOpenMovie(m.id)}
                        />
                      </div>
                    )}
                  </For>
                </div>
              )}
            </For>
          </Show>

          {/* DASHBOARD MODE: adaptive shelves with headers + "See All".
              The catch-all "all" section (the last section in dashboard
              mode) gets `hideSeeAll={true}` — the ENTIRE "See All" button
              is removed from the DOM (not just the click handler), because
              "See All" would just switch to the "all" status chip which
              is already active. Other sections get "See All" which switches
              the status chip. */}
          <Show when={!props.isFlatMode()}>
            <For each={props.sections()}>
              {(section) => (
                <VaultShelf
                  section={section}
                  search={props.search}
                  onOpenMovie={props.onOpenMovie}
                  expanded={props.expandedShelves().has(section.id)}
                  onToggleExpand={() => props.onToggleShelf(section.id)}
                  maxItems={props.displayLimit()}
                  // STRICT HIDE for the catch-all "all" section — the
                  // VaultShelf component removes the entire button from
                  // the DOM when `hideSeeAll === true`, eliminating the
                  // redundant navigation affordance entirely.
                  hideSeeAll={section.id === "all"}
                  onSeeAll={
                    section.id === "all"
                      ? undefined
                      : () => {
                          const statusMap: Record<string, string> = {
                            "in-progress": "Watching",
                            watching: "Watching",
                            planned: "Planned",
                            "recently-completed": "Completed"
                          };
                          const targetStatus = statusMap[section.id] ?? "all";
                          props.onSelectStatusTab(targetStatus);
                        }
                  }
                />
              )}
            </For>
          </Show>

          {/* Infinite scroll indicator (flat mode only) */}
          <Show
            when={
              props.isFlatMode() &&
              props.filtered().length > props.displayLimit()
            }
          >
            <div
              class="type-caption flex items-center justify-center gap-2 py-8"
              style={{ color: "var(--p)" }}
            >
              <Icon
                name="progress_activity"
                class="animate-spin text-sm"
                aria-hidden="true"
              />
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

/** Inner timeline view — extracted to keep the parent under 250 lines.
 *
 * POLISHED TIMELINE (v2):
 *   - Removed individual floating day bubbles (wasted horizontal space).
 *   - Items are grouped by Month/Year with a sleek sticky glass header
 *     for each group.
 *   - Cards list underneath each header in a clean vertical flow.
 */
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
    props
      .filtered()
      .filter(
        (m) => m.status === "Completed" && resolveTimelineDate(m) !== null
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
        class="animate-fade-in relative space-y-6 pb-10"
        role="feed"
        aria-label="Watch history timeline"
      >
        {/* Vertical rail — subtle line connecting the groups */}
        <div class="timeline-rail" aria-hidden="true" />
        <For each={groupedTimeline()}>
          {(group) => (
            <div class="relative" role="group" aria-label={group.label}>
              {/* Sticky glass Month/Year header — replaces the old
                  floating day bubbles. Cleaner, less visual noise. */}
              <div class="timeline-month-pill">
                <Icon
                  name="event"
                  style={{ "font-size": "14px", color: "var(--active-text)" }}
                  aria-hidden="true"
                />
                {group.label}
              </div>
              {/* Cards in a clean vertical flow — no per-card day bubble */}
              <div class="timeline-stagger space-y-3">
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
