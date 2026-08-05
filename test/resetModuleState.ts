// test/resetModuleState.ts
//
// Unified test-reset helpers for module-level Solid signals.
//
// ─────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS
// ─────────────────────────────────────────────────────────────────────
//
// Vitest reuses a single module instance per worker. Any Solid hook that
// holds module-level `createSignal(...)` state (i.e. the signal lives at
// module scope, not inside a component) will RETAIN that state across
// tests. This causes flaky failures where a toast/modal shown by test A
// is still visible when test B reads the signal.
//
// The four hooks that hold module-level state are:
//
//   • useToast            — toasts[], toastIdSeq, lastToastSignature,
//                           lastToastAt (dedup window)
//   • useModalState       — selectedItem signal + private historyEntryOurs
//                           flag (for Back-button-closes-modal behavior)
//   • useCollectionModal  — collectionSelectedItem signal + private
//                           collectionHistoryEntryOurs flag
//   • useAuthModal        — authModalOpen signal (resettable via the
//                           already-exported closeAuthModal())
//
// Each hook now exposes a `__resetForTest()` function (useToast,
// useModalState, useCollectionModal) OR a public closer (useAuthModal's
// `closeAuthModal`). This file imports all four and re-exports a single
// `resetModuleState()` that test/setup.ts calls in `beforeEach`.
//
// ─────────────────────────────────────────────────────────────────────
// DESIGN NOTES
// ─────────────────────────────────────────────────────────────────────
//
// 1. The reset is called in `beforeEach` — AFTER the localStorage.clear()
//    in setup.ts but BEFORE the test body runs. This guarantees a clean
//    signal slate for every test.
//
// 2. The `__resetForTest` functions are intentionally ugly names — the
//    double-underscore prefix is a convention that signals "do not call
//    from production code." They are NOT part of the public API and may
//    be removed/renamed without a major version bump.
//
// 3. The imports use the `~/*` alias so they resolve identically in test
//    and production builds (vitest.config.ts maps `~` → `src`).
//
// 4. If a hook fails to load (e.g. a future refactor removes it), the
//    reset is skipped for that hook rather than crashing the whole test
//    setup. This keeps the test suite resilient to in-progress refactors.
//    We still log a warning so the drift is visible.

import { __resetForTest as resetToast } from "~/shared/hooks/useToast";
import { __resetForTest as resetModalState } from "~/shared/hooks/useModalState";
import { __resetForTest as resetCollectionModal } from "~/shared/hooks/useCollectionModal";
import { useAuthModal } from "~/shared/hooks/useAuthModal";

/**
 * Reset ALL module-level Solid signal state to its initial value.
 *
 * Call this in `test/setup.ts`'s `beforeEach` hook, AFTER localStorage
 * is cleared but BEFORE the test body runs.
 *
 * Order matters: we reset the toast LAST because the modal-reset paths
 * (closeTitle / closeCollection) may internally call showToast during
 * normal app usage. By resetting the toast last, any toast shown by a
 * modal-close path during reset is immediately cleared.
 *
 * Safety: each reset is wrapped in try/catch so a failure in one hook
 * doesn't prevent the others from resetting. Failures are logged to
 * stderr so they're visible in CI output without failing the test.
 */
export function resetModuleState(): void {
  // 1. Reset the Details modal state (selectedItem signal + history flag).
  try {
    resetModalState();
  } catch (err) {
    console.error("[resetModuleState] useModalState reset failed:", err);
  }

  // 2. Reset the Collection modal state (signal + history flag).
  try {
    resetCollectionModal();
  } catch (err) {
    console.error("[resetModuleState] useCollectionModal reset failed:", err);
  }

  // 3. Reset the Auth modal via its public closer.
  try {
    const { closeAuthModal } = useAuthModal();
    closeAuthModal();
  } catch (err) {
    console.error("[resetModuleState] useAuthModal reset failed:", err);
  }

  // 4. Reset the toast state LAST (see comment above for ordering rationale).
  try {
    resetToast();
  } catch (err) {
    console.error("[resetModuleState] useToast reset failed:", err);
  }
}
