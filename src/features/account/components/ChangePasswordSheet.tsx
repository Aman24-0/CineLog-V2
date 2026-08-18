// src/features/account/components/ChangePasswordSheet.tsx
//
// ChangePasswordSheet — change the user's password.
//
// Flow:
//   1. User opens sheet from Account → Security → Login Methods → Email
//   2. Three inputs: current password (optional), new password, confirm
//   3. Strength meter on the new-password input (length + variety)
//   4. Submit → changePassword() → success state
//   5. Includes a "Forgot password?" link that calls sendPasswordResetEmail
//
// SECURITY: the Supabase project has `secure_password_change = false`,
// so `currentPassword` is technically optional. We still ask for it
// in the UI when the user has an email identity linked — it's an
// extra layer of protection against session hijack → password change.
// Users who only have OAuth linked (no email/password identity) see
// a "set password" mode instead (no current-password field).

import { Show, createSignal, createMemo, For, type Component } from "solid-js";
import AccountSheet from "./AccountSheet";
import { changePassword, sendPasswordResetEmail } from "../accountActions";
import { useAuth } from "~/shared/hooks/useAuth";
import { useFormField } from "~/shared/hooks/useFormField";
import { MutationButton, type MutationStatus } from "~/shared/ui/states";
import { ValidationMessage } from "~/shared/ui/ValidationMessage";

interface ChangePasswordSheetProps {
  open: boolean;
  onClose: () => void;
}

