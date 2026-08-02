// src/shared/utils/share.ts
//
// CineLog V2 — Share utilities
// --------------------------------
// Central helper for building deep-link URLs, shareable text payloads,
// and image-generation helpers for the movie/series share card.
//
// DEEP LINK CONTRACT
// ------------------
//   Movies:  https://cinelogv2.vercel.app/movie/{tmdb_id}
//   Series:  https://cinelogv2.vercel.app/tv/{tmdb_id}
//
// The deep link routes (src/routes/movie/[id].tsx, src/routes/tv/[id].tsx)
// render the same DetailsModal that the rest of the app uses. The modal
// reacts to auth state:
//   - Logged-in user  → vaultItem is matched → status tabs + activity panel
//   - Guest           → vaultItem is null    → only "+" + Trailer buttons
//   - Guest taps "+"  → useDetailsActions opens AuthModal
//
// The base URL is configurable via the VITE_APP_BASE_URL env variable so
// dev / preview / prod can all use their own host. Defaults to the
// production Vercel URL.

import type { TMDBDetails, WatchlistItem } from "~/shared/types";

/**
 * Shape of a single service's rating (IMDb / RT / Metacritic).
 *
 * This structurally matches `ServiceRating` from
 * `~/features/details/useMdbListRatings` so callers can pass the
 * `RatingsPayload` returned by `useMdbListRatings` directly without
 * any conversion. We define it locally (rather than importing it) to
 * avoid a `shared → features` dependency direction.
 */
export interface ShareServiceRating {
  /** Display score, e.g. "8.0", "85%", "77". "NR" if unavailable. */
  score: string;
  /** Compact vote count, e.g. "11K", "432". "0" if unavailable. */
  votes: string;
}

/**
 * The MDBList ratings payload accepted by `buildShareText` /
 * `buildShareTextBody`. Structurally compatible with the
 * `RatingsPayload` returned by `useMdbListRatings`.
 */
export interface ShareMdbRatings {
  imdb: ShareServiceRating | null;
  rottenTomatoes: ShareServiceRating | null;
  metacritic: ShareServiceRating | null;
}

/**
 * The canonical base URL for deep links.
 *
 * Priority:
 *   1. VITE_APP_BASE_URL env variable (set per-environment in Vercel)
 *   2. Hardcoded production URL (cinelogv2.vercel.app)
 *
 * Trailing slash is stripped so we can safely append `/movie/{id}`.
 *
 * The `import.meta.env` access is guarded because this module may be
 * imported in non-Vite contexts (e.g., unit tests run with ts-node).
 * In those cases we fall back to the hardcoded production URL.
 */
export function getBaseUrl(): string {
  let fromEnv: string | undefined;
  try {
    fromEnv = (import.meta as ImportMeta & { env?: Record<string, string> }).env
      ?.VITE_APP_BASE_URL;
  } catch {
    // import.meta.env may be undefined in non-Vite contexts — fall back.
    fromEnv = undefined;
  }
  const raw =
    fromEnv && fromEnv.trim().length > 0
      ? fromEnv
      : "https://cinelogv2.vercel.app";
  return raw.replace(/\/+$/, "");
}

/**
 * Build the deep-link URL for a movie or TV title.
 *
 * @param mediaType "movie" | "tv"
 * @param tmdbId    TMDB numeric id (string or number both accepted)
 * @returns absolute URL like "https://cinelogv2.vercel.app/movie/3392"
 */
export function buildShareUrl(
  mediaType: "movie" | "tv",
  tmdbId: number | string
): string {
  return `${getBaseUrl()}/${mediaType}/${tmdbId}`;
}

/**
 * Resolve the best display title from a TMDB details payload or a
 * WatchlistItem. Falls back to "Untitled" if no title is present.
 */
