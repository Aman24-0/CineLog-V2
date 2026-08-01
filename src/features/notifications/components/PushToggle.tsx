// src/features/notifications/components/PushToggle.tsx
//
// CineLog V2 — Push Notification Toggle + Test Button
// ---------------------------------------------------------------------
// A self-contained UI block that:
//   • Shows whether the browser supports Web Push (if not, the entire
//     block is replaced with a "Not supported in this browser" notice).
//   • Shows the current push subscription state for THIS device:
//       - Subscribed ✓  → toggle is ON, "Send test" button enabled.
//       - Not subscribed → toggle is OFF.
//       - Loading        → toggle is disabled, spinner shown.
//   • Toggling ON  → calls subscribe() (requests Notification.permission,
//     registers the push subscription, persists to Supabase).
//   • Toggling OFF → calls unsubscribe() (cancels the browser
//     subscription, deletes the row from Supabase).
//   • "Send test"  → calls sendTest() (fires a notification through the
//     server endpoint so the user can verify the full round-trip).
//
// WHY A SEPARATE COMPONENT (vs inline JSX in NotificationSection):
//   The push toggle has its own lifecycle (subscribe/unsubscribe/test)
//   and its own state (isSubscribed, isLoading, error). Wrapping it in
//   a dedicated component keeps NotificationSection.tsx focused on
//   category toggles + quiet hours + reminder lead time, and lets us
//   reuse the PushToggle on other pages (e.g. a future "Notification
//   Center" sheet could embed it).
//
// PROPS:
//   • showToast — passed in so we can fire toasts (success/error) using
//     the same toast system as the rest of the settings page. The
//     component doesn't import useToast directly to avoid creating a
//     second toast context.
// ---------------------------------------------------------------------

import { Show, createMemo, type JSX } from "solid-js";
import { usePushSubscription } from "~/features/notifications/hooks/usePushSubscription";

export interface PushToggleProps {
  /** Fire a toast (success / error / info). */
  showToast: (
    msg: string,
    type?: "success" | "error" | "info" | "action",
    durationMs?: number
  ) => void;
}

export function PushToggle(props: PushToggleProps): JSX.Element {
  const push = usePushSubscription();

  // The toggle's ON/OFF state mirrors push.isSubscribed(). When the
  // user toggles, we call subscribe() or unsubscribe() and let the
  // hook update the signal — the toggle re-renders automatically.
  const handleToggle = async (next: boolean): Promise<void> => {
    if (next === push.isSubscribed()) return;
    if (push.isLoading()) return;

    if (next) {
      const ok = await push.subscribe();
      if (ok) {
        props.showToast(
          "Push notifications enabled for this device.",
          "success"
        );
      } else {
        const err = push.error();
        props.showToast(
          err ?? "Failed to enable push notifications.",
          "error"
        );
      }
    } else {
      const ok = await push.unsubscribe();
      if (ok) {
        props.showToast("Push notifications disabled for this device.", "info");
      } else {
        const err = push.error();
        props.showToast(
          err ?? "Failed to disable push notifications.",
          "error"
        );
      }
    }
  };

  const handleTest = async (): Promise<void> => {
    if (push.isLoading()) return;
    const ok = await push.sendTest();
    if (ok) {
      props.showToast("Test notification sent.", "success");
    } else {
      const err = push.error();
      props.showToast(
        err ?? "Failed to send test notification.",
        "error"
      );
    }
  };

  // The description under the toggle reflects the current state so
  // the user always knows what's going on.
  const statusDesc = createMemo(() => {
    if (!push.isSupported()) {
      return "Not supported in this browser.";
    }
    if (push.isLoading()) {
      return "Working…";
    }
    if (push.isSubscribed()) {
      return "You'll receive notifications on this device, even when the app is closed.";
    }
    return "Get release-day reminders and weekly recaps on this device.";
  });

  return (
    <div class="setting-row-control">
      <div class="setting-row-control-header">
        <div class="setting-row-icon" aria-hidden="true">
          <span
            class="material-symbols-outlined"
            style={{ "font-size": "16px" }}
            aria-hidden="true"
          >
            notifications_active
          </span>
        </div>
        <div class="setting-row-control-meta">
          <span class="setting-row-control-label">
            Background push notifications
          </span>
          <span class="setting-row-control-desc">{statusDesc()}</span>
        </div>

        <Show
          when={push.isSupported()}
          fallback={
            <span
              style={{
                color: "var(--text-muted)",
                "font-size": "0.75rem",
              }}
            >
              Unsupported
            </span>
          }
        >
          {/* Toggle */}
          <div
            class="toggle"
            data-on={push.isSubscribed()}
            role="switch"
            aria-checked={push.isSubscribed()}
            aria-label="Background push notifications"
            data-disabled={push.isLoading() || !push.isSupported()}
            onClick={() => void handleToggle(!push.isSubscribed())}
            onKeyDown={(e) => {
              if (e.key === " " || e.key === "Enter") {
                e.preventDefault();
                void handleToggle(!push.isSubscribed());
              }
            }}
            tabindex={0}
          >
            <div class="toggle-knob" />
          </div>
        </Show>
      </div>

      {/* Test button + error message — only when subscribed */}
      <Show when={push.isSupported() && push.isSubscribed()}>
        <div
          style={{
            display: "flex",
            "flex-direction": "column",
            gap: "8px",
            "margin-top": "8px",
            "padding-left": "40px" /* aligns with the icon column */,
          }}
        >
          <button
            type="button"
            class="settings-link-btn focus-ring"
            disabled={push.isLoading()}
            onClick={() => void handleTest()}
          >
            Send test notification
          </button>
        </div>
      </Show>
    </div>
  );
}