/** Password strength estimate — 0 to 4. Purely heuristic. */
function passwordStrength(pw: string): {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
} {
  if (!pw) return { score: 0, label: "—" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  const labels = ["Too short", "Weak", "Fair", "Strong", "Excellent"];
  return { score: score as 0 | 1 | 2 | 3 | 4, label: labels[score] };
}

const ChangePasswordSheet: Component<ChangePasswordSheetProps> = (props) => {
  const { user } = useAuth();

  // Field-level validation via useFormField (validate on blur, not on every keystroke)
  const currentPwField = useFormField({
    initialValue: "",
    validate: (v: string) => v.length === 0 ? "Current password is required." : null,
  });
  const newPwField = useFormField({
    initialValue: "",
    validate: (v: string) => {
      if (v.length === 0) return "New password is required.";
      if (v.length < 8) return "Must be at least 8 characters.";
      return null;
    },
  });
  const confirmPwField = useFormField({
    initialValue: "",
    validate: (v: string) => {
      if (v.length === 0) return "Please confirm your new password.";
      if (v !== newPwField.value()) return "Passwords don't match.";
      return null;
    },
  });

  // Keep shorthand accessors for backward compatibility with existing template
  const currentPw = currentPwField.value;
  const setCurrentPw = currentPwField.setValue;
  const newPw = newPwField.value;
  const setNewPw = newPwField.setValue;
  const confirmPw = confirmPwField.value;
  const setConfirmPw = confirmPwField.setValue;

  const [showCurrent, setShowCurrent] = createSignal(false);
  const [showNew, setShowNew] = createSignal(false);
  const [showConfirm, setShowConfirm] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [done, setDone] = createSignal(false);
  const [resetSent, setResetSent] = createSignal(false);
  const [mutationStatus, setMutationStatus] = createSignal<MutationStatus>("idle");
  const [resetBusy, setResetBusy] = createSignal(false);

  // If the user has no "email" identity linked, they're setting a
  // password for the first time — no current-password field needed.
  const hasEmailIdentity = () => (user()?.providers ?? []).includes("email");
  const mode = () => (hasEmailIdentity() ? "change" : "set");

  const strength = createMemo(() => passwordStrength(newPw()));
  const passwordsMatch = createMemo(
    () => newPw() === confirmPw() && newPw().length > 0
  );
  const canSubmit = createMemo(() => {
    if (busy()) return false;
    if (newPw().length < 8) return false;
    if (!passwordsMatch()) return false;
    if (mode() === "change" && currentPw().length === 0) return false;
    return true;
  });

  const handleSubmit = async () => {
    // Validate all fields on submit attempt
    const fieldsValid = [
      mode() === "change" ? currentPwField.validate() : true,
      newPwField.validate(),
      confirmPwField.validate(),
    ].every(Boolean);
    if (!fieldsValid || !canSubmit()) return;
    setMutationStatus("submitting");
    setBusy(true);
    const result = await changePassword(
      newPw(),
      mode() === "change" ? currentPw() : undefined
    );
    setBusy(false);
    if (result.success) {
      setMutationStatus("success");
      setDone(true);
    } else {
      setMutationStatus("error");
    }
  };

  const handleForgotPassword = async () => {
    const email = user()?.email;
    if (!email || resetBusy()) return;
    setResetBusy(true);
    const result = await sendPasswordResetEmail(email);
    setResetBusy(false);
    if (result.success) setResetSent(true);
  };

  const handleClose = () => {
    currentPwField.reset();
    newPwField.reset();
    confirmPwField.reset();
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);
    setDone(false);
    setResetSent(false);
    setBusy(false);
    setMutationStatus("idle");
    setResetBusy(false);
    props.onClose();
  };

  return (
    <AccountSheet
      open={props.open}
      onClose={handleClose}
      title={mode() === "change" ? "Change Password" : "Set Password"}
      icon="lock"
      subtitle={
        mode() === "change"
          ? "Pick a strong password you don't use anywhere else."
          : "Set a password so you can sign in with email + password."
      }
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
                check_circle
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
              Password {mode() === "change" ? "Updated" : "Set"}
            </h4>
            <p
              class="type-body-soft"
              style={{
                margin: 0,
                "font-size": "0.8125rem",
                "max-width": "280px"
              }}
            >
              Use this password next time you sign in with email.
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
        {/* Current password — only in "change" mode */}
        <Show when={mode() === "change"}>
          <div style={{ "margin-bottom": "1rem" }}>
            <label class="account-sheet-label" for="current-pw-input">
              Current password
            </label>
            <div class="account-sheet-input-wrap">
              <input
                id="current-pw-input"
                type={showCurrent() ? "text" : "password"}
                value={currentPw()}
                onInput={(e) => setCurrentPw(e.currentTarget.value)}
                onBlur={() => currentPwField.touch()}
                placeholder="Enter current password"
                autocomplete="current-password"
                spellcheck={false}
                class="account-sheet-input account-sheet-input-with-action"
                aria-label="Current password"
              />
              <button
                type="button"
                class="account-sheet-input-action"
                onClick={() => setShowCurrent((v) => !v)}
                aria-label={showCurrent() ? "Hide password" : "Show password"}
                tabindex={0}
              >
                <span
                  class="material-symbols-outlined"
                  style={{ "font-size": "16px" }}
                  aria-hidden="true"
                >
                  {showCurrent() ? "visibility_off" : "visibility"}
                </span>
              </button>
            </div>
            <ValidationMessage error={currentPwField.error()} />
            <Show when={resetSent()}>
              <p class="account-sheet-hint account-sheet-hint-success">
                <span
                  class="material-symbols-outlined"
                  style={{ "font-size": "12px" }}
                  aria-hidden="true"
                >
                  check
                </span>
                Reset link sent to {user()?.email}.
              </p>
            </Show>
            <Show when={!resetSent()}>
              <button
                type="button"
                class="account-sheet-link"
                onClick={() => void handleForgotPassword()}
                disabled={resetBusy()}
                aria-busy={resetBusy() ? "true" : undefined}
              >
                <Show
                  when={!resetBusy()}
                  fallback={
                    <>
                      <span
                        class="material-symbols-outlined"
                        style={{ "font-size": "12px", animation: "spin 1s linear infinite" }}
                        aria-hidden="true"
                      >
                        progress_activity
                      </span>
                      Sending…
                    </>
                  }
                >
                  Forgot password?
                </Show>
              </button>
            </Show>
          </div>
        </Show>

        {/* New password */}
        <div style={{ "margin-bottom": "1rem" }}>
          <label class="account-sheet-label" for="new-pw-input">
            New password
          </label>
          <div class="account-sheet-input-wrap">
            <input
              id="new-pw-input"
              type={showNew() ? "text" : "password"}
              value={newPw()}
              onInput={(e) => setNewPw(e.currentTarget.value)}
              onBlur={() => newPwField.touch()}
              placeholder="At least 8 characters"
              autocomplete="new-password"
              spellcheck={false}
              class="account-sheet-input account-sheet-input-with-action"
              aria-label="New password"
            />
            <button
              type="button"
              class="account-sheet-input-action"
              onClick={() => setShowNew((v) => !v)}
              aria-label={showNew() ? "Hide password" : "Show password"}
              tabindex={0}
            >
              <span
                class="material-symbols-outlined"
                style={{ "font-size": "16px" }}
                aria-hidden="true"
              >
                {showNew() ? "visibility_off" : "visibility"}
              </span>
            </button>
          </div>
          <ValidationMessage error={newPwField.error()} />
          {/* Strength meter */}
          <Show when={newPw().length > 0}>
            <div class="account-sheet-strength">
              <div class="account-sheet-strength-bars">
                <For each={[1, 2, 3, 4]}>
                  {(i) => (
                    <div
                      class="account-sheet-strength-bar"
                      classList={{
                        "account-sheet-strength-bar-active":
                          i <= strength().score,
                        "account-sheet-strength-bar-weak":
                          i <= strength().score && strength().score <= 1,
                        "account-sheet-strength-bar-medium":
                          i <= strength().score && strength().score === 2,
                        "account-sheet-strength-bar-strong":
                          i <= strength().score && strength().score >= 3
                      }}
                    />
                  )}
                </For>
              </div>
              <span class="account-sheet-strength-label">
                {strength().label}
              </span>
            </div>
          </Show>
        </div>

        {/* Confirm password */}
        <div style={{ "margin-bottom": "1.5rem" }}>
          <label class="account-sheet-label" for="confirm-pw-input">
            Confirm new password
          </label>
          <div class="account-sheet-input-wrap">
            <input
              id="confirm-pw-input"
              type={showConfirm() ? "text" : "password"}
              value={confirmPw()}
              onInput={(e) => setConfirmPw(e.currentTarget.value)}
              onBlur={() => confirmPwField.touch()}
              placeholder="Re-enter new password"
              autocomplete="new-password"
              spellcheck={false}
              class="account-sheet-input account-sheet-input-with-action"
              aria-label="Confirm new password"
            />
            <button
              type="button"
              class="account-sheet-input-action"
              onClick={() => setShowConfirm((v) => !v)}
              aria-label={showConfirm() ? "Hide password" : "Show password"}
              tabindex={0}
            >
              <span
                class="material-symbols-outlined"
                style={{ "font-size": "16px" }}
                aria-hidden="true"
              >
                {showConfirm() ? "visibility_off" : "visibility"}
              </span>
            </button>
          </div>
          <ValidationMessage error={confirmPwField.error()} />
          <Show when={confirmPw().length > 0 && !passwordsMatch() && confirmPwField.isUntouched()}>
            <p class="account-sheet-hint account-sheet-hint-warn">
              <span
                class="material-symbols-outlined"
                style={{ "font-size": "12px" }}
                aria-hidden="true"
              >
                info
              </span>
              Passwords don't match.
            </p>
          </Show>
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
            idleLabel={mode() === "change" ? "Update Password" : "Set Password"}
            submittingLabel="Saving…"
            successLabel="Saved!"
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

export default ChangePasswordSheet;
