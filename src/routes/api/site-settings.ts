// src/routes/api/site-settings.ts
//
// CineLog V2 — Public Site Settings API
// ---------------------------------------------------------------------
// GET /api/site-settings — returns the public-facing site settings
// needed by the landing page (site name, tagline, social links,
// terms/privacy URLs).
//
// This endpoint is PUBLIC (no auth required) — the data it returns
// is not secret. The landing page calls this on load and caches the
// result.
//
// Why a separate endpoint from /api/admin/settings?
//   - The admin endpoint requires admin auth and returns ALL settings
//     (rate<->limits, TMDB config, retention policy, etc.).
//   - This endpoint is anon-accessible and returns only the subset
//     that the public UI needs.
//   - This endpoint is heavily cached (5 minutes at the CDN).

import { createClient } from "@supabase/supabase-js";

interface APIEvent {
  request: Request;
}

// ─── Public-facing defaults ─────────────────────────────────────

interface SiteSettingsPublic {
  site_name: string;
  tagline: string;
  social_links: {
    facebook: string;
    instagram: string;
    twitter: string;
    discord: string;
  };
  terms_url: string;
  privacy_url: string;
}

const DEFAULTS: SiteSettingsPublic = {
  site_name: "CineLog",
  tagline: "Your personal cinema universe",
  social_links: { facebook: "", instagram: "", twitter: "", discord: "" },
  terms_url: "",
  privacy_url: ""
};

// ─── Helper ─────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200, cacheControl = "public, max-age=60, s-maxage=300"): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": cacheControl
    }
  });
}

// ─── GET /api/site-settings ─────────────────────────────────────

export async function GET(_event: APIEvent) {
  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) {
      // Fall back to defaults if env not configured
      return jsonResponse(DEFAULTS);
    }

    const supabase = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data, error } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", "site_settings")
      .single();

    if (error || !data) {
      // Fall back to defaults if config row missing or query failed
      return jsonResponse(DEFAULTS);
    }

    const v = data.value as Record<string, unknown>;
    const social = (
      v.social_links && typeof v.social_links === "object"
        ? v.social_links
        : {}
    ) as Record<string, unknown>;

    const settings: SiteSettingsPublic = {
      site_name:
        typeof v.site_name === "string" ? v.site_name : DEFAULTS.site_name,
      tagline:
        typeof v.tagline === "string" ? v.tagline : DEFAULTS.tagline,
      social_links: {
        facebook:
          typeof social.facebook === "string" ? social.facebook : "",
        instagram:
          typeof social.instagram === "string" ? social.instagram : "",
        twitter:
          typeof social.twitter === "string" ? social.twitter : "",
        discord:
          typeof social.discord === "string" ? social.discord : ""
      },
      terms_url:
        typeof v.terms_url === "string" ? v.terms_url : "",
      privacy_url:
        typeof v.privacy_url === "string" ? v.privacy_url : ""
    };

    return jsonResponse(settings);
  } catch (err) {
    console.error("[site-settings] GET error:", err);
    return jsonResponse(DEFAULTS);
  }
}
