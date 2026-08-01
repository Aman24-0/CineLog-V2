// src/features/account/components/DeactivateAccountSheet.tsx
//
// DeactivateAccountSheet — the destructive-account-action sheet.
//
// Two distinct destructive actions live here:
//
//   1. DEACTIVATE (soft delete, recoverable)
//      Calls `profileRepo.scheduleDeletion(uid)` which sets
//      `scheduled_deletion_at = now + 7d`. During those 7 days the
//      user can sign in normally and the deletion is cancelled (the
//      profile.lifecycle code checks for an active session and
//      clears the flag).
//
//   2. PERMANENT DELETE (hard delete, NOT recoverable)
//      Requires typing the email to confirm. Calls the
//      `/api/account/delete` server route, which uses the
//      service-role client to bypass RLS (RLS blocks DELETE for
//      anon keys) AND calls `supabase.auth.admin.deleteUser(uid)`
//      to remove the auth identity. ⚠️ This is a real delete —
//      vault, collections, profile, favorites, auth identity —
//      all gone. The user can sign up again with the same email
//      to start fresh.
//
// The sheet has 3 phases per action:
//   • confirm  — user reviews what gets removed + types confirmation
//   • working  — spinner + step label (only for permanent delete)
//   • success  — green check + "Done" button (auto-signs out)
//
// Both actions end with a sign-out so the user lands on the signed-out
// state — there's no "deactivated account" UI to show.

import {
  Show,
  createSignal,
  onMount,
  createMemo,
  type Component
} from "solid-js";
import { Portal } from "solid-js/web";
import { useAuth } from "~/shared/hooks/useAuth";
import { useToast } from "~/shared/hooks/useToast";
import { useProfile } from "~/lib/supabase/hooks/useProfile";
import { signOut } from "~/shared/hooks/useAuthActions";
import { useNavigate } from "@solidjs/router";
import { useUserLibrary } from "~/shared/hooks/useUserLibrary";
import { useVault } from "~/features/watchlist/useVault";
import { useCollections } from "~/features/collections/hooks/useCollections";
import { clearCache as clearApiCache } from "~/shared/utils/apiCache";
import { getBrowserSession } from "~/lib/supabase/session";

type Mode = "deactivate" | "delete";
type Phase = "confirm" | "working" | "done";

interface DeactivateAccountSheetProps {
  open: boolean;
  mode: Mode;
  onClose: () => void;
}

