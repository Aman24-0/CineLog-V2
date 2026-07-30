// src/features/sync/components/SyncHistoryTimeline.tsx
//
// SyncHistoryTimeline — a timeline of recent library activity, grouped
// by day (Today, Yesterday, etc.).
//
// Answers the user's question: "When was everything synced?"
//
// DATA SOURCE: useSyncHistory, which derives entries from the user's
// watchlist timestamps. When a server-side sync log lands later, the
// hook's data source can swap without changing this component.

import { For, Show, type Component } from "solid-js";
import { useSyncHistory } from "../hooks/useSyncHistory";

const SyncHistoryTimeline: Component = () => {
  const { groups, total } = useSyncHistory();

  return (
    <div class="sync-history">
      <Show
        when={total() > 0}
        fallback={
          <div class="sync-history-empty">
            <span
              class="material-symbols-outlined"
              style={{ "font-size": "28px", color: "var(--text-dim)" }}
              aria-hidden="true"
            >
              history
            </span>
            <p class="sync-history-empty-text">
              No activity yet. Add a title to see your sync history here.
            </p>
          </div>
        }
      >
        <For each={groups().slice(0, 5)}>
          {(group) => (
            <div class="sync-history-group">
              <p class="sync-history-day">{group.dayLabel}</p>
              <div class="sync-history-entries">
                <For each={group.entries.slice(0, 6)}>
                  {(entry) => (
                    <div class="sync-history-entry">
                      <div class="sync-history-entry-icon" aria-hidden="true">
                        <span
                          class="material-symbols-outlined"
                          style={{ "font-size": "14px", color: "var(--p)" }}
                          aria-hidden="true"
                        >
                          {entry.icon}
                        </span>
                      </div>
                      <span class="sync-history-entry-label">
                        {entry.label}
                      </span>
                    </div>
                  )}
                </For>
              </div>
            </div>
          )}
        </For>
      </Show>
    </div>
  );
};

export default SyncHistoryTimeline;
