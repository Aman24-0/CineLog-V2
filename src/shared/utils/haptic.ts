// src/shared/utils/haptic.ts
//
// Haptic feedback utility using the Web Vibration API.
//
// Provides light tactile feedback for toast notifications and key
// interactive moments (adding to watchlist, rating, errors). The
// vibration patterns are deliberately subtle — 10ms pulses — so
// they feel like a gentle "tap" on the finger rather than an
// intrusive buzz.
//
// The API safely falls back on unsupported devices/browsers:
// `navigator.vibrate` is undefined on iOS Safari, desktop browsers,
// and older Android WebViews. On those platforms the calls are
// silently skipped, so no error handling is needed.

/** Light single-tap haptic — used for success toasts, toggles, add actions. */
export function hapticTap(): void {
  if ("vibrate" in navigator) {
    navigator.vibrate(10);
  }
}

/** Double-tap haptic — used for error toasts, destructive actions. */
export function hapticDouble(): void {
  if ("vibrate" in navigator) {
    navigator.vibrate([10, 30, 10]);
  }
}

/** Heavy haptic — used for critical errors, confirmations. */
export function hapticHeavy(): void {
  if ("vibrate" in navigator) {
    navigator.vibrate([20, 50, 20]);
  }
}

/**
 * Type-aware haptic: selects vibration pattern based on toast type.
 * - success → light tap (10ms)
 * - info    → light tap (10ms)
 * - error   → double-tap (10-30-10ms)
 * - action  → light tap (10ms)
 */
export function hapticForToastType(type: string): void {
  if (type === "error") {
    hapticDouble();
  } else {
    hapticTap();
  }
}
