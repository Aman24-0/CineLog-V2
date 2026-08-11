// src/features/discover/hooks/useDiscoverTaste.ts
//
// CineLog V2 — Discover Taste Profile Hook (Phase 7 Task 4)
// ---------------------------------------------------------------------
// Derives a `TasteProfile` from the user's vault.
//
// Phase 7 Task 4 — SERVER-SIDE PREFERRED, LOCAL FALLBACK
// ------------------------------------------------------
// The hook now prefers to fetch the taste profile from the server-side
// `/api/discover/taste` route. This is the architectural seam for
// future ML / collaborative-filtering recommendations — swapping the
// server implementation from a pure heuristic to an ML model is a
// one-file change that doesn't affect the client.
//
// Architecture:
//   1. On mount: fire `fetch('/api/discover/taste')`.
//   2. While the request is in-flight: compute the profile LOCALLY
//      from the in-memory watchlist via `computeTasteProfile` (the
//      shared pure function from `src/lib/discover/tasteProfile.ts`).
//      This gives an instant first paint with the same shape.
//   3. When the server response arrives: replace the local profile
//      with the server's profile (canonical).
//   4. If the server request fails (network error, 401, 500): fall
//      back to the local computation for this session.
//
// The local computation uses the SAME pure function as the server, so
// the two produce identical profiles today — the server fetch is the
// seam for future divergence (ML model, collaborative filtering, etc.).
//
// COLD START
// ----------
// If the user has no vault signal (guest, empty vault, or no
// rated/completed titles), `isColdStart` is true and the Discover
// page falls back to a generic-but-curated experience. This is by
// design — we never show fake personalization.

import { createMemo, createResource, type Accessor } from "solid-js";
import type { WatchlistItem, TasteProfile } from "~/shared/types";
import { computeTasteProfile } from "~/lib/discover/tasteProfile";
import { getAuthHeaders } from "~/lib/supabase/session";

interface UseDiscoverTasteArgs {
  watchlist: Accessor<WatchlistItem[]>;
  isGuest: Accessor<boolean>;
}

/**
 * Fetch the taste profile from the server API route.
 *
 * Returns `null` on any error (network, 401, 5xx, parse error) so the
 * caller falls back to the local computation. Errors are logged at
 * warn level — they're expected during development (the route may not
 * be running) and shouldn't spam production error tracking.
 */
async function fetchServerTaste(): Promise<TasteProfile | null> {
  // Skip fetch on the server (SSR) — there's no session cookie yet,
  // and the route would 401. The client re-fetches after hydration.
  if (typeof window === "undefined") return null;
  try {
    // Phase 13 Chunk 1: send the Supabase access token via the
    // Authorization header. The browser stores sessions in
    // localStorage (NOT cookies), so the server cannot read the
    // session from the Cookie header — without this header the
    // route returns 401 for every signed-in browser user.
    const resp = await fetch("/api/discover/taste", {
      credentials: "include",
      headers: { ...await getAuthHeaders() }
    });
    if (!resp.ok) {
      if (resp.status !== 401) {
        console.warn(
          `[useDiscoverTaste] /api/discover/taste returned ${resp.status}, falling back to local computation.`
        );
      }
      return null;
    }
    const body = (await resp.json()) as { profile: TasteProfile };
    return body.profile;
  } catch (err) {
    console.warn(
      "[useDiscoverTaste] /api/discover/taste fetch failed, falling back to local computation:",
      err
    );
    return null;
  }
}

export function useDiscoverTaste(args: UseDiscoverTasteArgs) {
  // ── Local profile (computed synchronously, instant first paint) ──
  // Uses the SAME pure function as the server route, so the two
  // produce identical profiles today. This is the fallback if the
  // server fetch fails.
  const localProfile = createMemo<TasteProfile>(() => {
    return computeTasteProfile(args.watchlist(), args.isGuest());
  });

  // ── Server profile (preferred, async) ────────────────────────────
  // We use a `createResource` with a source signal that returns `true`
  // only when the user is signed in (NOT a guest). This is the Phase 18
  // deep fix for the 401-on-mount bug:
  //
  //   ROOT CAUSE: the old code used `() => true` as the source, so the
  //   fetch fired IMMEDIATELY on mount — before the Supabase session
  //   had finished loading from localStorage. At that moment,
  //   getAuthHeaders() returned `{}` (no session yet), so the request
  //   went out with no Authorization header → 401. The 401 was logged
  //   to the console as a warning, flooding the console on every page
  //   load with a spurious auth error.
  //
  //   FIX: gate the source on `!isGuest()`. The isGuest accessor flips
  //   to false only AFTER authReady resolves (see useAuth). So the
  //   fetch only fires once we actually have a session, and the
  //   Authorization header is always populated. The 401 is gone.
  //
  //   For guests, the source returns false → the fetch never fires →
  //   serverProfile stays undefined → the local profile (which handles
  //   the guest case via computeTasteProfile) is used.
  //
  // We don't want it to re-fire on every vault change (that would
  // defeat the purpose of moving the computation server-side — we'd
  // be making the server do the work AND re-fetching on every rating).
  // Instead, the server profile is a "snapshot" that's refreshed on
  // the next mount (or manually). The local memo continues to update
  // reactively for instant UI feedback, and the server profile
  // replaces it when it arrives. On the NEXT mount, the local memo
  // starts fresh and the server fetch fires again with the latest
  // vault.
  const [serverProfile] = createResource<TasteProfile | null, boolean>(
    () => !args.isGuest(),
    async (shouldFetch) => {
      if (!shouldFetch) return null;
      return fetchServerTaste();
    }
  );

  // ── Public profile accessor ──────────────────────────────────────
  // Prefer the server profile when it's available; fall back to the
  // local memo otherwise. This is what every Discover hook consumes.
  //
  //   • While the server fetch is in-flight: serverProfile() === undefined
  //     → use localProfile() (instant).
  //   • When the server fetch succeeds with a non-null value: use it
  //     (canonical).
  //   • When the server fetch succeeds with null (error / fallback):
  //     use localProfile() (graceful degradation).
  //   • When the server fetch errors: serverProfile() === undefined
  //     → use localProfile() (graceful degradation).
  const profile = createMemo<TasteProfile>(() => {
    const server = serverProfile();
    if (server === undefined || server === null) {
      return localProfile();
    }
    return server;
  });

  return { profile };
}
