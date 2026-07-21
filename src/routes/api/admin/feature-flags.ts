// src/routes/api/admin/feature-flags.ts
//
// CineLog V2 — Admin Feature Flags API
// ---------------------------------------------------------------------
// GET  /api/admin/feature-flags — return all feature flags
// PUT  /api/admin/feature-flags — update one or more flags
//
// Flags are stored as a JSONB object in app_config table:
//   key: 'feature_flags'
//   value: { "imdb_integration": true, "streaming_button": false, ... }
//
// All mutations are audit-logged.

import { requireAdmin, type AdminAPIEvent } from "~/lib/supabase/admin/adminGuard";
import { createAdminClient } from "~/lib/supabase/admin/adminClient";
import { logAdminAction } from "~/lib/supabase/admin/auditLog";

interface APIEvent extends AdminAPIEvent {}

interface FeatureFlags {
  [key: string]: boolean;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ─── GET /api/admin/feature-flags ─────────────────────────────────

export async function GET(event: APIEvent) {
  const adminResult = await requireAdmin(event);
  if (!adminResult.ok) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", "feature_flags")
      .single();

    if (error || !data) {
      // No row yet — return defaults
      return jsonResponse({
        flags: {
          imdb_integration: true,
          streaming_button: true,
          upcoming: true,
          random_picker: true,
          ai_recommendations: false,
          experimental_features: false,
        } satisfies FeatureFlags,
      });
    }

    return jsonResponse({ flags: data.value as FeatureFlags });
  } catch (err) {
    console.error("[CineLog Admin] Feature flags GET error:", err);
    return jsonResponse({ error: "Server error" }, 500);
  }
}

// ─── PUT /api/admin/feature-flags ─────────────────────────────────
//
// Body: { flags: { flag_name: boolean, ... } }
//
// Merges the provided flags with the existing flags. Only the flags
// in the request body are updated; others remain unchanged.

export async function PUT(event: APIEvent) {
  const adminResult = await requireAdmin(event);
  if (!adminResult.ok) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  try {
    const body = (await event.request.json().catch(() => ({}))) as {
      flags?: FeatureFlags;
    };

    if (!body.flags || typeof body.flags !== "object") {
      return jsonResponse({ error: "Missing 'flags' object in body" }, 400);
    }

    // Validate all values are booleans
    for (const [key, value] of Object.entries(body.flags)) {
      if (typeof value !== "boolean") {
        return jsonResponse(
          { error: `Flag '${key}' must be a boolean, got ${typeof value}` },
          400,
        );
      }
      if (!/^[a-z_][a-z0-9_]*$/.test(key)) {
        return jsonResponse(
          { error: `Flag name '${key}' must be snake_case (lowercase letters, digits, underscore)` },
          400,
        );
      }
    }

    const supabase = createAdminClient();

    // Fetch current flags
    const { data: existing, error: fetchError } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", "feature_flags")
      .single();

    if (fetchError && fetchError.code !== "PGRST116") {
      // PGRST116 = no rows found, which is fine — we'll create
      console.error("[CineLog Admin] Feature flags fetch error:", fetchError);
      return jsonResponse({ error: "Failed to fetch current flags" }, 500);
    }

    const currentFlags = (existing?.value as FeatureFlags) ?? {};
    const updatedFlags: FeatureFlags = { ...currentFlags, ...body.flags };

    // Upsert
    const { error: upsertError } = await supabase
      .from("app_config")
      .upsert(
        {
          key: "feature_flags",
          value: updatedFlags,
          updated_by: adminResult.admin.id,
        },
        { onConflict: "key" },
      );

    if (upsertError) {
      console.error("[CineLog Admin] Feature flags upsert error:", upsertError);
      return jsonResponse({ error: "Failed to save flags" }, 500);
    }

    // Audit log — log each changed flag
    for (const [key, newValue] of Object.entries(body.flags)) {
      const oldValue = currentFlags[key];
      if (oldValue !== newValue) {
        await logAdminAction(event, adminResult.admin, {
          action: "feature_flag.toggle",
          entity_type: "feature_flag",
          entity_id: key,
          payload: { old: oldValue ?? null, new: newValue },
        });
      }
    }

    return jsonResponse({ ok: true, flags: updatedFlags });
  } catch (err) {
    console.error("[CineLog Admin] Feature flags PUT error:", err);
    return jsonResponse({ error: "Server error" }, 500);
  }
}
