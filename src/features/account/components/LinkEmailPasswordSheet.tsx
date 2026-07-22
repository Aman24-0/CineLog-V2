// src/features/account/components/LinkEmailPasswordSheet.tsx
//
// LinkEmailPasswordSheet — add email + password sign-in to an
// OAuth-only account.
//
// WHO USES THIS
//   Users who signed up via Google (or Apple) OAuth and therefore
//   have no password on their account. They want to ALSO be able to
//   sign in with email + password as a fallback (e.g. when they lose
//   access to their OAuth account).
//
// FLOW
//   1. User opens sheet from Account → Security → Login Methods →
//      Email & Password → "Connect"
//   2. Sheet shows:
//        • Email input — pre-filled with the user's current OAuth
//          email, editable in case they want to use a different one
//        • New password input (with strength meter)
//        • Confirm password input
//   3. Submit → linkEmailPassword(email, password)
//        • If email is UNCHANGED: Supabase sets the password and
//          adds "email" to providers. Done.
//        • If email is CHANGED: Supabase sends a confirmation email
//          AND sets the password. The new email becomes active only
//          after the user clicks the link in the confirmation email.
//   4. Sheet shows the appropriate success state
//
// SECURITY
//   • This requires an active session — the user is already signed
//     in via OAuth, so `supabase.auth.updateUser` uses their access
//     token to authorise the change.
//   • Supabase enforces a minimum password length of 8 characters.
//   • The "email changed" path requires `double_confirm_changes`
//     (currently enabled) — the new email is NOT active until the
//     user clicks the link in the confirmation email.

import { Show, createSignal, createMemo, For, type Component } from "solid-js";
import AccountSheet from "./AccountSheet";
import { linkEmailPassword } from "../accountActions";
import { useAuth } from "~/shared/hooks/useAuth";

interface LinkEmailPasswordSheetProps {
  open: boolean;
  onClose: () => void;
  /** Called when email+password linking succeeds. The parent can use
   * this to set a local override signal so the UI immediately reflects
   * the linked state even if the Supabase JWT hasn't refreshed yet. */
  onSuccess?: () => void;
}

