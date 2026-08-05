// postcss.config.js
//
// PostCSS config for CineLog V2.
//
// ─────────────────────────────────────────────────────────────────────
// PHASE 8 CHUNK 3 — TAILWIND v3 → v4 UPGRADE
// ─────────────────────────────────────────────────────────────────────
// Tailwind v4 replaces the `tailwindcss` PostCSS plugin with a new
// `@tailwindcss/postcss` plugin. The old plugin is no longer shipped
// in the `tailwindcss` package — projects must install the separate
// `@tailwindcss/postcss` package and reference it here.
//
// Concurrent changes:
//   • tailwindcss          v3.4.3 → v4.3.3
//   • @tailwindcss/postcss  (new)  → v4.3.3
//   • autoprefixer         REMOVED — Tailwind v4 bundles its own
//                                    autoprefixing via lightningcss,
//                                    so the standalone autoprefixer
//                                    PostCSS plugin is no longer needed.
//   • src/styles/base/tailwind.css — @tailwind directives replaced
//                                    with @import "tailwindcss"
//   • tailwind.config.js    KEPT — Tailwind v4 reads JS config via the
//                                    `config` option on the PostCSS
//                                    plugin (set below). We deliberately
//                                    do NOT use the `@config` directive
//                                    in CSS, because that directive is
//                                    resolved relative to the root CSS
//                                    file (e.g. src/app/globals.css),
//                                    not the file it is written in.
//                                    That breaks Vercel builds with
//                                    "Can't resolve '../../../tailwind.config.js'".
//                                    Passing the path through the
//                                    plugin options is robust against
//                                    CSS import depth.
// ─────────────────────────────────────────────────────────────────────

export default {
  plugins: {
    "@tailwindcss/postcss": {
      config: "./tailwind.config.js"
    }
  }
};
