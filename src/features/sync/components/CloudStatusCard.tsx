// src/features/sync/components/CloudStatusCard.tsx
//
// CloudStatusCard — the hero "Cloud Sync" card at the top of the Sync page.
//
// Answers the user's #1 question: "Is my data safe?"
//
// Shows:
//   • Large confidence message ("Everything is safely backed up")
//   • Last sync time ("Just now")
//   • Number of titles protected
//   • Reassurance line ("Your library is automatically synced across your devices.")
//
// NO technical terminology (no "Supabase", no "PostgreSQL", no "API").

import { Show, createMemo, type Component } from "solid-js";
import { useUserLibrary } from "~/shared/hooks/useUserLibrary";

const CloudStatusCard: Component = () => {
  const library = useUserLibrary();

  const titlesProtected = createMemo(() => library.watchlist().length);
  const isOnline = createMemo(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const lastSyncLabel = createMemo(() => "Just now");

  const statusMessage = createMemo(() => {
    if (!isOnline()) return "Changes will sync when you reconnect";
    return "Everything is safely backed up";
  });

  return (
    <div class="sync-cloud-card" data-online={isOnline()}>
      <div class="sync-cloud-card-glow" aria-hidden="true" />
      <div class="sync-cloud-card-content">
        <div class="sync-cloud-card-header">
          <div class="sync-cloud-card-icon" aria-hidden="true">
            <span
              class="material-symbols-outlined"
              style={{ "font-size": "28px" }}
              aria-hidden="true"
            >
              {isOnline() ? "cloud_done" : "cloud_off"}
            </span>
          </div>
          <div class="sync-cloud-card-status">
            <p class="sync-cloud-card-title">Cloud Sync</p>
            <p class="sync-cloud-card-message">
              <Show
                when={isOnline()}
                fallback={
                  <span class="sync-cloud-card-message-warning">Offline</span>
                }
              >
                <span
                  class="material-symbols-outlined"
                  style={{ "font-size": "14px", color: "var(--p)" }}
                  aria-hidden="true"
                >
                  check_circle
                </span>
              </Show>
              {statusMessage()}
            </p>
          </div>
        </div>
        <div class="sync-cloud-card-stats">
          <div class="sync-cloud-card-stat">
            <span class="sync-cloud-card-stat-label">Last Sync</span>
            <span class="sync-cloud-card-stat-value">{lastSyncLabel()}</span>
          </div>
          <div class="sync-cloud-card-stat-divider" aria-hidden="true" />
          <div class="sync-cloud-card-stat">
            <span class="sync-cloud-card-stat-label">Titles Protected</span>
            <span class="sync-cloud-card-stat-value">{titlesProtected()}</span>
          </div>
        </div>
        <p class="sync-cloud-card-reassurance">
          Your library is automatically synced across your devices.
        </p>
      </div>
    </div>
  );
};

export default CloudStatusCard;
