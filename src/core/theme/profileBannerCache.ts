import type { ProfileTheme } from "./profileBannerThemeUtils";

const CACHE_PREFIX = "cinelog:profile-banner-cache:v1:";
const MAX_CACHE_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export interface CachedProfileBannerState {
  bannerUrl: string;
  theme: ProfileTheme;
  profileSignature: string;
  savedAt: number;
}

function cacheKey(uid: string): string {
  return `${CACHE_PREFIX}${uid}`;
}

export function getProfileBannerSignature(profile: {
  banner_type: string | null;
  banner_url: string | null;
  favorite_movie_id: string | null;
  favorite_series_id: string | null;
  updated_at: string | null;
}): string {
  // updated_at is intentionally excluded: editing a bio or display name
  // must not discard a still-valid banner while the app is resuming.
  return [
    profile.banner_type ?? "",
    profile.banner_url ?? "",
    profile.favorite_movie_id ?? "",
    profile.favorite_series_id ?? ""
  ].join("|");
}

function isProfileTheme(value: unknown): value is ProfileTheme {
  if (!value || typeof value !== "object") return false;
  const theme = value as Partial<ProfileTheme>;
  return [
    "primary",
    "secondary",
    "tertiary",
    "neutral",
    "highlight",
    "shell",
    "image",
    "imageOpacity",
    "imageBrightness",
    "imageSaturation",
    "profileReady"
  ].every((key) => typeof theme[key as keyof ProfileTheme] === "string");
}

export function readCachedProfileBanner(
  uid: string,
  profileSignature?: string
): CachedProfileBannerState | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(cacheKey(uid));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const state = parsed as Partial<CachedProfileBannerState>;
    if (
      typeof state.bannerUrl !== "string" ||
      !state.bannerUrl ||
      typeof state.profileSignature !== "string" ||
      (profileSignature !== undefined &&
        state.profileSignature !== profileSignature) ||
      typeof state.savedAt !== "number" ||
      Date.now() - state.savedAt > MAX_CACHE_AGE_MS ||
      !isProfileTheme(state.theme)
    ) {
      return null;
    }
    return state as CachedProfileBannerState;
  } catch {
    return null;
  }
}

export function writeCachedProfileBanner(
  uid: string,
  state: Omit<CachedProfileBannerState, "savedAt">
): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      cacheKey(uid),
      JSON.stringify({ ...state, savedAt: Date.now() })
    );
  } catch {
    // Storage can be unavailable in private browsing or quota-constrained tabs.
  }
}

export function clearCachedProfileBanner(uid: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(cacheKey(uid));
  } catch {
    // Ignore storage failures; the live profile remains the source of truth.
  }
}
