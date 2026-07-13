// src/features/sync/components/ResetConfirmSheet.tsx
//
// ResetConfirmSheet — a premium bottom sheet that asks the user to
// confirm a full library reset by typing DELETE.
//
// FLOW:
//   1. User taps "Reset" on the DangerZoneCard → sheet opens
//   2. Sheet shows what WILL be removed and what WILL NOT be removed
//   3. User must type "DELETE" exactly to enable the Reset button
//   4. User taps "Reset Library" → progress UI shows each delete step
//   5. On success → success screen with green check + Done button
//   6. On failure → error message + Close button (nothing partially failed silently)
//
// After success, every cache/signal/store is refreshed so the UI
// instantly shows an empty library — no page reload, no logout.

import {
  Show, createSignal, onMount, onCleanup, type Component,
} from "solid-js";
import { Portal } from "solid-js/web";
import { getCurrentUid } from "~/shared/hooks/useAuth";
import { useToast } from "~/shared/hooks/useToast";
import { useUserLibrary } from "~/shared/hooks/useUserLibrary";
import { useVault } from "~/features/watchlist/useVault";
import { useCollections } from "~/features/collections/hooks/useCollections";
import { clearCache as clearApiCache } from "~/shared/utils/apiCache";
import { RECENT_KEY as SEARCH_RECENT_KEY } from "~/features/search/searchStorage";
import { resetUserLibrary, type ResetLibraryStep, type ResetLibraryResult } from "../reset/resetLibraryService";

interface ResetConfirmSheetProps {
  open: boolean;
  onClose: () => void;
}

type Phase = "confirm" | "resetting" | "success" | "error";

