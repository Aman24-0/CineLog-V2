# CineLog V2

Next-generation rebuild of CineLog — a cinematic watchlist and discovery
app for movies and TV shows, built with SolidStart and Supabase.

## Stack

- **Framework:** SolidStart (SolidJS) + Vinxi
- **Language:** TypeScript (strict)
- **Styling:** TailwindCSS 3 + custom Glassmorphism design system
- **Backend / Auth / DB:** Supabase (Postgres + RLS + Storage + Auth)
- **Search / Metadata:** TMDB API (cached), OMDB fallback
- **Deployment:** Vercel (preset)
- **Testing:** Vitest (618 tests, 27 files)
- **PWA:** installable, with manifest + icons

## Features

- **Discover** — Spotlight, Cosmos view, Trajectory cards, OTT rails,
  Taste surfaces, taste-driven recommendations
- **Vault (Watchlist)** — statuses (Planned / Watching / Completed /
  Dropped), re-watch tracking, episode progress, presets, vault filters,
  CSV / JSON import & export
- **Collections** — Smart rules, curated universes, timeline engine,
  folder editor, franchise grids
- **Profile** — banner editor, favorites carousel, achievement badges,
  Cinema DNA archetype, stats grid, profile completion
- **Details modal** — TMDB-rich metadata, season navigator, cast,
  recommendations, where-to-watch, share sheet (image + link + text)
- **Admin panel** — `/admin/*` routes for users, content, collections,
  feature flags, announcements, analytics, logs, maintenance, TMDB cache,
  homepage config
- **Sync** — Supabase sync history, devices, cloud status, reset library
- **Settings** — appearance, density, font size, accent color, poster
  quality, hide spoilers, reduced motion, high contrast, calendar,
  notifications, privacy, developer tools
- **Trash** — soft-deleted items with restore
- **Deep links** — `/movie/:id` and `/tv/:id` with per-title OG meta
  tags for rich WhatsApp / iMessage / Telegram / Slack previews

## Scripts

| Command              | Description                              |
| -------------------- | ---------------------------------------- |
| `npm run dev`        | Start the Vinxi dev server               |
| `npm run build`      | Production build (Vinxi)                 |
| `npm run start`      | Run the built server                     |
| `npm run lint`       | ESLint (TypeScript + Solid)              |
| `npm run format`     | Prettier write                           |
| `npm test`           | Vitest one-shot run                      |
| `npm run test:watch` | Vitest watch mode                        |
| `npm run test:coverage` | Vitest with V8 coverage               |

## Project Layout

```
src/
  app.tsx                 # Root: Router + providers
  app/AppShell.tsx        # Consumer layout (header, bottom nav, modals)
  routes/                 # File-routes (SolidStart)
    index.tsx             # / → /discover
    discover.tsx, search.tsx, watchlist.tsx
    movie/[id].tsx, tv/[id].tsx   # deep-link routes w/ OG meta
    profile/*, settings/*, admin/*
    api/                  # API endpoints (admin, feature-flags, tmdb-cache …)
  features/
    discover/, watchlist/, collections/, collection/,
    details/, profile/, admin/, sync/, account/, search/, trash/
  shared/
    ui/                   # Glass design system + primitives
    hooks/                # useAuth, useUserLibrary, useModalState, useToast…
    utils/, data/, types/
  core/
    tmdb/, omdb/, theme/, preferences/, config/
  lib/
    supabase/             # client, server, session, repositories, admin
    featureFlags.ts, featuredContent.ts, homepageConfig.ts, announcements.ts
supabase/
  config.toml
  migrations/*.sql        # 12 migrations incl. RLS, indexes, profile, admin
scripts/                  # SQL fixes, PWA icon generator, share verifier
```

## Status

- Foundation: complete
- Phase 1–3 Glassmorphism UI migration: complete
- Admin panel: phase 1–3 complete
- Bug fixes applied this revision: see `BUGFIX_REPORT.md`

## License

MIT (project-level — see repository for details).
