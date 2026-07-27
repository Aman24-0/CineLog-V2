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
  /**
   * Called when the user taps "See All ▾" on a shelf. The parent switches
   * the active status chip to this section's category so the grid shows
   * only that status. When provided, this REPLACES the toggleExpand
   * behavior — "See All" now navigates to the filtered view instead of
   * expanding the shelf inline.
   */
  onSeeAll?: () => void;
}

/**
 * VaultShelf — a status-grouped section with header + rail/grid.
 *
 * v2: The "See All" button now calls `onSeeAll` (if provided) to switch
 * the active status chip to this section's category, showing a flat grid
 * of only that status. When `onSeeAll` is NOT provided, falls back to
 * the original toggleExpand behavior (inline expand/collapse).
 */
const VaultShelf: Component<VaultShelfProps> = (props) => {
  const isExpanded = () => props.expanded ?? false;
  const showExpandAction = () => props.section.items.length > 6;

  const railItems = () => props.section.items.slice(0, 6);
  const gridItems = () =>
    props.maxItems != null
      ? props.section.items.slice(0, props.maxItems)
      : props.section.items;

  const handleSeeAll = () => {
    if (props.onSeeAll) {
      props.onSeeAll();
    } else {
      props.onToggleExpand?.();
    }
  };

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
            onClick={handleSeeAll}
            aria-label={isExpanded() && !props.onSeeAll ? `Collapse ${props.section.title}` : `See all ${props.section.title}`}
          >
            {/* When onSeeAll is provided, always show "See All" (navigates
                to the filtered grid). Otherwise toggle between See All / Show Less. */}
            {props.onSeeAll ? "See All" : isExpanded() ? "Show Less" : "See All"}
            <span
              class="material-symbols-outlined"
              style={{ "font-size": "10px", transition: "transform 200ms ease-out", transform: isExpanded() && !props.onSeeAll ? "rotate(180deg)" : "none" }}
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
