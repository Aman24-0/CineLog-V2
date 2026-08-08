// src/routes/api/ai/status.ts
//
// CineLog V2 — Public AI Status API
// ---------------------------------------------------------------------
// GET /api/ai/status — returns the user-facing subset of AI feature
// flags so the client knows whether to render AI-powered UI sections.
//
// WHY A SEPARATE ENDPOINT (Phase 16 Chunk 1):
//   The admin /api/admin/settings route returns ALL ai_settings flags
//   (including the admin-only `adminAssistantEnabled`) and requires
//   admin auth. The Discover page (and any other user-facing surface)
//   needs to know only TWO things:
//     1. Is the master AI switch on?
//     2. Are user-facing AI recommendations enabled?
//
//   Exposing the admin-assistant flag to anonymous browsers would
//   leak internal config (e.g. an attacker could probe whether the
//   admin panel's AI chat is active). This route deliberately omits
//   `adminAssistantEnabled` from the response.
//
// RESPONSE SHAPE:
//   200 OK:
//     {
//       "masterEnabled": false,
//       "userRecommendationsEnabled": false
//     }
//
//   The response is always 200 — even when AI is fully disabled. The
//   client treats `masterEnabled: false` as "render no AI UI". This
//   is intentional: a 503 would suggest the endpoint is broken, when
//   in fact it's working correctly and reporting that AI is off.
//
// CACHING:
//   • Cache-Control: public, max-age=60, s-maxage=300
//   • Same caching strategy as /api/feature-flags — 1 minute on the
//     client, 5 minutes on the CDN. This means flag toggles take up
//     to 60s to propagate to active users, which is acceptable per
//     the existing feature-flags contract.
//
// SECURITY:
//   • Public (no auth required) — these flags are not secret. The
//     admin-assistant flag is filtered out.
//   • Uses the anon Supabase client (RLS allows public SELECT on
//     app_config). We do NOT use the service-role key here.
//   • Never throws — on any error, returns the safe defaults
//     (masterEnabled: false, userRecommendationsEnabled: false) so
//     the client never sees a 500.

import { createClient } from "@supabase/supabase-js";

interface APIEvent {
  request: Request;
}

/** Public-facing response shape. Notice: NO adminAssistantEnabled. */
interface PublicAiStatus {
  masterEnabled: boolean;
  userRecommendationsEnabled: boolean;
}

/** Safe defaults returned when the DB is unreachable or the row is
 *  missing. AI is OFF until explicitly enabled. */
const DEFAULT_STATUS: PublicAiStatus = {
  masterEnabled: false,
  userRecommendationsEnabled: false
};

/** Build a JSON Response with the standard cache headers. */
function buildResponse(status: PublicAiStatus): Response {
  return new Response(JSON.stringify(status), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      // 1 min browser cache, 5 min CDN cache — matches /api/feature-flags.
      "Cache-Control": "public, max-age=60, s-maxage=300"
    }
  });
}

export async function GET(_event: APIEvent): Promise<Response> {
  try {
    const url = process.env.VITE_SUPABASE_URL;
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

    // No Supabase env vars configured (e.g. local dev without a DB) —
    // return safe defaults so the UI never breaks.
    if (!url || !anonKey) {
      return buildResponse(DEFAULT_STATUS);
    }

    // Use the ANON client — RLS allows public SELECT on app_config.
    // We deliberately do NOT use createAdminClient() here because:
    //   1. The service-role key is not needed (public SELECT is allowed).
    //   2. Using the anon client means this route works even if the
    //      server env is missing SUPABASE_SERVICE_ROLE_KEY (e.g. on
    //      a read-only preview deploy).
    const supabase = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data, error } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", "ai_settings")
      .single();

    // Missing row / DB error → safe defaults.
    if (error || !data) {
      return buildResponse(DEFAULT_STATUS);
    }

    const v = data.value as Record<string, unknown> | null;
    if (!v || typeof v !== "object") {
      return buildResponse(DEFAULT_STATUS);
    }

    const asBool = (val: unknown): boolean =>
      typeof val === "boolean" ? val : false;

    // IMPORTANT: only expose the user-facing flags. The
    // adminAssistantEnabled flag is intentionally omitted.
    return buildResponse({
      masterEnabled: asBool(v.masterEnabled),
      userRecommendationsEnabled: asBool(v.userRecommendationsEnabled)
    });
  } catch (err) {
    // Never leak internals — log server-side, return safe defaults.
    console.error("[CineLog] /api/ai/status GET error:", err);
    return buildResponse(DEFAULT_STATUS);
  }
}
