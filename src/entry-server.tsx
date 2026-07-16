// src/entry-server.tsx
import { createHandler, StartServer } from "@solidjs/start/server";

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
          <meta name="theme-color" content="#7c3aed" />
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta name="mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
          <meta name="apple-mobile-web-app-title" content="CineLog" />
          <link rel="icon" href="/favicon.ico" />
          <link rel="apple-touch-icon" href="/icon-192.png" />
          <link rel="manifest" href="/manifest.json" />
          <link rel="canonical" href="https://cinelog.app" />

          {/* Open Graph */}
          <meta property="og:type" content="website" />
          <meta property="og:title" content="CineLog V2 — Your Cinematic Watchlist" />
          <meta property="og:description" content="Track your movies and TV shows, discover new favorites, and build curated collections." />
          <meta property="og:site_name" content="CineLog V2" />
          <meta property="og:url" content="https://cinelog.app" />

          {/* Twitter Card */}
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content="CineLog V2 — Your Cinematic Watchlist" />
          <meta name="twitter:description" content="Track your movies and TV shows, discover new favorites, and build curated collections." />

          {/* Google Fonts & Material Symbols */}
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
          {/* Preconnect to TMDB image CDN so poster fetches skip TLS handshake */}
          <link rel="preconnect" href="https://image.tmdb.org" crossorigin="anonymous" />
          <link
            href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Outfit:wght@300;400;500;600;700;900&family=Azeret+Mono:wght@300;400;500;700&display=swap"
            rel="stylesheet"
          />
          <link
            href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
            rel="stylesheet"
          />

          {/* Hide Material Symbols icon names until the icon font is ready —
              prevents the FOUT where icon names like "density_default" flash
              as literal text before the font loads. The CSS rule in base.css
              hides .material-symbols-outlined until .mat-syms-loaded is on <html>. */}
          {/* eslint-disable-next-line solid/no-innerhtml -- intentional inline script for FOUT prevention (font-loading marker) */}
          <script innerHTML={`(function(){try{var done=false;function mark(){if(done)return;done=true;document.documentElement.classList.add('mat-syms-loaded')}setTimeout(mark,2000);if(document.fonts&&document.fonts.ready){document.fonts.ready.then(mark)}var f=new FontFace('Material Symbols Outlined','local("Material Symbols Outlined")');f.load().then(mark).catch(mark)}catch(e){document.documentElement.classList.add('mat-syms-loaded')}})();`} />

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
