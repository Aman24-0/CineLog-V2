// src/routes/api/feature-flags.ts
//
// CineLog V2 — Public Feature Flags API
// ---------------------------------------------------------------------
// GET /api/feature-flags — returns the current feature flag values.
//
// This endpoint is PUBLIC (no auth required) — feature flags are not
// secret. The client calls this once on app load and caches the result.
//
// Why a separate endpoint from /api/admin/feature-flags?
//   - The admin endpoint requires admin auth and returns ALL flags.
//   - This endpoint is anon-accessible and returns only the flags
//     that affect the consumer app (no admin-only flags).
//   - This endpoint is heavily cached (5 minutes) on the CDN.

import { createClient } from "@supabase/supabase-js";

interface APIEvent {
  request: Request;
}

interface FeatureFlags {
  [key: string]: boolean;
}

const DEFAULT_FLAGS: FeatureFlags = {
  imdb_integration: true,
  streaming_button: true,
  upcoming: true,
  random_picker: true,
  ai_recommendations: false,
  experimental_features: false,
};

export async function GET(_event: APIEvent) {
  try {
    const url = process.env.VITE_SUPABASE_URL;
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      // Fall back to defaults if env not configured
      return new Response(JSON.stringify({ flags: DEFAULT_FLAGS }), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=60, s-maxage=300",
        },
      });
    }

    const supabase = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", "feature_flags")
      .single();

    if (error || !data) {
      return new Response(JSON.stringify({ flags: DEFAULT_FLAGS }), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=60, s-maxage=300",
        },
      });
    }

    const flags = { ...DEFAULT_FLAGS, ...(data.value as FeatureFlags) };

    return new Response(JSON.stringify({ flags }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60, s-maxage=300",
      },
    });
  } catch (err) {
    console.error("[CineLog] Feature flags GET error:", err);
    return new Response(JSON.stringify({ flags: DEFAULT_FLAGS }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60, s-maxage=300",
      },
    });
  }
}
