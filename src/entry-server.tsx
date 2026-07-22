// src/entry-server.tsx
import { createHandler, StartServer } from "@solidjs/start/server";

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
if (typeof process !== "undefined") {
  process.on("unhandledRejection", (reason) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    // Only log TMDB/API errors at warn level (they're expected during
    // SSR when the API key is missing or the API is rate-limited).
    // Other errors are logged at error level for visibility.
    if (msg.includes("TMDB") || msg.includes("getTopRated") || msg.includes("discover") || msg.includes("401") || msg.includes("fetch")) {
      console.warn("[SSR] Suppressed API error (non-fatal):", msg);
    } else {
      console.error("[SSR] Unhandled rejection:", reason);
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
          <meta name="theme-color" content="#090909" />
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta name="mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
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
              We use display=swap on ALL font requests (including Material
              Symbols) so text renders immediately with a fallback font and
              swaps to the webfont when ready. This eliminates FOIT (Flash
              Of Invisible Text) which hurts LCP and CLS.

              The fonts.googleapis.com CSS is render-blocking by default,
              which is correct — we want the font CSS to load before the
              first paint so the browser can start requesting the actual
              font files ASAP. */}
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
          {/* Preconnect to TMDB image CDN so poster fetches skip TLS handshake */}
          <link rel="preconnect" href="https://image.tmdb.org" crossorigin="anonymous" />
          <link
            href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@300;400;500;600;700;800;900&family=Outfit:wght@300;400;500;600;700;900&family=Azeret+Mono:wght@300;400;500;700&display=swap"
            rel="stylesheet"
          />
          <link
            href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
            rel="stylesheet"
          />

          {/* Hide Material Symbols icon names until the icon font is ready —
              prevents the FOUT where icon names like "density_default" flash
              as literal text before the font loads. The CSS rule in base.css
              hides .material-symbols-outlined until .mat-syms-loaded is on <html>.

              The fallback timeout is 800ms (down from 2000ms) so icons appear
              sooner even if document.fonts.ready is slow. With display=swap on
              the font URL, the browser will show icons as soon as the font
              loads rather than waiting for all fonts to be ready. */}
          {/* eslint-disable-next-line solid/no-innerhtml -- intentional inline script for FOUT prevention (font-loading marker) */}
          <script innerHTML={`(function(){try{var done=false;function mark(){if(done)return;done=true;document.documentElement.classList.add('mat-syms-loaded')}setTimeout(mark,800);if(document.fonts&&document.fonts.ready){document.fonts.ready.then(mark)}var f=new FontFace('Material Symbols Outlined','local("Material Symbols Outlined")');f.load().then(mark).catch(mark)}catch(e){document.documentElement.classList.add('mat-syms-loaded')}})();`} />

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
