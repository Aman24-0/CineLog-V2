// src/entry-server.tsx
import { createHandler, StartServer } from "@solidjs/start/server";
// Phase 8 Chunk 1 — Sentry server wrapper.
//
// Importing this module has a top-level side effect: it calls
// `initSentry()` at module load. This is INTENTIONAL — `@sentry/node`
// v8+ uses OpenTelemetry under the hood and must hook Node's http/https
// modules BEFORE any outgoing request is made, or trace context is lost.
// Importing it here (at the top of entry-server) guarantees it runs
// before any SSR fetch.
//
// `captureException` is the only export we consume below.
import { captureException } from "~/lib/sentry/server";

// ── Global unhandled rejection handler ────────────────────────────
//
// During SSR, TMDB API calls can fail (401, network errors, etc.).
// Even though all our fetchers have try/catch, SolidStart's
// createResource + Suspense internals can create promise chains that
// reject independently, becoming "unhandled" rejections that crash
// the Node server process.
//
// This handler logs the rejection but does NOT crash the process.
// The user-facing behavior is unchanged: failed fetches show empty
// states in the UI. This only prevents the server worker from dying
// on transient API errors.
//
// On Vercel, each request runs in its own serverless function
// invocation, so a crash only affects that one request. But on
// Node-server deployments (and local testing), a crash takes down
// the entire server. This handler ensures stability in both cases.
//
// Phase 8 Chunk 1 — non-TMDB rejections are now ALSO forwarded to
// Sentry via captureException(). The TMDB-suppression logic is
// preserved (TMDB 401s / fetch errors are not sent to Sentry because
// the server-side `beforeSend` in src/lib/sentry/server.ts also filters
// them, but we additionally skip the captureException call entirely
// for those to avoid the overhead of constructing an event that
// `beforeSend` will discard).
if (typeof process !== "undefined") {
  process.on("unhandledRejection", (reason) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    // Only log TMDB/API errors at warn level (they're expected during
    // SSR when the API key is missing or the API is rate-limited).
    // Other errors are logged at error level for visibility.
    if (
      msg.includes("TMDB") ||
      msg.includes("getTopRated") ||
      msg.includes("discover") ||
      msg.includes("401") ||
      msg.includes("fetch")
    ) {
      console.warn("[SSR] Suppressed API error (non-fatal):", msg);
    } else {
      console.error("[SSR] Unhandled rejection:", reason);
      // Forward genuine (non-TMDB) rejections to Sentry for production
      // monitoring. captureException falls back to console.error when
      // Sentry is not configured (dev, tests, missing DSN), so this
      // is a no-op in those environments.
      captureException(reason, {
        source: "ssr-unhandled-rejection"
      });
    }
  });
}

