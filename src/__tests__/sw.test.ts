// src/__tests__/sw.test.ts
//
// Smoke test for the service worker file (Phase 7 Task 1).
//
// The SW is a plain JS file (not TypeScript) and runs in a separate
// scope, so we don't unit-test its internals. Instead we verify the
// file's STRUCTURE — that it defines the three required strategies
// and the cache names — so a regression (e.g. someone removes a
// strategy) is caught at test time.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SW_PATH = resolve(__dirname, "../../public/sw.js");

function readSw(): string {
  return readFileSync(SW_PATH, "utf-8");
}

describe("public/sw.js — PWA runtime caching (Phase 7 Task 1)", () => {
  it("defines the three cache names (static, html, runtime)", () => {
    const sw = readSw();
    expect(sw).toContain("CACHE_STATIC");
    expect(sw).toContain("CACHE_HTML");
    expect(sw).toContain("CACHE_RUNTIME");
  });

  it("registers a fetch event handler", () => {
    const sw = readSw();
    expect(sw).toMatch(/addEventListener\(["']fetch["']/);
  });

  it("implements Cache-First strategy for static assets", () => {
    const sw = readSw();
    // The strategy function + a reference to it from the fetch handler.
    expect(sw).toContain("cacheFirstStatic");
    expect(sw).toContain("CACHE_STATIC");
  });

  it("implements Network-First strategy for HTML navigations", () => {
    const sw = readSw();
    expect(sw).toContain("networkFirstHtml");
    expect(sw).toContain('req.mode === "navigate"');
  });

  it("implements Stale-While-Revalidate for API + TMDB images", () => {
    const sw = readSw();
    expect(sw).toContain("staleWhileRevalidate");
    expect(sw).toContain("image.tmdb.org");
  });

  it("skips non-GET requests (mutations must hit the network)", () => {
    const sw = readSw();
    expect(sw).toMatch(/req\.method\s*!==\s*["']GET["']/);
  });

  it("skips Supabase auth + realtime endpoints", () => {
    const sw = readSw();
    // Auth endpoints — caching these would break session refresh.
    expect(sw).toContain("/auth/v1/");
    expect(sw).toContain("/realtime/v1/");
  });

  it("skips /api/push/* and /api/email/* (mutation endpoints)", () => {
    const sw = readSw();
    expect(sw).toContain("/api/push/");
    expect(sw).toContain("/api/email/");
  });

  it("pre-caches the app shell on install", () => {
    const sw = readSw();
    expect(sw).toContain("APP_SHELL_URLS");
    expect(sw).toContain('"/"');
    expect(sw).toContain('"/offline.html"');
  });

  it("cleans up old cache versions on activate", () => {
    const sw = readSw();
    expect(sw).toContain("caches.keys()");
    expect(sw).toContain("caches.delete");
  });

  it("bounds cache sizes with MAX_*_ENTRIES caps", () => {
    const sw = readSw();
    expect(sw).toContain("MAX_STATIC_ENTRIES");
    expect(sw).toContain("MAX_HTML_ENTRIES");
    expect(sw).toContain("MAX_RUNTIME_ENTRIES");
    expect(sw).toContain("trimCache");
  });
});