export function resolveTitle(
  source: TMDBDetails | WatchlistItem | null | undefined
): string {
  if (!source) return "Untitled";
  return (
    (source as TMDBDetails).title ||
    (source as TMDBDetails).name ||
    (source as WatchlistItem).title ||
    (source as WatchlistItem).name ||
    "Untitled"
  );
}

/**
 * Resolve the release/first-air date from a TMDB details payload or a
 * WatchlistItem. Returns the raw YYYY-MM-DD string or "" if missing.
 */
export function resolveReleaseDate(
  source: TMDBDetails | WatchlistItem | null | undefined
): string {
  if (!source) return "";
  return (
    (source as TMDBDetails).release_date ||
    (source as TMDBDetails).first_air_date ||
    (source as WatchlistItem).release_date ||
    (source as WatchlistItem).first_air_date ||
    ""
  );
}

/**
 * Format a YYYY-MM-DD date string into a human-friendly label.
 * Returns "" if the input is empty or invalid.
 *
 * Examples:
 *   "2025-07-18" → "Jul 18, 2025"
 *   ""           → ""
 *   "garbage"    → ""
 */
export function formatReleaseDate(iso: string): string {
  if (!iso || iso.length < 10) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

/**
 * Format the TMDB vote_average (0-10) into a "X.X/10" string.
 * Returns "N/A" if the rating is missing or zero (a 0 vote average
 * usually means TMDB has no ratings for the title yet).
 */
export function formatRating(voteAverage: number | undefined | null): string {
  if (voteAverage === undefined || voteAverage === null || voteAverage <= 0) {
    return "N/A";
  }
  return `${voteAverage.toFixed(1)}/10`;
}

/**
 * Format a single MDBList service rating into a share-friendly token.
 *
 *   IMDb       → "7.5/10"  (already includes the /10 scale)
 *   RT         → "85%"     (already includes the % sign)
 *   Metacritic → "70"      (0-100 scale, no suffix)
 *
 * Returns "" if the rating is missing, "NR", or "0" — we don't want
 * to pollute the share text with "NR" placeholders for services that
 * don't have a score for this title.
 */
function formatMdbRating(
  rating: ShareServiceRating | null | undefined
): string {
  if (!rating) return "";
  const score = (rating.score ?? "").trim();
  if (!score || score === "NR" || score === "0") return "";
  return score;
}

/**
 * Build a single-line ratings summary from the MDBList payload.
 *
 * Returns a string like:
 *   "IMDb: 7.5/10 | RT: 85% | MC: 70"
 *
 * Only services with a usable score are included. Returns "" if no
 * service has a score (in which case the caller falls back to the
 * TMDB vote_average line).
 *
 * The separators (" | ") are chosen to render correctly in WhatsApp,
 * Telegram, SMS, and email — no special characters that get mangled
 * by chat-app text formatting.
 */
export function formatMdbRatingsLine(
  mdb: ShareMdbRatings | null | undefined
): string {
  if (!mdb) return "";
  const parts: string[] = [];
  const imdb = formatMdbRating(mdb.imdb);
  if (imdb) parts.push(`IMDb: ${imdb}`);
  const rt = formatMdbRating(mdb.rottenTomatoes);
  if (rt) parts.push(`RT: ${rt}`);
  const mc = formatMdbRating(mdb.metacritic);
  if (mc) parts.push(`MC: ${mc}`);
  return parts.join(" | ");
}

/**
 * Truncate a string to `max` characters, appending an ellipsis if cut.
 * Used for the overview paragraph on the share card (otherwise long
 * overviews blow out the card height).
 */
export function truncateOverview(text: string, max = 280): string {
  if (!text) return "";
  if (text.length <= max) return text;
  // Cut on the last whitespace boundary before max, then add ellipsis.
  const slice = text.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  const cleanCut = lastSpace > max * 0.7 ? slice.slice(0, lastSpace) : slice;
  return `${cleanCut}…`;
}

/**
 * Build a plain-text share message for WhatsApp / SMS / email.
 *
 * The message mirrors the green card design but in plain text so it
 * renders correctly in any chat app (including ones that don't generate
 * link previews).
 *
 * Layout:
 *   🎬 {Title}
 *   ⭐ Ratings: IMDb: 7.5/10 | RT: 85% | MC: 70   (if mdbRatings provided)
 *   ⭐ Rating: {X.X/10}                            (fallback: TMDB only)
 *   📅 Released: {Mon D, YYYY}
 *   🎭 {Genre1, Genre2, Genre3}
 *   📖 {Overview (truncated)}
 *   {For series} 📺 {N} Season(s) · {M} Episode(s)
 *
 *   ▶️ Start tracking your cinema log on CineLog:
 *   {deepLink}
 *
 * NOTE: This is the FULL message (with the URL appended). Use this
 * for clipboard copies (Copy Text). For `navigator.share({ url })`,
 * use `buildShareTextBody()` instead — passing `url` separately avoids
 * the link appearing twice in the shared message.
 *
 * @param mdbRatings Optional MDBList ratings payload (IMDb / RT / MC).
 *   When provided AND at least one service has a usable score, the
 *   share text uses the multi-service ratings line instead of the
 *   single TMDB vote_average. When null/undefined or all services are
 *   "NR", falls back to the TMDB vote_average.
 */
export function buildShareText(
  details: TMDBDetails | WatchlistItem | null | undefined,
  mediaType: "movie" | "tv",
  tmdbId: number | string,
  mdbRatings?: ShareMdbRatings | null
): string {
  const body = buildShareTextBody(details, mediaType, mdbRatings);
  const url = buildShareUrl(mediaType, tmdbId);
  return `${body}\n\n▶️ Start tracking your cinema log on CineLog:\n${url}`;
}

/**
 * Build the share message body WITHOUT the trailing URL.
 *
 * Use this with `navigator.share({ text: body, url })` — the Web Share
 * API appends the URL separately, so including it in the text would
 * cause the URL to appear twice in the shared message (a cosmetic bug
 * we hit in the first iteration).
 *
 * Layout (same as buildShareText, minus the URL footer):
 *   🎬 {Title}
 *   ⭐ Ratings: IMDb: 7.5/10 | RT: 85% | MC: 70   (if mdbRatings provided)
 *   ⭐ Rating: {X.X/10}                            (fallback: TMDB only)
 *   📅 Released: {Mon D, YYYY}
 *   🎭 {Genre1, Genre2, Genre3}
 *   📺 {N} Season(s) · {M} Episode(s)   (TV only)
 *   📖 {Overview (truncated)}
 *
 *   ▶️ Start tracking your cinema log on CineLog
 *
 * @param mdbRatings Optional MDBList ratings payload. When provided,
 *   the ratings line shows all available services (IMDb / RT / MC)
 *   instead of just the TMDB vote_average. Falls back gracefully.
 */
export function buildShareTextBody(
  details: TMDBDetails | WatchlistItem | null | undefined,
  mediaType: "movie" | "tv",
  mdbRatings?: ShareMdbRatings | null
): string {
  const title = resolveTitle(details);
  const dateIso = resolveReleaseDate(details);
  const dateLabel = formatReleaseDate(dateIso);
  const tmdbRating = formatRating((details as TMDBDetails)?.vote_average);
  const mdbLine = formatMdbRatingsLine(mdbRatings ?? null);
  const overview = truncateOverview(
    (details as TMDBDetails)?.overview ?? "",
    280
  );
  const genres =
    (details as TMDBDetails)?.genres?.map((g) => g.name).join(", ") ?? "";

  const lines: string[] = [];
  lines.push(`🎬 ${title}`);

  // Ratings line — prefer the multi-service MDBList line when available.
  // Fall back to the single TMDB vote_average so the share text always
  // has SOME rating (unless both are unavailable).
  if (mdbLine) {
    lines.push(`⭐ Ratings: ${mdbLine}`);
  } else if (tmdbRating !== "N/A") {
    lines.push(`⭐ Rating: ${tmdbRating}`);
  }
  if (dateLabel) {
    lines.push(`📅 Released: ${dateLabel}`);
  }
  if (genres) {
    lines.push(`🎭 ${genres}`);
  }

  // Series-specific: number of seasons and episodes
  if (mediaType === "tv") {
    const d = details as TMDBDetails;
    if (typeof d?.number_of_seasons === "number" && d.number_of_seasons > 0) {
      const seasonWord = d.number_of_seasons === 1 ? "Season" : "Seasons";
      if (
        typeof d?.number_of_episodes === "number" &&
        d.number_of_episodes > 0
      ) {
        lines.push(
          `📺 ${d.number_of_seasons} ${seasonWord} · ${d.number_of_episodes} Episodes`
        );
      } else {
        lines.push(`📺 ${d.number_of_seasons} ${seasonWord}`);
      }
    }
  }

  if (overview) {
    lines.push("");
    lines.push(`📖 ${overview}`);
  }

  lines.push("");
  lines.push("▶️ Start tracking your cinema log on CineLog");

  return lines.join("\n");
}

/**
 * Web Share API availability check.
 *
 * The Web Share API (`navigator.share`) is available on:
 *   - HTTPS pages (always)
 *   - Most modern mobile browsers (Chrome, Safari, Firefox Android)
 *   - NOT on desktop Chrome/Firefox (only Edge + Safari macOS)
 *
 * When available, we use it to share either:
 *   - Just text + URL (basic share)
 *   - An image file + URL (rich share, when files are supported)
 */
export function canWebShare(): boolean {
  if (typeof navigator === "undefined") return false;
  return typeof navigator.share === "function";
}

/**
 * Web Share API with file support (Level 2).
 *
 * `navigator.canShare({ files })` is the way to check whether the
 * current browser allows sharing files (images, PDFs, etc.) — not all
 * browsers that support `navigator.share` also support file sharing.
 */
export function canShareFiles(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    typeof (
      navigator as Navigator & {
        canShare?: (data: { files: File[] }) => boolean;
      }
    ).canShare === "function"
  );
}

