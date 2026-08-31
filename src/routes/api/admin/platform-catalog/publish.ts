// src/routes/api/admin/platform-catalog/publish.ts
//
// CineLog V2 — Admin Platform Catalogue API — Publish providers
// ---------------------------------------------------------------------
// Publishes one or more JustWatch providers for a country — sets
// `active = true` (inserting the row if it doesn't exist yet). The
// user-side Library Platform filter then sees these providers in
// its dropdown.
//
// Endpoint:
//   POST /api/admin/platform-catalog/publish
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
//   { "ok": true, "published": 3 }
//
// The `providers` array is typically a subset of the JustWatch
// fetch response (e.g. the admin clicks "Add Selected" with two
// NEW providers selected, or "Add All New" with all NEW providers).
// Publishing an already-published row is a no-op (the upsert
// refreshes `last_fetched_at` and `published_at` to now).
//
// Auth: admin-only via requireAdmin. Audit-logged.

import {
  requireAdmin,
  type AdminAPIEvent
} from "~/lib/supabase/admin/adminGuard";
import { logAdminAction } from "~/lib/supabase/admin/auditLog";
import { enforceAdminMutationRateLimit } from "~/lib/server/adminRateLimit";
import { publishProviders } from "~/server/justwatch/cache";
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

  // Rate-limit admin mutations.
  const rateLimit = await enforceAdminMutationRateLimit(
    event,
    adminResult.admin,
    "platform-catalog:publish"
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
    const providers = Array.isArray(body.providers) ? body.providers : [];
    if (providers.length === 0) {
      return jsonResponse({ error: "No providers to publish" }, 400);
    }
    // Defensive: filter out malformed entries.
    const validProviders: JustWatchPackage[] = providers.filter(
      (p): p is JustWatchPackage =>
        !!p &&
        typeof p.technicalName === "string" &&
        typeof p.clearName === "string" &&
        p.technicalName.length > 0 &&
        p.clearName.length > 0
    );

    await publishProviders(country, validProviders);

    // Audit log
    await logAdminAction(event, adminResult.admin, {
      action: "platform-catalog:publish",
      entity_type: "justwatch_provider_catalog",
      entity_id: country,
      payload: {
        country,
        count: validProviders.length,
        technicalNames: validProviders.map((p) => p.technicalName)
      }
    });

    return jsonResponse({ ok: true, published: validProviders.length });
  } catch (err) {
    console.warn(
      "[/api/admin/platform-catalog/publish] error:",
      err instanceof Error ? err.message : String(err)
    );
    return jsonResponse({ error: "Failed to publish providers" }, 500);
  }
}
