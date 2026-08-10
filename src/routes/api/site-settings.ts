// src/routes/api/site-settings.ts
//
// CineLog V2 — Public Site Settings API
// ---------------------------------------------------------------------
// GET /api/site-settings — returns the public-facing site settings
// needed by the landing page (site name, tagline, social links,
// terms/privacy URLs).
//
// This endpoint is PUBLIC (no auth required) — the data it returns
// is not secret. The landing page calls this on load.
//
// Why a separate endpoint from /api/admin/settings?
//   - The admin endpoint requires admin auth and returns ALL settings
//     (rate limits, TMDB config, retention policy, etc.).
//   - This endpoint is anon-accessible and returns only the subset
//     that the public UI needs.
//
// SOCIAL LINKS FORMAT:
//   social_links is an array of SocialLink objects:
//     { id, name, url, iconUrl, enabled, order }
//   The landing page footer renders enabled links in order.
//
// CACHING:
//   We use no-store to prevent stale social links from being served
//   after admin updates. The landing page must always reflect the
//   current configuration. The fetch on the landing page also uses
//   cache: 'no-store' as a belt-and-suspenders approach.

import { createClient } from "@supabase/supabase-js";

interface APIEvent {
  request: Request;
}

// ─── Public-facing types ─────────────────────────────────────

interface SocialLink {
  id: string;
  name: string;
  url: string;
  iconUrl: string;
  enabled: boolean;
  order: number;
}

interface SiteSettingsPublic {
  site_name: string;
  tagline: string;
  social_links: SocialLink[];
  terms_url: string;
  privacy_url: string;
}

const DEFAULTS: SiteSettingsPublic = {
  site_name: "CineLog",
  tagline: "Your personal cinema universe",
  social_links: [],
  terms_url: "",
  privacy_url: ""
};

// ─── Helper ─────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      // No caching — admin settings must be reflected immediately.
      // Previously used max-age=60, s-maxage=300 which caused deleted
      // social links to persist on the landing page for up to 5 minutes.
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Pragma": "no-cache",
    }
  });
}

/**
 * Validate and clean a dynamic SocialLink array.
 * Only the new dynamic array format is supported.
 * Legacy { facebook, instagram, twitter, discord } format is NOT
 * recognized — the migration has been completed.
 */
function validateSocialLinksArray(arr: unknown[]): SocialLink[] {
  return arr
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((link, idx) => ({
      id: typeof link.id === "string" && link.id.length > 0 ? link.id.slice(0, 64) : `link-${idx}`,
      name: typeof link.name === "string" ? link.name.slice(0, 60) : "",
      url: typeof link.url === "string" ? link.url.slice(0, 500) : "",
      iconUrl: typeof link.iconUrl === "string" ? link.iconUrl.slice(0, 500) : "",
      enabled: typeof link.enabled === "boolean" ? link.enabled : true,
      order: typeof link.order === "number" && Number.isFinite(link.order) ? Math.floor(link.order) : idx,
    }))
    .slice(0, 20);
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

    // Parse social_links — only the dynamic array format is supported
    let socialLinks: SocialLink[] = [];
    if (Array.isArray(v.social_links)) {
      socialLinks = validateSocialLinksArray(v.social_links);
    }
    // Legacy object format is intentionally NOT recognized.
    // If the DB still has old-format data, social_links will be empty
    // and the admin should re-add links in the new dynamic format.

    const settings: SiteSettingsPublic = {
      site_name:
        typeof v.site_name === "string" ? v.site_name : DEFAULTS.site_name,
      tagline:
        typeof v.tagline === "string" ? v.tagline : DEFAULTS.tagline,
      social_links: socialLinks,
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