/**
 * Convert a data URL (e.g. from html-to-image's toPng()) into a File
 * object suitable for `navigator.share({ files })`.
 *
 * The filename is derived from the title so it shows up nicely in the
 * share sheet ("Dolittle — CineLog.png" instead of "share.png").
 */
export async function dataUrlToFile(
  dataUrl: string,
  filename: string
): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], filename, { type: "image/png" });
}

/**
 * Convert a Blob to an object URL for use in <a href> downloads.
 *
 * This is more reliable on mobile Chrome than data URLs — Chrome
 * silently blocks data-URL downloads above ~2MB for security reasons,
 * but object URLs have no such limit.
 *
 * The caller MUST call `URL.revokeObjectURL(url)` after the download
 * to avoid leaking memory.
 */
export function blobToObjectUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}

/**
 * Trigger a browser download of a Blob using an object URL.
 *
 * This is the mobile-Chrome-friendly version of `downloadDataUrl` —
 * object URLs bypass the ~2MB size limit that Chrome imposes on
 * data URLs. Use this whenever you have a Blob (e.g., from
 * html-to-image's toBlob()).
 *
 * The object URL is revoked after the click to avoid memory leaks.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revocation by 1s so the download has time to start.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Trigger a browser download of a data URL.
 *
 * LEGACY: prefer `downloadBlob()` for new code — data URLs are
 * silently blocked by mobile Chrome above ~2MB. This function is
 * kept as a fallback for callers that only have a data URL.
 */
