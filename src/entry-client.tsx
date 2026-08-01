// src/entry-client.tsx
//
// CineLog V2 — Browser Entry Point
// ---------------------------------------------------------------------
// Mounts the SolidJS app and registers the service worker in production.
//
// Service Worker registration:
//   • Only runs in production (import.meta.env.PROD) — dev mode skips
//     registration to avoid caching issues while the SW file is being
//     iterated on.
//   • Only runs if the browser supports service workers AND the page is
//     served over HTTPS (or from localhost). Vercel enforces HTTPS in
//     production, so this is always safe on the deployed site.
//   • Registered on window load (deferred) so it doesn't compete with
//     initial hydration for bandwidth/CPU.
//   • Failures are logged but never thrown — a broken SW registration
//     must NOT prevent the app from working. Web Push simply becomes
//     unavailable until the next visit.
//   • On registration success, listen for a new SW waiting to activate
//     (i.e. a deploy shipped a new sw.js) and prompt it to take over
//     immediately via skipWaiting(). The user gets the new SW on the
//     next navigation without an explicit reload prompt — acceptable
//     for an SPA like CineLog where the SW changes infrequently.

import { mount, StartClient } from "@solidjs/start/client";
import { injectSpeedInsights } from "@vercel/speed-insights";

// Initialize Vercel Speed Insights for production Core Web Vitals
// collection. injectSpeedInsights() is a no-op in development and during
// SSR — it only activates on the deployed Vercel preview/production URL.
// This call must happen AFTER the app mounts so the SDK can hook into
// the correct navigation/route-change events.
injectSpeedInsights();

mount(() => <StartClient />, document.getElementById("app")!);

// ─── Service Worker registration (production only) ──────────────────
// Runs AFTER mount() so hydration isn't blocked. The browser will
// schedule this on the next idle frame.
if (
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  import.meta.env.PROD
) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        //console.log("[SW] Registered with scope:", registration.scope);

        // Watch for a new SW waiting to take over. When a new version
        // is installed (e.g. after a deploy), skipWaiting() so it
        // activates immediately on the next navigation.
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            if (
              newWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              // A new SW has finished installing and is waiting. Tell
              // it to skip waiting — it will activate on the next
              // navigation.
              newWorker.postMessage("SKIP_WAITING");
            }
          });
        });
      })
      .catch((err) => {
        // SW registration failures are non-fatal — the app works
        // without push notifications. Log so it's visible in devtools
        // but don't propagate.
        console.warn("[SW] Registration failed:", err);
      });
  });
}
