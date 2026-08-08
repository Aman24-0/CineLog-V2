// src/lib/shareCard/templates.ts
//
// CineLog V2 — Share Card HTML Templates (Phase 7 Task 6)
// ---------------------------------------------------------------------
// Pure HTML/CSS templates for the share cards rendered server-side by
// `/api/share-card`. The templates are FUNCTIONS that take a typed
// payload and return a self-contained HTML string (no external CSS,
// no external fonts — the headless browser renders them offline).
//
// Why templates instead of screenshotting the live DOM?
// ------------------------------------------------------
// The previous implementation used `html2canvas` to screenshot the
// LIVE DOM card. This had three problems:
//   1. ~300KB client bundle for html2canvas.
//   2. CSS rendering quirks (html2canvas can't replicate every CSS
//      feature — backdrop-filter, certain gradients, etc.).
//   3. The card's appearance depended on the user's theme (dark/light)
//      and on whether the Material Symbols font had loaded, leading
//      to inconsistent output.
//
// Moving server-side with dedicated templates:
//   • Eliminates the 300KB client bundle.
//   • Renders with a REAL Chromium, so all CSS features work.
//   • Produces a consistent branded card regardless of the user's
//     client theme (the template ships its own dark theme).
//   • Lets us version the template independently of the UI.
//
// SELF-CONTAINED HTML
// -------------------
// Each template returns a complete <html> document with inline <style>.
// The only external resource is the TMDB poster image (loaded via
// <img src="https://image.tmdb.org/...">), which Chromium fetches
// during rendering. If the poster fails to load, the template falls
// back to a branded placeholder (no broken-image icon).

/**
 * Shared payload for all share-card templates. The fields are
 * intentionally minimal so the template can render a card for ANY
 * kind of media (movie, TV, or stats summary).
 */
export interface ShareCardPayload {
  /** Card template to render. */
  template: "stats" | "details";
  /** Display name shown in the header (e.g. "John Doe" or "CineLog user"). */
  displayName: string;
  /** Avatar URL (TMDB poster or null for the placeholder initial). */
  avatarUrl?: string | null;
  /** Title shown at the top of the card (e.g. "My Cinematic Stats"). */
  title: string;
  /** Subtitle / eyebrow text (e.g. "My Cinematic Stats" or "Now Watching"). */
  eyebrow?: string;
  /**
   * Stats rows for the "stats" template. Each row is a label + value
   * pair rendered as a 2-column grid. Ignored for the "details" template.
   */
  rows?: Array<{ label: string; value: string }>;
  /**
   * Media details for the "details" template. Ignored for "stats".
   */
  details?: {
    /** Media type ("movie" or "tv"). */
    mediaType: "movie" | "tv";
    /** Release year (e.g. "2024"). */
    year?: string | null;
    /** User rating (1-10) or null. */
    rating?: number | null;
    /** User status ("Watching", "Completed", "Planned"). */
    status?: string | null;
    /** Poster URL (TMDB). */
    posterUrl?: string | null;
    /** Tagline (short marketing line). */
    tagline?: string | null;
    /** Genres (e.g. "Sci-Fi, Thriller"). */
    genres?: string | null;
  };
  /** Footer text shown at the bottom of the card (e.g. "cinelog.app"). */
  footer?: string;
}

/**
 * Render the share-card HTML for the given payload.
 *
 * Returns a complete <html> document string. The caller
 * (`/api/share-card`) sets this as the page content for headless
 * Chromium, then screenshots the `.share-card` element.
 *
 * The HTML is intentionally INLINE-STYLED (no external CSS) so the
 * headless browser doesn't need to make any network requests beyond
 * the poster image. Fonts are system fonts (no web font loading) —
 * the template is designed to look good with the default sans-serif.
 */
export function renderShareCardHtml(payload: ShareCardPayload): string {
  switch (payload.template) {
    case "stats":
      return renderStatsCard(payload);
    case "details":
      return renderDetailsCard(payload);
  }
}

// ─── Shared CSS ───────────────────────────────────────────────────────

