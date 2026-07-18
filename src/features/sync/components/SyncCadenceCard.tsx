// src/features/sync/components/SyncCadenceCard.tsx
//
// SyncCadenceCard — added to the Sync page in the v2 Settings redesign.
//
// Lets the user choose how often vault changes sync to Supabase:
//   • realtime   — push on every change (default)
//   • wifi-only  — queue until on WiFi
//   • manual     — only sync when user taps "Sync now"

import { Show, createMemo, type Component } from "solid-js";
import { ControlRow, Segmented } from "~/features/settings/sharedControls";
import { useToast } from "~/shared/hooks/useToast";
import {
  syncCadence,
  setSyncCadence,
  shouldSyncNow,
  type SyncCadence,
} from "~/core/preferences";

const OPTIONS: { id: SyncCadence; label: string }[] = [
  { id: "realtime",  label: "Real-time" },
  { id: "wifi-only", label: "Wi-Fi only" },
  { id: "manual",    label: "Manual" },
];

const SyncCadenceCard: Component = () => {
  const { showToast } = useToast();

  const cadenceDesc = createMemo(() => {
    const c = syncCadence();
    if (c === "realtime") return "Push every change to the cloud instantly. Best when you have stable internet.";
    if (c === "wifi-only") return "Queue changes locally and sync only when on Wi-Fi. Saves mobile data.";
    return "Only sync when you tap 'Sync now' below. Best for low-data plans or offline use.";
  });

  return (
    <div class="setting-group">
      <ControlRow
        icon="cloud_sync"
        label="Sync cadence"
        desc={cadenceDesc()}
      >
        <Segmented
          options={OPTIONS}
          current={syncCadence}
          onChange={(id) => {
            setSyncCadence(id);
            showToast(`Sync set to ${id === "realtime" ? "real-time" : id === "wifi-only" ? "Wi-Fi only" : "manual"}`, "info", 1500);
          }}
          name="Sync cadence"
        />
      </ControlRow>
      <Show when={!shouldSyncNow()}>
        <div class="info-callout" style={{ margin: "var(--sp-2) var(--sp-5) var(--sp-3)" }}>
          <span class="material-symbols-outlined info-callout-icon" style={{ "font-size": "16px" }} aria-hidden="true">pause_circle</span>
          <p class="info-callout-body">
            <strong>Syncing is paused.</strong> Your changes are saved locally and will sync when your cadence allows.
          </p>
        </div>
      </Show>
    </div>
  );
};

export default SyncCadenceCard;
