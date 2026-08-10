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
//     (rate limits, TMDB config, retention policy, etc.).
//   - This endpoint is anon-accessible and returns only the subset
//     that the public UI needs.
//   - This endpoint is heavily cached (5 minutes at the CDN).
//
// SOCIAL LINKS FORMAT:
//   social_links is an array of SocialLink objects:
//     { id, name, url, iconUrl, enabled, order }
//   The landing page footer renders enabled links in order.
//
//   For backward compatibility, if the database still contains the
//   legacy format { facebook, instagram, twitter, discord }, this
//   endpoint migrates it to the new array format before returning.

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

function jsonResponse(body: unknown, status = 200, cacheControl = "public, max-age=60, s-maxage=300"): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": cacheControl
    }
  });
}

/**
 * Migrate legacy { facebook, instagram, twitter, discord } format
 * to the new dynamic SocialLink[] array format.
 */
function migrateLegacySocialLinks(legacy: Record<string, unknown>): SocialLink[] {
  const result: SocialLink[] = [];
  const order: Array<{ key: string; name: string }> = [
    { key: "facebook", name: "Facebook" },
    { key: "instagram", name: "Instagram" },
    { key: "twitter", name: "Twitter" },
    { key: "discord", name: "Discord" },
  ];
  order.forEach(({ key, name }, idx) => {
    const val = typeof legacy[key] === "string" ? (legacy[key] as string) : "";
    if (val) {
      result.push({ id: key, name, url: val, iconUrl: "", enabled: true, order: idx });
    }
  });
  return result;
}

/**
 * Validate and clean a dynamic SocialLink array.
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

    // Determine social_links format
    let socialLinks: SocialLink[] = [];
    if (Array.isArray(v.social_links)) {
      // New dynamic format
      socialLinks = validateSocialLinksArray(v.social_links);
    } else if (v.social_links && typeof v.social_links === "object") {
      // Legacy format — migrate
      socialLinks = migrateLegacySocialLinks(v.social_links as Record<string, unknown>);
    }

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