const SHARED_CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: #0a0a0a; }
  body {
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto,
      "Helvetica Neue", Arial, "Noto Sans", sans-serif;
    -webkit-font-smoothing: antialiased;
    color: #fafafa;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 24px;
  }
  .share-card {
    width: 480px;
    background: linear-gradient(180deg, #14141a 0%, #0a0a0a 100%);
    border: 1px solid rgba(232, 183, 74, 0.18);
    border-radius: 20px;
    overflow: hidden;
    box-shadow: 0 24px 48px rgba(0, 0, 0, 0.5);
  }
  .share-card-header {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 20px 24px;
    background: linear-gradient(135deg, rgba(232, 183, 74, 0.12) 0%, rgba(232, 183, 74, 0) 100%);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }
  .share-card-avatar {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    object-fit: cover;
    background: #1f1f25;
    flex-shrink: 0;
    border: 1.5px solid rgba(232, 183, 74, 0.45);
  }
  .share-card-avatar-placeholder {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: linear-gradient(135deg, #e8b74a 0%, #b8862a 100%);
    color: #0a0a0a;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 18px;
    flex-shrink: 0;
    border: 1.5px solid rgba(232, 183, 74, 0.65);
  }
  .share-card-brand { flex: 1; min-width: 0; }
  .share-card-logo {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: ui-sans-serif, system-ui, sans-serif;
    font-size: 11px;
    letter-spacing: 0.32em;
    color: #e8b74a;
    text-transform: uppercase;
    font-weight: 600;
    margin-bottom: 4px;
  }
  .share-card-logo .cine { color: #fafafa; }
  .share-card-eyebrow {
    font-size: 11px;
    color: rgba(250, 250, 250, 0.55);
    text-transform: uppercase;
    letter-spacing: 0.12em;
    margin-bottom: 2px;
  }
  .share-card-name {
    font-size: 16px;
    font-weight: 600;
    color: #fafafa;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .share-card-footer {
    padding: 14px 24px;
    background: rgba(0, 0, 0, 0.4);
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    font-size: 11px;
    color: rgba(250, 250, 250, 0.4);
    text-align: center;
    letter-spacing: 0.05em;
  }
`;

/**
 * Get the user's initial for the avatar placeholder.
 */
function userInitial(name: string): string {
  const trimmed = (name || "").trim();
  if (!trimmed) return "?";
  return trimmed.charAt(0).toUpperCase();
}

/**
 * Render the avatar HTML — either an <img> or a placeholder div
 * with the user's initial.
 */
function renderAvatar(payload: ShareCardPayload): string {
  if (payload.avatarUrl) {
    return `<img class="share-card-avatar" src="${escapeHtml(payload.avatarUrl)}" alt="" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" /><div class="share-card-avatar-placeholder" style="display:none;">${escapeHtml(userInitial(payload.displayName))}</div>`;
  }
  return `<div class="share-card-avatar-placeholder">${escapeHtml(userInitial(payload.displayName))}</div>`;
}

/**
 * Escape a string for safe inclusion in HTML text content or an
 * attribute value. Prevents XSS if a user's display name contains
 * HTML metacharacters.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─── Stats template ──────────────────────────────────────────────────

function renderStatsCard(payload: ShareCardPayload): string {
  const rows = payload.rows ?? [];
  const rowsHtml = rows
    .map(
      (row) => `
        <div class="share-card-row">
          <span class="share-card-label">${escapeHtml(row.label)}</span>
          <span class="share-card-value">${escapeHtml(row.value)}</span>
        </div>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>CineLog Stats</title>
    <style>
      ${SHARED_CSS}
      .share-card-grid {
        padding: 20px 24px;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px 20px;
      }
      .share-card-row {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 10px 12px;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 10px;
      }
      .share-card-label {
        font-size: 10px;
        color: rgba(250, 250, 250, 0.5);
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .share-card-value {
        font-size: 18px;
        font-weight: 700;
        color: #fafafa;
      }
    </style>
  </head>
  <body>
    <div class="share-card">
      <div class="share-card-header">
        ${renderAvatar(payload)}
        <div class="share-card-brand">
          <div class="share-card-logo">
            <span class="cine">CINE</span><span>LOG</span>
          </div>
          <div class="share-card-eyebrow">${escapeHtml(payload.eyebrow ?? "My Cinematic Stats")}</div>
          <div class="share-card-name">${escapeHtml(payload.displayName)}</div>
        </div>
      </div>
      <div class="share-card-grid">
        ${rowsHtml}
      </div>
      <div class="share-card-footer">${escapeHtml(payload.footer ?? "cinelog.app")}</div>
    </div>
  </body>
</html>`;
}

// ─── Details template ────────────────────────────────────────────────

function renderDetailsCard(payload: ShareCardPayload): string {
  const d = payload.details;
  if (!d) return renderStatsCard(payload); // fallback

  const yearHtml = d.year ? `<span class="share-card-meta-pill">${escapeHtml(d.year)}</span>` : "";
  const typeHtml = `<span class="share-card-meta-pill">${escapeHtml(d.mediaType === "tv" ? "TV" : "Film")}</span>`;
  const statusHtml = d.status ? `<span class="share-card-meta-pill">${escapeHtml(d.status)}</span>` : "";
  const ratingHtml =
    typeof d.rating === "number" && d.rating > 0
      ? `<span class="share-card-meta-pill share-card-rating">★ ${escapeHtml(String(d.rating))}/10</span>`
      : "";

  const posterHtml = d.posterUrl
    ? `<img class="share-card-poster" src="${escapeHtml(d.posterUrl)}" alt="" onerror="this.style.display='none'; this.parentElement.classList.add('no-poster');" />`
    : `<div class="share-card-poster-placeholder"></div>`;

  const taglineHtml = d.tagline
    ? `<p class="share-card-tagline">${escapeHtml(d.tagline)}</p>`
    : "";
  const genresHtml = d.genres
    ? `<p class="share-card-genres">${escapeHtml(d.genres)}</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>CineLog — ${escapeHtml(payload.title)}</title>
    <style>
      ${SHARED_CSS}
      .share-card-body {
        padding: 24px;
        display: flex;
        gap: 18px;
      }
      .share-card-poster-wrap {
        flex-shrink: 0;
        width: 140px;
        height: 210px;
        border-radius: 12px;
        overflow: hidden;
        background: #1f1f25;
        border: 1px solid rgba(255, 255, 255, 0.08);
      }
      .share-card-poster {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
      .share-card-poster-placeholder {
        width: 100%;
        height: 100%;
        background: linear-gradient(135deg, #1f1f25 0%, #14141a 100%);
      }
      .share-card-poster-wrap.no-poster {
        background: linear-gradient(135deg, #1f1f25 0%, #14141a 100%);
      }
      .share-card-info {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 8px;
      }
      .share-card-title {
        font-size: 20px;
        font-weight: 700;
        color: #fafafa;
        line-height: 1.25;
        letter-spacing: -0.01em;
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .share-card-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .share-card-meta-pill {
        font-size: 11px;
        font-weight: 500;
        padding: 3px 10px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.06);
        color: rgba(250, 250, 250, 0.85);
        border: 1px solid rgba(255, 255, 255, 0.05);
      }
      .share-card-rating {
        background: rgba(232, 183, 74, 0.12);
        color: #e8b74a;
        border-color: rgba(232, 183, 74, 0.32);
      }
      .share-card-tagline {
        font-size: 13px;
        color: rgba(250, 250, 250, 0.65);
        font-style: italic;
        line-height: 1.4;
        margin-top: 4px;
      }
      .share-card-genres {
        font-size: 12px;
        color: rgba(250, 250, 250, 0.5);
        line-height: 1.4;
      }
    </style>
  </head>
  <body>
    <div class="share-card">
      <div class="share-card-header">
        ${renderAvatar(payload)}
        <div class="share-card-brand">
          <div class="share-card-logo">
            <span class="cine">CINE</span><span>LOG</span>
          </div>
          <div class="share-card-eyebrow">${escapeHtml(payload.eyebrow ?? "Now Watching")}</div>
          <div class="share-card-name">${escapeHtml(payload.displayName)}</div>
        </div>
      </div>
      <div class="share-card-body">
        <div class="share-card-poster-wrap">
          ${posterHtml}
        </div>
        <div class="share-card-info">
          <h1 class="share-card-title">${escapeHtml(payload.title)}</h1>
          <div class="share-card-meta">
            ${typeHtml}
            ${yearHtml}
            ${statusHtml}
            ${ratingHtml}
          </div>
          ${taglineHtml}
          ${genresHtml}
        </div>
      </div>
      <div class="share-card-footer">${escapeHtml(payload.footer ?? "cinelog.app")}</div>
    </div>
  </body>
</html>`;
}