/** Password strength estimate — 0 to 4. Purely heuristic. */
function passwordStrength(pw: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  if (!pw) return { score: 0, label: "—" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  const labels = ["Too short", "Weak", "Fair", "Strong", "Excellent"];
  return { score: score as 0 | 1 | 2 | 3 | 4, label: labels[score] };
}

const LinkEmailPasswordSheet: Component<LinkEmailPasswordSheetProps> = (props) => {
  const { user } = useAuth();

  // Pre-fill with the OAuth email so the common case is one tap to
  // confirm + two taps to type the password. The user can clear it
  // and type a different email if they want to use a separate address.
  const [email, setEmail] = createSignal(user()?.email ?? "");
  const [newPw, setNewPw] = createSignal("");
  const [confirmPw, setConfirmPw] = createSignal("");
  const [showNew, setShowNew] = createSignal(false);
  const [showConfirm, setShowConfirm] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [done, setDone] = createSignal(false);
  const [emailChangePending, setEmailChangePending] = createSignal(false);

  const emailValid = createMemo(() => {
    const e = email().trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  });

  const strength = createMemo(() => passwordStrength(newPw()));
  const passwordsMatch = createMemo(() => newPw() === confirmPw() && newPw().length > 0);

  const canSubmit = createMemo(() => {
    if (busy()) return false;
    if (!emailValid()) return false;
    if (newPw().length < 8) return false;
    if (!passwordsMatch()) return false;
    return true;
  });

  const handleSubmit = async () => {
    if (!canSubmit()) return;
    setBusy(true);
    const result = await linkEmailPassword(email(), newPw());
    setBusy(false);
    if (result.success) {
      setEmailChangePending(result.emailChangePending ?? false);
      setDone(true);
      // Notify parent so it can set the emailLinkedOverride signal.
      if (props.onSuccess) props.onSuccess();
    }
  };

  const handleClose = () => {
    setEmail(user()?.email ?? "");
    setNewPw("");
    setConfirmPw("");
    setShowNew(false);
    setShowConfirm(false);
    setDone(false);
    setEmailChangePending(false);
    setBusy(false);
    props.onClose();
  };

  // Subtitle changes based on whether the user already has an OAuth
  // email — helps them understand what "linking" actually does.
  const subtitle = () => {
    const currentEmail = user()?.email;
    if (currentEmail) {
      return "Add email + password sign-in alongside your connected provider.";
    }
    return "Set an email + password so you can sign in without OAuth.";
  };

  return (
    <AccountSheet
      open={props.open}
      onClose={handleClose}
      title="Connect Email & Password"
      icon="mail_lock"
      subtitle={subtitle()}
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
                check_circle
              </span>
            </div>
            <h4 class="type-headline" style={{ "font-size": "1rem", margin: "0 0 0.5rem", color: "var(--text-strong)" }}>
              {emailChangePending() ? "Password Set" : "Email + Password Linked"}
            </h4>
            <p class="type-body-soft" style={{ margin: 0, "font-size": "0.8125rem", "max-width": "300px" }}>
              <Show
                when={emailChangePending()}
                fallback={
                  "You can now sign in with email + password as well as your connected provider."
                }
              >
                Your password is active now. We also sent a confirmation link to{" "}
                <strong style={{ color: "var(--text-strong)" }}>{email().trim()}</strong> — click it
                to finish switching to that email.
              </Show>
            </p>
            <button class="btn-primary focus-ring mt-5" onClick={handleClose} style={{ "min-width": "120px" }}>
              Done
            </button>
          </div>
        }
      >
        {/* Email input — pre-filled with OAuth email, editable */}
        <div style={{ "margin-bottom": "1rem" }}>
          <label class="account-sheet-label" for="link-email-input">Email address</label>
          <input
            id="link-email-input"
            type="email"
            value={email()}
            onInput={(e) => setEmail(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && canSubmit()) void handleSubmit(); }}
            placeholder="you@example.com"
            autocomplete="email"
            spellcheck={false}
            class="account-sheet-input"
            aria-label="Email address"
          />
          <Show when={email() && !emailValid()}>
            <p class="account-sheet-hint account-sheet-hint-warn">
              <span class="material-symbols-outlined" style={{ "font-size": "12px" }} aria-hidden="true">info</span>
              Enter a valid email address.
            </p>
          </Show>
          <Show when={user()?.email && email().trim().toLowerCase() === (user()?.email ?? "").toLowerCase()}>
            <p class="account-sheet-hint">
              <span class="material-symbols-outlined" style={{ "font-size": "12px" }} aria-hidden="true">lock</span>
              This is your current email — only a password will be added.
            </p>
          </Show>
          <Show when={user()?.email && email() && email().trim().toLowerCase() !== (user()?.email ?? "").toLowerCase() && emailValid()}>
            <p class="account-sheet-hint account-sheet-hint-warn">
              <span class="material-symbols-outlined" style={{ "font-size": "12px" }} aria-hidden="true">info</span>
              Changing your email will send a confirmation link to the new address.
            </p>
          </Show>
        </div>

        {/* New password */}
        <div style={{ "margin-bottom": "1rem" }}>
          <label class="account-sheet-label" for="link-new-pw-input">New password</label>
          <div class="account-sheet-input-wrap">
            <input
              id="link-new-pw-input"
              type={showNew() ? "text" : "password"}
              value={newPw()}
              onInput={(e) => setNewPw(e.currentTarget.value)}
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
              <span class="material-symbols-outlined" style={{ "font-size": "16px" }} aria-hidden="true">
                {showNew() ? "visibility_off" : "visibility"}
              </span>
            </button>
          </div>
          {/* Strength meter */}
          <Show when={newPw().length > 0}>
            <div class="account-sheet-strength">
              <div class="account-sheet-strength-bars">
                <For each={[1, 2, 3, 4]}>
                  {(i) => (
                    <div
                      class="account-sheet-strength-bar"
                      classList={{
                        "account-sheet-strength-bar-active": i <= strength().score,
                        "account-sheet-strength-bar-weak": i <= strength().score && strength().score <= 1,
                        "account-sheet-strength-bar-medium": i <= strength().score && strength().score === 2,
                        "account-sheet-strength-bar-strong": i <= strength().score && strength().score >= 3,
                      }}
                    />
                  )}
                </For>
              </div>
              <span class="account-sheet-strength-label">{strength().label}</span>
            </div>
          </Show>
        </div>

        {/* Confirm password */}
        <div style={{ "margin-bottom": "1.5rem" }}>
          <label class="account-sheet-label" for="link-confirm-pw-input">Confirm new password</label>
          <div class="account-sheet-input-wrap">
            <input
              id="link-confirm-pw-input"
              type={showConfirm() ? "text" : "password"}
              value={confirmPw()}
              onInput={(e) => setConfirmPw(e.currentTarget.value)}
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
              <span class="material-symbols-outlined" style={{ "font-size": "16px" }} aria-hidden="true">
                {showConfirm() ? "visibility_off" : "visibility"}
              </span>
            </button>
          </div>
          <Show when={confirmPw().length > 0 && !passwordsMatch()}>
            <p class="account-sheet-hint account-sheet-hint-warn">
              <span class="material-symbols-outlined" style={{ "font-size": "12px" }} aria-hidden="true">info</span>
              Passwords don't match.
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
            <Show when={busy()} fallback="Connect">
              <span class="material-symbols-outlined" style={{ "font-size": "14px", animation: "spin 1s linear infinite" }} aria-hidden="true">
                progress_activity
              </span>
              Linking…
            </Show>
          </button>
        </div>
      </Show>
    </AccountSheet>
  );
};

export default LinkEmailPasswordSheet;
