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

## AniList Integration (Anime Enrichment)

CineLog integrates the [AniList GraphQL API](https://docs.anilist.co/) as a
**secondary, specialized metadata provider for anime content**. TMDB remains
the primary metadata provider for all content; AniList adds anime-specific
enrichment (characters, voice actors, relations, airing schedule, OP/ED
themes, seasonal schedules, anime recommendations).

### Architecture

```
TMDB (primary)  ─┐
                 ├─→  CineLog UI  ←─  anime_mappings table (TMDB ↔ AniList)
AniList (anime) ─┘                    ↑
                                      └─  auto-mapper (title + year search)
```

- TMDB is the source of truth for posters, titles, plots, ratings, and all
  non-anime content.
- AniList is queried only for titles detected as anime (via heuristics +
  the mapping table) and only for fields TMDB doesn't have (characters,
  studios, relations, airing schedule, OP/ED themes).
- AniList GraphQL requests route through `/api/anilist` (server proxy) so
  the optional `ANILIST_ACCESS_TOKEN` stays server-side and rate-limit
  state is shared across users on the same deployment.

### Environment Variables

Add to `.env` (or Vercel project settings):

```
ANILIST_API_URL=https://graphql.anilist.co
ANILIST_ACCESS_TOKEN=        # optional — raises rate limit from 90 → 120 req/min
```

Anonymous requests work without a token (90 req/min per IP).

### Database Migration

Apply the new migration to add the `anime_mappings` table + the default
`anime_settings` row in `app_config`:

```bash
supabase db push
# or, manually:
psql $DATABASE_URL -f supabase/migrations/20260801_add_anime_mappings.sql
```

The migration is **additive** — no existing tables are changed.

### Key Files

| Purpose | Path |
|---------|------|
| AniList GraphQL client + rate-limit handling | `src/lib/anilist/client.ts` |
| GraphQL fragments + queries | `src/lib/anilist/queries.ts` |
| AniList TypeScript types | `src/lib/anilist/types.ts` |
| Anime detection (heuristics + mapping lookup) | `src/core/anime/detector.ts` |
| TMDB ↔ AniList mapping repository | `src/lib/supabase/repositories/animeMapping.ts` |
| Discover anime carousels service | `src/features/discover/services/animeCarousels.ts` |
| Details page AniList enrichment hook | `src/features/details/useAnimeEnrichment.ts` |
| Details page anime sections UI | `src/features/details/DetailsModal/AnimeSections.tsx` |
| Anime recommendations (AniList graph) | `src/features/details/animeRecommendations.ts` |
| Search anime fallback | `src/features/search/animeSearchFallback.ts` |
| Smart anime collections | `src/features/collections/animeSmartCollections.ts` |
| AniList API server proxy | `src/routes/api/anilist.ts` |
| Public anime settings endpoint | `src/routes/api/anime-settings.ts` |
| Admin anime settings endpoint | `src/routes/api/admin/anime-settings.ts` |
| Admin anime settings UI | `src/features/admin/AdminAnimePage.tsx` |
| Provider plugin architecture | `src/lib/providers/BaseProvider.ts` |

### Admin Panel

Navigate to `/admin/anime` to:

- Toggle the master anime integration switch
- Toggle individual features (seasonal carousel, characters/staff,
  relations, airing schedule, OP/ED themes, auto-mapping)
- Configure AniList API timeout (ms)
- Configure cache TTLs for details, trending, seasonal, upcoming
- Configure the rate-limit buffer percentage

Changes are saved immediately (autosave on toggle) and take effect for all
users within 5 minutes (the public settings endpoint is CDN-cached).

### Detection Algorithm

A title is treated as anime if ANY of these signals is true:

1. TMDB genre 16 (Animation) + origin country `JP`
2. TMDB genre 16 + original language `ja`
3. Strong keyword in title/overview (`ova`, `manga adaptation`, `light
   novel adaptation`, `japanese animation`)
4. Weak keyword (`anime`, `manga`, `shounen`, `isekai`, etc.) + JP origin
5. The TMDB id exists in `anime_mappings` (previously confirmed)

Detection runs synchronously via heuristics (signals 1-4) on every render.
The mapping-table lookup (signal 5) is async and called only by the
Details page (where the latency is acceptable).

### Auto-Mapping

When a user opens an anime title that has no AniList mapping, the
auto-mapper:

1. Searches AniList by title (returns ~20 candidates).
2. Scores each candidate by title similarity (Levenshtein) + year match
   (±1 tolerance) + format match (TV vs MOVIE).
3. Picks the highest-scoring candidate above 70 (out of 100).
4. Upserts the mapping into `anime_mappings` with the appropriate
   confidence level (high/medium/low).

Auto-mapping can be disabled from the admin panel. When disabled, only
manually-curated mappings (entered by an admin) are used.

### Caching Strategy

| Layer | TTL | Purpose |
|-------|-----|---------|
| In-memory response cache (client.ts) | 5 min | Absorbs repeated clicks on the same anime detail page |
| Details query cache (client.ts) | 30 min | Long-lived cache for full Media details |
| apiCache (carousel service) | 6-24h | Trending, seasonal, upcoming, top-rated, movies carousels |
| Supabase `anime_mappings` | Permanent | TMDB ↔ AniList id joins (no expiry) |
| In-memory mapping cache | Session | Reduces DB round-trips for repeat lookups |
| Vercel CDN (proxy responses) | 5-30 min | Shared across users on the same deployment |

### Rate-Limit Handling

The AniList client:

- Reads `X-RateLimit-Remaining` and `X-RateLimit-Reset` from every response.
- When remaining drops below 5 requests, pauses until the bucket resets.
- On HTTP 429, honors `Retry-After` and retries once with exponential
  backoff for further retries.
- Deduplicates identical in-flight requests (5-second window) so concurrent
  callers share a single Promise.

### Error Handling

AniList failures are **silent**:

- If AniList is down, the Details page renders TMDB-only content (no
  anime sections, no error UI).
- If a specific anime has no AniList mapping, the anime sections are
  omitted (no "data not available" placeholder).
- If a carousel fails, the rail is hidden (no empty-state UI for anime
  the user doesn't care about).

### Provider Plugin Architecture (Phase 11)

The `MetadataProvider` interface (`src/lib/providers/BaseProvider.ts`)
lets future providers (MAL, Kitsu, JustWatch) be added without touching
consumers. AniList is registered as a provider; TMDB and MDBList will be
migrated to the same interface in a future refactor.

### Tests

```bash
npm test                      # run all 796 tests
npx vitest run src/core/anime # anime detector tests
npx vitest run src/lib/anilist # AniList query + season tests
npx vitest run src/lib/providers # provider registry tests
npx vitest run src/features/search/__tests__/animeSearchFallback.test.ts
```

73 new tests cover:
- Anime detection heuristics (signal 1, 2, 3, keyword boundaries)
- AniList season calculation (all 12 months)
- GraphQL query string structure (fragments + variables)
- Mapping repository (cache, save, automap, error paths)
- Provider registry (routing, fallback, dedup)
- Anime search fallback (Japanese detection, mapping miss, errors)
