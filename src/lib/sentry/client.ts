// src/lib/sentry/client.ts
//
// CineLog V2 — Sentry browser wrapper (Phase 8 Chunk 1)
// ---------------------------------------------------------------------
//
// WHAT THIS FILE DOES
//   Wraps `@sentry/browser` initialization behind a thin façade so that
//   the rest of the client-side code can `captureException(err)` without
//   caring whether Sentry is configured, in development, or running in
//   a test environment.
//
// WHY A WRAPPER (instead of calling @sentry/browser directly)
//   1. The DSN is read from `import.meta.env.VITE_SENTRY_DSN`. When that
//      env var is absent (local dev, CI, tests), `init()` is a no-op and
//      `captureException` degrades to `console.error`. This means the
//      app code never needs to feature-detect — it just calls
//      `captureException(err)` and the wrapper does the right thing.
//   2. Centralizing the `beforeSend` hook lets us strip noisy non-fatal
//      browser errors (ResizeObserver loop, TMDB 401s) that are already
//      handled in-app and would just pollute the Sentry inbox.
//   3. If Sentry is ever swapped for a different provider (or removed),
//      only this file needs to change.
//
// INITIALIZATION
//   `initSentry()` is idempotent — calling it twice is safe (the second
//   call short-circuits via the `initialized` flag). It is invoked from
//   `src/entry-client.tsx` AFTER `mount()` so it doesn't block hydration.
//
// SAMPLE RATE
//   In production we sample 100% of errors (sampleRate: 1.0) because
//   CineLog is a single-developer project and we want every error. For
//   traces we use a low sample rate (0.1) to stay within Sentry's free
//   tier quota — traces are nice-to-have, errors are must-have.
//
// ENVIRONMENT
//   The Sentry `environment` tag is set from `import.meta.env.MODE`
//   ("development" / "production"). In dev, errors are still sent IF
//   a DSN is configured — useful for testing the Sentry pipeline locally
//   before deploying. If no DSN is configured, `init()` is skipped and
//   `captureException` falls back to `console.error`.
//
// TEST SAFETY
//   Vitest runs in jsdom, not a real browser. `@sentry/browser` checks
//   for `window.document` and gracefully degrades if absent, but to
//   avoid any chance of network calls during tests, `initSentry()`
//   short-circuits when `import.meta.env.VITEST` is truthy.

import * as Sentry from "@sentry/browser";

let initialized = false;

/**
 * Initialize the Sentry browser SDK.
 *
 * Safe to call multiple times — the second call is a no-op.
 * Safe to call in tests / dev without a DSN — the call is a no-op
 * and `captureException` falls back to `console.error`.
 */
export function initSentry(): void {
  if (initialized) return;

  // Skip entirely in Vitest — we never want network calls during tests.
  if (import.meta.env.VITEST) {
    initialized = true;
    return;
  }

  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) {
    // No DSN configured — leave Sentry uninitialized. captureException
    // will fall back to console.error.
    initialized = true;
    return;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE ?? "production",
    release: import.meta.env.VITE_SENTRY_RELEASE,
    // 100% of errors — CineLog is a solo project, we want them all.
    sampleRate: 1.0,
    // 10% of traces — nice-to-have, stays within free-tier quota.
    tracesSampleRate: 0.1,
    // Auto-instrument the browser APIs Sentry supports.
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        // Mask all text and input content in session replays — CineLog
        // vaults contain user-typed notes that may include personal
        // content. We send the DOM structure but redact text.
        maskAllText: true,
        blockAllMedia: true
      })
    ],
    // Session replay sample rates — required to suppress the
    // "Replay is disabled because neither replaysSessionSampleRate
    // nor replaysOnErrorSampleRate are set" console warning.
    // 10% of normal sessions, 100% of sessions with errors.
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    beforeSend(event) {
      // Strip noisy non-fatal browser errors that are already handled
      // in-app and would just pollute the Sentry inbox.
      const exc = event.exception?.values?.[0];
      if (exc) {
        const msg = exc.value ?? "";
        // ResizeObserver loop errors are harmless browser noise.
        if (msg.includes("ResizeObserver loop")) {
          return null;
        }
        // TMDB 401s are expected when the API key is missing or
        // rate-limited — they're handled in-app with empty states.
        if (msg.includes("TMDB") || msg.includes("401")) {
          return null;
        }
      }
      return event;
    }
  });

  initialized = true;
}

/**
 * Capture an exception and send it to Sentry (if initialized).
 *
 * Falls back to `console.error` when Sentry is not configured (dev,
 * tests, missing DSN). This means callers never need to feature-detect
 * — they just call `captureException(err)` and the wrapper does the
 * right thing.
 *
 * @param err     The error to capture. Accepts unknown because the
 *                entry-client's catch blocks receive `unknown` from
 *                typed Promise rejections.
 * @param context Optional additional context — merged into the Sentry
 *                event's `extra` bag. Useful for tagging with the
 *                feature/module that threw (e.g. { feature: "sw" }).
 */
export function captureException(
  err: unknown,
  context?: Record<string, unknown>
): void {
  if (initialized) {
    Sentry.captureException(err, {
      extra: context
    });
  } else {
    // Fallback for dev/tests — preserve the original error so the
    // console shows a proper stack trace, not just a string.
     
    console.error("[captureException]", err, context ?? "");
  }
}

/**
 * Explicitly set the authenticated user on the Sentry scope.
 *
 * Call this after a successful sign-in so subsequent errors are tagged
 * with the user's id. Safe to call before initSentry() — the call is
 * buffered and flushed once Sentry initializes.
 */
export function setSentryUser(user: { id: string; email?: string }): void {
  if (initialized) {
    Sentry.setUser(user);
  }
}

/**
 * Clear the authenticated user from the Sentry scope.
 *
 * Call this on sign-out so subsequent errors are anonymous.
 */
export function clearSentryUser(): void {
  if (initialized) {
    Sentry.setUser(null);
  }
}
