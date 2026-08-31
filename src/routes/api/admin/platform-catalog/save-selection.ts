// src/routes/api/admin/platform-catalog/save-selection.ts
//
// CineLog V2 — Admin Platform Catalogue API — Save Selection
// ---------------------------------------------------------------------
// Saves the admin's EXACT selected set as the complete published
// catalogue for a country. This replaces the old additive "Add
// Selected" semantics.
//
// After this call:
//   - every provider in `providers` has `active = true` for the
//     given country (inserted if it doesn't exist, upserted if it
//     does);
//   - EVERY OTHER row for the same country has `active = false`
//     (rows are NOT physically deleted — they're preserved for re-
//     publish later);
//   - rows for OTHER countries are NOT touched (country isolation).
//
// Endpoint:
//   POST /api/admin/platform-catalog/save-selection
//   Body: {
//     "country": "XX",
//     "providers": [
//       { "id": "...", "clearName": "Netflix", "shortName": "NF",
//         "technicalName": "netflix", "icon": "/icon/..." },
//       ...
//     ]
//   }
//
// Response (200):
//   { "ok": true, "published": 4, "deactivated": 87 }
//
// Behavior:
//   1. requireAdmin — 401 if not authenticated.
//   2. enforceAdminMutationRateLimit — 429 if too many mutations.
//   3. Validate `country` (2-letter ISO code).
//   4. Validate `providers` (array of JustWatchPackage with
//      technicalName + clearName).
//   5. Call `saveSelectionToPublishedCatalog(country, providers)`.
//   6. logAdminAction — audit log entry for the catalogue
//      replacement (action: "platform-catalog:save-selection").
//   7. Return `{ ok, published, deactivated }`.
//
// The `providers` array is the admin's COMPLETE selection — not a
// delta. An empty array is allowed (it deactivates ALL rows for the
// country); the admin UI guards against accidental zero-selection
// with a confirm dialog, but the server allows it because the empty
// catalogue is a valid state (e.g. the admin wants to temporarily
// hide all platforms for a country).
//
// Auth: admin-only via requireAdmin. Audit-logged. Rate-limited.

import {
  requireAdmin,
  type AdminAPIEvent
} from "~/lib/supabase/admin/adminGuard";
import { logAdminAction } from "~/lib/supabase/admin/auditLog";
import { enforceAdminMutationRateLimit } from "~/lib/server/adminRateLimit";
import { saveSelectionToPublishedCatalog } from "~/server/justwatch/cache";
import type { JustWatchPackage } from "~/shared/types/justwatch";

type APIEvent = AdminAPIEvent;

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

export async function POST(event: APIEvent): Promise<Response> {
  const adminResult = await requireAdmin(event);
  if (!adminResult.ok) return jsonResponse({ error: "Unauthorized" }, 401);

  // Rate-limit admin mutations. The action name is distinct from the
  // old "publish" action so a single admin's save-selection rate is
  // tracked independently.
  const rateLimit = await enforceAdminMutationRateLimit(
    event,
    adminResult.admin,
    "platform-catalog:save-selection"
  );
  if (rateLimit) return rateLimit;

  try {
    const body = (await event.request.json().catch(() => ({}))) as {
      country?: string;
      providers?: JustWatchPackage[];
    };
    const country = normalizeCountry(body.country ?? null);
    if (!country) {
      return jsonResponse({ error: "Missing or invalid country code" }, 400);
    }

    // `providers` is allowed to be empty (the zero-selection case —
    // deactivates ALL rows for the country). We just validate it's an
    // array if present.
    const providers = Array.isArray(body.providers) ? body.providers : [];

    // Defensive: filter out malformed entries (missing technicalName
    // or clearName). The cache helper re-validates, but filtering
    // here too means the audit log reflects the ACTUAL providers
    // saved, not the raw input.
    const validProviders: JustWatchPackage[] = providers.filter(
      (p): p is JustWatchPackage =>
        !!p &&
        typeof p.technicalName === "string" &&
        typeof p.clearName === "string" &&
        p.technicalName.length > 0 &&
        p.clearName.length > 0
    );

    const { published, deactivated } = await saveSelectionToPublishedCatalog(
      country,
      validProviders
    );

    // Audit log. The payload includes the selected technical names
    // AND the count of deactivated rows so a future auditor can
    // reconstruct the before/after state.
    await logAdminAction(event, adminResult.admin, {
      action: "platform-catalog:save-selection",
      entity_type: "justwatch_provider_catalog",
      entity_id: country,
      payload: {
        country,
        published,
        deactivated,
        selectedTechnicalNames: validProviders.map((p) => p.technicalName)
      }
    });

    return jsonResponse({ ok: true, published, deactivated });
  } catch (err) {
    console.warn(
      "[/api/admin/platform-catalog/save-selection] error:",
      err instanceof Error ? err.message : String(err)
    );
    return jsonResponse({ error: "Failed to save selection" }, 500);
  }
}
