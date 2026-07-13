// src/features/sync/components/DangerZoneCard.tsx
//
// DangerZoneCard — the red-outlined card at the bottom of the Sync page.
//
// Contains a single action: "Reset Library" — which opens a
// confirmation bottom sheet (ResetConfirmSheet) requiring the user to
// type DELETE before the reset can proceed.
//
// This card is for development/testing and future power users. It
// permanently removes the user's entire CineLog library while keeping
// their account, profile, preferences, and achievements intact.

import { createSignal, type Component } from "solid-js";
import ResetConfirmSheet from "./ResetConfirmSheet";

const DangerZoneCard: Component = () => {
  const [showConfirm, setShowConfirm] = createSignal(false);

  return (
    <>
      <div class="sync-danger-card">
        <div class="sync-danger-header">
          <div class="sync-danger-icon" aria-hidden="true">
            <span class="material-symbols-outlined" style={{ "font-size": "22px", color: "#f87171" }} aria-hidden="true">warning</span>
          </div>
          <div class="sync-danger-text">
            <p class="sync-danger-title">Danger Zone</p>
            <p class="sync-danger-body">
              These actions permanently remove your CineLog library. This cannot be undone.
            </p>
          </div>
        </div>

        <div class="sync-danger-action">
          <div class="sync-danger-action-text">
            <p class="sync-danger-action-title">Reset Library</p>
            <p class="sync-danger-action-desc">
              Delete every movie, series, collection and watch history while keeping your account.
            </p>
          </div>
          <button
            type="button"
            class="btn-danger focus-ring"
            onClick={() => setShowConfirm(true)}
            aria-label="Reset library"
          >
            <span class="material-symbols-outlined" style={{ "font-size": "14px" }} aria-hidden="true">delete</span>
            Reset
          </button>
        </div>
      </div>

      <ResetConfirmSheet open={showConfirm()} onClose={() => setShowConfirm(false)} />
    </>
  );
};

export default DangerZoneCard;
