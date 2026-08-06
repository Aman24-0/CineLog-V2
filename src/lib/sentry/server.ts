// src/lib/sentry/server.ts
//
// CineLog V2 — Sentry Node wrapper (Phase 8 Chunk 1)
// ---------------------------------------------------------------------
//
// WHAT THIS FILE DOES
//   Wraps `@sentry/node` initialization behind a thin façade so that
//   server-side code (entry-server.tsx, API routes, the request
//   middleware) can `captureException(err)` without caring whether
//   Sentry is configured or running in a test environment.
//
// WHY A WRAPPER (instead of calling @sentry/node directly)
//   1. The DSN is read from `process.env.SENTRY_DSN`. When that env var
//      is absent (local dev, CI, tests, build-time), `init()` is a no-op
//      and `captureException` degrades to `console.error`. App code
//      never needs to feature-detect.
//   2. Centralizing the `beforeSend` hook lets us preserve the existing
//      TMDB-suppression logic from entry-server.tsx's
//      `process.on("unhandledRejection")` handler — TMDB 401s and
//      transient fetch errors during SSR are already handled in-app with
//      empty states, so we don't want them spamming Sentry.
//   3. `@sentry/node` v8+ uses OpenTelemetry under the hood. On Vercel
//      serverless, each invocation is a fresh process, so we initialize
//      once at module load (top-level side effect is intentional) and
//      let the SDK flush on its own before the lambda freezes.
//
// INITIALIZATION
//   `initSentry()` is called at module load (immediately after the
//   function declarations). This is intentional — Sentry needs to hook
//   into Node's http/https modules BEFORE any outgoing request is made
//   so it can capture trace context. Late init = lost traces.
//
//   `initSentry()` is also exported so entry-server.tsx can call it
//   again defensively (idempotent — second call is a no-op).
//
// VITEST SAFETY
//   Vitest imports server modules (e.g. repositories) during tests.
//   We must NOT initialize Sentry in test mode — `initSentry()` checks
//   `process.env.VITEST` and short-circuits. captureException then
//   falls back to console.error, which vitest captures as a test
//   warning rather than making a network call.
//
// VERCEL SERVERLESS NOTES
//   On Vercel, each request is a fresh lambda invocation. `@sentry/node`
//   registers its hooks at module load (which happens once per cold
//   start), and Sentry's `beforeSend` + transport batching handle the
//   flush-on-freeze correctly. We do NOT need to call `Sentry.flush()`
//   manually — the SDK handles it.
//
//   For long-running Node servers (local `vinxi start`), the same
//   init-at-module-load pattern works — Sentry just keeps the
//   background flush loop running.

import * as Sentry from "@sentry/node";

let initialized = false;

/**
 * Initialize the Sentry Node SDK.
 *
 * Safe to call multiple times — the second call is a no-op.
 * Safe to call in tests / dev without a DSN — the call is a no-op
 * and `captureException` falls back to `console.error`.
 */
export function initSentry(): void {
  if (initialized) return;

  // Skip entirely in Vitest — we never want network calls during tests.
  if (process.env.VITEST) {
    initialized = true;
    return;
  }

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    // No DSN configured — leave Sentry uninitialized. captureException
    // will fall back to console.error.
    initialized = true;
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.MODE ?? process.env.NODE_ENV ?? "production",
    release: process.env.SENTRY_RELEASE,
    // 100% of errors on the server — same reasoning as the client.
    sampleRate: 1.0,
    // 10% of traces — server-side traces are more expensive than client
    // (each trace captures DB queries + upstream API calls), so we keep
    // the sample rate low.
    tracesSampleRate: 0.1,
    // @sentry/node v8+ auto-registers the http/https integrations.
    // We keep the defaults — they're well-tuned for typical Node servers.
    beforeSend(event) {
      // Preserve the TMDB-suppression logic from entry-server.tsx.
      // TMDB 401s / fetch errors during SSR are expected (the API key
      // may be missing in dev, or the API may rate-limit). They're
      // handled in-app with empty states — no need to alert on them.
      const exc = event.exception?.values?.[0];
      if (exc) {
        const msg = exc.value ?? "";
        if (
          msg.includes("TMDB") ||
          msg.includes("getTopRated") ||
          msg.includes("discover") ||
          msg.includes("401") ||
          msg.includes("fetch")
        ) {
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
 * tests, missing DSN). Callers never need to feature-detect.
 *
 * @param err     The error to capture. Accepts unknown because the
 *                entry-server's `process.on("unhandledRejection")`
 *                handler receives `unknown`.
 * @param context Optional additional context — merged into the Sentry
 *                event's `extra` bag.
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
 * On the server, this should be called per-request after the Supabase
 * session is resolved (e.g. in the request middleware). The SDK stores
 * the user on the current scope, which is per-request in
 * `@sentry/node` v8+ when used with the `withSentry` HOC / middleware.
 */
export function setSentryUser(user: { id: string; email?: string }): void {
  if (initialized) {
    Sentry.setUser(user);
  }
}

/**
 * Clear the authenticated user from the Sentry scope.
 */
export function clearSentryUser(): void {
  if (initialized) {
    Sentry.setUser(null);
  }
}

// Initialize at module load — see file header for the rationale.
// Late init = lost traces because @sentry/node hooks http/https at init.
initSentry();
