// src/features/watchlist/components/VaultShelf.tsx
import {For, Show, Component} from "solid-js";
import MovieCard from "~/shared/ui/MovieCard";
import type { VaultSection } from "../useVaultSections";

interface VaultShelfProps {
  section: VaultSection;
  search: () => string;
  onOpenMovie: (id: string) => void;
  /** When the shelf is expanded (user tapped "See All"), show all items in a grid.
   *  When collapsed (default), show a horizontal rail of 6 items. */
  expanded?: boolean;
  onToggleExpand?: () => void;
  /** Maximum number of items to render in the grid view. When set, the grid
   *  renders only the first `maxItems` items instead of the entire section.
   *  Used by the infinite scroll pattern in flat mode to avoid creating
   *  hundreds of MovieCard components synchronously. Not applied to the
   *  rail view (always shows 6). */
  maxItems?: number;
}

/**
 * VaultShelf — a status-grouped section with header + rail/grid.
 *
 * ADAPTIVE DISPLAY:
 *  - By default, shows a horizontal rail of up to 6 items (quick browse)
 *  - "See All" action expands to a full grid showing all items in the section
 *  - If the section has ≤ 6 items, no "See All" action is shown (rail shows all)
 *
 * DEDUPLICATION:
 *  The shelf only renders items passed to it via `section.items`. The
 *  `useVaultSections` hook already handles deduplication — items claimed
 *  by higher-priority shelves are excluded from lower-priority shelves.
 *  The shelf itself is dedup-unaware; it just renders what it's given.
 *
 * DESIGN LANGUAGE:
 *  - Uses .vault-shelf-header with accent-bar title pattern (inherited from
 *    DashboardSection / DetailSection)
 *  - Uses .vault-shelf-rail for horizontal scroll-snap
 *  - Uses .vault-shelf-grid for expanded grid (2/4/6 columns responsive)
 *  - MovieCard variant="compact" for rail, variant="default" for grid
 *
 * The shelf is self-contained — all data comes from the VaultSection prop.
 */
const VaultShelf: Component<VaultShelfProps> = (props) => {
  const isExpanded = () => props.expanded ?? false;
  const showExpandAction = () => props.section.items.length > 6;

  const railItems = () => props.section.items.slice(0, 6);
  const gridItems = () =>
    props.maxItems != null
      ? props.section.items.slice(0, props.maxItems)
      : props.section.items;

  return (
    <section class="vault-shelf animate-fade-up" aria-label={props.section.title}>
      {/* Shelf header */}
      <div class="vault-shelf-header">
        <div class="vault-shelf-title-cluster">
          <h3 class="vault-shelf-title">
            <span
              class="material-symbols-outlined vault-shelf-title-icon"
              aria-hidden="true"
            >
              {props.section.icon}
            </span>
            {props.section.title}
          </h3>
          <span class="vault-shelf-count">{props.section.subtitle}</span>
        </div>

        <Show when={showExpandAction()}>
          <button
            type="button"
            class="vault-shelf-action"
            onClick={() => props.onToggleExpand?.()}
            aria-label={isExpanded() ? `Collapse ${props.section.title}` : `See all ${props.section.title}`}
          >
            {isExpanded() ? "Show Less" : "See All"}
            <span
              class="material-symbols-outlined"
              style={{ "font-size": "10px", transition: "transform 200ms ease-out", transform: isExpanded() ? "rotate(180deg)" : "none" }}
              aria-hidden="true"
            >
              expand_more
            </span>
          </button>
        </Show>
      </div>

      {/* Shelf content — rail (collapsed) or grid (expanded) */}
      <Show
        when={!isExpanded() && props.section.railByDefault}
        fallback={
          // Expanded grid or non-rail section
          <div class="vault-shelf-grid" role="list">
            <For each={gridItems()}>
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
        }
      >
        {/* Horizontal rail */}
        <div class="vault-shelf-rail" role="list">
          <For each={railItems()}>
            {(m) => (
              <div class="vault-shelf-card" role="listitem"
              >
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
      </Show>
    </section>
  );
};

export default VaultShelf;
