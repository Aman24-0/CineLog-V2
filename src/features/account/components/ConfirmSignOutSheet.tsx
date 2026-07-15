// src/features/account/components/ConfirmSignOutSheet.tsx
//
// ConfirmSignOutSheet — yes/no confirmation bottom sheet that wraps the
// destructive "Sign out" and "Sign out everywhere" actions.
//
// WHY THIS EXISTS:
//   The Sign out / Sign out everywhere buttons used to fire instantly
//   on click. Users reported accidentally tapping them and getting
//   logged out. This sheet adds a friction step:
//     1. User taps "Sign out" or "Sign out everywhere"
//     2. This sheet slides up with a short warning + two buttons
//        ("Cancel" — ghost, "Yes, sign out" — danger)
//     3. Only when "Yes, sign out" is tapped does the actual sign-out
//        call fire.
//
// The sheet is reusable for both flavors of sign-out:
//   • mode="local"    → "Sign out of this device"
//   • mode="global"   → "Sign out everywhere" (revokes ALL sessions)
//
// The sheet takes an async `onConfirm` callback that it awaits while
// showing a spinner on the confirm button. On success the sheet closes
// itself. On failure the toast is shown by the caller (signOut /
// signOutGlobal already show toasts) and the sheet stays open so the
// user can retry.

import { Show, createSignal, createMemo, type Component } from "solid-js";
import AccountSheet from "./AccountSheet";

export interface ConfirmSignOutSheetProps {
  open: boolean;
  onClose: () => void;
  /**
   * "local"  — sign out of THIS device only (Sign out button).
   * "global" — revoke ALL sessions across every device (Sign out everywhere).
   */
  mode: "local" | "global";
  /** Async callback that performs the actual sign-out. Awaits it. */
  onConfirm: () => Promise<void>;
}

const ConfirmSignOutSheet: Component<ConfirmSignOutSheetProps> = (props) => {
  const [busy, setBusy] = createSignal(false);

  // Reactive derived values — must be memos so they update when
  // props.mode changes (e.g. user opens "Sign out" sheet, closes it,
  // then opens "Sign out everywhere" sheet on the same instance).
  const title = createMemo(() =>
    props.mode === "global" ? "Sign out everywhere?" : "Sign out?",
  );
  const subtitle = createMemo(() =>
    props.mode === "global"
      ? "This revokes every session across all your devices. You'll need to sign in again on each one."
      : "You'll be signed out of CineLog on this device. Your watchlist and data are saved.",
  );
  const confirmLabel = createMemo(() =>
    props.mode === "global" ? "Yes, sign out everywhere" : "Yes, sign out",
  );

  const handleConfirm = async () => {
    if (busy()) return;
    setBusy(true);
    try {
      await props.onConfirm();
      // Close on success — failures bubble up via the caller's toast,
      // and we leave the sheet open so the user can retry.
      props.onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <AccountSheet
      open={props.open}
      onClose={() => !busy() && props.onClose()}
      title={title()}
      icon="logout"
      subtitle={subtitle()}
      danger
      busy={busy()}
      maxWidth="max-w-sm"
    >
      <div class="confirm-signout-body">
        {/* Visual warning icon */}
        <div class="confirm-signout-icon-wrap" aria-hidden="true">
          <span
            class="material-symbols-outlined"
            style={{
              "font-size": "32px",
              color: "#f87171",
              "font-variation-settings": "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 40",
            }}
            aria-hidden="true"
          >
            {props.mode === "global" ? "devices" : "logout"}
          </span>
        </div>

        {/* Action buttons — Cancel (ghost) + Confirm (danger) */}
        <div class="confirm-signout-actions">
          <button
            type="button"
            class="confirm-signout-btn confirm-signout-btn-cancel focus-ring"
            onClick={() => !busy() && props.onClose()}
            disabled={busy()}
            aria-label="Cancel sign out"
          >
            Cancel
          </button>
          <button
            type="button"
            class="confirm-signout-btn confirm-signout-btn-danger focus-ring"
            onClick={() => void handleConfirm()}
            disabled={busy()}
            aria-label={confirmLabel()}
          >
            <Show when={busy()} fallback={confirmLabel()}>
              <span
                class="material-symbols-outlined"
                style={{ "font-size": "14px", animation: "spin 1s linear infinite" }}
                aria-hidden="true"
              >
                progress_activity
              </span>
              Signing out…
            </Show>
          </button>
        </div>
      </div>
    </AccountSheet>
  );
};

export default ConfirmSignOutSheet;
