// src/routes/api/admin/platform-catalog/update.ts
//
// CineLog V2 — Admin Platform Catalogue API — Update provider metadata
// ---------------------------------------------------------------------
// Updates a single provider's display metadata (clearName / shortName /
// icon_template) in the saved Supabase catalogue. Stamps `updated_at`
// so the admin UI can show when the row was last manually edited.
// The `active` flag is NOT touched (a metadata edit doesn't change
// publish state).
//
// Endpoint:
//   POST /api/admin/platform-catalog/update
//   Body: {
//     "country": "XX",
//     "technical_name": "netflix",
//     "clear_name": "Netflix",         // optional
//     "short_name": "NF",              // optional
//     "icon_template": "/icon/..."     // optional
//   }
//
// Response (200): { "ok": true }
// Response (400): { "error": "..." } (missing fields)
// Response (401): { "error": "Unauthorized" }
// Response (500): { "error": "Failed to update provider" }
//
// Auth: admin-only via requireAdmin. Audit-logged.

import {
  requireAdmin,
  type AdminAPIEvent
} from "~/lib/supabase/admin/adminGuard";
import { logAdminAction } from "~/lib/supabase/admin/auditLog";
import { enforceAdminMutationRateLimit } from "~/lib/server/adminRateLimit";
import { updateProviderMetadata } from "~/server/justwatch/cache";

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
    "platform-catalog:update-metadata"
  );
  if (rateLimit) return rateLimit;

  try {
    const body = (await event.request.json().catch(() => ({}))) as {
      country?: string;
      technical_name?: string;
      clear_name?: string;
      short_name?: string;
      icon_template?: string;
    };
    const country = normalizeCountry(body.country ?? null);
    const technicalName =
      typeof body.technical_name === "string" ? body.technical_name : null;
    if (!country || !technicalName) {
      return jsonResponse(
        { error: "Missing country or technical_name" },
        400
      );
    }
    // At least one of the optional metadata fields must be present.
    if (
      typeof body.clear_name !== "string" &&
      typeof body.short_name !== "string" &&
      typeof body.icon_template !== "string"
    ) {
      return jsonResponse(
        { error: "No metadata fields to update" },
        400
      );
    }

    await updateProviderMetadata(country, technicalName, {
      clearName: body.clear_name,
      shortName: body.short_name,
      iconTemplate: body.icon_template
    });

    await logAdminAction(event, adminResult.admin, {
      action: "platform-catalog:update-metadata",
      entity_type: "justwatch_provider_catalog",
      entity_id: `${country}:${technicalName}`,
      payload: {
        country,
        technicalName,
        clearName: body.clear_name,
        shortName: body.short_name,
        iconTemplate: body.icon_template
      }
    });

    return jsonResponse({ ok: true });
  } catch (err) {
    console.warn(
      "[/api/admin/platform-catalog/update] error:",
      err instanceof Error ? err.message : String(err)
    );
    return jsonResponse({ error: "Failed to update provider" }, 500);
  }
}
