/**
 * Image URL helpers shared by profile image previews and persisted profile
 * surfaces.
 */

/**
 * Add a deterministic version query parameter to Supabase Storage object URLs.
 *
 * Storage uploads intentionally reuse one per-user object path. Browsers and
 * the CDN may therefore keep serving the previous bytes when the URL string
 * does not change. The version is kept out of the database payload; it is
 * applied only at render time.
 */
export function withImageCacheBust(
  url: string | null | undefined,
  version?: string | number | null
): string | null {
  if (typeof url !== "string") return null;
  const value = url.trim();
  if (!value || value.startsWith("data:") || value.startsWith("blob:")) {
    return value || null;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return value;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return value;
  }

  // Only mutate URLs served by Supabase Storage. External image providers may
  // treat arbitrary query parameters as a different resource or reject them.
  if (!parsed.pathname.includes("/storage/v1/object/")) {
    return value;
  }

  const token = String(version ?? "").trim() || String(Date.now());
  parsed.searchParams.set("v", token);
  return parsed.toString();
}

/**
 * Return the profile row's update timestamp as a stable render version.
 * Falls back to the current time for a freshly uploaded local value.
 */
export function imageVersion(
  updatedAt?: string | null,
  fallback?: string | number | null
): string {
  const version = updatedAt?.trim() || String(fallback ?? "").trim();
  return version || String(Date.now());
}
