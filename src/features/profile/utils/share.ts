// src/features/profile/utils/share.ts
//
// Shared profile-share helpers — used by both the viewer's own Profile
// page and the public /u/[username] route so the share-link logic + the
// toast behavior stay consistent.
//
// Origin resolution: prefer VITE_APP_URL (set in production Vercel env);
// otherwise fall back to the current window.location.origin so the link
// always points at whichever deployment the user is actually viewing
// (preview branches, localhost, etc.). The previous hard-coded
// https://cinelog.app/ produced dead links.

/**
 * Build the canonical share URL for a profile.
 *
 * Returns an empty string when called on the server (no window) and no
 * VITE_APP_URL is configured — callers should treat "" as a soft failure.
 */
export function buildProfileShareUrl(username: string): string {
  const baseUrl =
    (import.meta.env.VITE_APP_URL as string | undefined) ||
    (typeof window !== "undefined" ? window.location.origin : "");
  return `${baseUrl}/u/${username}`;
}

/**
 * Try the Web Share API first (mobile / capable desktop browsers), then
 * fall back to clipboard. Returns true if sharing succeeded in some form.
 *
 * Both code paths surface a toast via the provided `notify` callback so
 * callers don't need to import the toast hook themselves.
 */
export async function shareProfileLink(
  username: string,
  displayName: string,
  notify: (
    msg: string,
    kind: "success" | "info" | "error",
    durationMs?: number
  ) => void
): Promise<boolean> {
  const url = buildProfileShareUrl(username);
  if (!url) {
    notify("Couldn't build the share link.", "error");
    return false;
  }

  // 1. Try the Web Share API when available (mobile browsers, Safari,
  //    Chrome on some platforms). It surfaces the native share sheet
  //    which lets the user pick WhatsApp / Telegram / Messages / etc.
  if (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function"
  ) {
    try {
      await navigator.share({
        title: `${displayName} on CineLog`,
        text: `Check out ${displayName}'s profile on CineLog`,
        url
      });
      // navigator.share resolves on actual share (and on some browsers
      // when the user dismisses the sheet without sharing). Either way
      // we don't show a second toast — the sheet itself is the feedback.
      return true;
    } catch (err) {
      // AbortError = user cancelled — silent. Other errors fall through
      // to the clipboard fallback below.
      if (err instanceof DOMException && err.name === "AbortError") {
        return false;
      }
      // Fall through to clipboard.
    }
  }

  // 2. Clipboard fallback.
  try {
    await navigator.clipboard.writeText(url);
    notify("Profile link copied to clipboard.", "success", 1800);
    return true;
  } catch {
    // Clipboard API can fail in non-secure contexts — fall back to a
    // toast with the URL so the user can copy it manually.
    notify(`Share link: ${url}`, "info", 4000);
    return false;
  }
}
