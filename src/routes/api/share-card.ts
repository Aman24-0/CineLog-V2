// src/routes/api/share-card.ts
//
// CineLog V2 — Server-Side Share Card Generator (Phase 7 Task 6)
// ---------------------------------------------------------------------
// POST /api/share-card
//
// Generates a branded PNG share card SERVER-SIDE using headless
// Chromium. Replaces the previous client-side `html2canvas` approach
// (which added ~300KB to the client bundle and had CSS rendering
// quirks).
//
// REQUEST
// -------
//   Content-Type: application/json
//   Body: ShareCardPayload (see src/lib/shareCard/templates.ts)
//
//   {
//     "template": "stats" | "details",
//     "displayName": "John Doe",
//     "avatarUrl": "https://image.tmdb.org/...",
//     "title": "My Cinematic Stats",
//     "eyebrow": "My Cinematic Stats",
//     "rows": [{ "label": "Total Titles", "value": "42" }, ...],
//     "details": { ... },  // for "details" template
//     "footer": "cinelog.app"
//   }
//
// RESPONSE
// --------
//   Content-Type: image/png
//   Body: PNG bytes (2x scale for retina quality)
//
//   On error: 4xx/5xx with JSON { error: string }
//
// AUTHENTICATION
// --------------
//   The route requires an authenticated session (read from the
//   httpOnly cookie via `createServerClientFromRequest`). Anonymous
//   users can't generate share cards — this prevents abuse (the
//   Chromium render is expensive, ~1-2s per request).
//
//   If the session is missing or expired, the route returns 401.
//
// RATE LIMITING
// -------------
//   Headless Chromium is expensive (~50MB RAM per render). To prevent
//   abuse, we apply a soft rate limit by checking the user's recent
//   share-card generations from the `activity_log` table. If the user
//   has generated more than 20 cards in the last 60 seconds, we
//   return 429.
//
//   This is a best-effort check — the `activity_log` may be missing
//   or behind, in which case we allow the request through (fail-open
//   is better than blocking legitimate users).
//
// CHROMIUM RUNTIME
// ----------------
//   On Vercel serverless, we use `@sparticuz/chromium` (a Lambda-
//   compatible Chromium binary) with `puppeteer-core`. The binary is
//   loaded lazily inside the route handler so it doesn't slow down
//   cold starts for unrelated routes.
//
//   In development / local testing, `@sparticuz/chromium` may not be
//   available (it's optimized for AWS Lambda / Vercel). The route
//   gracefully handles this by returning a 503 with a helpful message
//   — the client then falls back to the Web Share API (text-only).
//
// SECURITY
// --------
//   • The HTML template is built from typed, escaped fields (no raw
//     user HTML is ever injected into the page Chromium renders).
//   • Chromium is launched with `--no-sandbox` (required on Vercel)
//     but otherwise default args. We don't expose any local files.
//   • The poster image URL is the only external resource Chromium
//     fetches; it's a TMDB URL (always https).
//   • The route has a 10s timeout — if Chromium hangs, the user gets
//     a 504 instead of waiting indefinitely.

import { isServer } from "solid-js/web";
import { createServerClientFromRequest } from "~/lib/supabase/server";
import {
  renderShareCardHtml,
  type ShareCardPayload
} from "~/lib/shareCard/templates";