const DeactivateAccountSheet: Component<DeactivateAccountSheetProps> = (
  props
) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const profileRepo = useProfile();
  const library = useUserLibrary();
  const vault = useVault();
  const collections = useCollections();
  const navigate = useNavigate();

  const [confirmText, setConfirmText] = createSignal("");
  const [phase, setPhase] = createSignal<Phase>("confirm");
  const [errorMsg, setErrorMsg] = createSignal("");

  onMount(() => {
    if (props.open) document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  });

  // For "delete" mode, the user must type their email or username to confirm.
  // For "deactivate" mode, just type DEACTIVATE.
  const expectedText = createMemo(() => {
    if (props.mode === "delete") {
      return (user()?.email ?? "").toLowerCase();
    }
    return "DEACTIVATE";
  });

  const canConfirm = createMemo(
    () =>
      confirmText().trim().toLowerCase() === expectedText() &&
      phase() === "confirm"
  );

  const handleConfirm = async () => {
    const uid = user()?.uid;
    if (!uid) {
      showToast("Sign in to manage your account.", "error");
      return;
    }
    if (!canConfirm()) return;

    setPhase("working");
    setErrorMsg("");

    try {
      if (props.mode === "deactivate") {
        // Soft delete — schedules deletion 7 days out.
        const { error } = await profileRepo.scheduleDeletion(uid);
        if (error) throw error;
      } else {
        // Hard delete — calls /api/account/delete, which uses the
        // service-role client to bypass RLS and also removes the
        // auth.users row via supabase.auth.admin.deleteUser.
        //
        // We need to send the access_token in the body because the
        // browser client stores sessions in localStorage (not
        // cookies), so the server can't read it from the Cookie
        // header. The server re-verifies the token via getUser().
        const session = await getBrowserSession();
        const accessToken = session?.access_token ?? "";

        const res = await fetch("/api/account/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            confirmation: confirmText().trim(),
            accessToken
          })
        });

        if (!res.ok) {
          let msg = "Failed to delete account.";
          try {
            const body = (await res.json()) as { error?: string };
            if (body?.error) msg = body.error;
          } catch {
            // Ignore — response body wasn't JSON.
          }
          throw new Error(msg);
        }

        // Clear all local caches/stores so the next sign-in is fresh.
        await Promise.allSettled([
          library.refresh(),
          vault.refreshPresets(uid),
          collections.refreshCollections(uid),
          collections.refreshUniversePrefs(uid)
        ]);
        clearApiCache();
      }

      // Sign out — either the account is gone or it's marked for deletion.
      await signOut();
      setPhase("done");
    } catch (err) {
      console.error(`[DeactivateAccountSheet] ${props.mode} failed:`, err);
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong.");
      setPhase("confirm");
      showToast(
        props.mode === "deactivate"
          ? "Couldn't deactivate account."
          : "Couldn't delete account.",
        "error"
      );
    }
  };

  const handleClose = () => {
    if (phase() === "working") return; // can't close mid-flight
    setConfirmText("");
    setPhase("confirm");
    setErrorMsg("");
    props.onClose();
    // If we just finished, navigate to /discover (the sign-out already
    // happened inside handleConfirm).
    if (phase() === "done") {
      navigate("/discover");
    }
  };

  const title = () =>
    props.mode === "delete"
      ? "Permanently Delete Account"
      : "Deactivate Account";

  const subtitle = () =>
    props.mode === "delete"
      ? "This cannot be undone. Your data will be permanently removed."
      : "Your account is marked for deletion in 7 days. Sign in anytime before then to cancel.";

  return (
    <Show when={props.open}>
      <Portal>
        <div
          class="animate-fade-in fixed inset-0 z-[999999] flex items-end justify-center sm:items-center sm:p-4"
          style={{
            background: "rgba(0,0,0,0.88)",
            "backdrop-filter": "blur(12px)",
            "-webkit-backdrop-filter": "blur(12px)",
            "padding-bottom": "var(--nav-total-height)"
          }}
          onClick={() => handleClose()}
          role="dialog"
          aria-modal="true"
          aria-label={title()}
        >
          <div
            class="modal-sheet-enter relative flex w-full max-w-md flex-col rounded-t-[2rem] sm:rounded-[2rem]"
            style={{
              "max-height":
                "calc(100dvh - var(--nav-total-height) - env(safe-area-inset-top, 0px) - var(--sp-4))",
              "min-height": "0",
              background: "var(--glass-bg-strong)",
              "backdrop-filter": "blur(28px)",
              "-webkit-backdrop-filter": "blur(28px)",
              border: "1px solid rgba(248, 113, 113, 0.3)",
              "box-shadow": "var(--shadow-elevated)"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div
              class="mx-auto mb-2 mt-4 h-1.5 w-12 flex-shrink-0 rounded-full sm:hidden"
              style={{ background: "var(--hairline-2)" }}
              aria-hidden="true"
            />

            {/* Close button — hidden during working phase */}
            <Show when={phase() !== "working"}>
              <button
                onClick={() => handleClose()}
                class="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full transition-all active:scale-95"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  color: "var(--text-soft)",
                  border: "1px solid var(--hairline)"
                }}
                aria-label="Close"
              >
                <span
                  class="material-symbols-outlined"
                  style={{ "font-size": "16px" }}
                  aria-hidden="true"
                >
                  close
                </span>
              </button>
            </Show>

            {/* === CONFIRM PHASE === */}
            <Show when={phase() === "confirm"}>
              <div
                class="overflow-y-auto px-6 pb-5 pt-5"
                style={{ "overscroll-behavior": "contain" }}
              >
                <div class="mb-3 flex items-center gap-2">
                  <span
                    class="material-symbols-outlined"
                    style={{ color: "#f87171", "font-size": "20px" }}
                    aria-hidden="true"
                  >
                    {props.mode === "delete" ? "dangerous" : "warning"}
                  </span>
                  <h3
                    class="type-headline"
                    style={{ "font-size": "1rem", margin: 0, color: "#fca5a5" }}
                  >
                    {title()}
                  </h3>
                </div>

                <p
                  class="type-body-soft"
                  style={{
                    margin: "0 0 var(--sp-3)",
                    "font-size": "0.8125rem"
                  }}
                >
                  {subtitle()}
                </p>

                <p
                  class="type-body-soft"
                  style={{
                    margin: "0 0 var(--sp-2)",
                    "font-size": "0.8125rem"
                  }}
                >
                  {props.mode === "delete"
                    ? "This will permanently remove:"
                    : "During the 7-day deactivation window:"}
                </p>

                <Show when={props.mode === "delete"}>
                  <ul
                    class="type-body-soft"
                    style={{
                      margin: "0 0 var(--sp-3)",
                      "padding-left": "1.25rem",
                      "font-size": "0.75rem",
                      "line-height": "1.7",
                      color: "#fca5a5"
                    }}
                  >
                    <li>Watchlist &amp; watch progress</li>
                    <li>Collections &amp; favourites</li>
                    <li>Profile, avatar, banner, bio</li>
                    <li>Ratings, reviews, notes</li>
                    <li>Sync history &amp; achievements</li>
                  </ul>
                  <p
                    class="type-micro"
                    style={{
                      color: "var(--text-muted)",
                      margin: "0 0 var(--sp-3)"
                    }}
                  >
                    Your auth identity is also deleted. You can sign up again
                    with the same email to start with a fresh, empty CineLog
                    account.
                  </p>
                </Show>

                <Show when={props.mode === "deactivate"}>
                  <ul
                    class="type-body-soft"
                    style={{
                      margin: "0 0 var(--sp-3)",
                      "padding-left": "1.25rem",
                      "font-size": "0.75rem",
                      "line-height": "1.7",
                      color: "var(--text-soft)"
                    }}
                  >
                    <li>Your data stays intact (not deleted yet)</li>
                    <li>You can sign in normally to cancel</li>
                    <li>After 7 days, everything is permanently removed</li>
                    <li>You'll be signed out of this device</li>
                  </ul>
                </Show>

                {/* Type-to-confirm */}
                <div class="mb-4">
                  <p
                    class="type-micro"
                    style={{ color: "var(--text-muted)", margin: "0 0 0.5rem" }}
                  >
                    {props.mode === "delete"
                      ? `Type your email (${expectedText()}) to confirm:`
                      : "Type DEACTIVATE to confirm:"}
                  </p>
                  <input
                    type="text"
                    value={confirmText()}
                    onInput={(e) => setConfirmText(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") handleClose();
                    }}
                    placeholder={expectedText()}
                    autocomplete="off"
                    spellcheck={false}
                    class="w-full rounded-lg px-3 py-2.5 outline-none"
                    style={{
                      background: "rgba(248, 113, 113, 0.06)",
                      border: "1px solid rgba(248, 113, 113, 0.2)",
                      color: "var(--text-strong)",
                      "font-family": "'Azeret Mono', monospace",
                      "font-size": "0.875rem",
                      "font-weight": 700,
                      "letter-spacing": "0.05em"
                    }}
                    aria-label={`Type ${expectedText()} to confirm`}
                  />
                </div>

                <Show when={errorMsg()}>
                  <p
                    class="type-micro"
                    style={{
                      color: "#fca5a5",
                      margin: "0 0 var(--sp-3)",
                      "font-size": "0.75rem"
                    }}
                  >
                    {errorMsg()}
                  </p>
                </Show>

                {/* Actions */}
                <div class="flex gap-2">
                  <button
                    type="button"
                    class="btn-ghost focus-ring flex-1"
                    onClick={() => handleClose()}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    class="btn-danger focus-ring flex-1"
                    onClick={() => void handleConfirm()}
                    disabled={!canConfirm()}
                    aria-label={title()}
                  >
                    <span
                      class="material-symbols-outlined"
                      style={{ "font-size": "14px" }}
                      aria-hidden="true"
                    >
                      {props.mode === "delete" ? "delete_forever" : "block"}
                    </span>
                    {props.mode === "delete" ? "Delete Account" : "Deactivate"}
                  </button>
                </div>
              </div>
            </Show>

            {/* === WORKING PHASE === */}
            <Show when={phase() === "working"}>
              <div class="flex flex-col items-center px-6 pb-8 pt-8 text-center">
                <div class="sync-reset-spinner" aria-hidden="true">
                  <span
                    class="material-symbols-outlined animate-spin"
                    style={{ "font-size": "32px", color: "#f87171" }}
                    aria-hidden="true"
                  >
                    progress_activity
                  </span>
                </div>
                <h3
                  class="type-headline text-white"
                  style={{
                    "font-size": "1rem",
                    margin: "var(--sp-3) 0 var(--sp-1)"
                  }}
                >
                  {props.mode === "delete"
                    ? "Deleting your account…"
                    : "Deactivating…"}
                </h3>
                <p
                  class="type-body-soft"
                  style={{ margin: 0, "font-size": "0.8125rem" }}
                >
                  Please don't close this window.
                </p>
              </div>
            </Show>

            {/* === DONE PHASE === */}
            <Show when={phase() === "done"}>
              <div class="flex flex-col items-center px-6 pb-8 pt-8 text-center">
                <div
                  class="mb-3 flex h-16 w-16 items-center justify-center rounded-full"
                  style={{
                    background: "rgba(72, 187, 120, 0.12)",
                    border: "1px solid rgba(72, 187, 120, 0.3)"
                  }}
                  aria-hidden="true"
                >
                  <span
                    class="material-symbols-outlined"
                    style={{ "font-size": "36px", color: "#6ee7b7" }}
                    aria-hidden="true"
                  >
                    check_circle
                  </span>
                </div>
                <h3
                  class="type-headline text-white"
                  style={{ "font-size": "1.125rem", margin: "0 0 var(--sp-2)" }}
                >
                  {props.mode === "delete"
                    ? "Account Deleted"
                    : "Account Deactivated"}
                </h3>
                <p
                  class="type-body-soft"
                  style={{
                    margin: "0 0 var(--sp-5)",
                    "font-size": "0.8125rem",
                    "max-width": "280px"
                  }}
                >
                  {props.mode === "delete"
                    ? "Your CineLog account has been permanently removed. Goodbye."
                    : "Your account is scheduled for deletion in 7 days. Sign in before then to cancel."}
                </p>
                <button
                  class="btn-primary focus-ring"
                  onClick={() => handleClose()}
                >
                  Done
                </button>
              </div>
            </Show>
          </div>
        </div>
      </Portal>
    </Show>
  );
};

export default DeactivateAccountSheet;
