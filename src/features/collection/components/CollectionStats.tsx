// src/features/collection/components/CollectionStats.tsx
import { Show, type Accessor } from "solid-js";

/**
 * CollectionStats — the four-or-five-cell stats strip.
 *
 * Cells: Total / Owned / Completed / Watching (+ optional Avg Rating).
 */
export interface CollectionStatsProps {
  stats: Accessor<{
    owned: number;
    completed: number;
    watching: number;
    total: number;
    pct: number;
    avgRating: string | null;
  } | null>;
}

export default function CollectionStats(props: CollectionStatsProps) {
  return (
    <Show when={props.stats()}>
      <div class="collection-stats">
        <div class="collection-stat-cell">
          <span class="collection-stat-value">{props.stats()!.total}</span>
          <span class="collection-stat-label">Total</span>
        </div>
        <div class="collection-stat-cell">
          <span class="collection-stat-value" style={{ color: "var(--p)" }}>
            {props.stats()!.owned}
          </span>
          <span class="collection-stat-label">Owned</span>
        </div>
        <div class="collection-stat-cell">
          <span class="collection-stat-value" style={{ color: "#4ade80" }}>
            {props.stats()!.completed}
          </span>
          <span class="collection-stat-label">Completed</span>
        </div>
        <div class="collection-stat-cell">
          <span class="collection-stat-value" style={{ color: "#60a5fa" }}>
            {props.stats()!.watching}
          </span>
          <span class="collection-stat-label">Watching</span>
        </div>
        <Show when={props.stats()!.avgRating}>
          <div class="collection-stat-cell">
            <span class="collection-stat-value" style={{ color: "#f5c518" }}>
              ★ {props.stats()!.avgRating}
            </span>
            <span class="collection-stat-label">Avg Rating</span>
          </div>
        </Show>
      </div>
    </Show>
  );
}