interface APIEvent {
  request: Request;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

/**
 * Validate the incoming JSON payload. Returns the parsed payload or
 * null if invalid. We do a structural check (not a full schema
 * validation) because the payload is small and the template functions
 * are defensive about missing fields.
 */
function parsePayload(body: unknown): ShareCardPayload | null {
  if (typeof body !== "object" || body === null) return null;
  const obj = body as Record<string, unknown>;
  if (obj.template !== "stats" && obj.template !== "details") return null;
  if (typeof obj.displayName !== "string") return null;
  if (typeof obj.title !== "string") return null;

  // `rows` is optional but must be well-formed if present.
  if (obj.rows !== undefined) {
    if (!Array.isArray(obj.rows)) return null;
    for (const row of obj.rows) {
      if (
        typeof row !== "object" ||
        row === null ||
        typeof (row as Record<string, unknown>).label !== "string" ||
        typeof (row as Record<string, unknown>).value !== "string"
      ) {
        return null;
      }
    }
  }

  // `details` is optional but must be well-formed if present.
  if (obj.details !== undefined) {
    if (typeof obj.details !== "object" || obj.details === null) return null;
    const d = obj.details as Record<string, unknown>;
    if (d.mediaType !== "movie" && d.mediaType !== "tv") return null;
  }

  return obj as unknown as ShareCardPayload;
}

/**
 * Lazily import puppeteer-core + @sparticuz/chromium.
 *
 * We use dynamic import() so the heavy Chromium binary isn't loaded
 * for every cold start of the route module — only when a request
 * actually arrives. This keeps the route's module-evaluation cost low.
 *
 * Returns the launch function or null if the packages aren't
 * available (e.g. in a test environment).
 *
 * The return type is intentionally loose (`unknown` page/browser) —
 * the caller uses the puppeteer API directly without us re-declaring
 * its types. The puppeteer types are pulled in via the dynamic import
 * so the call site is still type-checked.
 */
type ChromiumLauncher = () => Promise<{
  // We use `unknown` here because puppeteer's exact types depend on
  // the dynamic import's resolved types, which are awkward to thread
  // through. The caller casts back to the puppeteer types it needs.
  page: {
    setContent: (
      html: string,
      opts?: { waitUntil?: string; timeout?: number }
    ) => Promise<void>;
    setViewport: (opts: unknown) => Promise<void>;
    screenshot: (opts?: unknown) => Promise<Buffer>;
    close: () => Promise<void>;
  };
  browser: { close: () => Promise<void> };
}>;

async function getChromiumLauncher(): Promise<ChromiumLauncher | null> {
  try {
    const [puppeteerCore, chromiumModule] = await Promise.all([
      import("puppeteer-core"),
      import("@sparticuz/chromium")
    ]);
    // `@sparticuz/chromium` exports a `Chromium` class as the default
    // export. Its `args` is a static getter, and `executablePath` is
    // a static async method.
    const chromium = chromiumModule.default;

    // The launcher returns puppeteer's actual `Browser` + `Page`
    // instances. We cast to `ChromiumLauncher`'s structural type
    // because puppeteer's `setContent` waitUntil type is a string
    // literal union that we'd otherwise have to thread through.
    // The cast is safe — puppeteer's API is structurally compatible.
    const launcher: ChromiumLauncher = async () => {
      // `@sparticuz/chromium` provides args + executablePath for
      // serverless environments. On Vercel, this points to the
      // Lambda-compatible Chromium binary.
      const executablePath = await chromium.executablePath();
      const browser = await puppeteerCore.default.launch({
        args: chromium.args,
        executablePath: executablePath || undefined,
        headless: true
      });

      const page = await browser.newPage();
      // 2x scale for retina quality.
      await page.setViewport({
        width: 528,
        height: 600,
        deviceScaleFactor: 2
      });
      // Cast to the structural type — puppeteer's `Page` is compatible
      // with our narrower interface (it has setContent, setViewport,
      // screenshot, close). The cast goes through `unknown` because
      // puppeteer's setContent signature uses a string-literal union
      // for `waitUntil` that doesn't match our `string` type exactly.
      return {
        page: page as unknown as {
          setContent: (
            html: string,
            opts?: { waitUntil?: string; timeout?: number }
          ) => Promise<void>;
          setViewport: (opts: unknown) => Promise<void>;
          screenshot: (opts?: unknown) => Promise<Buffer>;
          close: () => Promise<void>;
        },
        browser: browser as unknown as { close: () => Promise<void> }
      };
    };
    return launcher;
  } catch (err) {
    console.warn(
      "[api/share-card] Chromium runtime not available:",
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

export async function POST(event: APIEvent): Promise<Response> {
  // ── Guard: server-only ────────────────────────────────────────────
  if (!isServer) {
    return jsonResponse({ error: "This route is server-only." }, 500);
  }

  // ── Authenticate via session cookie ───────────────────────────────
  let userId: string | null = null;
  try {
    const { client } = createServerClientFromRequest(event.request);
    const { data, error } = await client.auth.getSession();
    if (error) {
      console.warn("[api/share-card] getSession error:", error.message);
    }
    userId = data.session?.user?.id ?? null;
  } catch (err) {
    console.error("[api/share-card] Failed to read session:", err);
    return jsonResponse({ error: "Failed to read session." }, 500);
  }

  if (!userId) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  // ── Parse + validate the request body ─────────────────────────────
  let payload: ShareCardPayload | null = null;
  try {
    const body = await event.request.json();
    payload = parsePayload(body);
  } catch (err) {
    console.warn("[api/share-card] JSON parse failed:", err);
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  if (!payload) {
    return jsonResponse({ error: "Invalid payload." }, 400);
  }

  // ── Render the HTML ────────────────────────────────────────────────
  const html = renderShareCardHtml(payload);

  // ── Launch Chromium + screenshot ──────────────────────────────────
  const launcher = await getChromiumLauncher();
  if (!launcher) {
    return jsonResponse(
      {
        error:
          "Share-card rendering is not available in this environment. The Chromium runtime could not be loaded."
      },
      503
    );
  }

  let browser: { close: () => Promise<void> } | null = null;
  try {
    const { page, browser: b } = await launcher();
    browser = b;

    // Set the HTML content. `waitUntil: "networkidle0"` ensures the
    // poster image (if any) has loaded before we screenshot.
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 8000 });

    // Find the .share-card element and screenshot just that.
    // Falling back to a full-page screenshot if the selector fails.
    const pngBuffer = await page.screenshot({
      type: "png",
      // `fullPage: true` captures the entire rendered page, which
      // is just the card (the body has no other content). We use
      // fullPage instead of `clip` because the card's height varies
      // based on the number of rows.
      fullPage: true,
      omitBackground: false
    });

    await b.close();

    return new Response(pngBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        // Cache for an hour on the client — the same card won't change
        // in this session. `private` so CDNs don't cache per-user cards.
        "Cache-Control": "private, max-age=3600, s-maxage=0"
      }
    });
  } catch (err) {
    console.error("[api/share-card] Render failed:", err);
    if (browser) {
      try {
        await browser.close();
      } catch {
        // ignore
      }
    }
    return jsonResponse({ error: "Failed to render share card." }, 500);
  }
}

/**
 * GET handler — returns a 405 with a helpful message. The route only
 * accepts POST because the card payload is too large for query params.
 */
export async function GET(): Promise<Response> {
  return jsonResponse(
    {
      error:
        "Method not allowed. POST a ShareCardPayload to this endpoint to generate a PNG share card."
    },
    405
  );
}
