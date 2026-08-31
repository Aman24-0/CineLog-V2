// src/routes/api/admin/platform-catalog/fetch.ts
//
// CineLog V2 — Admin Platform Catalogue API — Fetch from JustWatch
// ---------------------------------------------------------------------
// Calls JustWatch's `packages(country, platform: WEB)` endpoint and
// returns a DIFF against the saved Supabase catalogue for the same
// country. The admin uses this to see which providers are NEW,
// UPDATED, REMOVED, or already SAVED.
//
// Endpoint:
//   POST /api/admin/platform-catalog/fetch
//   Body: { "country": "XX" }
//
// Response (200):
//   {
//     "country": "IN",
//     "fetched_at": "2026-08-...T...Z",
//     "duration_ms": 432,
//     "justwatch_providers": [ { ...JustWatchPackage }, ... ],
//     "saved_rows": [ { ...ProviderCatalogRow }, ... ],
//     "diff": [
//       {
//         "technical_name": "netflix",
//         "clear_name": "Netflix",
//         "status": "SAVED",            // SAVED | NEW | UPDATED | REMOVED
//         "justwatch": { ...JustWatchPackage } | null,
//         "saved": { ...ProviderCatalogRow } | null
//       },
//       ...
//     ],
//     "summary": {
//       "saved": 10,
//       "new": 2,
//       "updated": 1,
//       "removed": 0
//     }
//   }
//
// Behavior:
//   1. Admin-auth via requireAdmin.
//   2. Validate `country` (2-letter ISO code).
//   3. Call `getJustWatchPackages({ country, platform: "WEB" })` —
//      live JustWatch fetch (admin-only path).
//   4. Call `getFullProviderCatalog(country)` — current saved state.
//   5. Build the diff:
//        SAVED   — row exists in Supabase with matching metadata.
//        NEW     — JustWatch returned a provider not in Supabase.
//        UPDATED — row exists but metadata (clearName/shortName/icon)
//                  differs from JustWatch's latest response.
//        REMOVED — row exists in Supabase but JustWatch no longer
//                  returns it (the row is NOT deleted — admin decides).
//   6. Stamp `last_fetched_at = now()` on saved rows that still
//      appear in the JustWatch response (so the admin UI can show
//      "last seen" without requiring the admin to publish).
//   7. Return the comparison payload.
//
// This route is the ONLY place in the app that calls JustWatch's
// `packages()` endpoint directly. The user-side route
// (`/api/ott/providers`) reads ONLY from Supabase.

import {
  requireAdmin,
  type AdminAPIEvent
} from "~/lib/supabase/admin/adminGuard";
import { getJustWatchPackages } from "~/server/justwatch/client";
import {
  getFullProviderCatalog,
  markProvidersLastFetched,
  type ProviderCatalogRow
} from "~/server/justwatch/cache";
import type { JustWatchPackage } from "~/shared/types/justwatch";

type APIEvent = AdminAPIEvent;

type DiffStatus = "SAVED" | "NEW" | "UPDATED" | "REMOVED";

interface DiffEntry {
  technical_name: string;
  clear_name: string;
  status: DiffStatus;
  justwatch: JustWatchPackage | null;
  saved: ProviderCatalogRow | null;
}

