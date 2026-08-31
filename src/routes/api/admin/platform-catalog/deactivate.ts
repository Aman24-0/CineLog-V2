// src/routes/api/admin/platform-catalog/deactivate.ts
//
// CineLog V2 — Admin Platform Catalogue API — Deactivate providers
// ---------------------------------------------------------------------
// Deactivates one or more published providers for a country — sets
// `active = false`. The user-side Library Platform filter then no
// longer sees them in the dropdown. The rows are NOT deleted, so the
// admin can re-publish them later if the provider reappears in a
// JustWatch fetch (no data loss from a transient JustWatch response).
//
// Endpoint:
//   POST /api/admin/platform-catalog/deactivate
//   Body: {
//     "country": "XX",
//     "technical_names": ["netflix", "prime"]
//   }
//
// Response (200):
//   { "ok": true, "deactivated": 2 }
//
// Auth: admin-only via requireAdmin. Audit-logged.

import {
  requireAdmin,
  type AdminAPIEvent
} from "~/lib/supabase/admin/adminGuard";
import { logAdminAction } from "~/lib/supabase/admin/auditLog";
import { enforceAdminMutationRateLimit } from "~/lib/server/adminRateLimit";
import { deactivateProviders } from "~/server/justwatch/cache";

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

  const rateLimit = await enforceAdminMutationRateLimit(
    event,
    adminResult.admin,
    "platform-catalog:deactivate"
  );
  if (rateLimit) return rateLimit;

  try {
    const body = (await event.request.json().catch(() => ({}))) as {
      country?: string;
      technical_names?: string[];
    };
    const country = normalizeCountry(body.country ?? null);
    if (!country) {
      return jsonResponse({ error: "Missing or invalid country code" }, 400);
    }
    const technicalNames = Array.isArray(body.technical_names)
      ? body.technical_names.filter(
          (n): n is string => typeof n === "string" && n.length > 0
        )
      : [];
    if (technicalNames.length === 0) {
      return jsonResponse({ error: "No providers to deactivate" }, 400);
    }

    await deactivateProviders(country, technicalNames);

    await logAdminAction(event, adminResult.admin, {
      action: "platform-catalog:deactivate",
      entity_type: "justwatch_provider_catalog",
      entity_id: country,
      payload: { country, technicalNames }
    });

    return jsonResponse({ ok: true, deactivated: technicalNames.length });
  } catch (err) {
    console.warn(
      "[/api/admin/platform-catalog/deactivate] error:",
      err instanceof Error ? err.message : String(err)
    );
    return jsonResponse({ error: "Failed to deactivate providers" }, 500);
  }
}