const ResetConfirmSheet: Component<ResetConfirmSheetProps> = (props) => {
  const { showToast } = useToast();
  const library = useUserLibrary();
  const vault = useVault();
  const collections = useCollections();

  const [phase, setPhase] = createSignal<Phase>("confirm");
  const [confirmText, setConfirmText] = createSignal("");
  const [progressLabel, setProgressLabel] = createSignal("");
  const [progressStep, setProgressStep] = createSignal(0);
  const [totalSteps, setTotalSteps] = createSignal(0);
  const [errorMsg, setErrorMsg] = createSignal("");

  onMount(() => {
    if (props.open) document.body.style.overflow = "hidden";
  });
  onCleanup(() => {
    document.body.style.overflow = "";
  });

  const canReset = () => confirmText() === "DELETE";

  const handleReset = async () => {
    const uid = getCurrentUid();
    if (!uid) {
      showToast("Please sign in to reset your library.", "error");
      return;
    }
    if (!canReset()) return;

    setPhase("resetting");
    setErrorMsg("");

    try {
      const result: ResetLibraryResult = await resetUserLibrary(uid, {
        onProgress: (step: ResetLibraryStep, total: number) => {
          setProgressLabel(step.label);
          setProgressStep(step.index + 1);
          setTotalSteps(total);
        },
      });

      if (!result.success) {
        setErrorMsg(result.error ?? "Couldn't reset your library.");
        setPhase("error");
        return;
      }

      // ─── FULL STATE SYNCHRONIZATION ───────────────────────────────
      // After a successful reset, refresh every SolidJS store + clear
      // every local cache so the UI instantly shows empty states
      // everywhere — no page reload, no logout.

      // 1. Refresh all SolidJS stores (vault, collections, presets,
      //    universe prefs). These are the reactive signals every page
      //    reads from — refreshing them propagates empty state to
      //    Watchlist, Dashboard, Collections, Discover, Profile, Search.
      await Promise.allSettled([
        library.refresh(),
        vault.refreshPresets(uid),
        collections.refreshCollections(uid),
        collections.refreshUniversePrefs(uid),
      ]);

      // 2. Clear the TMDB/OMDb API response cache so any stale
      //    "in vault" badges or recommendation caches are dropped.
      clearApiCache();

      // 3. Clear the search recent-history localStorage so deleted
      //    titles don't appear in recent searches.
      try {
        localStorage.removeItem(SEARCH_RECENT_KEY);
      } catch {
        // localStorage may be unavailable — non-fatal.
      }

      setPhase("success");
      showToast("Library reset complete.", "success");
    } catch (err) {
      console.error("[ResetConfirmSheet] Reset failed:", err);
      setErrorMsg(err instanceof Error ? err.message : "Couldn't reset your library.");
      setPhase("error");
    }
  };

  const handleClose = () => {
    if (phase() === "resetting") return; // can't close mid-reset
    setPhase("confirm");
    setConfirmText("");
    setErrorMsg("");
    props.onClose();
  };

  return (
    <Show when={props.open}>
      <Portal>
        <div
          class="fixed inset-0 flex items-end sm:items-center justify-center sm:p-4 z-[999999] animate-fade-in"
          style={{
            background: "rgba(0,0,0,0.85)",
            "backdrop-filter": "blur(12px)",
            "-webkit-backdrop-filter": "blur(12px)",
            "padding-bottom": "var(--nav-total-height)",
          }}
          onClick={() => handleClose()}
          role="dialog"
          aria-modal="true"
          aria-label="Reset library confirmation"
        >
          <div
            class="w-full max-w-sm rounded-t-[2rem] sm:rounded-[2rem] flex flex-col modal-sheet-enter"
            style={{
              "max-height": "calc(100dvh - var(--nav-total-height) - env(safe-area-inset-top, 0px) - var(--sp-4))",
              "min-height": "0",
              background: "var(--glass-bg-strong)",
              "backdrop-filter": "blur(28px)",
              "-webkit-backdrop-filter": "blur(28px)",
              border: "1px solid rgba(248, 113, 113, 0.3)",
              "box-shadow": "var(--shadow-elevated)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div
              class="w-12 h-1.5 rounded-full mx-auto mt-4 mb-2 sm:hidden flex-shrink-0"
              style={{ background: "var(--hairline-2)" }}
              aria-hidden="true"
            />

            {/* Close button — hidden during resetting */}
            <Show when={phase() !== "resetting"}>
              <button
                onClick={() => handleClose()}
                class="absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-95 z-10"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  color: "var(--text-soft)",
                  border: "1px solid var(--hairline)",
                }}
                aria-label="Close"
              >
                <span class="material-symbols-outlined" style={{ "font-size": "16px" }} aria-hidden="true">close</span>
              </button>
            </Show>

            {/* === CONFIRM PHASE === */}
            <Show when={phase() === "confirm"}>
              <div class="px-6 pt-5 pb-5 overflow-y-auto" style={{ "overscroll-behavior": "contain" }}>
                <div class="flex items-center gap-2 mb-3">
                  <span class="material-symbols-outlined" style={{ color: "#f87171", "font-size": "20px" }} aria-hidden="true">warning</span>
                  <h3 class="type-headline text-white" style={{ "font-size": "1rem", margin: 0 }}>
                    Reset your CineLog Library?
                  </h3>
                </div>

                <p class="type-body-soft" style={{ margin: "0 0 var(--sp-3)", "font-size": "0.8125rem" }}>
                  This will permanently remove:
                </p>
                <ul class="type-body-soft" style={{ margin: "0 0 var(--sp-3)", "padding-left": "1.25rem", "font-size": "0.75rem", "line-height": "1.7", color: "#fca5a5" }}>
                  <li>Watchlist</li>
                  <li>Favorites</li>
                  <li>Collections</li>
                  <li>Collection Entries</li>
                  <li>Watch Progress</li>
                  <li>Ratings</li>
                  <li>Reviews</li>
                  <li>Notes</li>
                  <li>Timeline</li>
                  <li>Sync History</li>
                  <li>Import History</li>
                  <li>Continue Watching</li>
                </ul>

                <p class="type-body-soft" style={{ margin: "0 0 var(--sp-2)", "font-size": "0.8125rem" }}>
                  This WILL NOT remove:
                </p>
                <div class="flex flex-wrap gap-1 mb-4">
                  {["Account", "Google Login", "Email", "Username", "Profile", "Avatar", "Banner", "Bio", "Settings", "Theme", "Preferences", "Achievements"].map((item) => (
                    <span
                      class="px-2 py-0.5 rounded-full"
                      style={{
                        background: "rgba(72, 187, 120, 0.1)",
                        border: "1px solid rgba(72, 187, 120, 0.2)",
                        color: "#6ee7b7",
                        "font-size": "0.5625rem",
                        "font-family": "'Azeret Mono', monospace",
                        "font-weight": 600,
                        "letter-spacing": "0.04em",
                      }}
                    >
                      ✓ {item}
                    </span>
                  ))}
                </div>

                {/* Type DELETE confirmation */}
                <div class="mb-4">
                  <p class="type-micro" style={{ color: "var(--text-muted)", margin: "0 0 0.5rem" }}>
                    Type DELETE to confirm:
                  </p>
                  <input
                    type="text"
                    value={confirmText()}
                    onInput={(e) => setConfirmText(e.currentTarget.value)}
                    onKeyDown={(e) => { if (e.key === "Escape") handleClose(); }}
                    placeholder="DELETE"
                    autocomplete="off"
                    spellcheck={false}
                    class="w-full px-3 py-2.5 rounded-lg outline-none"
                    style={{
                      background: "rgba(248, 113, 113, 0.06)",
                      border: "1px solid rgba(248, 113, 113, 0.2)",
                      color: "var(--text-strong)",
                      "font-family": "'Azeret Mono', monospace",
                      "font-size": "0.875rem",
                      "font-weight": 700,
                      "letter-spacing": "0.1em",
                      "text-transform": "uppercase",
                    }}
                    aria-label="Type DELETE to confirm"
                  />
                </div>

                {/* Action buttons */}
                <div class="flex gap-2">
                  <button
                    type="button"
                    class="btn-ghost flex-1 focus-ring"
                    onClick={() => handleClose()}
                    aria-label="Cancel reset"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    class="btn-danger flex-1 focus-ring"
                    onClick={() => void handleReset()}
                    disabled={!canReset()}
                    aria-label="Reset library permanently"
                  >
                    <span class="material-symbols-outlined" style={{ "font-size": "14px" }} aria-hidden="true">delete_forever</span>
                    Reset Library
                  </button>
                </div>
              </div>
            </Show>

            {/* === RESETTING PHASE (progress) === */}
            <Show when={phase() === "resetting"}>
              <div class="px-6 pt-8 pb-8 flex flex-col items-center text-center">
                <div class="sync-reset-spinner" aria-hidden="true">
                  <span class="material-symbols-outlined animate-spin" style={{ "font-size": "32px", color: "#f87171" }} aria-hidden="true">progress_activity</span>
                </div>
                <h3 class="type-headline text-white" style={{ "font-size": "1rem", margin: "var(--sp-3) 0 var(--sp-1)" }}>
                  Resetting your library…
                </h3>
                <p class="type-body-soft" style={{ margin: 0, "font-size": "0.8125rem" }}>
                  {progressLabel() || "Preparing…"}
                </p>
                <Show when={totalSteps() > 0}>
                  <p class="type-micro" style={{ color: "var(--text-muted)", margin: "0.5rem 0 0" }}>
                    Step {progressStep()} of {totalSteps()}
                  </p>
                </Show>
                <div class="w-full mt-4 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--tier-3)" }}>
                  <div
                    class="h-full rounded-full transition-all"
                    style={{
                      width: `${totalSteps() > 0 ? (progressStep() / totalSteps()) * 100 : 0}%`,
                      background: "linear-gradient(90deg, #f87171, #fca5a5)",
                    }}
                  />
                </div>
                <p class="type-micro" style={{ color: "var(--text-muted)", margin: "var(--sp-3) 0 0" }}>
                  Do not close this window.
                </p>
              </div>
            </Show>

            {/* === SUCCESS PHASE === */}
            <Show when={phase() === "success"}>
              <div class="px-6 pt-8 pb-8 flex flex-col items-center text-center">
                <div
                  class="w-16 h-16 rounded-full flex items-center justify-center mb-3"
                  style={{ background: "rgba(72, 187, 120, 0.12)", border: "1px solid rgba(72, 187, 120, 0.3)" }}
                  aria-hidden="true"
                >
                  <span class="material-symbols-outlined" style={{ "font-size": "36px", color: "#6ee7b7" }} aria-hidden="true">check_circle</span>
                </div>
                <h3 class="type-headline text-white" style={{ "font-size": "1.125rem", margin: "0 0 var(--sp-2)" }}>
                  Library Reset Complete
                </h3>
                <p class="type-body-soft" style={{ margin: "0 0 var(--sp-5)", "font-size": "0.8125rem", "max-width": "260px" }}>
                  Your CineLog library has been cleared successfully. Your account and profile remain unchanged.
                </p>
                <button class="btn-primary focus-ring" onClick={() => handleClose()}>
                  Done
                </button>
              </div>
            </Show>

            {/* === ERROR PHASE === */}
            <Show when={phase() === "error"}>
              <div class="px-6 pt-8 pb-8 flex flex-col items-center text-center">
                <div
                  class="w-16 h-16 rounded-full flex items-center justify-center mb-3"
                  style={{ background: "rgba(248, 113, 113, 0.12)", border: "1px solid rgba(248, 113, 113, 0.3)" }}
                  aria-hidden="true"
                >
                  <span class="material-symbols-outlined" style={{ "font-size": "36px", color: "#f87171" }} aria-hidden="true">error</span>
                </div>
                <h3 class="type-headline text-white" style={{ "font-size": "1.125rem", margin: "0 0 var(--sp-2)" }}>
                  Couldn't reset your library
                </h3>
                <p class="type-body-soft" style={{ margin: "0 0 var(--sp-3)", "font-size": "0.75rem", "max-width": "280px", color: "#fca5a5" }}>
                  {errorMsg() || "An unexpected error occurred. Please try again."}
                </p>
                <p class="type-micro" style={{ color: "var(--text-muted)", margin: "0 0 var(--sp-4)" }}>
                  No data was partially deleted. You can safely retry.
                </p>
                <button class="btn-ghost focus-ring" onClick={() => handleClose()}>
                  Close
                </button>
              </div>
            </Show>
          </div>
        </div>
      </Portal>
    </Show>
  );
};

export default ResetConfirmSheet;
