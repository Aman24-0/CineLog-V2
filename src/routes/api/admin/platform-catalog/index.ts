// src/routes/api/admin/platform-catalog/index.ts
//
// CineLog V2 — Admin Platform Catalogue API — list saved rows
// ---------------------------------------------------------------------
// Returns the FULL saved provider catalogue for a country (active +
// inactive rows), with admin-only fields. Used by the admin Platform
// Catalogue page to render the current state of the published
// catalogue before fetching from JustWatch.
//
// Endpoint:
//   GET /api/admin/platform-catalog?country=XX
//
// Response (200):
//   {
//     "country": "IN",
//     "rows": [
//       {
//         "country": "IN",
//         "package_id": "cGF8...",
//         "clear_name": "Netflix",
//         "short_name": "NF",
//         "technical_name": "netflix",
//         "icon_template": "/icon/4982/{profile}/{technicalName}.{format}",
//         "fetched_at": "2026-08-...",
//         "expires_at": "2036-08-...",
//         "active": true,
//         "last_fetched_at": "2026-08-...",
//         "published_at": "2026-08-...",
//         "updated_at": "2026-08-..."
//       },
//       ...
//     ]
//   }
//
// Auth: admin-only via requireAdmin.

import {
  requireAdmin,
  type AdminAPIEvent
} from "~/lib/supabase/admin/adminGuard";
import { getFullProviderCatalog } from "~/server/justwatch/cache";

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

export async function GET(event: APIEvent): Promise<Response> {
  const adminResult = await requireAdmin(event);
  if (!adminResult.ok) return jsonResponse({ error: "Unauthorized" }, 401);

  const url = new URL(event.request.url);
  const country = normalizeCountry(url.searchParams.get("country"));
  if (!country) {
    return jsonResponse({ error: "Missing or invalid country code" }, 400);
  }

  const rows = await getFullProviderCatalog(country);
  // `rows === null` means a cache init error — return empty array so
  // the admin UI can still render the page (with a diagnostic note).
  return jsonResponse({ country, rows: rows ?? [] });
}
