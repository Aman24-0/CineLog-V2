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

import { Show, createSignal, createMemo, type Component } from "solid-js";
import AccountSheet from "./AccountSheet";
import { updateEmail } from "../accountActions";
import { useAuth } from "~/shared/hooks/useAuth";
import { useFormField } from "~/shared/hooks/useFormField";
import { MutationButton, type MutationStatus } from "~/shared/ui/states";
import { ValidationMessage } from "~/shared/ui/ValidationMessage";

interface UpdateEmailSheetProps {
  open: boolean;
  onClose: () => void;
}

const UpdateEmailSheet: Component<UpdateEmailSheetProps> = (props) => {
  const { user } = useAuth();

  // Field-level validation via useFormField (validate on blur, not on every keystroke)
  const emailField = useFormField({
    initialValue: "",
    validate: (v: string) => {
      const trimmed = v.trim().toLowerCase();
      if (trimmed.length === 0) return "Email is required.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return "Enter a valid email address.";
      if (trimmed === (user()?.email ?? "").toLowerCase()) return "New email must differ from current email.";
      return null;
    },
  });

  // Keep shorthand accessors
  const newEmail = emailField.value;
  const setNewEmail = emailField.setValue;

  const [busy, setBusy] = createSignal(false);
  const [done, setDone] = createSignal(false);
  const [mutationStatus, setMutationStatus] = createSignal<MutationStatus>("idle");

  const currentEmail = () => user()?.email ?? "—";

  const isValid = createMemo(() => {
    const e = newEmail().trim().toLowerCase();
    return (
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e !== currentEmail().toLowerCase()
    );
  });

  const canSubmit = () => isValid() && !busy();

  const handleSubmit = async () => {
    // Validate on submit attempt
    if (!emailField.validate() || !canSubmit()) return;
    setMutationStatus("submitting");
    setBusy(true);
    const result = await updateEmail(newEmail());
    setBusy(false);
    if (result.success) {
      setMutationStatus("success");
      setDone(true);
    } else {
      setMutationStatus("error");
    }
  };

  const handleClose = () => {
    emailField.reset();
    setDone(false);
    setBusy(false);
    setMutationStatus("idle");
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
          <div class="flex flex-col items-center py-6 text-center">
            <div
              class="mb-4 flex h-16 w-16 items-center justify-center rounded-full"
              style={{
                background: "rgba(72, 187, 120, 0.12)",
                border: "1px solid rgba(72, 187, 120, 0.3)"
              }}
              aria-hidden="true"
            >
              <span
                class="material-symbols-outlined"
                style={{ "font-size": "32px", color: "#6ee7b7" }}
                aria-hidden="true"
              >
                mark_email_read
              </span>
            </div>
            <h4
              class="type-headline"
              style={{
                "font-size": "1rem",
                margin: "0 0 0.5rem",
                color: "var(--text-strong)"
              }}
            >
              Check your inbox
            </h4>
            <p
              class="type-body-soft"
              style={{
                margin: 0,
                "font-size": "0.8125rem",
                "max-width": "280px"
              }}
            >
              We sent a confirmation link to{" "}
              <strong style={{ color: "var(--text-strong)" }}>
                {newEmail().trim()}
              </strong>
              . Click it to finish updating your email.
            </p>
            <button
              class="btn-primary focus-ring mt-5"
              onClick={handleClose}
              style={{ "min-width": "120px" }}
            >
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
          <label class="account-sheet-label" for="new-email-input">
            New email
          </label>
          <input
            id="new-email-input"
            type="email"
            value={newEmail()}
            onInput={(e) => setNewEmail(e.currentTarget.value)}
            onBlur={() => emailField.touch()}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSubmit()) void handleSubmit();
            }}
            placeholder="you@example.com"
            autocomplete="email"
            spellcheck={false}
            class="account-sheet-input"
            aria-label="New email address"
          />
          <ValidationMessage error={emailField.error()} />
        </div>

        {/* Actions */}
        <div class="flex gap-2">
          <button
            type="button"
            class="btn-ghost focus-ring flex-1"
            onClick={handleClose}
            disabled={busy()}
          >
            Cancel
          </button>
          <MutationButton
            status={mutationStatus()}
            onClick={() => void handleSubmit()}
            idleLabel="Send Confirmation"
            submittingLabel="Sending…"
            successLabel="Sent!"
            errorLabel="Failed — retry?"
            variant="primary"
            disabled={!canSubmit() && mutationStatus() === "idle"}
            class="flex-1"
            successResetMs={0}
          />
        </div>
      </Show>
    </AccountSheet>
  );
};

export default UpdateEmailSheet;