export function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * Sanitize a title for use in a filename.
 *
 * Removes characters that are invalid in filenames on Windows / macOS /
 * Linux, collapses whitespace, and trims to a reasonable length.
 */
export function sanitizeFilename(title: string): string {
  return (
    title
      // eslint-disable-next-line no-control-regex
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60)
  );
}

/**
 * Build a richly formatted share text with separator lines and all
 * metadata. This is the "Copy Rich Text" variant — more visually
 * structured than `buildShareTextBody()` with emoji + separator lines.
 *
 * Layout:
 *   🎬 Interstellar
 *   IMDb 8.7 | RT 8.4 | MC 90
 *   📅 Released: Oct 26, 2014
 *   🎭 Adventure, Drama, Science Fiction
 *   ⏱ 169 min
 *   📖 Overview text...
 *   ━━━━━━━━━━━━━━
 *   Track this title on CineLog
 *   https://cinelogv2.vercel.app/movie/157336
 *   ━━━━━━━━━━━━━━
 *
 * @param details TMDB details payload
 * @param mediaType "movie" | "tv"
 * @param tmdbId TMDB numeric id
 * @param mdbRatings Optional MDBList ratings payload
 */
export function buildRichShareText(
  details: TMDBDetails | WatchlistItem | null | undefined,
  mediaType: "movie" | "tv",
  tmdbId: number | string,
  mdbRatings?: ShareMdbRatings | null
): string {
  const title = resolveTitle(details);
  const dateIso = resolveReleaseDate(details);
  const dateLabel = formatReleaseDate(dateIso);
  const overview = truncateOverview(
    (details as TMDBDetails)?.overview ?? "",
    280
  );
  const genres =
    (details as TMDBDetails)?.genres?.map((g) => g.name).join(", ") ?? "";
  const runtime = (details as TMDBDetails)?.runtime;
  const url = buildShareUrl(mediaType, tmdbId);
  const separator = "━━━━━━━━━━━━━━";

  const lines: string[] = [];
  lines.push(`🎬 ${title}`);

  // Ratings line — compact format without labels
  const mdbLine = formatMdbRatingsLine(mdbRatings ?? null);
  if (mdbLine) {
    // Replace "IMDb: X | RT: Y | MC: Z" with "IMDb X | RT Y | MC Z"
    const compact = mdbLine
      .replace(/IMDb:\s*/g, "IMDb ")
      .replace(/RT:\s*/g, "RT ")
      .replace(/MC:\s*/g, "MC ");
    lines.push(compact);
  } else {
    const tmdbRating = formatRating((details as TMDBDetails)?.vote_average);
    if (tmdbRating !== "N/A") {
      lines.push(`TMDB ${tmdbRating}`);
    }
  }

  if (dateLabel) {
    lines.push(`📅 Released: ${dateLabel}`);
  }
  if (genres) {
    lines.push(`🎭 ${genres}`);
  }
  if (mediaType === "movie" && runtime && runtime > 0) {
    lines.push(`⏱ ${runtime} min`);
  }

  // Series-specific
  if (mediaType === "tv") {
    const d = details as TMDBDetails;
    if (typeof d?.number_of_seasons === "number" && d.number_of_seasons > 0) {
      const seasonWord = d.number_of_seasons === 1 ? "Season" : "Seasons";
      if (
        typeof d?.number_of_episodes === "number" &&
        d.number_of_episodes > 0
      ) {
        lines.push(
          `📺 ${d.number_of_seasons} ${seasonWord} · ${d.number_of_episodes} Episodes`
        );
      } else {
        lines.push(`📺 ${d.number_of_seasons} ${seasonWord}`);
      }
    }
  }

  if (overview) {
    lines.push(`📖 ${overview}`);
  }

  lines.push(separator);
  lines.push("Track this title on CineLog");
  lines.push(url);
  lines.push(separator);

  return lines.join("\n");
}

/**
 * Copy text to the clipboard.
 *
 * Uses the modern `navigator.clipboard.writeText` API with a fallback
 * to the deprecated `document.execCommand("copy")` for older browsers
 * and insecure contexts (HTTP).
 *
 * @returns true if the copy succeeded, false otherwise.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === "function"
    ) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path.
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.top = "-9999px";
    ta.style.left = "-9999px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