export default createHandler(() => (
  <StartServer
    document={({ assets, children, scripts }) => (
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1, viewport-fit=cover"
          />
          <title>CineLog V2 — Your Cinematic Watchlist</title>
          <meta
            name="description"
            content="CineLog V2 — track your movies and TV shows, discover new favorites, and build curated collections. A modern watchlist app for cinephiles."
          />
          {/* Per-mode theme-color meta tags.
              ---------------------------------------------------------------
              The browser uses this color for the URL bar / status bar
              tint on mobile (Chrome on Android, Safari on iOS 15+).
              CineLog has TWO modes:
                • Dark (default) — void black background (#0a0a0a) with
                  cinema gold accent (#e8b74a). The URL bar should be
                  void black so the app feels immersive.
                • Light — warm cream background. The URL bar should be
                  the same cream so it blends with the page.

              The `media` attribute lets us declare BOTH values and the
              browser picks the right one based on the user's OS theme.
              This is the modern, standards-based alternative to setting
              a single theme-color and hoping it matches every mode.

              The manifest.json `theme_color` field is the FALLBACK for
              PWA install (the standalone app's status bar). We set it
              to #0a0a0a (dark) because the app defaults to dark mode —
              most installs will be in dark mode, and the per-mode meta
              tags below take precedence in browsers that support them.

              Chrome 93+, Firefox 91+, and Safari 15+ all support the
              `media` attribute on theme-color meta tags. Older
              browsers fall back to the manifest.json theme_color. */}
          <meta name="theme-color" content="#0a0a0a" media="(prefers-color-scheme: dark)" />
          <meta name="theme-color" content="#faf7f0" media="(prefers-color-scheme: light)" />
          <meta name="theme-color" content="#0a0a0a" />
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta name="mobile-web-app-capable" content="yes" />
          <meta
            name="apple-mobile-web-app-status-bar-style"
            content="black-translucent"
          />
          <meta name="apple-mobile-web-app-title" content="CineLog" />
          <link rel="icon" href="/favicon.ico" />
          <link rel="apple-touch-icon" href="/icon-192.png" />
          <link rel="manifest" href="/manifest.json" />
          <link rel="canonical" href="https://cinelog.app" />

          {/* Open Graph — DOMAIN-WIDE DEFAULTS ONLY
              ---------------------------------------------------------------
              IMPORTANT: We intentionally do NOT include og:title,
              og:description, og:url, or og:image here. Those tags are
              set PER-ROUTE by the deep-link routes (src/routes/movie/[id].tsx
              and src/routes/tv/[id].tsx) so chat-app scrapers (WhatsApp,
              iMessage, Telegram, Slack) see the per-movie poster + title
              instead of a generic app-wide preview.

              If we added og:title here, scrapers would see TWO og:title
              tags (this static one + the route's dynamic one) and pick
              the FIRST one — which is always the static generic title,
              defeating the per-movie link preview.

              We keep og:site_name and og:type because those ARE
              domain-wide properties (every page belongs to the same
              site and is the same type). */}
          <meta property="og:site_name" content="CineLog V2" />
          <meta property="og:type" content="website" />

          {/* Twitter Card — domain-wide default. The route-level Meta
              tags override twitter:title / twitter:description /
              twitter:image per page. We keep twitter:card here because
              it's a domain-wide display preference. */}
          <meta name="twitter:card" content="summary_large_image" />

          {/* Google Fonts & Material Symbols
              --------------------------------
              Phase 5 Task 3: Fonts are now SELF-HOSTED via @fontsource
              packages (see src/app.tsx for the imports). This eliminates
              the render-blocking <link> tags to fonts.googleapis.com and
              the associated DNS/TLS handshake to Google's CDN.

              Benefits:
                • No render-blocking external CSS request
                • No external DNS lookup + TLS handshake
                • Full control over which weights are bundled
                • woff2 files are served from the same origin as the app
                  (no third-party dependency)
                • Privacy: no requests to Google's font CDN

              The @fontsource CSS is bundled into the app's CSS by Vite
              and included in the SSR-rendered HTML, so the browser
              starts fetching the woff2 files as soon as the HTML arrives
              — before JS hydration. This is faster than the old
              render-blocking <link> approach. */}
          {/* Preconnect to TMDB image CDN so poster fetches skip TLS handshake */}
          <link
            rel="preconnect"
            href="https://image.tmdb.org"
            crossorigin="anonymous"
          />

          {/* Hide Material Symbols icon names until the icon font is ready —
              prevents the FOUT where icon names like "density_default" flash
              as literal text before the font loads. The CSS rule in base.css
              hides .material-symbols-outlined until .mat-syms-loaded is on <html>.

              The fallback timeout is 800ms (down from 2000ms) so icons appear
              sooner even if document.fonts.ready is slow. With display=swap on
              the font URL, the browser will show icons as soon as the font
              loads rather than waiting for all fonts to be ready.

              Phase 5 Task 3: the FontFace constructor now references
              'Material Symbols Outlined Variable' (the family name declared
              by @fontsource-variable/material-symbols-outlined) instead of
              the old Google Fonts family name. */}
          { }
          <script innerHTML={`(function(){try{var done=false;function mark(){if(done)return;done=true;document.documentElement.classList.add('mat-syms-loaded')}setTimeout(mark,800);if(document.fonts&&document.fonts.ready){document.fonts.ready.then(mark)}var f=new FontFace('Material Symbols Outlined Variable','local("Material Symbols Outlined Variable")');f.load().then(mark).catch(mark)}catch(e){document.documentElement.classList.add('mat-syms-loaded')}})();`} />

          {assets}
        </head>
        <body>
          <div id="app">{children}</div>
          {scripts}
        </body>
      </html>
    )}
  />
));
