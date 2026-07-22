// src/features/account/components/UpdateEmailSheet.tsx
//
// UpdateEmailSheet — change the user's email address.
//
// Flow:
//   1. User opens sheet from Account → Security → Login Methods → Email
//   2. Sheet shows the current email (read-only) and a new-email input
//   3. User types the new email → "Send Confirmation" button enables
//   4. On submit → calls updateEmail() → Supabase sends a confirmation
//      email to the NEW address (because double_confirm_changes = true)
//   5. Sheet shows a "check your inbox" success state
//   6. The actual email change happens AFTER the user clicks the link
//      in the confirmation email — until then the old email is still
//      in use.
//
// SECURITY: this is NOT a destructive action — the user keeps access
// to their account during the transition. They can cancel the change
// by ignoring the confirmation email.

import { Show, createSignal, createMemo, createEffect, type Component } from "solid-js";
import AccountSheet from "./AccountSheet";
import { updateEmailAndUnlinkStaleOAuth } from "../accountActions";
import { useAuth } from "~/shared/hooks/useAuth";
import { getUserIdentities } from "../accountActions";
import type { UserIdentity } from "@supabase/supabase-js";

interface UpdateEmailSheetProps {
  open: boolean;
  onClose: () => void;
}

const UpdateEmailSheet: Component<UpdateEmailSheetProps> = (props) => {
  const { user } = useAuth();
  const [newEmail, setNewEmail] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [done, setDone] = createSignal(false);
  const [googleWillDisconnect, setGoogleWillDisconnect] = createSignal(false);
  const [googleIdentity, setGoogleIdentity] = createSignal<UserIdentity | null>(null);

  const currentEmail = () => user()?.email ?? "—";

  const isValid = createMemo(() => {
    const e = newEmail().trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e !== currentEmail().toLowerCase();
  });

  const canSubmit = () => isValid() && !busy();

  // Check if Google is linked with the current email, so we can warn
  // the user and auto-unlink it when they change their email.
  const checkGoogleLink = async () => {
    const ids = await getUserIdentities();
    if (ids) {
      const google = ids.find((i) => i.provider === "google");
      if (google) {
        setGoogleWillDisconnect(true);
        setGoogleIdentity(google);
      }
    }
  };

  // Check if Google is linked when the sheet opens, so we can warn
  // the user and auto-unlink it when they change their email.
  createEffect(() => {
    if (props.open) {
      void checkGoogleLink();
    }
  });

  const handleSubmit = async () => {
    if (!canSubmit()) return;
    setBusy(true);
    const result = await updateEmailAndUnlinkStaleOAuth(newEmail(), googleIdentity());
    setBusy(false);
    if (result.success) {
      setDone(true);
    }
  };

  const handleClose = () => {
    setNewEmail("");
    setDone(false);
    setBusy(false);
    setGoogleWillDisconnect(false);
    setGoogleIdentity(null);
    props.onClose();
  };

  return (
    <AccountSheet
      open={props.open}
      onClose={handleClose}
      title="Update Email"
      icon="mail"
      subtitle="We'll send a confirmation link to your new email."
      busy={busy()}
    >
      <Show
        when={!done()}
        fallback={
          <div class="flex flex-col items-center text-center py-6">
            <div
              class="w-16 h-16 rounded-full flex items-center justify-center mb-4"
              style={{ background: "rgba(72, 187, 120, 0.12)", border: "1px solid rgba(72, 187, 120, 0.3)" }}
              aria-hidden="true"
            >
              <span class="material-symbols-outlined" style={{ "font-size": "32px", color: "#6ee7b7" }} aria-hidden="true">
                mark_email_read
              </span>
            </div>
            <h4 class="type-headline" style={{ "font-size": "1rem", margin: "0 0 0.5rem", color: "var(--text-strong)" }}>
              Check your inbox
            </h4>
            <p class="type-body-soft" style={{ margin: 0, "font-size": "0.8125rem", "max-width": "280px" }}>
              We sent a confirmation link to <strong style={{ color: "var(--text-strong)" }}>{newEmail().trim()}</strong>.
              Click it to finish updating your email.
            </p>
            <button class="btn-primary focus-ring mt-5" onClick={handleClose} style={{ "min-width": "120px" }}>
              Done
            </button>
          </div>
        }
      >
        {/* Current email — read-only */}
        <div style={{ "margin-bottom": "1rem" }}>
          <label class="account-sheet-label">Current email</label>
          <div class="account-sheet-readonly">{currentEmail()}</div>
        </div>

        {/* New email */}
        <div style={{ "margin-bottom": "1.5rem" }}>
          <label class="account-sheet-label" for="new-email-input">New email</label>
          <input
            id="new-email-input"
            type="email"
            value={newEmail()}
            onInput={(e) => setNewEmail(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && canSubmit()) void handleSubmit(); }}
            placeholder="you@example.com"
            autocomplete="email"
            spellcheck={false}
            class="account-sheet-input"
            aria-label="New email address"
          />
          <Show when={newEmail() && !isValid()}>
            <p class="account-sheet-hint account-sheet-hint-warn">
              <span class="material-symbols-outlined" style={{ "font-size": "12px" }} aria-hidden="true">info</span>
              Enter a valid email different from your current one.
            </p>
          </Show>
          {/* Google disconnect warning */}
          <Show when={googleWillDisconnect() && isValid()}>
            <p class="account-sheet-hint account-sheet-hint-warn">
              <span class="material-symbols-outlined" style={{ "font-size": "12px" }} aria-hidden="true">warning</span>
              Your Google login ({currentEmail()}) will be disconnected after you change your email, so you can reconnect with your new Gmail.
            </p>
          </Show>
        </div>

        {/* Actions */}
        <div class="flex gap-2">
          <button
            type="button"
            class="btn-ghost flex-1 focus-ring"
            onClick={handleClose}
            disabled={busy()}
          >
            Cancel
          </button>
          <button
            type="button"
            class="btn-primary flex-1 focus-ring"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit()}
          >
            <Show when={busy()} fallback="Send Confirmation">
              <span class="material-symbols-outlined" style={{ "font-size": "14px", animation: "spin 1s linear infinite" }} aria-hidden="true">
                progress_activity
              </span>
              Sending…
            </Show>
          </button>
        </div>
      </Show>
    </AccountSheet>
  );
};

export default UpdateEmailSheet;