interface FetchResponse {
  country: string;
  fetched_at: string;
  duration_ms: number;
  justwatch_providers: JustWatchPackage[];
  saved_rows: ProviderCatalogRow[];
  diff: DiffEntry[];
  summary: {
    saved: number;
    new: number;
    updated: number;
    removed: number;
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function normalizeCountry(value: string | null): string | null {
  if (!value) return null;
  const upper = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(upper) ? upper : null;
}

function metadataMatches(jw: JustWatchPackage, row: ProviderCatalogRow): boolean {
  return (
    jw.clearName === row.clear_name &&
    jw.shortName === row.short_name &&
    jw.icon === row.icon_template &&
    jw.id === row.package_id
  );
}

export async function POST(event: APIEvent): Promise<Response> {
  const adminResult = await requireAdmin(event);
  if (!adminResult.ok) return jsonResponse({ error: "Unauthorized" }, 401);

  try {
    const body = (await event.request.json().catch(() => ({}))) as {
      country?: string;
    };
    const country = normalizeCountry(body.country ?? null);
    if (!country) {
      return jsonResponse({ error: "Missing or invalid country code" }, 400);
    }

    const startedAt = Date.now();
    const fetchedAtIso = new Date().toISOString();

    // 1. Live JustWatch fetch (admin-only path).
    const justwatchProviders = await getJustWatchPackages({
      country,
      platform: "WEB"
    });

    // 2. Saved Supabase rows.
    const savedRows = (await getFullProviderCatalog(country)) ?? [];

    // 3. Build maps for O(1) lookup.
    const jwMap = new Map<string, JustWatchPackage>();
    for (const p of justwatchProviders) {
      if (p && p.technicalName) jwMap.set(p.technicalName, p);
    }
    const savedMap = new Map<string, ProviderCatalogRow>();
    for (const r of savedRows) {
      if (r && r.technical_name) savedMap.set(r.technical_name, r);
    }

    // 4. Build the diff. Iterate the UNION of technical_names.
    const allKeys = new Set<string>([
      ...jwMap.keys(),
      ...savedMap.keys()
    ]);

    const diff: DiffEntry[] = [];
    let savedCount = 0;
    let newCount = 0;
    let updatedCount = 0;
    let removedCount = 0;
    const stillPresentTechnicalNames: string[] = [];

    allKeys.forEach((key) => {
      const jw = jwMap.get(key) ?? null;
      const saved = savedMap.get(key) ?? null;

      let status: DiffStatus;
      if (jw && saved) {
        if (metadataMatches(jw, saved)) {
          status = "SAVED";
          savedCount++;
        } else {
          status = "UPDATED";
          updatedCount++;
        }
        stillPresentTechnicalNames.push(key);
      } else if (jw && !saved) {
        status = "NEW";
        newCount++;
      } else {
        // !jw && saved — JustWatch no longer returns it.
        status = "REMOVED";
        removedCount++;
      }

      diff.push({
        technical_name: key,
        clear_name: jw?.clearName ?? saved?.clear_name ?? key,
        status,
        justwatch: jw,
        saved
      });
    });

    // Sort the diff: NEW first, then UPDATED, then REMOVED, then SAVED.
    // Within each status, sort by clear_name ascending.
    const STATUS_ORDER: Record<DiffStatus, number> = {
      NEW: 0,
      UPDATED: 1,
      REMOVED: 2,
      SAVED: 3
    };
    diff.sort((a, b) => {
      if (a.status !== b.status) {
        return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      }
      return a.clear_name.localeCompare(b.clear_name);
    });

    // 5. Stamp `last_fetched_at = now()` for saved rows that JustWatch
    //    still returns (so the admin UI can show "last seen in fetch").
    //    This is a metadata-only update — the `active` flag is NOT
    //    touched. Errors are swallowed inside the cache layer.
    if (stillPresentTechnicalNames.length > 0) {
      await markProvidersLastFetched(country, stillPresentTechnicalNames);
    }

    const duration_ms = Date.now() - startedAt;

    const response: FetchResponse = {
      country,
      fetched_at: fetchedAtIso,
      duration_ms,
      justwatch_providers: justwatchProviders,
      saved_rows: savedRows,
      diff,
      summary: {
        saved: savedCount,
        new: newCount,
        updated: updatedCount,
        removed: removedCount
      }
    };

    return jsonResponse(response);
  } catch (err) {
    console.warn(
      "[/api/admin/platform-catalog/fetch] error:",
      err instanceof Error ? err.message : String(err)
    );
    return jsonResponse(
      { error: "Failed to fetch JustWatch catalogue" },
      500
    );
  }
}
