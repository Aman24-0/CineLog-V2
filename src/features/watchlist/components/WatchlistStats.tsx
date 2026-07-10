// src/features/watchlist/components/WatchlistStats.tsx
import { Show, type Accessor } from "solid-js";

/**
 * WatchlistStats — the result count context bar shown in flat mode.
 *
 * Renders only when flat mode is active (search/filters/status tab) and
 * the vault has finished loading. Shows the total count + the active
 * search query (if any), plus a "Clear filter" button when a status tab
 * is active.
 */
export interface WatchlistStatsProps {
  isFlatMode: Accessor<boolean>;
  loading: Accessor<boolean>;
  filteredCount: Accessor<number>;
  search: Accessor<string>;
  activeStatusTab: Accessor<string>;
  onClearStatusTab: () => void;
}

export default function WatchlistStats(props: WatchlistStatsProps) {
  return (
    <Show when={props.isFlatMode() && !props.loading()}>
      <div class="vault-context-bar">
        <span class="vault-context-count">
          <strong>{props.filteredCount()}</strong> title
          {props.filteredCount() !== 1 ? "s" : ""}
          <Show when={props.search()}> for "{props.search()}"</Show>
        </span>
        <Show when={props.activeStatusTab() !== "all"}>
          <button class="vault-shelf-action" onClick={props.onClearStatusTab}>
            Clear filter
          </button>
        </Show>
      </div>
    </Show>
  );
}
