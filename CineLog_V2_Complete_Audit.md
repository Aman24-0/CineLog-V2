# CineLog V2 — Complete Repository Audit

**Repository:** `https://github.com/Aman24-0/CineLog-V2.git`
**Branch audited:** `main` (HEAD: `3b21d5c` — *Revert Sprint 5C: Remove Dulo-inspired cinematic atmosphere redesign*)
**Audit date:** 2026-08-04
**Audit type:** Read-only architecture & feature audit. No files were modified, no code was generated, no refactor was performed.
**Methodology:** Direct source review of all 709 files in the repository (16 MB), supported by 6 parallel exploration subagents covering: routes & pages, glass/shared UI, API/DB/auth, 16 feature modules, state/theme/PWA, and performance/a11y/security/deps/dead-code/bugs. Findings are cross-referenced to concrete file paths wherever possible.

---

## 0. Repository At-a-Glance

| Property | Value |
|---|---|
| Framework | **SolidStart** (SolidJS) on Vinxi/Vite, Vercel preset |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS 3.4 + custom Glassmorphism design system (~70+ CSS files) |
| Backend / Auth / DB | **Supabase** (Postgres + RLS + Storage + Auth + pg_cron + pg_net) |
| External APIs | TMDB (primary), AniList (anime enrichment), MDBList (ratings), OMDB (legacy, deprecated), Resend (transactional email), Vercel Speed Insights |
| Deployment | Vercel (`app.config.ts` preset) |
| Testing | Vitest 4 + jsdom + `@solidjs/testing-library` (~27 test files, 600+ tests) |
| PWA | Installable (manifest + 3 icons), service worker with push only — **no offline caching** |
| Repo size | 16 MB |
| Source files | 709 (excluding `.git`) |
| File distribution | `src/features`: 276 · `src/lib`: 102 · `src/shared`: 92 · `src/styles`: 57 · `src/routes`: 75 · `src/core`: 40 |
| SQL migrations | 29 (`supabase/migrations/*.sql`) + 3 standalone scripts |
| API routes | 31 (15 public consumer-facing + 16 admin-gated) |
| UI routes | 44 (consumer) + 16 (admin) + 1 auth callback = 61 routes |
| Firebase remnants | **None at runtime.** 18+ historical/migration comments only. Migration `01_user_presets.sql` documents "eliminates final Firebase dependency." Legacy Firestore timestamp shapes (`{seconds, nanoseconds}`) are still handled for V1 backup import compat. |

---

## 1. Executive Summary

CineLog V2 is a **production-grade, single-developer PWA** that has matured through at least 12 development "sprints" (Sprint 1–5C visible in commit history). It is a feature-rich cinematic watchlist & discovery application targeting primarily Indian / English-speaking audiences, built on SolidJS + Supabase and deployed to Vercel. The architecture is unusually disciplined for a solo project: repositories are cleanly separated from adapters, which are cleanly separated from feature hooks, which are cleanly separated from page components. RLS is enforced on every table. Admin mutations are audit-logged. Tests exist for the pure-functional core (utilities, repositories, adapters, business logic) with coverage thresholds enforced.

### Overall architecture
The codebase is organized into four concentric layers:
1. **`core/`** — pure modules with no Supabase dependency: TMDB client, OMDB legacy, anime detector, theme engine, 18 preference signals, feature-flag defaults.
2. **`lib/`** — infrastructure with side effects: Supabase client (browser + admin + server + session), 18 repositories grouped by domain (vault, collection, profile, discover, preset, episodeProgress, dashboard, animeMapping, activityLog, loginHistory, sessions, settings, stats, upcoming), AniList GraphQL client, providers plugin architecture, email renderer + 6 templates, announcements/homepageConfig/featureFlags caches.
3. **`shared/`** — reusable UI: Glass design system (21 components), primitives (Button + Skeleton — both dead), layout (PageContainer + SectionContainer), root shared UI (AppHeader, BottomNavigation, NavButton, DesktopSidebar, DesktopUtilityPanel, MovieCard, MovieCardRatings, SafeImage, HighlightText, Icon, ScrollToTop, AuthModal, ToastContainer, OfflineBanner, AnnouncementsBanner, GlobalErrorBoundary), contexts (SearchContext), hooks (useAuth, useAuthActions, useAuthModal, useModalState, useCollectionModal, useToast, useUserLibrary, userLibraryAdapter, useLazyImdbRating, useLazyImdbRating, useLazyImdbRating, useCollectionModal), utilities (date, format, progress, tmdbCache, apiCache, colorExtractor, imageCompress, share, vaultMatch, vaultStatus, seenTitles, haptic, username, routePrefetch, clearStorage, genres), data (countryLanguages, curatedCollections, franchises, suggestedUniverses), types.
4. **`features/`** — 16 feature modules: discover, watchlist, collections (plural — user folders + curated universes), collection (singular — franchise modal), details, profile, stats, upcoming, search, settings, sync, account, trash, admin, notifications, anime.

### Current maturity
**Stable, ~80% feature-complete, ~70% production-ready.** All 16 feature modules are documented as "Stable" with optimistic updates, defensive error handling, and SSR safety. The remaining 20–30% gap is mostly: PWA offline support (zero), real-time sync (none — Supabase Realtime not used), social features (deliberately removed in migration 20260802), smart collection rule persistence (schema limitation), and proper rate limiting (in-memory only — effectively a no-op on Vercel serverless).

### Major strengths
1. **Defense-in-depth on admin routes**: cookie JWT (HS256, constant-time signature compare) + DB lookup (`is_admin AND admin_disabled_at IS NULL AND deleted_at IS NULL`) + PIN (constant-time compare) + audit log on every mutation.
2. **Service-role key never reaches browser**: `createAdminClient()` throws if `isServer` is false; all service-role operations are confined to API routes.
3. **RLS is the primary access control**: every table has RLS enabled with owner-only or admin-only policies. A `protect_admin_columns()` trigger prevents non-admins from changing `is_admin`/`admin_disabled_at` even via direct SQL.
4. **Constant-time comparisons** on all secret comparisons (PIN, JWT signature, CRON_SECRET).
5. **Comprehensive audit trail**: `admin_actions` (append-only — no UPDATE/DELETE policy), `maintenance_runs`, `login_history`, `activity_log`, `import_export_jobs`.
6. **Progressive security fixes** in migrations 05, 06, 20260801_fix_maintenance_rls, 20260806_fix_user_preferences_rls — each addressing a specific audit finding.
7. **Optimistic updates** with revert-on-error across vault, collections, and trash — UI feels instant.
8. **Comprehensive inline documentation** of race conditions, gotchas, and bug-fix history. Most non-trivial files have a header comment explaining architecture + data flow.
9. **Strict TypeScript** with `strict: true`, `isolatedModules`, `forceConsistentCasingInFileNames`. Zero `as any` casts (banned by eslint).
10. **Idempotent migrations** — every migration uses `IF NOT EXISTS` / `DROP POLICY IF EXISTS` / `CREATE OR REPLACE`. Safe to re-run.
11. **CDN caching strategy is well-tuned**: public read-only endpoints cache aggressively (5–30 min), user-specific endpoints cache briefly (60s), mutations cache `no-store`.
12. **Three-layer TMDB caching**: in-memory `apiCache.ts` (10 min) → localStorage `cinelog_tmdb_cache` (24h) → Supabase `tmdb_cache` table (7d SWR, shared cross-user).
13. **Triple-dedup IMDb ratings**: LRU cache (500 entries) → in-flight Set → IntersectionObserver (disconnects after first intersection).
14. **Strong SEO on deep links**: `/movie/[id]` and `/tv/[id]` emit per-route OG/Twitter meta with `deferStream: true` so SSR waits for TMDB data before flushing — chat-app scrapers see real posters.
15. **WCAG-minded a11y**: focus traps + restore-focus in GlassModal/GlassSheet, roving tabindex in GlassTabs, `aria-modal`, `aria-live` regions, `prefers-reduced-motion` and `prefers-color-scheme` listeners, high-contrast mode.

### Major weaknesses
1. **PWA is essentially decorative.** Service worker (`public/sw.js`) handles only `push` and `notificationclick`. There is **no `fetch` handler, no Cache API usage, no offline support**. The app is non-functional offline. Worse, Chrome's installability criteria historically required a SW with a fetch handler — the install prompt may not fire in some browsers.
2. **PWA identity mismatch.** Manifest `theme_color: #7c3aed` (purple), entry-server `<meta name="theme-color" content="#7c3aed">`, and PWA icons (auto-generated with `ACCENT = (124, 58, 237)` purple) — but the app's default theme `cinematic` uses `--p: #e8b74a` (cinema gold). Status bar / splash / home-screen icon will be purple while app content is gold.
3. **`database.types.ts` is severely outdated.** Missing 9+ tables added after initial generation: `admin_actions`, `app_config`, `announcements`, `featured_content`, `maintenance_runs`, `notifications`, `user_reminders`, `push_subscriptions`, `login_history`, `universe_phases`. Still includes `follows` table and `profiles.social_links`/`is_public` columns dropped in migration 20260802. TypeScript can't catch schema mismatches at compile time.
4. **Rate limiting is in-memory only.** All 5 rate limiters (admin auth, account delete, push send, push status, email send) use module-level `Map`s that reset on every Vercel cold-start. The `/api/account/delete` limiter (5 attempts / 15 min) is **effectively a no-op in production** because each invocation may run in a fresh instance.
5. **Admin mutation routes have NO rate limiting.** Only `requireAdmin()` is called on `/api/admin/{collections,content,announcements,users,feature-flags,...}` POST/PATCH/DELETE. A compromised admin token could spam DB writes.
6. **User sessions stored in localStorage** (Supabase SDK default with `persistSession: true`). XSS attack could exfiltrate `sb-*-auth-token` (access + refresh tokens). Mitigated by strict CSP, but CSP allows `'unsafe-inline'` and `'unsafe-eval'` in `script-src`.
7. **OMDB API key exposed in browser bundle** (`src/core/omdb/omdb.ts:5` uses `import.meta.env.VITE_OMDB_API_KEY`). Unlike TMDB/MDBList/AniList which route through server proxies, OMDB is called directly from the browser. The OMDB module is largely superseded by MDBList via `/api/media/ratings` and may be dead.
8. **Schema-vs-code drift**: `curated_universe_entries` has 4 redundant position columns (`position`, `release_position`, `story_position`, `timeline_position`) but only `position` is actively used; `incident_year` is the new primary sort driver. `activity_log.entity_id` is UUID-typed but never populated (TMDB ids are stored in `metadata.tmdb_id`). `universe_phases.before_entry_id` is TEXT storing either UUIDs or TMDB-id-strings with no constraint. `user_universe_subscriptions` lacks an `is_hidden` column that the code expects.
9. **Smart collection rules cannot persist.** `collections.collection_type='smart'` exists in the DB but there is **no rules JSONB column**. `useCollections.updateSmartRules()` throws `UnsupportedFeatureError` if rules are non-empty. Smart rules are evaluated live only; refreshing the page loses them.
10. **`weekly_recap` pg_cron migration has unresolved placeholders** (`<APP_URL>`, `<CRON_SECRET>`) that operators must manually replace. If the migration is applied as-is, the cron job will POST to `https://<APP_URL>/api/cron/weekly-recap` (literal string) and fail silently.
11. **Admin JWT secret minimum is 16 chars** (`adminJwt.ts:89`) — too weak for production. The error message itself recommends 32+.
12. **`signOut()` default scope is `global`** — calling sign-out from the standard "Sign out" button signs the user out of ALL devices, not just the current one. The explicit `signOutGlobal()` exists for the "Sign out everywhere" intent, suggesting the default should use `scope: "local"`.
13. **No `[...404].tsx` catch-all route.** Unknown URLs render SolidStart's default (typically blank). This is a UX and SEO gap.
14. **Theme (8 accent presets) is NOT in `PreferencesSnapshot`** — `cinelog_theme` localStorage key is synced only locally, not to Supabase. A user who picks "matrix" on their laptop sees "cinematic" (default) on their phone.
15. **Module-level signals lack test-reset helpers** (except `useAuth._resetAuthStateForTesting()`). Test isolation is brittle for `useToast`, `useModalState`, `useCollectionModal`, `useAuthModal`.
16. **`accentHelpers.ts` duplicates `~/core/preferences/customAccent`** verbatim — acknowledged tech debt.
17. **Two duplicate `UpcomingPage.tsx` files** — `src/features/profile/UpcomingPage.tsx` (1355 lines, **dead**) vs `src/features/upcoming/UpcomingPage.tsx` (659 lines, **live**). The dead one inflates the repo and risks accidental import.
18. **Two duplicate `PageContainer.tsx` files** — `src/shared/ui/PageContainer.tsx` (legacy, exported from barrel, used by ~22 routes) vs `src/shared/ui/layout/PageContainer.tsx` (newer, only used by `ProfilePage`). Callers get the legacy one by default.
19. **Dead Glass UI components** — `GlassChip`, `GlassDivider`, `GlassListItem`, `GlassSearchBar`, `GlassSectionHeader`, `SectionContainer`, `primitives/Button`, `primitives/Skeleton` all have zero real consumers (only their own barrel exports).
20. **`AdminCollectionEditorPage` (`/admin/collections/[id]`) does NOT wrap with `<AdminShell>`** and does NOT call `useAdminAuth()` / `requireAdmin()`. Non-admin visitors can render the editor chrome (UI shell not gated). API calls are still protected server-side, so this is a UX/consistency bug, not a data-leak — but it's inconsistent with every other `/admin/*` route.

### Estimated completion %
**~80% feature-complete, ~70% production-ready.** Most consumer features work end-to-end. The remaining 20–30% is: PWA offline (zero), real-time sync (none), social (deliberately removed), smart rule persistence (blocked on schema migration), proper rate limiting, account-deletion cron automation, comprehensive test coverage for Details/Settings/Sync/Account/Trash/Admin/Notifications/Anime features (all untested), and the various bugs/dead-code items catalogued in §24/§23.

### Overall project quality
**Strong for a solo project.** The architecture is clean, the documentation is extensive, the security posture is defense-in-depth, and the testing culture exists for the pure-functional core. The weaknesses are typical of mature solo projects: tech debt accumulates where the solo dev couldn't justify the refactor (duplicate PageContainer, dead Glass components, outdated database.types.ts), and infrastructure pieces that "work on Vercel free tier" are accepted as good-enough (in-memory rate limiters, no offline PWA).

### Technical debt level
**Moderate.** Catalogued items:
- 8 dead Glass/primitive components still in the barrel
- 1 dead 1355-line `UpcomingPage.tsx`
- 2 duplicate `PageContainer.tsx` files
- `accentHelpers.ts` duplicates `customAccent.ts`
- `database.types.ts` 9+ tables out of date
- 4 redundant `position` columns on `curated_universe_entries`
- ~60+ inline `style={{...}}` literals in feature components (MovieCard extracted these to module constants as the gold-standard pattern; the rest haven't followed)
- Vitest coverage config references non-existent `features/dashboard/*` files
- `_phase21.css` and `_phase22_sprint1.css` kept "as-is to avoid CSS modifications" — should be refactored into proper category files

### Maintainability score: **7.5 / 10**
+ Clean layering (core/lib/shared/features)
+ Extensive inline documentation
+ Idempotent migrations
+ TypeScript strict mode
+ Test coverage on pure-functional core (utilities, repositories, adapters)
− Dead code accumulating (8 Glass components, duplicate UpcomingPage)
− Outdated `database.types.ts` defeats compile-time schema checking
− Large files (`BackupService.ts` 1207 LOC, `useSettingsState.tsx` 1155 LOC, `AdminCollectionEditorPage.tsx` 1045 LOC, `CollectionDetailPage.tsx` 1027 LOC, `ShareSheet.tsx` 893 LOC, `SvgChart.tsx` 975 LOC, `useNotifications.ts` 609 LOC, `normalizeBackup.ts` 690 LOC)
− No test coverage for Details, Settings, Sync, Account, Trash, Admin, Notifications, Anime features
− Duplicate PageContainer / accentHelpers

### Performance score: **7.5 / 10**
+ Three-layer TMDB caching (in-memory → localStorage → Supabase)
+ Triple-dedup IMDb ratings (LRU + in-flight + IntersectionObserver)
+ Lazy-loaded heavy modals (DetailsModal, CollectionModal)
+ Dynamic import for html2canvas (~300 KB, only loaded on share-card generation)
+ Module-level style constants in MovieCard (avoids ~1000 object allocations per page mount)
+ `deferStream: true` for SEO-critical deep links
+ Per-route Suspense + ErrorBoundary
+ Route prefetch on hover/touch/focus
+ Vercel Speed Insights wired via `requestIdleCallback`
− 60+ inline `style={{...}}` literals create per-render object allocations across feature components
− 100+ `IntersectionObserver`s for IMDb ratings on Discover (one per card; should be a shared pool)
− No `<link rel="preload" as="image">` for above-the-fold LCP posters
− Render-blocking Google Fonts CSS request (could self-host via `@fontsource/*`)
− `html2canvas` is 300 KB and has known issues with modern CSS (`backdrop-filter`, `aspect-ratio`)
− Dead 1355-line `UpcomingPage.tsx` file (risks accidental import / inflation)

### UX score: **8 / 10**
+ Polished glass design system with consistent tokens
+ Mobile-first responsive layout (CSS-driven, no JS breakpoints)
+ Bottom navigation with route prefetch + glowing active indicator
+ Toast system with haptics + ARIA live regions
+ Cinematic Details modal with focus trap + body scroll lock + history sync (Back button closes modal)
+ Optimistic updates everywhere — UI feels instant
+ Smart Share (Web Share API with bottom-sheet fallback)
+ Reduced-motion + high-contrast + spoiler-blur preferences
+ Skip-to-main-content link missing (WCAG 2.4.1 failure)
+ AppHeader action buttons 36×36px (below WCAG 2.5.5 44×44)
+ No `[...404].tsx` — unknown URLs render blank
+ No "New version available" toast on SW `controllerchange`
+ PWA has no offline support — user sees blank page if network drops

### Code quality score: **8 / 10**
+ Strict TypeScript with zero `as any`
+ Consistent naming conventions
+ Per-domain repository organization
+ Barrel exports everywhere
+ Extensive inline documentation of bug-fix history
+ eslint + prettier configured
+ Coverage thresholds enforced
− ~80 `!` non-null assertions (mostly safe inside `<Show>` blocks but a TS narrowing gap)
− ~50 `as unknown` casts (mostly Supabase JSON column casts — necessary)
− 40+ silent `catch {}` blocks (mostly safe best-effort cleanup)
− 60+ inline `style={{...}}` literals (not the MovieCard pattern)

### Scalability score: **7 / 10**
+ Supabase scales horizontally (no server to manage)
+ Repository pattern decouples data access from feature logic
+ Provider plugin architecture for future metadata providers (MAL, Kitsu, JustWatch)
+ Feature modules are self-contained
+ CDN caching strategy is well-tuned for read-heavy traffic
− `stats.ts` computes all stats client-side after TMDB enrichment (vault table doesn't store genres/cast/director/runtime) — won't scale past ~10k items
− 5 separate `getVaultByStatus` queries per vault load (N+1 risk on huge vaults, mitigated by `limit: 1000`)
− `get_user_email` RPC called N times per admin users page (one per visible user via `Promise.all`)
− In-memory rate limiters don't scale across serverless instances
− No Supabase Realtime subscriptions (cross-device sync requires manual refresh)

### Security observations
- **Strong posture overall.** Strict CSP, HSTS preload, X-Frame-Options DENY, Permissions-Policy restricting camera/mic/geolocation/Topics, Referrer-Policy strict-origin-when-cross-origin.
- **RLS enforced on every table.** `protect_admin_columns()` trigger prevents privilege escalation.
- **Service-role key never reaches browser.** `createAdminClient()` throws on browser-side invocation.
- **All secret comparisons are constant-time** (PIN, JWT signature, CRON_SECRET).
- **Gaps**: in-memory rate limiters (effectively no-op on Vercel), no rate limit on admin mutation routes, no enum validation on admin inputs (Postgres rejects with leaky 500), no client-side file size validation for banner uploads (50 MB photo loads into memory before canvas compression), OMDB API key in browser bundle, sessions in localStorage (XSS-exfiltrable), `script-src 'unsafe-inline' 'unsafe-eval'` (could be tightened with nonces).

---

## 2. Complete Feature Inventory

CineLog V2 ships 16 distinct feature modules plus the Glass design system. Each is documented below with: purpose, user access path, internal mechanism, files involved, dependencies, status, limitations, and missing functionality.

### 2.1 Discover (`src/features/discover/*`)
- **Purpose**: Landing page (`/discover`) answering "what should I watch next?" — serendipitous daily-rotating feed with 8–16 curated rails.
- **User access**: `/discover` (default redirect from `/`). Works for guests and signed-in users.
- **Internal mechanism**: `DiscoverPage.tsx` (892 LOC) orchestrates 8 folds via per-section `<ErrorBoundary>` + `<Suspense>`. Global dedup chain — every row receives the prior row's `renderedIds` Set so a title never appears twice. `useDiscoverFeeds` fetches 7 TMDB feeds in parallel with 15-second safety timeout. `useSpotlight` (560 LOC) picks daily hero via strategy chain (because-you-watched → hidden-gems → genre-deep-dive → acclaimed-fallback → trending), 30-day no-repeat via per-uid `seenTitles` localStorage. `usePersonalizedDiscover` derives daily seed via FNV-1a hash of `{date}:{uid}:{candidateCount}`. `useAnimeCarousels` fetches 7 AniList carousels gated by `useAnimeSettings().enabled()` plus per-carousel flags. `useDiscoverTaste` derives `TasteProfile` (topGenres, topDirectors, activeFranchises, avgImdb, seedTitle, isColdStart) from vault.
- **Files**: `DiscoverPage.tsx`, `useDiscoverActions.ts`, hooks/ (`useDiscoverFeeds.ts`, `useDiscoverTaste.ts`, `useAnimeCarousels.ts`, `useSpotlight.ts`, `useDiscoverRow.ts`, `usePersonalizedDiscover.ts`), services/`animeCarousels.ts`, components/ (Spotlight, SpotlightSkeleton, GenreExplorer, GenreDropdown, OttDropdown, DiscoverRail, DiscoverSkeleton, DiscoverEmptyState, DiscoverSectionError, RelationshipPill [dead], ottProviderRegistry).
- **Dependencies**: TMDB (`/api/media/*`), AniList (`/api/anilist`), Supabase `discover` repository (personalized rows), `/api/homepage-config`, `/api/featured-content`, `/api/anime-settings`, `useUserLibrary().watchlist()` (for taste derivation), `useDiscoverRegion()`, `core/preferences` (streamingProviders, defaultDiscoverTab).
- **Status**: **Stable.** Heavily documented, defensive error handling, optimistic updates, race-condition fixes documented inline.
- **Known limitations**: `RelationshipPill.tsx` is orphaned (no other component imports it). `useDiscoverFeeds` returns `topRatedMovies`, `topRatedTv`, `newSeasons`, `nowPlaying` but DiscoverPage only consumes `upcoming` — dead signals still fetched on every region change. Anime carousels skip items lacking a TMDB mapping and don't auto-map on Discover (mapping only happens on the Details page).
- **Missing functionality**: No persisted "Not interested" / dismiss action on individual cards. No server-side personalization (all derived client-side from the vault).

### 2.2 Watchlist / Vault (`src/features/watchlist/*`)
- **Purpose**: User's personal library of tracked movies/TV (`/watchlist`). Adaptive status shelves, infinite scroll, advanced filtering, presets, CRUD on every user-owned field.
- **User access**: `/watchlist` (bottom-nav tab #2). Works for signed-in users; guests see AuthModal CTA.
- **Internal mechanism**: `WatchlistView.tsx` orchestrates view modes (grid/timeline), display limit, expanded shelves, filter drawer visibility, infinite-scroll handler. `useVault.tsx` (365 LOC) is a compatibility wrapper around `useUserLibrary()` (read) + `vaultAdapter` / `episodeProgressAdapter` / `useVaultPresets` (write) with optimistic update helper `runWriteOptimistic(itemId, op, successMsg, errorMsg, localUpdate?)`. `vaultReadAdapter` runs 5 parallel `getVaultByStatus` queries (one per status), merges, enriches TV items with episode progress in a single batch, sorts by `created_at desc`. `vaultAdapter` (466 LOC) is the WRITE bridge with media-type-aware date column mapping (`watched_on` for movies vs `started_at`/`completed_at` for TV; respects `vault_movie_no_series_cols` / `vault_tv_no_movie_cols` CHECK constraints). `vaultFilterUtils.ts` (658 LOC) provides pure filter/sort helpers with WeakMap-cached per-item search index (includes cast, director, genres, year, platforms). `useVaultSections` builds adaptive shelves: Continue Watching → Watching → Planned → Recently Completed → All Titles.
- **Files**: `WatchlistView.tsx`, `useVault.tsx`, `useVaultFiltering.ts`, `useVaultPresets.ts`, `useVaultSections.ts`, `vaultAdapter.ts`, `vaultReadAdapter.ts`, `vaultFilterUtils.ts`, `episodeProgressAdapter.ts`, `presetAdapter.ts`, `platformDisplayNames.ts`, components/ (QuickFilterTabs, WatchlistGrid, EmptyState, LoadingSkeleton, VaultShelf, VaultFilters, VaultFiltersContent, WatchlistHeader, VaultCard, FilterControls, WatchlistDialogs). Tests: 4 files.
- **Dependencies**: Supabase `vault` repository (`vault.read`, `vault.write`), `preset` repository, `episodeProgress` repository, `/api/tmdb-cache` (posters), `/api/media/ratings` (MDBList ratings).
- **Status**: **Stable.** Fully migrated from Firebase/Firestore (Phase 12.2 complete). Optimistic updates, race-safe. Multiple inline-documented bug fixes (toggleFavorite cast-to-optional-field hack, season_episodes cleanup, cascade-delete of collection_entries).
- **Known limitations**: `useVault()` is marked `@deprecated` but still used by `CollectionDetailPage`, `DetailsModal`, `AddToFolderSheet`, etc. — migration to `useUserLibrary` is incomplete. 5 separate `getVaultByStatus` queries — N+1 risk on huge vaults (mitigated by `pagination: { limit: 1000 }`). Auto-purge of soft-deleted items happens client-side on Trash page visit only. `enrichWithEpisodeProgress` (sync version) is a stub that returns `items` unchanged — only `enrichWithEpisodeProgressAsync` actually fetches.
- **Missing functionality**: No tag CRUD UI (tags only editable from Details modal). No "watch next" auto-suggestion within a shelf.

### 2.3 Collections (`src/features/collections/*` — plural)
- **Purpose**: Two halves — (1) user-created folders with CRUD + entries + drag-and-drop reorder, (2) subscribed curated universes from Supabase `curated_universes`. Plus smart collections (rule-based, client-side evaluation).
- **User access**: `/collections` (bottom-nav tab #3). `/collections/[id]` for detail view.
- **Internal mechanism**: `CollectionsPage.tsx` (522 LOC) orchestrates three sections: Your Collections (with Smart + New + Show Archived), Subscribed Universes, Smart Builder modal. `CollectionDetailPage.tsx` (1027 LOC) renders a single collection OR curated universe by slug — UniverseDashboard (hero+stats+pencil edit) + CollectionActionBar + CollectionSortFilter + EntryListRow (user) / TimelineEngine (universe) + AddTitlesModal + ReorderModal + FolderEditor. `collectionAdapter.ts` (395 LOC) handles CRUD with optimistic updates. `collectionEntryAdapter.ts` (361 LOC) does 3-step normalization: entries → vault rows → TMDB metadata batch. `curatedUniverseAdapter.ts` (465 LOC) bridges `curated_universes` + `curated_universe_entries` + `universe_phases`. `useCollections.tsx` (~960 LOC) is the context provider with temp-ID reconciliation (`makeTempId()` returns `temp-${Date.now()}-${++_tempIdCounter}`, downstream ops `await waitForRealId(collectionId)`).
- **Files**: `CollectionsPage.tsx`, `CollectionDetailPage.tsx`, adapters (`collectionAdapter.ts`, `collectionEntryAdapter.ts`, `curatedUniverseAdapter.ts`, `universePreferencesAdapter.ts`, `collectionMapper.ts`, `collectionErrors.ts`, `animeSmartCollections.ts`), utils/`evaluateSmartRules.ts`, hooks/ (`useCollections.tsx`, `useCollectionSearch.ts`, `useCollectionSort.ts`, `useCollectionFilter.ts`, `useCuratedUniverses.ts`, `useUniversePrefs.ts`, `collectionQueries.ts`), components/ (17 files, ~5600 LOC). Tests: 3 files.
- **Dependencies**: Supabase `collection` repository, `vault` repository, TMDB (metadata hydration), `@thisbeyond/solid-dnd` (ReorderModal).
- **Status**: **Stable.** Phase 8/9 complete with optimistic updates, Phase 8.1 production polish (explicit error types for unsupported features). Self-healing Favorites duplicate cleanup.
- **Known limitations**: **Smart collection rules are NOT persisted** — `collection_type='smart'` exists in DB but there is NO rules column. Smart rules exist only in-memory/client-side. Saving a smart collection loses its rules on page refresh. `isHidden` not in `user_universe_subscriptions` schema — `hiddenUniverses` memo always returns empty. `saveOverrides` method still exists on `useCollections` for compat but no UI invokes it (universe overrides removed in v4). Custom Entry creation removed in v4.
- **Missing functionality**: No collection sharing / public URLs (social features removed). No bulk entry operations (multi-select add/remove). No server-side smart rule persistence. No "smart collection re-evaluation" trigger when vault changes (must refresh page).

### 2.4 Single Collection Franchise Modal (`src/features/collection/*` — singular)
- **Purpose**: Cinematic franchise modal that opens when user taps a franchise trigger from the Details page. Shows the franchise's full timeline with vault-aware badges.
- **User access**: Triggered from Details modal via `useCollectionModal().openCollection(franchise, triggerTitleId)`. No URL.
- **Internal mechanism**: `CollectionModal.tsx` (190 LOC) opens via Portal, renders CollectionHero + CollectionStats + CollectionTimeline + CollectionSkeleton. Uses `createResource(franchise, fetchFranchiseTitles)`. `collectionFetcher.ts` (74 LOC) has hybrid strategy: TMDB `/collection/{id}` for movie franchises with `tmdbCollectionId` (Harry Potter, Mission Impossible); keyword-based `searchMulti` fallback for franchises without a TMDB collection (MCU, Star Wars, John Wick) — searches up to 5 keywords, dedupes by `{media_type}/{id}`, validates result names contain a franchise keyword. Sorts final list by release date ascending.
- **Files**: `CollectionModal.tsx`, `collectionFetcher.ts`, components/ (CollectionHero, CollectionStats, CollectionTimeline, CollectionSkeleton).
- **Dependencies**: TMDB `/collection/{id}` and `/search/multi`, `useUserLibrary().watchlist()` (for in-vault badges), `useCollectionModal()`.
- **Status**: **Stable.** Thin, focused. No tests.
- **Known limitations**: Keyword-search fallback can return false positives if a generic title matches a keyword (mitigated by `name.includes(k)` check). No pagination — fetches all parts of a TMDB collection at once. Only supports movie franchises via `tmdbCollectionId`; TV franchises rely entirely on keyword search.
- **Missing functionality**: No "Add all to vault" bulk action. No franchise-level progress tracking (only per-title). No way to navigate between franchises from within the modal.

### 2.5 Details Modal (`src/features/details/*`)
- **Purpose**: The cinematic title detail modal — the primary surface for viewing + editing a single title's full metadata + user-owned state. ~9.4k LOC — the largest feature.
- **User access**: Opened from any card via `useModalState().openTitle(baseItem, watchlist)`. Also via deep-link routes `/movie/[id]` and `/tv/[id]` (which set modal state).
- **Internal mechanism**: `useDetails.ts` (52 LOC) is `createResource` fetching TMDB details + OMDb ratings sequentially (TMDB first to get `imdb_id`, then OMDb with that id to prevent wrong-movie matches). `DetailsModal.tsx` (544 LOC) owns trailer state, folders sheet, remove-confirm sheet, share sheet, edit-mode toggle. Body-overflow lock + focus trap (Escape priority: remove-confirm → edit → trailer → modal). Smart Share via Web Share API with bottom-sheet fallback. `useDetailsActions.ts` (442 LOC) handles all user-action handlers including two-pass trailer lookup (`pickTrailer` → `fetchAnyVideoKey`). `useDetailsForm.ts` (307 LOC) owns inline edit-form state with movie re-watch normalization (rewatchCount string, rewatchDates array length = count+1) and series per-season re-watch (seasonDates, seasonRewatchCount, seasonRewatchDates). `useDetailsProgress.ts` (278 LOC) handles status cycle (Planned → Watching → Completed → Planned), episode change (auto-upgrades Planned → Watching), episode unmark (delete-forward + rewind). `useAnimeEnrichment.ts` (177 LOC) is self-gating AniList fetcher — detects anime via heuristics, resolves AniList id (mapping table → autoMap fallback), fetches Media details (characters, studios, relations, airing schedule, OP/ED themes, recommendations). `useMdbListRatings.ts` (107 LOC) fetches IMDb/RT/Metacritic ratings + vote counts from `/api/media/ratings` (24h browser cache + 7d SWR). `ShareSheet.tsx` (893 LOC) is a premium bottom sheet with 6 share options: Share, Copy Link, Copy Rich Text, Save Poster, Generate Share Card (via `html2canvas` lazy-loaded), QR Code (via `qrcode`).
- **Files**: `useDetails.ts`, `useAnimeEnrichment.ts`, `useMdbListRatings.ts`, `animeRecommendations.ts`, `ShareSheet.tsx`, DetailsModal/ (DetailsModal.tsx, DetailsHero, DetailsHeader, DetailsActions, DetailsOverview, DetailsRatings, DetailsMetadata, DetailsSeasons, DetailsCast, DetailsRecommendations, AnimeCharacters, AnimeSections, AnimeRecommendations, useDetailsActions, useDetailsForm, useDetailsProgress, types, index), components/ (MetadataGrid, DetailsSkeleton, ActionDock, RatingPanel, PersonModal, SimilarTitles, YourActivityCard, AddToFolderSheet, UserCollectionInfo, DetailsError, WhereToWatch, DetailSection, CinematicHero, SeasonNavigator, DetailsEditForm, HeroContentCluster, EpisodeCard, ConfirmRemoveSheet).
- **Dependencies**: TMDB `/movie/{id}` or `/tv/{id}` (with `append_to_response=credits,videos,similar,recommendations,watch/providers,external_ids`), OMDb (using imdb_id), MDBList (`/api/media/ratings`), AniList (`/api/anilist`), Supabase `vault` + `episodeProgress` + `collection_entries` repositories.
- **Status**: **Stable.** Most complex feature (9.4k LOC). Extensive inline documentation of bug fixes: trailer two-pass lookup, focus trap, body-overflow restore, ownership boundary, bidirectional episode toggle (delete-forward + rewind), Smart Share with native fallback.
- **Known limitations**: OMDb fetch is sequential after TMDB (waits for `imdb_id`) — could be parallel with a deferred OMDb call. `html2canvas` is ~300KB, lazy-loaded only on share-card generation. AniList enrichment failures are silent — user sees standard TMDB-only Details.
- **Missing functionality**: No "mark as favorite" inline action (must open Add to Folder sheet). No episode-level rating (only series-level). No watch-progress scrubber for streaming. No "go back" history within the modal (forward-only navigation via recommendations).

### 2.6 Profile (`src/features/profile/*`)
- **Purpose**: Personal dashboard at `/profile`. Banner + header + stats row + tabs (Favorites / Lists / Achievements) + quick actions. Includes sub-pages: Achievements, History, Upcoming (legacy alias).
- **User access**: `/profile` (bottom-nav tab #4). `/profile/achievements`, `/profile/history`, `/profile/upcoming`, `/profile/stats`, `/profile/trash` are sub-routes.
- **Internal mechanism**: `ProfilePage.tsx` (289 LOC) orchestrates ProfileBanner + ProfileHeader + ProfileStatsRow + ProfileTabs + tab content + QuickActionRow + EditProfileModal. `useProfileData.ts` (238 LOC) loads profile row + enriches favorites (movie/series/director) with TMDB metadata in parallel. `useStats.ts` (283 LOC) derives `StatsData` from watchlist (totals, runtime, movie/TV ratio, top genres, decades, top directors, heatmap, monthly counts, weekday/weekend split, avg rating, topRated, mostRewatched). `storyGenerator.ts` (581 LOC) is a pure deterministic narrative engine — generates "Your Story" reflection, Identity Chips, Favorite Reasons, Activity Reactions, One-Word Reactions. Priority order: genre shift → director obsession → decade affinity → comfort pattern → weekend ritual → volume milestone → default. `AchievementsPage.tsx` (404 LOC) — museum-card achievements (NOT gamification). ~15 achievement defs (`first-watch`, `ten-titles`, `fifty-titles`, `centurion`, genre-specific, etc.). `HistoryPage.tsx` (476 LOC) — chronological diary grouped by Today/Yesterday/This Week/Last Week/This Month/This Year/2024/2023...
- **Files**: `ProfilePage.tsx`, `AchievementsPage.tsx`, `HistoryPage.tsx`, `UpcomingPage.tsx` (1355 LOC — **DEAD, duplicate of `features/upcoming/UpcomingPage.tsx`**), `useProfileData.ts`, `useStats.ts`, `hooks/useProfileTabs.ts`, `utils/storyGenerator.ts`, components/ (UserListsPreview, ProfileTabs, AchievementsPreview, ProfileHeader, FavoritesGrid, BannerEditor, EditProfileModal, ProfileBanner, QuickActionRow, TasteCard, ProfileStatsRow). Tests: 1 file.
- **Dependencies**: Supabase `profiles` + `user_preferences`, TMDB (favorites enrichment), `useUserLibrary().watchlist()` (for stats), `useCollections.userCollections()` (for FavoritesGrid / UserListsPreview).
- **Status**: **Stable.** V3 redesign complete. Social features removed (personal-only). All sub-pages functional.
- **Known limitations**: `AchievementsPreview` duplicates the BADGES array from `AchievementsPage` (acknowledged inline as tech debt). `ProfileBanner.onChooseBanner` prop is dead (V3.1 cleanup note in file). `UpcomingPage.tsx` here is 1355 LOC — duplicate of `src/features/upcoming/UpcomingPage.tsx` (659 LOC). Likely the profile one is legacy and the dedicated `features/upcoming/` is the canonical version.
- **Missing functionality**: No public profile URL (social removed). No follower/following counts. No profile export.

### 2.7 Stats (`src/features/stats/*`)
- **Purpose**: Redesigned Statistics dashboard at `/profile/stats`. Chart-driven cinematic personality analysis.
- **User access**: `/profile/stats` (via QuickActionRow on profile page, or DesktopSidebar).
- **Internal mechanism**: `StatisticsPage.tsx` (284 LOC) — header + StatsOverview (4 cards) + StatsTabs (Activity/Genres/Ratings/Decades/People/Trends) + tab content + HighestRatedCarousel + action row (Share / Export CSV). `useStatsData.ts` (87 LOC) derives `AllStats` from `useUserLibrary().watchlist()` via pure calculators in `~/lib/supabase/repositories/stats` using `createMemo` (no `createResource`) — re-derives reactively when watchlist changes. `SvgChart.tsx` (975 LOC) is custom SVG chart primitives (bars, lines, pie, heatmap). `StatsShareModal.tsx` (342 LOC) shares stats as an image via `html2canvas`.
- **Files**: `StatisticsPage.tsx`, hooks/`useStatsData.ts`, components/ (SvgChart, DecadeChart, StatsShareModal, ChartContainer, MovieSeriesPie, PeopleList, RatingsHistogram, GenreChart, HighestRatedCarousel, StatsTabs, StatsOverview, TrendsChart, ActivityChart).
- **Dependencies**: `useUserLibrary().watchlist()`, `~/lib/supabase/repositories/stats` (pure functional calculators — no DB I/O), `html2canvas` (lazy-loaded for share).
- **Status**: **Stable.** Clean architecture, pure memos, defensive guards.
- **Known limitations**: All stats computed in-memory on every watchlist change — O(n) per chart; fine for <10k items. `SvgChart.tsx` is 975 LOC — candidate for splitting. No date-range filter (all-time stats only).
- **Missing functionality**: No year-over-year comparison. No stats export as image (only via StatsShareModal). No per-genre deep-dive (clicking a genre bar doesn't filter the watchlist).

### 2.8 Upcoming (`src/features/upcoming/*`)
- **Purpose**: Redesigned Upcoming hub at `/profile/upcoming`. Calendar + reminders + filters.
- **User access**: `/profile/upcoming` (via QuickActionRow on profile page, or DesktopSidebar).
- **Internal mechanism**: `UpcomingPage.tsx` (659 LOC) — header + filter bar (DateRangePicker, Sort, Filter, ViewToggle) + list/calendar view. Region reactive to `useProfileData().profile.country` (fallback "US"). Country-filtered movies (`with_release_country` + client-side date filter); TV uses two endpoints (`/discover/tv` with `air_date.gte/lte` + `/tv/airing_today`). `useUpcomingData.ts` (224 LOC) — `createResource` over `UpcomingDataFilters`. Groups results into Today/Tomorrow/This Week/Later buckets + `calendarBuckets` for calendar view. `useNotifications.ts` (609 LOC) owns notification feed + reminder state + browser-notification side effect. On mount: loads notifications + reminders, fires due reminders as browser Notifications (with permission + quiet-hours check), marks `notification_sent=true`. Exposes scheduleReminder / cancelReminder / markRead / markAllRead / clearRead. Includes `applyLeadTime` helper.
- **Files**: `UpcomingPage.tsx`, hooks/ (useNotifications, useUpcomingData), components/ (TrailerModal, CalendarView, ViewToggle, NotificationCenter, FilterSheet, UpcomingCard, CountdownBadge, SortDropdown, HeaderNotificationBell, DateRangePicker). Tests: 2 files.
- **Dependencies**: TMDB `/discover/movie` (with_release_country) + `/discover/tv` (air_date.gte/lte) + `/tv/airing_today`, Supabase `notifications` + `user_reminders` repositories.
- **Status**: **Stable.** Phase 4 Task 25 (language reactivity) complete. Comprehensive notification system.
- **Known limitations**: TV upcoming uses two endpoints + client-side merge — can be slow on dense date windows. `applyLeadTime` loses sub-day precision (release_date is DATE not TIMESTAMPTZ). No email notifications (only browser + in-app) — `renderEmailTemplate` is imported but not used for sending.
- **Missing functionality**: No push notification integration (that's in `features/notifications/`). No "notify all" bulk action. No snooze/dismiss for individual notifications.

### 2.9 Search (`src/features/search/*`)
- **Purpose**: Global search overlay — TMDB multi-search + AniList fallback + genre browse mode.
- **User access**: Triggered from AppHeader search icon (mobile overlay or desktop inline). Renders as `SearchOverlay` in AppShell. Not a dedicated route (was merged into Discover).
- **Internal mechanism**: `SearchOverlay.tsx` (60 LOC) reads from `useGlobalSearch()` context. `useSearch.ts` (292 LOC) has two modes: (1) text search — 250ms debounced `searchMulti`, results grouped into Movies/Series/People; (2) genre browse — `discoverMovies` + `discoverTv` by genre ID, paginated, interleaved. Anime fallback: if TMDB returns 0 results AND `looksLikeAnimeQuery(query)`, fires AniList `searchAnime` → maps to TMDB via `getTmdbId` (no auto-map during search). Loads trending (12 items) on mount for cold-start state. `vaultKeys` memo via `buildVaultKeySet` for O(1) in-vault checks. `searchStorage.ts` (37 LOC) — localStorage helpers for recent searches (max 8, deduped, MRU first, SSR-safe). `genreBrowseUtils.ts` (97 LOC) — `fetchGenrePage` fetches movies + TV in parallel, interleaves, dedupes by `{media_type}/{id}`. `animeSearchFallback.ts` (116 LOC) — `looksLikeAnimeQuery` heuristic (Japanese chars OR anime keywords).
- **Files**: `SearchOverlay.tsx`, `SearchResults.tsx`, `SearchResultRow.tsx`, `SearchEmptyState.tsx`, `SearchLoading.tsx`, `useSearch.ts`, `searchStorage.ts`, `searchConstants.ts`, `genreBrowseUtils.ts`, `animeSearchFallback.ts`. Tests: 2 files.
- **Dependencies**: TMDB `/search/multi`, `/discover/movie`, `/discover/tv`, AniList `searchAnime`, `/api/anime-mappings`, `useUserLibrary().watchlist()` (for in-vault checks), `useGlobalSearch()` context.
- **Status**: **Stable.** Phase 5 anime fallback complete. Clean separation of text search vs genre browse.
- **Known limitations**: AniList fallback only fires when TMDB returns 0 results — doesn't merge with TMDB results. No people search results UI (people are fetched but not rendered separately). No search history beyond 8 recent searches.
- **Missing functionality**: No saved searches / collections from search. No "search inside a collection" (that's in `useCollectionSearch`). No fuzzy matching / typo correction.

### 2.10 Settings (`src/features/settings/*`)
- **Purpose**: Unified single-page settings hub at `/settings`. 6 sections + Danger Zone: Account, Appearance, Content & Language, Notifications, Calendar, Data & Sync.
- **User access**: `/settings` and 10 sub-routes (`/settings/about`, `/settings/account`, `/settings/appearance`, `/settings/calendar`, `/settings/content-discover`, `/settings/developer` [redirect], `/settings/notifications`, `/settings/privacy`, `/settings/profile-preferences`, `/settings/sync`).
- **Internal mechanism**: `SettingsPage.tsx` (253 LOC) — thin composer: renders page shell (header, search bar, sidebar nav) + delegates section bodies to section components + renders account sheets at root. Desktop = two-column (sticky sidebar + scrollable sections); mobile = single column with accordions. Search filters sections by title/desc/keywords with `<mark>` highlighting. `useSettingsState.tsx` (1155 LOC) owns ALL signals, handlers, memos, UI helpers. Returns a `SettingsState` bag passed to each section. Handles: account (profile, OAuth, sheets), appearance (theme, accent, dynamic color extraction), content (providers, language, region), notifications (push permission, category toggles). `sharedControls.tsx` (214 LOC) — `Segmented` (radio group), `ControlRow`, `ToggleRow`, `PickerRow`. `accentHelpers.ts` (119 LOC) — local safety-net duplicates of `~/core/preferences/customAccent`.
- **Files**: `SettingsPage.tsx`, hooks/`useSettingsState.tsx`, `sharedControls.tsx`, `accentHelpers.ts`, sections/ (AccountSection, AppearanceSection, ContentDiscoverSection, NotificationSection, CalendarSection, SyncSection, DangerZoneSection, meta, types, index), components/ (TwoFactorSetup, ThemeCard, AccentSwatch, LoginHistoryList, SessionList).
- **Dependencies**: Supabase `profiles` + `user_preferences` (via `useProfile`), TMDB `/watch/providers/movie` + `/watch/providers/tv` (for streaming provider logos), Supabase Auth MFA API, Supabase `login_history`, all 18 `core/preferences/*` signals.
- **Status**: **Stable.** Section-refactor complete. State bag pattern keeps sections as pure JSX extractors.
- **Known limitations**: `accentHelpers.ts` duplicates `~/core/preferences/customAccent` verbatim — acknowledged tech debt. `useSettingsState` is 1155 LOC — large but well-organized. No "reset to defaults" per-section.
- **Missing functionality**: No settings import/export. No per-device settings sync (settings are per-user in Supabase). No settings preview (changes apply immediately).

### 2.11 Sync (`src/features/sync/*`)
- **Purpose**: Backup, restore, import, export, and reset for the user's library.
- **User access**: `/settings/sync` (Settings → Data & Sync section).
- **Internal mechanism**: `BackupService.ts` (1207 LOC) — single entry point for backup creation, export, parsing, restore. Supports V2 wrapped (`{version, library: {watchlist, collections, presets, episodeProgress}}`) and V1 flat array (`[...items]`). Includes `parseBackupFile`, `previewBackup`, `restoreBackup` (with progress callbacks + cancel). `normalizeBackup.ts` (690 LOC) — Universal Normalization Layer. Pipeline: `detectBackupFormat` → `extractRawItems` → `normalizeWatchlistItem` (mapLegacyFields → normalizeStatus → normalizeRating → normalizeDates → normalizeProgress → repairMissingFields) → `validateItem`. Supports 9 wrapper keys (watchlist, library, vault, data, items, movies, series, titles, entries, backup). `csvImport.ts` (448 LOC) — parses Letterboxd / Trakt / IMDb / TV Time / generic CSV. Auto-detects source from header row. `csvExport.ts` (221 LOC) — generates CSV compatible with Letterboxd / Trakt / IMDb / generic. RFC 4180 escaping. `resetLibraryService.ts` (413 LOC) — best-effort delete with error classification. Core tables must succeed; optional tables skipped if missing. Dependency-safe delete order (children before parents). `useSyncHistory.ts` (139 LOC) — derives timeline from watchlist's `addedAt` / `updatedAt` / `watchDate`.
- **Files**: backup/ (BackupService.ts, normalizeBackup.ts), import/ (ImportSource.ts, csvImport.ts, sources/jsonImportSource.ts, sources/JsonImportWizard.tsx), export/csvExport.ts, reset/resetLibraryService.ts, hooks/useSyncHistory.ts, components/ (CloudStatusCard, SyncCadenceCard, DevicesCard, StorageStats, BackupCards, CsvImportCard, CsvExportCard, ImportHub, SyncHistoryTimeline, PrivacyCard, DangerZoneCard, ResetConfirmSheet).
- **Dependencies**: Supabase (vault, collections, collection_entries, user_presets, episode_progress, activity_log, import_export_jobs, user_universe_subscriptions), `useUserLibrary().refresh()`, browser Blob + `<a download>`.
- **Status**: **Stable.** Phase 1 audit fixes applied (collections + presets + episodeProgress now included in backups). Universal Normalization Layer handles any past/future format.
- **Known limitations**: No real-time cloud sync (SyncCadenceCard is likely a stub or future feature). `useSyncHistory` derives from watchlist timestamps, not a real audit log. Reset is irreversible (no undo). No incremental backup (full snapshot each time).
- **Missing functionality**: No automatic scheduled backups. No cross-device sync conflict resolution. No import from Letterboxd/Trakt/IMDb CSV via the ImportSource plugin (only CSV + JSON wired up; the plugin contract supports more but no other sources registered).

### 2.12 Account (`src/features/account/*`)
- **Purpose**: Extended auth/account actions + destructive-account sheets (email/password change, OAuth link, sign-out, deactivate, delete).
- **User access**: Triggered from Settings → Account section and Settings → Danger Zone.
- **Internal mechanism**: `accountActions.ts` (400 LOC) wraps Supabase Auth calls: `updateEmail`, `changePassword`, `getUserIdentities`, `linkProvider`, `unlinkProvider`, `sendPasswordResetEmail`, `signOutGlobal`, `linkEmailPassword`. All show toast on success/failure. `friendlyError` maps common Supabase auth errors to user-facing copy. Each sheet (`UpdateEmailSheet`, `ChangePasswordSheet`, `LinkEmailPasswordSheet`, `ConfirmSignOutSheet`, `DeactivateAccountSheet`) owns its form state + busy/done signals.
- **Files**: `accountActions.ts`, components/ (ConfirmSignOutSheet, DeactivateAccountSheet, ChangePasswordSheet, UpdateEmailSheet, AccountSheet, LinkEmailPasswordSheet).
- **Dependencies**: Supabase Auth API (`updateUser`, `linkIdentity`, `unlinkIdentity`, `getUserIdentities`, `signInWithPassword`, `signOut`), `useToast`, `useProfile`, `/api/account/delete` server route.
- **Status**: **Stable.** Comprehensive security flow with friendly error mapping.
- **Known limitations**: `ChangePasswordSheet` asks for current password in UI even though Supabase ignores it (`secure_password_change = false`) — extra friction for users. `DeactivateAccountSheet` deactivate mode doesn't show a "cancel deletion" UI within the sheet — user must sign in again to cancel. No 2FA challenge for destructive actions (only for sign-in).
- **Missing functionality**: No session listing (Supabase doesn't expose client-side). No login notification email. No account recovery flow beyond password reset.

### 2.13 Trash (`src/features/trash/*`)
- **Purpose**: Recycle bin for soft-deleted vault items + collections. 30-day retention with restore / hard-delete / clear-all.
- **User access**: `/profile/trash`.
- **Internal mechanism**: `TrashPage.tsx` (386 LOC) — Glass design system. Groups items by deletion date bucket (Today / Yesterday / This Week / Older). ConfirmDialog for every destructive action. `trashAdapter.ts` (353 LOC) — `fetchTrashedVaultItems` (with TMDB metadata enrichment), `fetchTrashedCollections`, `hardDeleteVaultItem`, `hardDeleteCollection`, `clearAllTrash`, `autoPurgeExpired` (deletes items with `deleted_at > 30d`). `useTrashData.ts` (355 LOC) — owns fetch state + imperative mutators (restoreVaultItem, restoreCollection, restoreAll, deleteVaultItemPermanently, deleteCollectionPermanently, clearAll). Optimistic-on-success. Auto-purge on first load.
- **Files**: `TrashPage.tsx`, `trashAdapter.ts`, `hooks/useTrashData.ts`, components/ (TrashItemCard, ConfirmDialog, TrashHeader, TrashEmptyState, TrashActionBar).
- **Dependencies**: Supabase `vault` (where `deleted_at NOT NULL`) + `collections` (where `deleted_at NOT NULL`), TMDB batch metadata fetch, `useUserLibrary().refresh()`.
- **Status**: **Stable.** Clean v3 redesign with Glass design system.
- **Known limitations**: Auto-purge is client-side only — items linger past 30 days if user never visits Trash. No "expires in X days" countdown on cards (data is computed but not always shown). No bulk select (only Restore All / Clear Trash).
- **Missing functionality**: No server-side cron for auto-purge. No "restore to original collection" for trashed collections (restores as a new collection). No trash for episodes/progress (only vault items + collections).

### 2.14 Admin (`src/features/admin/*`)
- **Purpose**: Admin panel at `/admin/*` — separate layout, session-gated, manages users, feature flags, content, homepage, collections, announcements, TMDB cache, analytics, logs, maintenance, anime, settings, developer tools.
- **User access**: `/admin/login` (email + password + 6-digit PIN). All other `/admin/*` routes require valid admin cookie.
- **Internal mechanism**: `AdminShell.tsx` (544 LOC) — separate layout (no consumer AppShell). Sidebar (desktop 240px / mobile hamburger overlay) + top bar with breadcrumb + logout. Session gate redirects to `/admin/login` if not authenticated. `AdminDashboard.tsx` (387 LOC) — 8 metric cards (Total Users, Active 24h/7d/30d, Watchlist Entries, Movies vs TV, TMDB Cache, Server Status, API Requests, Database Size). Polls `/api/admin/stats` every 60s. `useAdminAuth.ts` (278 LOC) — module-level signals shared across all admin components. `login(email, password, pin)` → POST `/api/admin/auth`. `logout()` → DELETE. Cookie-based session. SSR-safe. 15 admin pages ranging 286–1045 LOC each. `collectionEditor/` (TmdbSearchModal, UniversePhasesPanel, EntryRow, types) — for editing curated universes.
- **Files**: `AdminShell.tsx`, `AdminDashboard.tsx`, 14 AdminXxxPage.tsx files (Users, Content, Announcements, CollectionEditor, Collections, TmdbCache, Analytics, Logs, Maintenance, Settings, Homepage, Anime, FeatureFlags, Developer), `collectionEditor/` (TmdbSearchModal, UniversePhasesPanel, EntryRow, types), `hooks/useAdminAuth.ts`.
- **Dependencies**: All `/api/admin/*` routes, `useAdminAuth`, Supabase service-role client (server-side only).
- **Status**: **Stable.** Comprehensive admin panel. Phase 1 + Phase 2 nav items complete.
- **Known limitations**: Admin pages are large (often 500-1000 LOC each) — could be split into smaller components. No admin 2FA (only email + password + PIN). Polling every 60s for dashboard metrics — could use WebSockets for real-time. No admin role differentiation (single admin role). No admin audit trail UI (data is in `admin_actions` table but not surfaced as a UI).
- **Missing functionality**: No admin bulk user operations (only per-user).

### 2.15 Notifications (`src/features/notifications/*`)
- **Purpose**: Web Push subscription management (subscribe/unsubscribe/test) for browser push notifications.
- **User access**: Settings → Notifications → Push toggle.
- **Internal mechanism**: `usePushSubscription.ts` (536 LOC) — detects browser support, fetches VAPID public key from `app_config`, checks existing subscription, `subscribe()` requests Notification.permission + registers push subscription + persists to `push_subscriptions` table, `unsubscribe()` cleans up both sides, `sendTest()` fires test notification. Only initializes on mount if `isSignedIn()` is true (Performance Sprint 1, Task 7). `PushToggle.tsx` (191 LOC) — self-contained UI block.
- **Files**: `hooks/usePushSubscription.ts`, `components/PushToggle.tsx`.
- **Dependencies**: Supabase `push_subscriptions` table + `app_config.vapid_public_key`, browser PushManager + service worker, `/api/push/send` server route.
- **Status**: **Stable.** Complete Web Push lifecycle. Defensive error handling (returns boolean, never throws).
- **Known limitations**: VAPID key fetched from `app_config` — if admin hasn't set it, push won't work. No multi-device management UI (each device manages its own subscription). `push_subscriptions` table has `expires_at` column but no auto-cleanup of expired subscriptions. No `pushsubscriptionchange` handler in SW — browser subscription rotation silently breaks push delivery.
- **Missing functionality**: No push notification content customization (all pushes are server-defined). No quiet hours enforcement on push (handled client-side in `useNotifications` but not server-side). No push categories (all-or-nothing subscription).

### 2.16 Anime (`src/features/anime/*`)
- **Purpose**: Single hook that fetches admin-controlled anime integration settings from `/api/anime-settings` (public endpoint).
- **User access**: No direct user flow — consumed by other features. Admin manages settings via `AdminAnimePage`.
- **Internal mechanism**: `useAnimeSettings.ts` (196 LOC) — fetches `AnimeSettings` (19 fields: master `enabled` + 7 carousel toggles + 4 detail-section toggles + auto_mapping + 5 cache/timeout/rate-limit knobs). 5-minute in-memory cache shared across all callers in the tab. Falls back to `DEFAULT_ANIME_SETTINGS` (all true, 10s timeout, standard TTLs) on fetch failure. `normalize()` maps snake_case server shape to camelCase hook shape. `refresh()` clears cache + refetches.
- **Files**: `useAnimeSettings.ts`.
- **Dependencies**: `/api/anime-settings` (public), admin-configured `app_config.anime_settings`.
- **Status**: **Stable.** Simple, defensive hook with caching + fallback.
- **Known limitations**: 5-minute cache means admin changes take up to 5 minutes to propagate to existing sessions. No reactive update (admin changes don't trigger refetch in open tabs). `DEFAULT_ANIME_SETTINGS` has everything enabled — if the endpoint is down, anime features stay on (could be undesirable if AniList is also down).
- **Missing functionality**: No per-user anime settings (all admin-controlled). No anime-specific cache invalidation.

### 2.17 Additional Cross-Cutting Features

| Feature | Description | Status |
|---|---|---|
| **Continue Watching** | Adaptive shelf in Watchlist (vault items with status=watching + recent `last_activity_at`); also surfaces as Discover section "continue_universes" | Stable |
| **Shuffle / Random Picker** | "Surprise Me" section on Discover; Spotlight daily-shuffle with 30-day no-repeat; feature flag `random_picker` (default true) | Stable |
| **TMDB Search** | `/search/multi` via `/api/media/*` proxy; powers global search, AddTitlesModal, TmdbSearchModal in admin | Stable |
| **Filters** | Advanced multi-dimensional filtering in Watchlist (status, genre, platform, tag, year, rating, runtime) + Collections (status, search) + Discover (region, genre, OTT) | Stable |
| **Sort** | Watchlist: added_date, title, rating, watch_date, year, runtime; Collections: manual, release, added, title, rating; Upcoming: date, rating, popularity, title | Stable |
| **Relationship System** | Franchise detection via `shared/data/franchises.ts` (curated keywords) + TMDB `/collection/{id}` + `searchMulti` fallback; CollectionModal orchestrates | Stable |
| **Progress Tracking** | `episode_progress` table per (vault_id, season, episode); `useDetailsProgress` bidirectional toggle (delete-forward + rewind); `progress_minutes` field on vault | Stable |
| **Streaming** | Where-to-watch provider chips in Details; OTT rails in Discover; `ottProviderRegistry.ts` canonical TMDB ID → provider-key map | Stable |
| **Share** | `ShareSheet.tsx` 6 options: native Web Share API, copy link, copy rich text, save poster, generate share card (html2canvas), QR code; deep-link routes `/movie/[id]` + `/tv/[id]` with OG meta | Stable |
| **Vault** | See §2.2 Watchlist | Stable |
| **Deep Links** | `/movie/:id` and `/tv/:id` with `deferStream: true` SSR + per-route OG/Twitter meta for chat-app scrapers (WhatsApp, iMessage, Telegram, Slack) | Stable |
| **Notifications** | Browser push (`usePushSubscription`), in-app feed (`useNotifications`), scheduled reminders, quiet hours, weekly recap email (cron) | Stable |
| **Offline Support** | **None** — service worker has no `fetch` handler, no Cache API. App is non-functional offline. | Missing |
| **Analytics** | Vercel Speed Insights (RUM); admin-side materialized views (`mv_admin_*`); `activity_log` table; `login_history` | Stable |
| **Backup / Export** | JSON backup (full snapshot), CSV export (Letterboxd/Trakt/IMDb compatible); CSV import (multi-source auto-detect) | Stable |
| **Achievements** | Museum-card UI on `/profile/achievements`; ~15 achievement defs (first-watch, ten-titles, fifty-titles, centurion, genre-specific) | Stable |
| **2FA / MFA** | TOTP via Supabase MFA; `TwoFactorSetup.tsx` with QR code enrollment; `sessions.ts` for factor management | Stable |
| **Identity Linking** | `linkProvider`/`unlinkProvider` (Google + email); `linkEmailPassword` for OAuth-only users adding password | Stable |
| **Account Deletion** | Soft (7-day grace via `scheduled_deletion_at`) + Hard (via `/api/account/delete` server route with email confirmation + rate limit) | Stable (soft); Hard-delete cron NOT wired |
| **Reduced Motion / High Contrast** | User preferences + OS-level `prefers-reduced-motion` listener; high-contrast mode with WCAG-tuned text colors | Stable |

---

## 3. Route Inventory

SolidStart file-routes. All live under `src/routes/`. Total: 44 consumer routes + 16 admin routes + 1 auth callback = 61 routes. Plus 31 API endpoints (15 public + 16 admin).

### 3.1 Top-level consumer routes

| Path | File | Lazy? | Protected? | Purpose |
|---|---|---|---|---|
| `/` | `routes/index.tsx` | No (Navigate) | None | Redirects to `/discover` |
| `/discover` | `routes/discover.tsx` | ✅ lazy | None | Landing page — daily-rotating cinematic feed |
| `/search` | `routes/search.tsx` | No (Navigate) | None | Redirects to `/discover` (search was merged) |
| `/watchlist` | `routes/watchlist.tsx` | ✅ lazy | Feature-level | User's vault |
| `/movie/[id]` | `routes/movie/[id].tsx` | No (modal via AppShell) | None | Deep-link with OG meta; opens Details modal |
| `/tv/[id]` | `routes/tv/[id].tsx` | No (modal via AppShell) | None | Deep-link with OG meta; opens Details modal |
| `/details/movie/[id]` | `routes/details/movie/[id].tsx` | No (Navigate) | None | Backwards-compat redirect → `/movie/:id` |
| `/details/tv/[id]` | `routes/details/tv/[id].tsx` | No (Navigate) | None | Backwards-compat redirect → `/tv/:id` |
| `/collections` | `routes/collections/index.tsx` | ✅ lazy | Feature-level | Hub page — user collections + curated universes |
| `/collections/[id]` | `routes/collections/[id]/index.tsx` | ✅ lazy | Feature-level | Collection detail (timeline / release / story / franchise) |
| `/auth/callback` | `routes/auth/callback.tsx` | No (inline) | None | PKCE exchange for OAuth/email confirmation |

### 3.2 Profile routes (`/profile/*`)

| Path | File | Lazy? | Purpose |
|---|---|---|---|
| `/profile` | `profile/index.tsx` | ✅ lazy | Profile dashboard |
| `/profile/achievements` | `profile/achievements.tsx` | ✅ lazy | Achievement badges grid |
| `/profile/history` | `profile/history.tsx` | ✅ lazy | Activity diary |
| `/profile/stats` | `profile/stats.tsx` | ✅ lazy | Statistics dashboard |
| `/profile/trash` | `profile/trash.tsx` | ✅ lazy | Soft-deleted items recycle bin |
| `/profile/upcoming` | `profile/upcoming.tsx` | ✅ lazy | Upcoming releases + reminders |

None are protected at the route level — feature modules handle guest state with `<Show when={isSignedIn()}>` + AuthModal CTA.

### 3.3 Settings routes (`/settings/*`)

| Path | File | Lazy? | Purpose |
|---|---|---|---|
| `/settings` | `settings/index.tsx` | ✅ lazy | Unified settings hub |
| `/settings/about` | `settings/about.tsx` | No (inline) | Version info, changelog, legal, FAQ |
| `/settings/account` | `settings/account.tsx` | No (inline, 1160 LOC) | Account details, security, OAuth, 2FA, sessions |
| `/settings/appearance` | `settings/appearance.tsx` | No (inline, 547 LOC) | Theme, accent, density, font, poster quality, spoilers |
| `/settings/calendar` | `settings/calendar.tsx` | No (inline, 142 LOC) | First day, time format, timezone, default view |
| `/settings/content-discover` | `settings/content-discover.tsx` | No (inline, 330 LOC) | Adult filter, content rating cap, streaming providers, discover tab, rating scale |
| `/settings/developer` | `settings/developer.tsx` | No (Navigate, 10 LOC) | Redirect to `/settings/about` (file comment says moved to `/admin/developer` — misleading) |
| `/settings/notifications` | `settings/notifications.tsx` | No (inline, 328 LOC) | Push, categories, quiet hours, lead time |
| `/settings/privacy` | `settings/privacy.tsx` | No (inline, 285 LOC) | Visibility, screenshot blur, clear search history |
| `/settings/profile-preferences` | `settings/profile-preferences.tsx` | No (inline, 356 LOC) | Name, country, language, fallback language, default vault status |
| `/settings/sync` | `settings/sync.tsx` | No (inline, 149 LOC) | Cloud sync, import, export, devices, danger zone |

### 3.4 Admin routes (`/admin/*`)

All admin routes (except `login.tsx` and `collections/[id]/index.tsx`) follow the uniform pattern: `<AdminShell><Title>{...}</Title><LazyPage /></AdminShell>`.

| Path | File | Lazy? | Notes |
|---|---|---|---|
| `/admin` | `admin/index.tsx` | ✅ lazy | Dashboard — 8 metric cards, 60s polling |
| `/admin/login` | `admin/login.tsx` | No (inline, 684 LOC) | Three-layer auth: CineLog session + is_admin + PIN |
| `/admin/analytics` | `admin/analytics.tsx` | ✅ lazy | Aggregated engagement metrics |
| `/admin/anime` | `admin/anime.tsx` | ✅ lazy | Anime integration settings |
| `/admin/announcements` | `admin/announcements.tsx` | ✅ lazy | Banners & notices CRUD |
| `/admin/collections` | `admin/collections/index.tsx` | ✅ lazy | Curated universes list |
| `/admin/collections/[id]` | `admin/collections/[id]/index.tsx` | ✅ lazy | ⚠️ **BUG: Does NOT wrap with `<AdminShell>` and does NOT call `useAdminAuth()`. Non-admin visitors can render the editor chrome. API calls are still protected server-side, so this is a UX/consistency bug, not a data-leak.** |
| `/admin/content` | `admin/content.tsx` | ✅ lazy | Featured content CRUD |
| `/admin/developer` | `admin/developer.tsx` | ✅ lazy | Developer tools |
| `/admin/feature-flags` | `admin/feature-flags.tsx` | ✅ lazy | Feature flag toggles |
| `/admin/homepage` | `admin/homepage.tsx` | ✅ lazy | Discover section toggles |
| `/admin/logs` | `admin/logs.tsx` | ✅ lazy | Audit log viewer |
| `/admin/maintenance` | `admin/maintenance.tsx` | ✅ lazy | Maintenance mode + 8 operations |
| `/admin/settings` | `admin/settings.tsx` | ✅ lazy | App config (5 buckets) |
| `/admin/tmdb-cache` | `admin/tmdb-cache.tsx` | ✅ lazy | Cache stats & operations |
| `/admin/users` | `admin/users.tsx` | ✅ lazy | User management |

### 3.5 API routes (`/api/*`)

31 endpoints total. All SolidStart/Nitro handlers keyed on exported `GET`/`POST`/`PATCH`/`PUT`/`DELETE`/`OPTIONS`. Pattern: minimal `interface APIEvent { request: Request }` type. Admin endpoints extend `AdminAPIEvent` and call `requireAdmin(event)`.

**Public consumer-facing (15 endpoints)** — see §6 for full details:
- `GET /api/media/[...path]` (TMDB proxy)
- `GET /api/media/ratings` (MDBList proxy)
- `GET/POST /api/tmdb-cache` (server-side cache)
- `POST /api/anilist` (AniList GraphQL proxy)
- `POST /api/anime-mappings` (public write)
- `GET /api/anime-settings`
- `GET /api/announcements`
- `GET /api/feature-flags`
- `GET /api/featured-content`
- `GET /api/homepage-config`
- `POST /api/account/delete` (authenticated)
- `POST /api/push/send` (authenticated)
- `GET /api/push/status`
- `POST /api/push/send-admin` (CRON_SECRET)
- `POST /api/email/send` (authenticated or CRON_SECRET)
- `POST /api/cron/weekly-recap` (CRON_SECRET)

**Admin-gated (16 endpoints)** — all require `requireAdmin()`:
- `POST/DELETE/GET /api/admin/auth`
- `GET/PATCH /api/admin/users`
- `GET/POST/PATCH/DELETE /api/admin/collections`
- `GET/POST/PATCH/DELETE /api/admin/collections/entries`
- `GET/POST/PATCH/DELETE /api/admin/content`
- `GET/POST/PATCH/DELETE /api/admin/announcements`
- `GET/POST /api/admin/maintenance`
- `GET/PUT /api/admin/feature-flags`
- `GET/PUT /api/admin/settings`
- `GET/PUT /api/admin/anime-settings`
- `GET/PUT /api/admin/homepage`
- `GET/POST/DELETE /api/admin/tmdb-cache`
- `GET /api/admin/stats`
- `GET /api/admin/analytics`
- `GET /api/admin/logs`

### 3.6 Route-level concerns

- **No `[...404].tsx` catch-all route exists.** Unknown URLs render SolidStart's default (likely blank). This is a UX and SEO gap.
- **Route prefetch** (`src/shared/utils/routePrefetch.ts`) only covers 6 routes (`/discover`, `/watchlist`, `/collections`, `/profile`, `/settings`, `/search`). Missing: all `/profile/*` sub-routes, all `/settings/*` sub-routes, `/collections/[id]`, all `/admin/*` routes.
- **No explicit scroll restoration.** Solid Router's default behavior is relied upon. Only the floating `ScrollToTop` FAB exists.
- **Per-route `<Suspense>` inconsistency**: Some lazy routes wrap with their own skeleton (`profile/index.tsx`, `profile/stats.tsx`, `profile/upcoming.tsx`, `collections/index.tsx`, `discover.tsx`, `watchlist.tsx`). Others rely on AppShell-level Suspense (`profile/achievements.tsx`, `profile/history.tsx`, `profile/trash.tsx`, `settings/index.tsx`, `collections/[id]/index.tsx`).
- **`/collections/[id]` is missing `<Title>` tag** — every other route sets one. Likely also missing `<Meta>` description.

---

## 4. Page Audit

This section audits every page individually. Given the volume (61 routes), I provide a per-page summary table focused on the consumer-facing routes (admin routes are uniform — they all use `<AdminShell>` + a lazy feature page). Deep audits per page are in §3.

### 4.1 Discover page (`/discover`)

- **Purpose**: Landing page — daily-rotating cinematic feed with 8–16 sections.
- **Hierarchy**: `<PageContainer>` → Spotlight → GenreExplorer → Continue Universes → Insight Strip → Trending → Theatres → Because You Love → Surprise Me → Weekend Picks → Step Outside → Hidden Gems → Top Rated Movies/Series → New on OTT → New Seasons → Coming Soon.
- **Components**: `Spotlight`, `SpotlightSkeleton`, `GenreExplorer` (669 LOC, roving-tabindex arrow nav, lazy per-genre carousel), `GenreDropdown`, `OttDropdown` (312 LOC, dynamic region provider list), `DiscoverRail` (271 LOC, horizontal scroll-snap, lazy IMDb rating via IntersectionObserver, NEW SEASON OUT badge), `DiscoverSkeleton`, `DiscoverEmptyState`, `DiscoverSectionError`, `ottProviderRegistry` (318 LOC, canonical TMDB ID → provider-key map).
- **State**: `useDiscoverFeeds` (parallel TMDB fetch + 15s safety timeout), `usePersonalizedDiscover` (FNV-1a hash seed), `useSpotlight` (560 LOC, daily-rotating hero), `useAnimeCarousels` (7 AniList carousels), `useDiscoverTaste` (TasteProfile derivation), `useHomepageConfig` (16 section toggles).
- **Data**: TMDB `/discover/movie`, `/discover/tv`, `/trending`, `/movie/{id}/recommendations`, `/watch/providers`; AniList GraphQL (anime carousels); Supabase `discover` repository (personalized rows for signed-in users).
- **UX**: Per-section `<ErrorBoundary>` + `<Suspense>` so a single section failure doesn't break the page. Global dedup chain (`renderedIds` Set) prevents duplicate titles across rails.
- **Performance**: Lazy IMDb ratings via `useLazyImdbRating` IntersectionObserver. 5-min cache on `/api/homepage-config` and `/api/anime-settings`.
- **Accessibility**: Each rail has `aria-label`. Spotlight has shuffle + retry buttons with aria-labels. GenreExplorer has full WAI-ARIA Tabs pattern.
- **Mobile**: Single column. Spotlight hero collapses to mobile-specific layout. Bottom nav visible.
- **Desktop**: Three-column workspace (sidebar + main + utility panel). Utility panel is mostly placeholder text.
- **Strengths**: Robust error handling per section. Daily-rotation logic with 30-day no-repeat. Anime + TMDB integration seamless.
- **Weaknesses**: `RelationshipPill.tsx` is orphaned. `useDiscoverFeeds` returns unused signals (`topRatedMovies`, `topRatedTv`, `newSeasons`, `nowPlaying`). 100+ IntersectionObservers on Discover (one per card; should be a shared pool).
- **Improvement ideas**: Add "Not interested" dismiss action. Add `<link rel="preload" as="image">` for first 3 above-the-fold posters. Implement shared IntersectionObserver pool.

### 4.2 Watchlist page (`/watchlist`)

- **Purpose**: User's vault — adaptive status shelves, infinite scroll, advanced filtering, presets.
- **Hierarchy**: `<PageContainer>` → `WatchlistHeader` (sticky, expandable search) → `QuickFilterTabs` (status chips) → `VaultFilters` (advanced filter sheet) → `WatchlistGrid` (dashboard/flat/timeline layouts) → `VaultShelf` (status-grouped sections) → `WatchlistDialogs`.
- **Components**: `WatchlistHeader` (371 LOC), `WatchlistGrid` (274 LOC), `VaultShelf` (167 LOC), `VaultCard` (389 LOC, timeline row card), `VaultFilters` (149 LOC) + `VaultFiltersContent` (270 LOC) + `FilterControls` (612 LOC), `QuickFilterTabs` (154 LOC), `WatchlistDialogs` (60 LOC), `EmptyState` (72 LOC), `LoadingSkeleton` (74 LOC).
- **State**: `useVault()` (compatibility wrapper), `useVaultFiltering` (searchInput 120ms debounce, filters signal, URL `?status=` sync, view-mode effect), `useVaultPresets` (presets signal cache + CRUD), `useVaultSections` (adaptive shelf builder with `claimed` Set dedup).
- **Data**: Supabase `vault` (5 status buckets) + `episode_progress` (batch) → `vaultReadAdapter` → `WatchlistItem[]` → `useUserLibrary` global signal.
- **UX**: Optimistic updates with `runWriteOptimistic` helper (apply local → toast → background persist → revert-on-error). URL `?status=` sync from Dashboard stat cards.
- **Performance**: 5 parallel `getVaultByStatus` queries with `pagination: { limit: 1000 }`. Infinite scroll bumps display limit by 20 when within 500px of bottom.
- **Accessibility**: Status badges use raw `tag-chip` + `status-badge-*` CSS classes (NOT GlassBadge — drift). Cards have `role="button"` + `tabindex={0}` + Enter/Space handler.
- **Mobile**: Single column. Filter sheet opens as bottom sheet.
- **Desktop**: Grid layout. Filter sheet opens as side panel.
- **Strengths**: Comprehensive filtering (genre, platform, tag, year, rating, runtime). Preset persistence. Optimistic updates. Race-safe writes.
- **Weaknesses**: 5 separate status queries (N+1 risk on huge vaults). `enrichWithEpisodeProgress` (sync) is a stub returning items unchanged — only `enrichWithEpisodeProgressAsync` actually fetches. `useVault()` marked deprecated but still used by 25+ consumers. MovieCard status badge is `aria-hidden="true"` — invisible to screen readers.
- **Improvement ideas**: Single query with `IN (statuses)` filter instead of 5 parallel. Implement sync `enrichWithEpisodeProgress` or remove it. Migrate MovieCard status badge to GlassBadge. Complete `useVault` deprecation.

### 4.3 Collections page (`/collections`)

- **Purpose**: Hub page — user collections + curated universes + smart builder.
- **Hierarchy**: `<PageContainer>` → "Your Collections" section (`CollectionsGrid` + `SmartCollectionBuilder` button + `AddUniverseModal` lazy) → "Subscribed Universes" section → "Archived Collections" section.
- **Components**: `CollectionsGrid` (360 LOC), `FranchiseGrid` (198 LOC), `ArchivedCollectionsSection` (152 LOC), `SmartCollectionBuilder` (568 LOC), `AddUniverseModal` (488 LOC, lazy-loaded), `FolderEditor` (575 LOC), `ThreeDotMenu` (117 LOC), `ProgressRing` (92 LOC), `UniverseSuggestions` (162 LOC).
- **State**: `useCollections()` context provider (8 mutation methods with optimistic updates + temp-ID reconciliation). `useCuratedUniverses()` reactive catalog + subscriptions.
- **Data**: Supabase `collections` + `collection_entries` (vault_id FK) + `vault` (tmdb_id FK) + TMDB (metadata hydration); `curated_universes` + `curated_universe_entries` + `user_universe_subscriptions`.
- **UX**: Inline name input for new collection. Drag-and-drop reorder via `@thisbeyond/solid-dnd`. Folder editor with cover/banner/accent customization. Smart builder with rule-based evaluation.
- **Performance**: `ensureFavoritesExistsInSupabase` with mutex + duplicate cleanup. `duplicateCollectionInSupabase` sequentially adds entries (no batch insert).
- **Accessibility**: `ProgressRing` has `role="img"` + `aria-label`. Three-dot menu has `aria-haspopup`.
- **Mobile**: Grid collapses to 1-2 columns. Modals become bottom sheets.
- **Desktop**: Grid 3-4 columns. Side panel for filter/sort.
- **Strengths**: Optimistic updates with snapshot + rollback. Temp-ID reconciliation for instant feedback. Self-healing Favorites duplicate cleanup. Phase 8.1 production polish with explicit error types.
- **Weaknesses**: **Smart collection rules are NOT persisted** — no rules column in DB. `isHidden` not in `user_universe_subscriptions` schema — `hiddenUniverses` memo always returns empty. `duplicateCollectionInSupabase` sequential entry adds (slow for large collections). `ensureFavoritesExistsInSupabase` module-level mutex doesn't protect across tabs.
- **Improvement ideas**: Add `rules` JSONB column to `collections` table for smart rule persistence. Batch insert for `duplicateCollectionInSupabase`. Add `is_hidden` column to `user_universe_subscriptions`.

### 4.4 Collection detail page (`/collections/[id]`)

- **Purpose**: Single collection OR curated universe view with timeline / release / story / franchise modes.
- **Hierarchy**: `<PageContainer>` → `CollectionHero` → `CollectionActionBar` → `CollectionSortFilter` → `EntryListRow` (user) / `TimelineEngine` (universe) → `PhaseDivider` → `AddTitlesModal` / `ReorderModal`.
- **Components**: `UniverseDashboard` (428 LOC), `TimelineEngine` (385 LOC), `TimelineEntry` (247 LOC), `PhaseDivider` (65 LOC), `CollectionActionBar` (153 LOC), `CollectionSortFilter` (205 LOC), `EntryListRow` (219 LOC), `timelineSort.ts` (215 LOC pure functions).
- **State**: `useCollectionSearch` (vault-wide search for AddTitlesModal), `useCollectionSort` (manual/release/added/title/rating), `useCollectionFilter` (status pills + 200ms debounced search).
- **Data**: Supabase `collection_entries` + `vault` + `curated_universe_entries` + `universe_phases`.
- **UX**: Drag-and-drop reorder (ReorderModal). Inline `incident_year` editing (admin only). Phase dividers for narrative grouping.
- **Performance**: 3-step normalization: entries → vault rows → TMDB metadata batch.
- **Accessibility**: Timeline entries have `aria-label` with title + status. Sort/filter controls labeled.
- **Strengths**: Multiple view modes. Phase divider system for narrative grouping. Inline editing.
- **Weaknesses**: **Missing `<Title>` tag** (every other route sets one). No per-route `<Suspense>` wrapper (relies on AppShell-level Suspense). `position`/`release_position`/`story_position`/`timeline_position` columns are legacy — only `position` and `incident_year` are actively used.
- **Improvement ideas**: Add `<Title>` tag. Add per-route Suspense. Deprecate redundant position columns.

### 4.5 Profile page (`/profile`)

- **Purpose**: Personal dashboard — banner + header + stats + tabs (Favorites / Lists / Achievements) + quick actions.
- **Hierarchy**: `<PageContainer>` → `ProfileBanner` (dynamic cinematic backdrop) → `ProfileHeader` (avatar + name + bio + edit/share buttons) → `ProfileStatsRow` (5 GlassStatCards with completion rings) → `ProfileTabs` (underline tab strip with arrow-key nav) → tab content (FavoritesGrid / UserListsPreview / AchievementsPreview) → `QuickActionRow` (Stats / Upcoming / Settings / Trash) → `EditProfileModal` (full-screen sheet) → `BannerEditor` (bottom sheet).
- **Components**: `ProfileBanner` (183 LOC), `ProfileHeader` (120 LOC), `ProfileStatsRow` (128 LOC), `ProfileTabs` (101 LOC), `FavoritesGrid` (173 LOC), `UserListsPreview` (123 LOC), `AchievementsPreview` (284 LOC), `QuickActionRow` (61 LOC), `TasteCard` (467 LOC), `EditProfileModal` (559 LOC), `BannerEditor` (531 LOC).
- **State**: `useProfileData` (client-only signal + `refetch()` on uid change), `useStats` (pure memo over watchlist), `useProfileTabs` (local signal + localStorage persistence).
- **Data**: Supabase `profiles` + TMDB (favorites enrichment) + `useUserLibrary().watchlist()` (for stats) + `useCollections.userCollections()` (for FavoritesGrid / UserListsPreview).
- **UX**: Tab strip persisted across refreshes. Edit profile modal with avatar + banner customization. Share profile via Web Share API or clipboard.
- **Performance**: Parallel TMDB enrichment for favorites. `useStats` is pure memo (no fetch).
- **Accessibility**: Tabs have full WAI-ARIA Tabs pattern. Edit modal has focus trap.
- **Strengths**: Comprehensive profile with banner editor, taste card (storyGenerator), achievements preview, quick actions. Deterministic narrative engine for "Your Story".
- **Weaknesses**: `AchievementsPreview` duplicates the BADGES array from `AchievementsPage` (acknowledged tech debt). `ProfileBanner.onChooseBanner` prop is dead. Two `UpcomingPage.tsx` files exist (this one is 1355 LOC and DEAD; the canonical is `features/upcoming/`). `ProfilePage.handleShare` always copies `/profile` URL (no username slug).
- **Improvement ideas**: Delete dead `features/profile/UpcomingPage.tsx`. Extract BADGES to a shared module. Add public profile URL (if social returns).

### 4.6 Settings page (`/settings`)

- **Purpose**: Unified single-page settings hub.
- **Hierarchy**: `<PageContainer>` → Header with search bar → Sidebar nav (desktop) / accordion list (mobile) → 6 sections (Account, Appearance, Content & Discover, Notifications, Calendar, Sync) + Danger Zone → Account sheets rendered at root.
- **Components**: 6 section components + `TwoFactorSetup` (356 LOC), `ThemeCard` (106 LOC), `AccentSwatch` (94 LOC), `LoginHistoryList` (188 LOC), `SessionList` (151 LOC).
- **State**: `useSettingsState` (1155 LOC, owns ALL signals + handlers + memos + UI helpers, returns `SettingsState` bag).
- **Data**: Supabase `profiles` + `user_preferences` + `login_history`; TMDB `/watch/providers/movie` + `/watch/providers/tv` (for streaming provider logos); Supabase Auth MFA API.
- **UX**: Search filters sections by title/desc/keywords with `<mark>` highlighting. Each setting applies immediately (no Save button).
- **Performance**: `onMount` loads profile + providers + has-password; `createEffect` for region-change refetching.
- **Accessibility**: All form controls labeled. Sheets have focus trap.
- **Strengths**: Comprehensive settings (theme, accent, density, font, poster quality, spoilers, animations, calendar, notifications, content filters, streaming providers, language, region, rating scale, danger zone, account, OAuth, 2FA, sessions, login history). State bag pattern keeps sections as pure JSX extractors.
- **Weaknesses**: `accentHelpers.ts` duplicates `~/core/preferences/customAccent` verbatim. `useSettingsState` is 1155 LOC. `applyAccentToDocument` accepts 3-digit hex shorthand in regex but `hexToRgbaLocal` only handles 6-digit — silent fallback to green. `SessionList` says Supabase doesn't expose "list all my sessions" — only shows current device.
- **Improvement ideas**: Consolidate `accentHelpers` into `customAccent`. Add "reset to defaults" per-section. Add settings import/export.

### 4.7 Stats page (`/profile/stats`)

- **Purpose**: Statistics dashboard with chart-driven cinematic personality analysis.
- **Hierarchy**: `<PageContainer>` → Header → `StatsOverview` (4 GlassCards) → `StatsTabs` (Activity/Genres/Ratings/Decades/People/Trends) → tab content → `HighestRatedCarousel` → action row (Share / Export CSV).
- **Components**: `StatsOverview` (156 LOC), `StatsTabs` (88 LOC), `ActivityChart` (171 LOC), `GenreChart` (87 LOC), `RatingsHistogram` (92 LOC), `DecadeChart` (82 LOC), `PeopleList` (112 LOC), `TrendsChart` (110 LOC), `MovieSeriesPie` (83 LOC), `HighestRatedCarousel` (234 LOC), `ChartContainer` (112 LOC), `SvgChart` (975 LOC), `StatsShareModal` (342 LOC).
- **State**: `useStatsData` (87 LOC, pure memo over watchlist, no fetch).
- **Data**: `useUserLibrary().watchlist()` → `getStatsData(list)` (pure calculators in `~/lib/supabase/repositories/stats`) → `AllStats`.
- **UX**: Reactive — stats update immediately when watchlist changes. Share as image via `html2canvas` lazy-loaded.
- **Performance**: Pure memos — no network. `createMemo` re-derives only when watchlist changes.
- **Accessibility**: Charts have `aria-label` with summary. Tabs have WAI-ARIA pattern.
- **Strengths**: Clean architecture, pure memos, defensive guards. Custom SVG charts (no chart library dependency). Share as image.
- **Weaknesses**: All stats computed in-memory on every watchlist change — O(n) per chart; fine for <10k items. `SvgChart.tsx` is 975 LOC. No date-range filter (all-time stats only). `StatisticsPage` has defensive `try/catch` around `library.watchlist` — if `library` is null, returns `[]` (masks a real bug).
- **Improvement ideas**: Split `SvgChart.tsx`. Add date-range filter. Add year-over-year comparison.

### 4.8 Upcoming page (`/profile/upcoming`)

- **Purpose**: Upcoming releases hub with calendar + reminders + filters.
- **Hierarchy**: `<PageContainer>` → Header with notification bell → Filter bar (DateRangePicker, Sort, Filter, ViewToggle) → List view (grouped by Today/Tomorrow/This Week/Later) OR Calendar view (month grid with title counts per day) → `TrailerModal` (lazy).
- **Components**: `UpcomingCard` (375 LOC), `CalendarView` (205 LOC), `DateRangePicker` (162 LOC), `FilterSheet` (246 LOC), `NotificationCenter` (204 LOC), `SortDropdown` (74 LOC), `ViewToggle` (132 LOC), `CountdownBadge` (72 LOC), `HeaderNotificationBell` (57 LOC), `TrailerModal` (63 LOC).
- **State**: `useUpcomingData` (`createResource` over filter memos), `useNotifications` (609 LOC, owns notification feed + reminder state + browser-notification side effect).
- **Data**: TMDB `/discover/movie` (with_release_country) + `/discover/tv` (air_date.gte/lte) + `/tv/airing_today`; Supabase `notifications` + `user_reminders`.
- **UX**: Region reactive to `useProfileData().profile.country`. List/calendar toggle persisted in localStorage. Notifications fire on mount for due reminders.
- **Performance**: TV uses two endpoints + client-side merge — can be slow on dense date windows.
- **Accessibility**: Calendar has `role="grid"`. Cards have `aria-label`.
- **Strengths**: Comprehensive notification system with reminders, quiet hours, lead time. Calendar view with title counts.
- **Weaknesses**: TV uses two endpoints + client-side merge. `applyLeadTime` loses sub-day precision. No email notifications (only browser + in-app) — `renderEmailTemplate` is imported but not used. Two `UpcomingPage.tsx` files exist (this one is canonical). `useNotifications` fires browser notifications on mount for ALL due reminders — could spam if many due.
- **Improvement ideas**: Single endpoint for TV upcoming. Add push notification integration. Add snooze/dismiss for individual notifications. Rate-limit `useNotifications` on-mount firing.

### 4.9 Trash page (`/profile/trash`)

- **Purpose**: Recycle bin for soft-deleted vault items + collections.
- **Hierarchy**: `<PageContainer>` → `TrashHeader` (title + count badge) → `TrashActionBar` (Restore All + Clear Trash) → Grouped items (Today / Yesterday / This Week / Older) → `ConfirmDialog` (variant: default/warning/danger).
- **Components**: `TrashItemCard` (333 LOC, exports `TrashVaultItemCard`, `TrashCollectionCard`, `TrashItemCardSkeleton`, `TrashGroupRenderer`), `TrashHeader` (69 LOC), `TrashActionBar` (61 LOC), `TrashEmptyState` (53 LOC), `ConfirmDialog` (161 LOC).
- **State**: `useTrashData` (355 LOC, local signals for vaultItems, collections, loading, error, busy).
- **Data**: Supabase `vault` (where `deleted_at NOT NULL`) + `collections` (where `deleted_at NOT NULL`) + TMDB batch metadata fetch.
- **UX**: Auto-purge on first load (deletes items with `deleted_at > 30d`). Confirm dialog for every destructive action. Toast feedback.
- **Performance**: TMDB batch metadata enrichment.
- **Accessibility**: Confirm dialogs have `role="alertdialog"`. Buttons have aria-labels.
- **Strengths**: Clean v3 redesign with Glass design system. Auto-purge. Comprehensive restore/delete operations.
- **Weaknesses**: Auto-purge is client-side only — items linger past 30 days if user never visits Trash. No "expires in X days" countdown on cards. No bulk select. `autoPurgeExpired` runs on every `refetch()` — could delete items user intended to restore. `useTrashData` mutators return inconsistent types (boolean vs counts).
- **Improvement ideas**: Server-side cron for auto-purge. Add "expires in X days" countdown. Add bulk select. Make mutator return types consistent.

### 4.10 Admin pages

All 16 admin pages follow the same pattern: `<AdminShell><Title>{...}</Title><LazyPage /></AdminShell>`. They range from 286 LOC (`AdminDeveloperPage`) to 1045 LOC (`AdminCollectionEditorPage`). All mutations go through `/api/admin/*` routes (audit-logged). Comprehensive but unsplit. See §3.4 for the route list and §2.14 for the admin feature audit.

---

## 5. Component Inventory

CineLog V2 has 4 distinct component layers: Glass design system (21 components), primitives (3 files, both dead), layout (3 components, 1 dead), and root shared UI (14 components). Plus ~150 feature-specific components.

### 5.1 Glass Design System (`src/shared/ui/glass/`)

21 files. The "Phase 2 Component Library". Architecture: `GlassSurface` (atomic) → `GlassCard` (workhorse) / `GlassModal` / `GlassSheet` (overlays) → `GlassPosterCard` / `GlassStatCard` / `GlassSearchBar` (composites).

| Component | LOC | Purpose | Key Props | Usage Count | Reusable? | Status |
|---|---|---|---|---|---|---|
| `GlassSurface` | ~150 | Atomic glass primitive — strength × padding × radius × state | `strength`, `border`, `padding`, `radius`, `loading`, `interactive`, `disabled`, `aria-label` | 5 files | Yes | Alive |
| `GlassCard` | ~200 | Workhorse container — variant × size × state | `variant`, `size`, `interactive`, `selected`, `loading`, `disabled`, `hoverable`, `padding`, `border` | 16 files / ~50 refs | Yes | Alive |
| `GlassPosterCard` | ~80 | 2:3 poster card with image + metadata footer | `title`, `meta`, `imageUrl`, `imageAlt`, `loading`, `selected`, `overlay`, `onClick` | 1 (TasteCard) | Yes | **Underused** — MovieCard won the adoption race |
| `GlassButton` | ~150 | Full-featured button — 6 variants × 3 sizes × icon × loading × selected/active | `variant`, `size`, `loading`, `disabled`, `fullWidth`, `icon`, `iconPosition`, `iconFill`, `selected`, `active` | 17 files / 79 refs | Yes | Alive (workhorse) |
| `GlassIconButton` | ~120 | Square/circular icon-only button + notification badge | `variant`, `size`, `icon` (req), `label` (req, aria), `loading`, `disabled`, `selected`, `badge` | 1 (ProfileHeader) | Yes | **Underused** |
| `GlassChip` | ~80 | Compact pill for tags/filters/categories | `label`, `variant`, `icon`, `trailingIcon`, `trailingIconLabel`, `onClick`, `onTrailingIconClick`, `selected` | 0 | Yes | **DEAD** |
| `GlassBadge` | ~100 | Status badge (5 watch statuses) + 6 intents | `status`, `intent`, `label`, `icon`, `size`, `glass` | 10 files / 24 refs | Yes | Alive |
| `GlassInput` | ~100 | Text input with icon + label + right action slot | `icon`, `label`, `rightContent`, `size` | 1 (EditProfileModal) | Yes | **Underused** |
| `GlassSearchBar` | ~60 | Search form composed of GlassInput + clear + submit | `query`, `onQueryChange`, `onSubmit`, `onClear`, `placeholder`, `inputRef`, `size` | 0 | Yes | **DEAD** |
| `GlassSectionHeader` | ~80 | Section header with eyebrow + title + accent + action | `title`, `eyebrow`, `icon`, `actionLabel`, `onAction`, `variant`, `accent`, `description` | 0 (transitive via SectionContainer, also dead) | Yes | **DEAD** |
| `GlassDivider` | ~60 | H/V divider with optional label | `variant`, `spacing`, `vertical`, `label` | 0 | Yes | **DEAD** |
| `GlassSkeleton` | ~200 | Multi-shape loading skeleton with shimmer | `variant` (block/text/circle/card/avatar/poster), `width`, `height`, `radius`, `lines`, `animated` | 15 files / 58 refs | Yes | Alive (heavily used) |
| `GlassEmptyState` | ~80 | Polished empty-state — large glass icon + headline + action | `icon`, `title`, `message`, `variant`, `action`, `surface` | 17 files / 45 refs | Yes | Alive (heavily used) |
| `GlassLoadingState` | ~60 | Centered spinner + message + ambient glow | `message`, `size`, `fullHeight` | 1 (app.tsx Suspense) | Yes | **Underused** |
| `GlassListItem` | ~120 | List row with image/icon + title + subtitle + trailing | `title`, `subtitle`, `icon`, `imageUrl`, `trailing`, `variant`, `size`, `interactive`, `selected`, `disabled`, `onClick` | 0 | Yes | **DEAD** |
| `GlassStatCard` | ~100 | Statistic card built on GlassCard + trend indicator | `value`, `label`, `variant`, `size`, `icon`, `trend`, `trendValue`, `loading`, `onClick` | 1 (ProfileStatsRow) | Yes | **Underused** |
| `GlassTabs` | ~200 | Tab bar — pill/underline/segmented — full WAI-ARIA Tabs | `items`, `value`, `onChange`, `variant`, `size`, `fullWidth`, `aria-label` | 4 (QuickFilterTabs, ProfileTabs, StatsTabs) | Yes | Alive |
| `GlassAvatar` | ~80 | Avatar with image, fallback initials, loading, interactive | `src`, `name`, `size`, `interactive`, `loading` | 2 (StatsShareModal, ProfileHeader) | Yes | Alive |
| `GlassModal` | ~280 | Premium centered modal — focus trap + ESC + auto-focus + restore-focus | `open`, `onClose`, `strength`, `size`, `title`, `icon`, `headerRight`, `showCloseButton`, `disableBackdropClose`, `zIndexBase` | 11 files / 35 refs | Yes | Alive (workhorse) — but NOT used by DetailsModal/CollectionModal/AuthModal |
| `GlassSheet` | ~240 | Bottom sheet — focus trap + ESC + auto-focus + restore-focus | `open`, `onClose`, `strength`, `snap`, `title`, `icon`, `headerRight`, `showHandle`, `disableBackdropClose`, `zIndexBase` | 1 (ShareSheet) | Yes | **Underused** — doc claims "swipe down" closes but no swipe gesture implemented |
| `index.ts` | 30 | Barrel export | — | — | — | — |

**Dead Glass components** (zero real consumers): `GlassChip`, `GlassDivider`, `GlassListItem`, `GlassSearchBar`, `GlassSectionHeader`. Plus `primitives/Button`, `primitives/Skeleton`, `layout/SectionContainer`.

### 5.2 Primitives (`src/shared/ui/primitives/`)

3 files, both components dead. Superseded by Glass equivalents.

| Component | Purpose | Status |
|---|---|---|
| `Button` | Older "Premium" button using CSS classes `.btn-primary` / `.btn-ghost` | **DEAD** — zero consumers. GlobalErrorBoundary uses raw `class="btn-primary"` instead. |
| `Skeleton` | Older "Premium" skeleton using CSS classes `.skeleton-base` / `.skeleton-text` | **DEAD** — zero consumers. |
| `index.ts` | Barrel export | Re-exported via `~/shared/ui/index.ts` |

### 5.3 Layout (`src/shared/ui/layout/`)

3 files.

| Component | Purpose | Status |
|---|---|---|
| `PageContainer` (premium) | Single source of truth for page-level rhythm — `<div role="region" aria-label="Page content" tabindex={-1}>` | **Effectively duplicate** — only `ProfilePage` imports from `~/shared/ui/layout`. All other 22 pages import from `~/shared/ui/PageContainer` (the legacy simpler one). |
| `SectionContainer` | Section wrapper with optional GlassSectionHeader + collapsible behavior | **DEAD** — zero real consumers. |
| `index.ts` | Barrel export | NOT re-exported from `~/shared/ui/index.ts` (opt-in only). |

### 5.4 Root shared UI (`src/shared/ui/`)

14 files at root level.

| Component | Purpose | Usage | Status |
|---|---|---|---|
| `AppHeader` | Sticky application header (mobile + desktop variants) | AppShell singleton | Alive — but hand-rolls buttons instead of using GlassIconButton, hand-rolls search instead of GlassInput |
| `BottomNavigation` | Fixed bottom-of-viewport primary nav (4 items) | AppShell singleton | Alive |
| `NavButton` | Single tab in BottomNavigation (64px touch target, prefetch on hover) | BottomNavigation | Alive |
| `DesktopSidebar` | Permanent left nav for desktop (7 items, collapsible) | AppShell singleton | Alive |
| `DesktopUtilityPanel` | Right contextual panel for desktop | AppShell singleton | **Mostly empty placeholder** — every context renders "Your X appears here" |
| `MovieCard` | Poster card used everywhere (vault, discover, search, collections) | 8 files / 25 refs | Alive (622 LOC — borderline should-split) |
| `MovieCardRatings` | 3-source rating chip cluster (IMDb + RT + User) | MovieCard | Alive |
| `SafeImage` | Defensive `<img>` wrapper with onError fallback | 6 files | Alive — but MovieCard has its own `imgLoaded`/`imgError` pattern (duplication) |
| `HighlightText` | Highlights search query matches in text | MovieCard | Alive |
| `Icon` | Material Symbols wrapper | 8 direct imports | Alive — but inconsistent adoption (most use raw `<span class="material-symbols-outlined">`) |
| `ScrollToTop` | Floating button (IntersectionObserver-driven) | 15 files / 32 refs | Alive |
| `AuthModal` | Sign-in / sign-up modal (email/password + Google OAuth) | AppShell singleton | Alive — but **does NOT use GlassModal** (hand-rolls Portal + GlassSurface + inline styles, ~400 lines of style objects) |
| `ToastContainer` | Global toast stack | AppShell singleton | Alive |
| `OfflineBanner` | Top-of-page banner when network is down | app.tsx sibling of AppShell | Alive |
| `AnnouncementsBanner` | Top-of-page banner announcements | AppShell singleton | Alive — uses emoji icons (ℹ️ ✅ ⚠️ 🛑) inconsistent with Material Symbols elsewhere |
| `GlobalErrorBoundary` | Wraps entire app, friendly fallback with Retry + Home | app.tsx | Alive — uses raw `class="btn-primary"` instead of GlassButton |
| `PageContainer` (legacy) | Older PageContainer — simpler props | 22 routes (via `~/shared/ui` barrel) | **Duplicate** of `layout/PageContainer.tsx` |
| `index.ts` | Barrel export | — | Incomplete — does NOT re-export `./glass`, `./layout`, or most root components |

### 5.5 Feature components

~150 feature-specific components across 16 feature modules. See §2 for per-feature component listings. Notable patterns:
- **Discover**: Spotlight (363 LOC), GenreExplorer (669 LOC), DiscoverRail (271 LOC), OttDropdown (312 LOC), ottProviderRegistry (318 LOC).
- **Watchlist**: WatchlistHeader (371 LOC), WatchlistGrid (274 LOC), VaultCard (389 LOC), FilterControls (612 LOC), VaultFiltersContent (270 LOC).
- **Collections**: UniverseDashboard (428 LOC), TimelineEngine (385 LOC), FolderEditor (575 LOC), SmartCollectionBuilder (568 LOC), AddUniverseModal (488 LOC), ReorderModal (661 LOC), AddTitlesModal (315 LOC).
- **Details**: ~30 components including CinematicHero (256), MetadataGrid (509), PersonModal (509), SeasonNavigator (490), YourActivityCard (467), DetailsEditForm (558), AddToFolderSheet (365), WhereToWatch (238), EpisodeCard (238), ActionDock (287), RatingPanel (208), ConfirmRemoveSheet (222), DetailsCast (429), AnimeCharacters (240), AnimeSections (235).
- **Profile**: TasteCard (467), EditProfileModal (559), BannerEditor (531), AchievementsPreview (284).
- **Stats**: SvgChart (975), StatsShareModal (342), HighestRatedCarousel (234), ActivityChart (171).
- **Upcoming**: UpcomingCard (375), CalendarView (205), NotificationCenter (204), FilterSheet (246), DateRangePicker (162).
- **Sync**: CsvImportCard (573), ResetConfirmSheet (528), BackupCards (120), ImportHub (136).
- **Admin**: AdminShell (544), AdminDashboard (387), AdminUsersPage (845), AdminContentPage (909), AdminAnnouncementsPage (928), AdminCollectionEditorPage (1045), AdminCollectionsPage (710), AdminTmdbCachePage (713), AdminAnalyticsPage (625), AdminLogsPage (658), AdminMaintenancePage (630), AdminSettingsPage (815).
- **Details ShareSheet**: 893 LOC (largest single component in the codebase).

### 5.6 Dead/unused components (verified via grep)

| Component | Status | Evidence |
|---|---|---|
| `primitives/Button.tsx` | DEAD | 0 imports via `~/shared/ui` barrel |
| `primitives/Skeleton.tsx` | DEAD | 0 imports via `~/shared/ui` barrel |
| `glass/GlassChip.tsx` | DEAD | Only barrel export references it |
| `glass/GlassDivider.tsx` | DEAD | Only barrel export references it |
| `glass/GlassListItem.tsx` | DEAD | Only barrel export references it |
| `glass/GlassSearchBar.tsx` | DEAD | Only barrel export references it |
| `glass/GlassSectionHeader.tsx` | DEAD (transitively) | Only used by SectionContainer, which is also dead |
| `layout/SectionContainer.tsx` | DEAD | 0 imports outside `layout/` directory |
| `features/profile/UpcomingPage.tsx` (1355 LOC) | DEAD | 0 imports — duplicate of `features/upcoming/UpcomingPage.tsx` |
| `features/discover/components/RelationshipPill.tsx` | DEAD | Only mentioned in a comment in `franchises.ts` |

### 5.7 Parallel implementations (drift)

The Glass system exists but feature code hand-rolls equivalents in several places:

| Glass component | Hand-rolled equivalent | Where |
|---|---|---|
| GlassModal | Custom Portal + GlassSurface | AuthModal, DetailsModal, CollectionModal |
| GlassIconButton | Raw `<button>` with inline styles | AppHeader (×5), AuthModal (close), OfflineBanner (×2), GlobalErrorBoundary (×2) |
| GlassBadge | Raw `tag-chip` + `status-badge-*` classes | MovieCard status badge |
| GlassInput | Raw `<input>` with inline styles | AppHeader (×2), AuthModal (×2) |
| GlassDivider | Raw `<div>` + border-t | AuthModal "or" divider |
| GlassButton | Raw `<button class="btn-primary">` | GlobalErrorBoundary retry button |
| GlassLoadingState | Raw `progress_activity` + `softPulse` | AppShell Suspense fallbacks, AuthModal submit, GlobalErrorBoundary retry |
| SafeImage | `imgLoaded`/`imgError` signals | MovieCard |

---

## 6. API Audit

31 API endpoints under `src/routes/api/`. All SolidStart/Nitro handlers. Pattern: `interface APIEvent { request: Request }`. Admin endpoints extend `AdminAPIEvent` and call `requireAdmin(event)`.

### 6.1 TMDB integration (`src/core/tmdb/*`)

- **Files**: `tmdb.ts`, `discover.ts`, `discoverNormalize.ts`, `fetchHelpers.ts`, `genres.ts`.
- **Architecture**: All TMDB calls go through client-side `API = "/api/media"` constant. On server (SSR), `apiBaseUrl()` prepends `getBaseUrl()` from `VITE_APP_BASE_URL`. API key injected server-side; client never holds `TMDB_API_KEY`.
- **Caching (3 layers)**:
  1. `apiCache.ts` — in-memory Map (max 300 entries, LRU-evicted), 10-min TTL for TMDB.
  2. `tmdbCache.ts` — client-side helper checking localStorage (`cinelog_tmdb_cache`, 24h TTL) then falling back to `GET /api/tmdb-cache?keys=...` (5s timeout per chunk, 200 keys per chunk).
  3. Supabase `tmdb_cache` table — server-side shared cache (7-day expiry, UNIQUE on `(media_type, tmdb_id)`, public SELECT RLS, service-role-only writes).
- **Retry policy**: `fetchWithRetry` makes up to 2 attempts (1 retry). Retries on 5xx + network `TypeError`. NEVER retries `AbortError` (timeout) or 4xx. `TMDBError` carries `status` + `endpoint` for caller-side 404 silencing.
- **Timeout**: `fetchWithTimeout` uses `AbortController` with `TMDB_FETCH_TIMEOUT_MS = 10_000` ms.
- **Key entry points** in `tmdb.ts`: `fetchTmdbDetails`, `fetchPersonDetails`, `fetchPersonCombinedCredits`, `fetchTmdbMetadata` (strips credits after extracting director + castList), `fetchTmdbMetadataBatch` (chunked parallel fetch, `CHUNK_SIZE=20`), `fetchSeasonDetails`, `fetchCollectionDetails`, `fetchTitleWatchProviders`, `pickTrailer` (YouTube preferred, Vimeo fallback), `fetchAnyVideoKey`.
- **Discover layer** (`discover.ts`): `discoverMovies`, `discoverTv`, `getRecommendations`, `getTrending`, `getTopRatedMovies`, `searchMulti`, `fetchTitleDirector`, `getNowPlaying`, `getUpcoming`, `getTopRatedTv`, `getOnTheAir`, `getWatchProviderList`, `discoverMoviesWithProvider`, `discoverTvWithProvider`, `getWatchProviderListTv`.
- **Preferences wiring**: `tmdbFetch` rewrites `language=en-US` to `effectiveTMDBLanguage()` and appends `include_adult={true|false}` based on `tmdbIncludeAdult()`.
- **Genre maps**: Inlined `MOVIE_GENRES` (19 entries) + `TV_GENRES` (16 entries) so discover cards don't need a second `/genre` round-trip.

### 6.2 OMDB integration (`src/core/omdb/omdb.ts`)

- **Status**: **Legacy / largely superseded** by MDBList via `/api/media/ratings`.
- **Key issue**: `OMDB_KEY = import.meta.env.VITE_OMDB_API_KEY` (line 5) — **this key IS shipped to the browser bundle** (VITE_ prefix), unlike TMDB/MDBList/AniList which route through server proxies.
- **Caching**: `cachedFetch` with `OMDb_TTL = 24h`. Prefers IMDb ID lookup (`?i=`) over title (`?t=`).
- **Returns**: `{ imdb, rt, director, actors, writer, plot, rated, year, runtime }`.
- **Usage**: `useLazyImdbRating.ts` and `useMdbListRatings.ts` both use the MDBList route, not OMDB directly. OMDB remains only as a fallback for legacy callers.
- **Recommendation**: Either delete OMDB or wrap it in a server proxy like `/api/media/omdb-ratings`.

### 6.3 AniList integration (`src/lib/anilist/*`)

- **Files**: `client.ts`, `queries.ts`, `types.ts`, `index.ts`.
- **Architecture**: All requests route through `/api/anilist` proxy. Server injects `ANILIST_ACCESS_TOKEN` if set.
- **Caching**: 5-min in-memory response cache (`CACHE_TTL_MS = 5*60*1000`). 30-min TTL override for details fetch.
- **Request dedup**: Identical `query::JSON.stringify(variables)` keys share a single in-flight Promise via `.then(onFulfilled, onRejected)` (NOT `.finally` to avoid unhandled rejection noise).
- **Rate-limit aware**: Reads `X-RateLimit-Remaining` and `X-RateLimit-Reset` headers. If `remaining < 5` AND `resetAt` known AND wait < 60s, blocks next request until reset. On 429: honors `Retry-After` header, falls back to `min(30s, 1000 * 2^attempt)`.
- **Retry policy**: Up to 3 retries (default) with exponential backoff. 5xx → 500ms, 1s, 2s. 403 outage (body contains "temporarily disabled" or "severe stability issues") → 2s, 4s, 8s. Network errors / AbortError → 500ms, 1s, 2s. 4xx (non-429, non-403-outage) → non-retryable. GraphQL errors → non-retryable.
- **Per-call options**: `timeoutMs` (default 10s), `cacheTtlMs` (0 disables cache), `retries` (default 3).
- **Queries** (`queries.ts`): 12 query constants + 4 fragments (`MEDIA_CARD_FRAGMENT`, `MEDIA_DETAILS_FRAGMENT`, `CHARACTER_FRAGMENT`, `STAFF_FRAGMENT`, `RELATION_FRAGMENT`). Functions: `fetchMediaDetails`, `fetchTrendingAnime`, `fetchSeasonalAnime`, `fetchUpcomingAnime`, `fetchTopRatedAnime`, `fetchPopularAnime`, `fetchHiddenGemsAnime`, `fetchAnimeMovies`, `searchAnime`, `fetchCurrentlyAiring`, `fetchFinishedAnime`, `fetchAnimeRecommendations`. `currentAniListSeason(date)` maps month→season.
- **Note on themes**: `openings`/`endings` fields were removed from AniList's GraphQL schema (queries.ts:90-97 comment); the legacy `AniListThemeEntry` type is kept for backwards-compat.

### 6.4 MDBList integration

- **Used by**: `/api/media/ratings` and `useLazyImdbRating.ts` + `useMdbListRatings.ts`.
- **`useLazyImdbRating.ts`**: Lazy IntersectionObserver-based rating fetch. 3 layers: module-level LRU cache (500 entries) → in-flight dedup Set → IntersectionObserver (rootMargin `"200px 0px"`, threshold 0, disconnects after first intersection).
- **`/api/media/ratings`** (server proxy): `https://api.mdblist.com/tmdb/{movie|show}/{tmdbId}?apikey=KEY`. Maps `tv`/`show` → `show`. Returns `{ imdb, rottenTomatoes, metacritic }` each `{score, votes}` or null. 24h browser cache + 7d SWR. No retries.

### 6.5 Providers plugin architecture (`src/lib/providers/*`)

- **Files**: `BaseProvider.ts`, `AniListProvider.ts`, `index.ts`.
- **`MetadataProvider` interface** (`BaseProvider.ts:84-124`): `id`, `name`, `icon`, `canHandle(mediaType)`, and optional methods `getTrending`, `getSeasonal`, `getUpcoming`, `getTopRated`, `search`, `getRecommendations`, `getDetails`.
- **`ProviderRegistry` class**: Walks registered providers in priority order, calls first one that `canHandle(mediaType)` AND implements the requested method. Catches errors per-provider and returns empty/null (fail-soft).
- **Registered providers**: Only `AniListProvider` is registered (idempotent by `provider.id`). TMDB and MDBList are NOT wrapped as `MetadataProvider`s yet (their call sites are too numerous — `index.ts:9-12` comment).
- **`AniListProvider`**: Handles `mediaType === "anime" || "manga"`. Wraps `fetchTrendingAnime`, `fetchSeasonalAnime`, etc. Each method fetches AniList IDs then converts to TMDB titles via `anilistMediaToTmdbTitles` (uses `getTmdbId(anilistId)` + `fetchTmdbMetadataBatch`).

### 6.6 Email system (`src/lib/email/*`)

- **Files**: `renderer.ts`, `templates/base.ts`, `templates/reminder.ts`, `templates/weeklyRecap.ts`, `templates/newSeason.ts`, `templates/continueWatching.ts`, `templates/recommendations.ts`, `templates/syncStatus.ts`.
- **Renderer** (`renderer.ts:113-176`): Single `renderEmailTemplate(type, context)` switch over `NotificationType = "reminder" | "weekly_recap" | "new_season" | "continue_watching" | "recommendations" | "sync_status"`. Falls back to base template with escaped `message` for unknown types.
- **Base template**: Dark-themed (`background:#0a0a0a`, `color:#f5f5f5`), gold wordmark (`🎬 CineLog` in `#f5c842`), max-width 600px container, footer linking to `/settings/notifications`. Inline CSS only (Resend strips `<style>` tags).
- **Templates**: 6 templates for different notification types.
- **Isomorphic**: All templates are pure string builders, safe to import from both server routes and browser code (the browser-side fallback path in `useNotifications.ts` renders HTML client-side).

### 6.7 Web Push (`src/routes/api/push/*`, `src/features/notifications/*`)

- **Endpoints**: `/api/push/send` (user-initiated), `/api/push/send-admin` (cron-initiated), `/api/push/status` (diagnostic).
- **Client hook** (`usePushSubscription.ts`): Detects browser support, fetches VAPID public key from `app_config.vapid_public_key`, requests Notification.permission, calls `pushManager.subscribe`, persists to `push_subscriptions` table. `unsubscribe()` cleans up both browser + DB. `sendTest()` POSTs to `/api/push/send`. Only initializes on mount if `isSignedIn()` is true.
- **VAPID key handling (server-side)**: `configureVapid()` trims whitespace + strips surrounding quotes (Vercel dashboard sometimes preserves them). Auto-prepends `mailto:` to bare emails. Module-level cached flag.
- **`PushToggle.tsx`**: Self-contained UI block — shows subscribe/unsubscribe/test-send buttons.

### 6.8 Caching layers summary

| Layer | Location | TTL | Scope |
|---|---|---|---|
| In-memory TMDB cache | `src/shared/utils/apiCache.ts` | 10 min | Per-session; SSR-safe (module-level) |
| In-memory OMDb cache | `src/shared/utils/apiCache.ts` | 24 h | Same as above |
| In-memory AniList cache | `src/lib/anilist/client.ts` | 5 min (30 min for details) | Same |
| In-flight dedup | `apiCache.ts`, `anilist/client.ts` | n/a | Shares Promise for concurrent identical requests |
| localStorage TMDB cache | `src/shared/utils/tmdbCache.ts` (`cinelog_tmdb_cache`) | 24 h | Per-browser; pruned on every write |
| Lazy IMDb rating LRU | `src/shared/hooks/useLazyImdbRating.ts` | never expires (LRU 500) | Per-session module-level |
| Supabase `tmdb_cache` table | DB | 7 days (`expires_at`) | Cross-user shared |
| Vercel CDN | via `Cache-Control` headers | varies | Cross-user edge cache |
| `app_config` settings | DB | n/a (read every page load) | Admin-managed |

### 6.9 Error handling, retries, fallbacks

- **TMDB**: `fetchWithRetry` (2 attempts, 1s/2s backoff, retries 5xx + network TypeError, never retries AbortError/4xx). `TMDBError` carries status for caller-side 404 silencing.
- **AniList**: 4 retries (3 retries + initial), exponential backoff. Retries 5xx (500ms/1s/2s), 403-outage (2s/4s/8s), network/AbortError (500ms/1s/2s). 429 honors `Retry-After`.
- **MDBList**: No retries — single fetch. Non-2xx logged with body text, returns 502.
- **TMDB cache route**: No retries. Server-side errors return 500 with `error.message`.
- **Push send**: Per-subscription try/catch; 404/410 deletes the row, other errors logged but don't abort the batch.
- **Email send**: Resend 4xx/5xx mapped to 503. Mock mode (console.log) when `RESEND_API_KEY` missing.
- **Anime mappings**: Browser write failure is non-fatal — populates in-memory cache anyway and returns false (caller doesn't surface error).
- **Activity log / Login history**: Fire-and-forget; errors logged to console only.
- **Audit log** (`auditLog.ts`): NEVER throws — catches own errors and logs to stderr. The actual admin operation should never fail because of an audit-logging failure.

### 6.10 Rate limiting

**All rate limiting is in-memory** (Map on the module). State is lost on serverless cold-start.

| Endpoint | Limit | Window | Keyed by |
|---|---|---|---|
| `/api/account/delete` | 5 failures | 15 min | IP |
| `/api/admin/auth` | 5 failures | 15 min | IP |
| `/api/push/send` | 30 sends | 1 min | callerUid |
| `/api/push/status` | 20 requests | 1 min | IP |
| `/api/email/send` | 10 sends | 24 h | effectiveUserId (cron bypasses) |

**No DB-backed rate limiting exists.** The `rate_limits` setting in `app_config` (`api_per_min: 60`, `auth_attempts_per_hr: 20`, `upload_mb_per_day: 50`) is admin-configurable but **not actually enforced anywhere in the codebase** — it's documentation only.

### 6.11 CORS configuration

- **`vercel.json`** sets global security headers (CSP, HSTS, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy).
- **CSP**: `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https: blob:; media-src 'self' https:; connect-src 'self' https://*.supabase.co https://api.themoviedb.org https://www.omdbapi.com https://image.tmdb.org https://vercel.live; frame-src 'self' https://vercel.live https://www.youtube-nocookie.com https://www.youtube.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; manifest-src 'self'`.
- **Per-route CORS**: `/api/media/[...path]` and `/api/media/ratings` have explicit `Access-Control-Allow-Origin: *`, `Allow-Methods: GET, OPTIONS`, `Allow-Headers: Content-Type`, `Max-Age: 86400`. All other routes: no CORS headers (same-origin only).

### 6.12 API problems

1. **In-memory rate limiters reset on every Vercel cold-start.** A determined attacker could trigger cold starts to reset the rate limit. For the admin auth route (5 failures / 15 min), this means an attacker who can force cold starts gets unlimited attempts.
2. **Admin mutation routes have no rate limiting.** Only `requireAdmin()` is called on POST/PATCH/DELETE for `/api/admin/{collections,content,announcements,users,feature-flags,...}`.
3. **No enum validation on admin inputs** (`admin/announcements.ts`, `admin/content.ts`). Postgres enum constraints will reject invalid values, returning a 500 that may leak DB error message.
4. **`rate_limits` in `app_config` is documentation-only** — not enforced anywhere.
5. **OMDB API key exposed in browser bundle** (`core/omdb/omdb.ts:5`).
6. **No `POST /api/admin/tmdb-cache/refresh?id=<uuid>`** — documented as TODO but not implemented.
7. **`POST /api/admin/content/reorder`** — documented in header comment but not a separate route (folded into PATCH).
8. **`DELETE /api/admin/users?id=<uuid>`** — documented in header comment but only GET and PATCH exported (DELETE folded into PATCH via `deleted_at` soft-delete).

### 6.13 API improvements

1. Migrate rate limiters to DB-backed storage (e.g., `rate_limit_buckets` table or Upstash Redis).
2. Add per-admin-per-action rate limiter on admin mutation routes.
3. Add explicit enum validation on admin inputs.
4. Enforce `rate_limits` from `app_config`, or remove the setting.
5. Remove or proxy the OMDB integration.
6. Implement `POST /api/admin/tmdb-cache/refresh?id=<uuid>`.
7. Add `worker-src 'self'` to CSP (explicitly allows `/sw.js`).
8. Add `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp` for process isolation.

---

*(Sections 7–28 continue in the next part of the report due to length.)*

---

## 7. Database Audit

29 migration files under `supabase/migrations/` + 3 standalone scripts under `scripts/`.

### 7.1 Migration files inventory

| # | File | Purpose |
|---|------|---------|
| 01 | `01_user_presets.sql` | Creates `user_presets` table + RLS (owner-only) + updated_at trigger |
| 02 | `02_profile_favorites.sql` | Adds `favorite_movie_id`, `favorite_series_id`, `favorite_director_id`, `favorite_genre`, `banner_override_path` to `profiles` |
| 03 | `03_profile_banner_system.sql` | Adds `banner_type` (CHECK constraint) + `banner_url` to `profiles` |
| 04 | `04_profile_display_name_initialized.sql` | Adds `display_name_initialized` boolean to `profiles` |
| 05 | `05_fix_external_ids_rls.sql` | **Security fix:** drops overly-permissive `external_ids_select_authenticated`, replaces with vault-ownership-checked SELECT/INSERT/UPDATE/DELETE |
| 06 | `06_fix_username_availability.sql` | Creates `is_username_available(text) RETURNS boolean` SECURITY DEFINER; `authenticated`-only EXECUTE |
| 07 | `20260720_performance_indexes_and_tmdb_cache_rls.sql` | tmdb_cache RLS; vault partial indexes (`idx_vault_active`, `idx_vault_status`, `idx_vault_identity`); episode_progress indexes; tmdb_cache indexes |
| 08 | `20260720_performance_fix_remaining.sql` | UNIQUE constraint `tmdb_cache_media_type_tmdb_id_key` on `(media_type, tmdb_id)` |
| 09 | `20260721_admin_phase1.sql` | Adds `is_admin`+`admin_disabled_at` to `profiles`; creates `admin_actions` (append-only) + `app_config` tables; `protect_admin_columns()` trigger; seeds `feature_flags`, `global_settings`, `tmdb_cache_stats`; promotes `dahayataman@gmail.com` to admin |
| 10 | `20260722_admin_phase2.sql` | Creates `announcements` + `featured_content` tables + `homepage_sections` row in `app_config` |
| 11 | `20260723_admin_phase3.sql` | Creates 4 materialized views (`mv_admin_user_growth`, `mv_admin_active_users`, `mv_admin_content_engagement`, `mv_admin_top_titles`); `refresh_admin_analytics()` function; pg_cron job `refresh_admin_analytics` at `5 * * * *` (hourly minute 5); `maintenance_runs` table; 6 maintenance functions; seeds 6 `app_config` settings keys |
| 12 | `20260724_universe_default_view_franchise.sql` | Adds `'franchise'` to `universe_default_view_type` enum |
| 13 | `20260725_universe_entry_incident_year.sql` | Adds `incident_year INT` to `curated_universe_entries` + index |
| 14 | `20260729_add_archived_at_to_collections.sql` | Adds `archived_at` to `collections`; adds `order_index` to `collection_entries`; creates `universe_phases` table (admin-only writes) |
| 15 | `20260730_add_social_and_profile_fields.sql` | Adds `social_links` JSONB + `is_public` boolean to `profiles`; creates `follows` table |
| 16 | `20260731_public_profile_lookup.sql` | Creates `get_public_profile_by_username(text)` and `get_public_vault_by_user(uuid)` SECURITY DEFINER functions |
| 17 | `20260801_add_user_preferences_ext.sql` | Adds `prefs_json JSONB` to `user_preferences` |
| 18 | `20260801_fix_maintenance_rls.sql` | **Security fix:** revokes EXECUTE on 6 maintenance functions from `authenticated/anon/public`; grants to `service_role` only. Tightens `admin_actions` + `maintenance_runs` INSERT to require active admin. Drops `tmdb_cache` INSERT/UPDATE policies (service-role-only writes). |
| 19 | `20260801_add_login_history.sql` | Creates `login_history` table (owner-only RLS, no UPDATE/DELETE) |
| 20 | `20260801_add_upcoming_notifications.sql` | Creates `notifications` + `user_reminders` tables (owner-only RLS) |
| 21 | `20260801_add_anime_mappings.sql` | Creates `anime_mappings` table (public read, authenticated write); seeds `anime_settings` in `app_config` |
| 22 | `20260802_follows_anon_read.sql` | Adds anon SELECT policy on `follows` |
| 23 | `20260802_remove_social_module.sql` | **Drops** `follows` table, `get_public_profile_by_username`, `get_public_vault_by_user`, `profiles.social_links`, `profiles.is_public` (social module removed) |
| 24 | `20260802_add_push_subscriptions.sql` | Creates `push_subscriptions` table (owner-only RLS, UNIQUE on `(user_id, endpoint)`); `set_push_subscriptions_updated_at()` trigger; seeds `vapid_public_key` in `app_config` |
| 25 | `20260803_add_weekly_recap_preferences.sql` | Adds `weekly_recap_last_sent TIMESTAMPTZ` to `user_preferences`; creates `get_users_for_weekly_recap(INTEGER)` + `mark_weekly_recap_sent(UUID)` SECURITY DEFINER functions; schedules pg_cron job `weekly_recap` at `0 9 * * *` (daily 09:00 UTC) using `pg_net.http_post` |
| 26 | `20260804_add_get_user_email_rpc.sql` | Creates `get_user_email(UUID) RETURNS TEXT` SECURITY DEFINER (search_path pinned to `'auth'`); admin check inside function |
| 27 | `20260804_add_purge_soft_deleted_vault.sql` | Creates `purge_soft_deleted_vault(INT)` SECURITY DEFINER (service-role-only); cascades deletes to `episode_progress` + `collection_entries` |
| 28 | `20260805_create_banners_bucket.sql` | Creates `banners` (5MB, jpeg/png/webp) + `avatars` (2MB) Storage buckets with public-read + per-uid-folder-write RLS policies |
| 29 | `20260806_fix_user_preferences_rls.sql` | **Bug fix:** adds missing INSERT policy on `user_preferences` (upsert was failing with 42501) |

### 7.2 Complete table list

#### Application data tables (18)

| Table | PK | Notable columns | FKs |
|-------|----|----|-----|
| `profiles` | `id UUID` (= `auth.users.id`) | username (citext, UNIQUE), display_name, display_name_initialized, avatar_url, banner_url, banner_type (CHECK: upload\|url\|favorite_movie\|default), banner_override_path, bio, country, language_code, timezone, is_admin, admin_disabled_at, scheduled_deletion_at, deleted_at, favorite_movie_id/series_id/director_id TEXT, favorite_genre TEXT, created_at, updated_at | — |
| `user_preferences` | `id UUID` | user_id UUID (UNIQUE 1:1 → profiles), theme, accent_color, density, spoiler_level, adult_content, preferred_content, vault_view, discover_view, collection_view, default_sort, country, language_code, timezone, **prefs_json JSONB**, **weekly_recap_last_sent TIMESTAMPTZ**, created_at, updated_at | user_id → profiles ON DELETE CASCADE |
| `vault` | `id UUID` | user_id, tmdb_id INT, media_type (movie\|tv), status (planned\|watching\|completed\|on_hold\|dropped), rating, notes, is_favorite, is_pinned, progress_minutes, watched_on, started_at, completed_at, last_activity_at, rewatch_count, rewatch_dates text[], season_dates JSONB, season_rewatch_count INT, season_rewatch_dates JSONB, deleted_at, created_at, updated_at | user_id → profiles ON DELETE CASCADE; UNIQUE(user_id, tmdb_id, media_type) |
| `episode_progress` | `id UUID` | vault_id, season_number, episode_number, is_completed, progress_minutes, watched_at, created_at, updated_at | vault_id → vault ON DELETE CASCADE |
| `collections` | `id UUID` | user_id (nullable for curated), name, description, collection_type (user\|curated\|smart), view_mode, sort_mode, color, cover_url, banner_url, archived_at, deleted_at, created_at, updated_at | user_id → profiles ON DELETE CASCADE |
| `collection_entries` | `id UUID` | collection_id, vault_id, position, order_index, created_at | collection_id → collections; vault_id → vault |
| `curated_universes` | `id UUID` | slug (UNIQUE), name, description, default_view (timeline\|release\|story\|franchise), color, cover_url, banner_url, created_at, updated_at | — |
| `curated_universe_entries` | `id UUID` | universe_id, tmdb_id INT, media_type, position, release_position, story_position, timeline_position, incident_year INT (nullable), note, created_at | universe_id → curated_universes ON DELETE CASCADE |
| `universe_phases` | `id UUID` | universe_id, label, description, before_entry_id TEXT, order_index, created_at, updated_at | universe_id → curated_universes ON DELETE CASCADE |
| `user_universe_subscriptions` | `id UUID` | user_id, universe_id, is_pinned, custom_color, custom_cover, custom_banner, custom_sort, created_at, updated_at | user_id → profiles; universe_id → curated_universes |
| `user_presets` | `id UUID` | user_id, name, version SMALLINT (CHECK >0), filters JSONB, created_at, updated_at | user_id → profiles ON DELETE CASCADE |
| `external_ids` | `id UUID` | vault_id, provider (imdb\|trakt\|anilist\|myanimelist\|tvdb\|tvmaze), external_id, created_at, updated_at | vault_id → vault |
| `import_export_jobs` | `id UUID` | user_id, job_type (import\|export), format (json\|csv), source, status, total_records, processed_records, failed_records, file_url, file_size_bytes, error_message, started_at, completed_at, created_at, updated_at | user_id → profiles |
| `activity_log` | `id UUID` | user_id, action (activity_action_type enum), entity_type, entity_id UUID, metadata JSONB, ip_address INET, user_agent, created_at | user_id → profiles (no explicit FK) |
| `login_history` | `id UUID` | user_id, ip_address TEXT, user_agent TEXT, login_at TIMESTAMPTZ | user_id → profiles ON DELETE CASCADE |
| `notifications` | `id UUID` | user_id, title, message, type TEXT, related_title_id TEXT, related_title_type, scheduled_for, sent_at, read_at, is_read, created_at | user_id → profiles ON DELETE CASCADE |
| `user_reminders` | `id UUID` | user_id, tmdb_id TEXT, title_type, release_date DATE, is_scheduled, notification_sent, created_at; UNIQUE(user_id, tmdb_id) | user_id → profiles ON DELETE CASCADE |
| `push_subscriptions` | `id UUID` | user_id, endpoint TEXT, keys JSONB `{p256dh, auth}`, expires_at, created_at, updated_at; UNIQUE(user_id, endpoint) | user_id → profiles ON DELETE CASCADE |
| `anime_mappings` | `id UUID` | tmdb_id INT (UNIQUE), tmdb_type (movie\|tv), anilist_id INT, anilist_type (ANIME\|MANGA), title, match_confidence (high\|medium\|low\|manual), created_by, created_at, updated_at | — |
| `tmdb_cache` | `id UUID` | media_type, tmdb_id INT, data JSONB, expires_at, fetched_at, created_at, updated_at; UNIQUE(media_type, tmdb_id) | — |

#### Admin tables (5)

| Table | PK | Notable columns |
|-------|----|----|
| `admin_actions` | `id UUID` | admin_id → profiles ON DELETE RESTRICT, action TEXT, entity_type, entity_id, payload JSONB, ip_address INET, user_agent, created_at. **Append-only** (no UPDATE/DELETE policies). |
| `app_config` | `key TEXT` | value JSONB, updated_at, updated_by → profiles ON DELETE SET NULL |
| `announcements` | `id UUID` | type (banner\|toast\|modal), severity (info\|success\|warning\|error), title, body, cta_label, cta_href, is_dismissible, is_active, starts_at, ends_at, target_audience (all\|guests\|authenticated), created_by, deleted_at, created_at, updated_at |
| `featured_content` | `id UUID` | slot (hero\|spotlight\|rail\|pinned\|editor_pick), tmdb_id, media_type, title_override, note, tagline, position, is_active, starts_at, ends_at, created_by, deleted_at, created_at, updated_at; UNIQUE(slot, tmdb_id, media_type) |
| `maintenance_runs` | `id UUID` | admin_id → profiles ON DELETE SET NULL, operation, status (running\|success\|failed\|partial), rows_affected BIGINT, details JSONB, error, started_at, finished_at |

### 7.3 Relationships (foreign keys)

```
auth.users.id ←─── profiles.id (1:1, implicit)
profiles.id ←─── user_preferences.user_id (1:1, CASCADE)
profiles.id ←─── vault.user_id (1:N, CASCADE)
profiles.id ←─── collections.user_id (1:N, CASCADE)
profiles.id ←─── user_presets.user_id (1:N, CASCADE)
profiles.id ←─── user_universe_subscriptions.user_id (1:N)
profiles.id ←─── activity_log.user_id (1:N)
profiles.id ←─── login_history.user_id (1:N, CASCADE)
profiles.id ←─── notifications.user_id (1:N, CASCADE)
profiles.id ←─── user_reminders.user_id (1:N, CASCADE)
profiles.id ←─── push_subscriptions.user_id (1:N, CASCADE)
profiles.id ←─── import_export_jobs.user_id (1:N)
profiles.id ←─── admin_actions.admin_id (1:N, RESTRICT)
profiles.id ←─── app_config.updated_by (1:N, SET NULL)
profiles.id ←─── announcements.created_by (1:N, SET NULL)
profiles.id ←─── featured_content.created_by (1:N, SET NULL)
profiles.id ←─── maintenance_runs.admin_id (1:N, SET NULL)

vault.id ←─── episode_progress.vault_id (1:N, CASCADE)
vault.id ←─── collection_entries.vault_id (1:N)
vault.id ←─── external_ids.vault_id (1:N)

collections.id ←─── collection_entries.collection_id (1:N)
curated_universes.id ←─── curated_universe_entries.universe_id (1:N, CASCADE)
curated_universes.id ←─── universe_phases.universe_id (1:N, CASCADE)
curated_universes.id ←─── user_universe_subscriptions.universe_id (1:N)
```

### 7.4 Indexes

**Vault**: `idx_vault_active` (user_id, created_at DESC) WHERE deleted_at IS NULL (partial); `idx_vault_status` (user_id, status) WHERE deleted_at IS NULL; `idx_vault_identity` (user_id, tmdb_id, media_type) WHERE deleted_at IS NULL.

**episode_progress**: `idx_ep_latest` (vault_id, watched_at DESC NULLS LAST, updated_at DESC); `idx_ep_vault_id` (vault_id).

**tmdb_cache**: `idx_tmdb_cache_media_lookup` (media_type, tmdb_id); `idx_tmdb_cache_expires` (expires_at); `tmdb_cache_media_type_tmdb_id_key` UNIQUE.

**profiles**: `idx_profiles_is_admin` (is_admin) WHERE is_admin = TRUE (partial).

**admin_actions**: `idx_admin_actions_created_at` (created_at DESC); `idx_admin_actions_admin_id` (admin_id, created_at DESC); `idx_admin_actions_action` (action, created_at DESC); `idx_admin_actions_entity` (entity_type, entity_id) WHERE entity_type IS NOT NULL (partial).

**announcements**: `idx_announcements_active_window` (is_active, starts_at, ends_at) WHERE deleted_at IS NULL; `idx_announcements_type` (type) WHERE deleted_at IS NULL.

**featured_content**: `idx_featured_content_slot_active` (slot, position) WHERE deleted_at IS NULL AND is_active = TRUE; `idx_featured_content_tmdb` (tmdb_id, media_type) WHERE deleted_at IS NULL.

**maintenance_runs**: `idx_maintenance_runs_started_at` (started_at DESC); `idx_maintenance_runs_operation` (operation, started_at DESC).

**Materialized views (unique indexes for CONCURRENT refresh)**:
- `idx_mv_admin_user_growth_day` UNIQUE (day)
- `idx_mv_admin_active_users_day` UNIQUE (day)
- `idx_mv_admin_content_engagement_day` (day DESC)
- `idx_mv_admin_content_engagement_action` (action, day DESC)
- `idx_mv_admin_top_titles_tmdb` UNIQUE (tmdb_id, media_type)

**login_history**: `login_history_user_id_login_at_idx` (user_id, login_at DESC).

**notifications**: `notifications_user_created_idx` (user_id, created_at DESC); `notifications_user_unread_idx` (user_id) WHERE is_read = FALSE (partial).

**user_reminders**: `user_reminders_user_idx` (user_id); `user_reminders_release_idx` (release_date) WHERE is_scheduled = TRUE AND notification_sent = FALSE (partial).

**push_subscriptions**: `push_subscriptions_user_idx` (user_id); `push_subscriptions_expires_idx` (expires_at) WHERE expires_at IS NOT NULL (partial).

**anime_mappings**: `anime_mappings_tmdb_id_unique` UNIQUE (tmdb_id); `anime_mappings_anilist_id_idx` (anilist_id); `anime_mappings_tmdb_type_idx` (tmdb_type).

**curated_universe_entries**: `curated_universe_entries_incident_year_idx` (universe_id, incident_year).

**universe_phases**: `idx_universe_phases_universe` (universe_id, order_index).

**user_preferences**: `user_preferences_weekly_recap_idx` (weekly_recap_last_sent).

**user_presets**: `idx_user_presets_user_id`; `idx_user_presets_user_id_created_at`.

### 7.5 RLS policies summary

| Table | SELECT | INSERT | UPDATE | DELETE | Notes |
|-------|--------|--------|--------|--------|-------|
| `profiles` | `id = auth.uid()` | — | `id = auth.uid()` (but `is_admin`/`admin_disabled_at` protected by `protect_admin_columns()` trigger) | — | No DELETE policy → user can't delete own profile |
| `user_preferences` | `auth.uid() = user_id` | `auth.uid() = user_id` (added in 20260806 fix) | `auth.uid() = user_id` | — | — |
| `vault` | `user_id = auth.uid()` | `user_id = auth.uid()` | `user_id = auth.uid()` | `user_id = auth.uid()` | All exclude soft-deleted via partial index |
| `episode_progress` | EXISTS(vault owned by user) | EXISTS | EXISTS | EXISTS | Inherits ownership through vault |
| `collections` | USER: `user_id = auth.uid()`; CURATED: `true` | owner/admin | owner/admin | owner/admin | — |
| `collection_entries` | EXISTS(collection owned by user) | EXISTS | EXISTS | EXISTS | Inherits through collection |
| `curated_universes` | `true` (all authenticated) | admin-only | admin-only | admin-only | — |
| `curated_universe_entries` | `true` | admin-only | admin-only | admin-only | — |
| `universe_phases` | `true` (authenticated) | admin-only | admin-only | admin-only | — |
| `user_universe_subscriptions` | `user_id = auth.uid()` | `user_id = auth.uid()` | `user_id = auth.uid()` | `user_id = auth.uid()` | — |
| `user_presets` | `auth.uid() = user_id` | `auth.uid() = user_id` | `auth.uid() = user_id` | `auth.uid() = user_id` | — |
| `external_ids` | EXISTS(vault owned by user) | EXISTS | EXISTS | EXISTS | Fixed in 05_fix_external_ids_rls.sql |
| `import_export_jobs` | `user_id = auth.uid()` | `user_id = auth.uid()` | — | — | — |
| `activity_log` | `user_id = auth.uid()` | `user_id = auth.uid()` | — | — | Append-only for users |
| `login_history` | `user_id = auth.uid()` | `user_id = auth.uid()` | — (no UPDATE policy) | — (no DELETE policy) | Cannot tamper with audit trail |
| `notifications` | `user_id = auth.uid()` | `user_id = auth.uid()` | `user_id = auth.uid()` | `user_id = auth.uid()` | — |
| `user_reminders` | `user_id = auth.uid()` | `user_id = auth.uid()` | — | `user_id = auth.uid()` | — |
| `push_subscriptions` | `user_id = auth.uid()` | `user_id = auth.uid()` | `user_id = auth.uid()` | `user_id = auth.uid()` | — |
| `anime_mappings` | `true` (public) | `true` (authenticated — but actual writes go through `/api/anime-mappings` server route) | `true` (authenticated) | — | Public metadata |
| `tmdb_cache` | `true` (public) | — (dropped in 20260801; service-role-only) | — (dropped in 20260801) | — (service-role-only) | Shared metadata; browser cannot poison cache |
| `admin_actions` | admin check (is_admin AND admin_disabled_at IS NULL) | admin check (tightened in 20260801) | — (no UPDATE policy) | — (no DELETE policy) | Append-only audit log |
| `app_config` | `true` (public) | admin-only | admin-only | admin-only | Feature flags/settings are public |
| `announcements` | `deleted_at IS NULL` (public) | admin-only | admin-only | admin-only (soft-delete) | — |
| `featured_content` | `deleted_at IS NULL` (public) | admin-only | admin-only | admin-only (soft-delete) | — |
| `maintenance_runs` | admin-only | admin-only (tightened in 20260801) | admin-only | — | — |

**Admin check predicate used everywhere**: `EXISTS(SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE AND admin_disabled_at IS NULL [AND deleted_at IS NULL])`.

### 7.6 Stored procedures / RPCs

| Function | Args | Returns | Security |
|----------|------|---------|----------|
| `is_username_available(p_username text)` | text | boolean | SECURITY DEFINER, search_path=public |
| `bump_app_config_updated_at()` | — | TRIGGER | plpgsql |
| `protect_admin_columns()` | — | TRIGGER | SECURITY DEFINER, search_path=public |
| `tg_announcements_updated_at()` | — | TRIGGER | plpgsql |
| `tg_featured_content_updated_at()` | — | TRIGGER | plpgsql |
| `set_push_subscriptions_updated_at()` | — | TRIGGER | plpgsql |
| `touch_anime_mappings_updated_at()` | — | TRIGGER | plpgsql |
| `refresh_admin_analytics()` | — | VOID | SECURITY DEFINER (service_role only since 20260801) |
| `purge_soft_deleted_profiles(days INT DEFAULT 90)` | INT | JSONB | SECURITY DEFINER (service_role only) |
| `purge_old_activity_log(days INT DEFAULT 180)` | INT | JSONB | SECURITY DEFINER (service_role only) |
| `purge_expired_tmdb_cache(days INT DEFAULT 30)` | INT | JSONB | SECURITY DEFINER (service_role only) |
| `purge_orphaned_collection_entries()` | — | JSONB | SECURITY DEFINER (service_role only) |
| `cleanup_old_admin_actions(days INT DEFAULT 365)` | INT | JSONB | SECURITY DEFINER (service_role only) |
| `vacuum_analyze_hint()` | — | JSONB | SECURITY DEFINER (service_role only) |
| `purge_soft_deleted_vault(days INT DEFAULT 30)` | INT | JSONB | SECURITY DEFINER (service_role only) |
| `get_users_for_weekly_recap(target_day INTEGER)` | INT | TABLE(user_id, display_name, username) | SECURITY DEFINER, STABLE |
| `mark_weekly_recap_sent(target_user_id UUID)` | UUID | VOID | SECURITY DEFINER |
| `get_user_email(user_id UUID)` | UUID | TEXT | SECURITY DEFINER, search_path='auth' |

**Dropped in migration 20260802** (social module removal):
- `get_public_profile_by_username(text)`
- `get_public_vault_by_user(uuid)`

### 7.7 Materialized views

| MV | Refresh | Source |
|----|---------|--------|
| `mv_admin_user_growth` | CONCURRENTLY (unique idx on `day`) | profiles (last 90 days) |
| `mv_admin_active_users` | CONCURRENTLY (unique idx on `day`) | activity_log (DAU/WAU/MAU per day, last 90 days) |
| `mv_admin_content_engagement` | non-concurrent | activity_log (vault/collection actions per day, last 90 days) |
| `mv_admin_top_titles` | non-concurrent | vault (top 100 most-vaulted titles, last 30 days) |

All refreshed by `refresh_admin_analytics()` called by pg_cron at `5 * * * *` (hourly minute 5).

### 7.8 Triggers

| Trigger | Table | When | Function |
|---------|-------|------|----------|
| `trg_user_presets_set_updated_at` | user_presets | BEFORE UPDATE | `set_updated_at()` |
| `trg_app_config_updated_at` | app_config | BEFORE UPDATE | `bump_app_config_updated_at()` |
| `trg_protect_admin_columns` | profiles | BEFORE UPDATE | `protect_admin_columns()` — raises exception if non-admin tries to change `is_admin`/`admin_disabled_at` |
| `trg_announcements_updated_at` | announcements | BEFORE UPDATE | `tg_announcements_updated_at()` |
| `trg_featured_content_updated_at` | featured_content | BEFORE UPDATE | `tg_featured_content_updated_at()` |
| `trg_push_subscriptions_updated_at` | push_subscriptions | BEFORE UPDATE | `set_push_subscriptions_updated_at()` |
| `anime_mappings_touch_updated_at` | anime_mappings | BEFORE UPDATE | `touch_anime_mappings_updated_at()` |

### 7.9 Storage buckets

Created in `20260805_create_banners_bucket.sql`:

| Bucket | Public | Size limit | MIME types | RLS |
|--------|--------|-----------|-----------|-----|
| `banners` | yes | 5 MB | jpeg, png, webp | Public SELECT (anon+auth); INSERT/UPDATE/DELETE only to `storage.foldername(name)[1] = auth.uid()::text` (per-uid folder) |
| `avatars` | yes | 2 MB | jpeg, png, webp | Same pattern |

**Pre-20260805 bug**: Banner uploads fell back to data URLs (~270KB base64) stored in `profiles.banner_url` because the bucket didn't exist. Existing data URLs still work; new uploads use Storage. `scripts/migrate_data_url_banners.ts` exists for backfilling but isn't auto-run.

### 7.10 pg_cron jobs

| Job name | Schedule | Command | Migration |
|----------|----------|---------|-----------|
| `refresh_admin_analytics` | `5 * * * *` (every hour at minute 5) | `SELECT public.refresh_admin_analytics();` | 20260723 |
| `weekly_recap` | `0 9 * * *` (daily at 09:00 UTC) | `SELECT net.http_post(url := format('%s/api/cron/weekly-recap', '<APP_URL>'), headers := jsonb_build_object('Content-Type', 'application/json', 'X-Cron-Secret', '<CRON_SECRET>'), body := '{}'::jsonb);` | 20260803 |

**⚠️ The `weekly_recap` cron command requires manual replacement of `<APP_URL>` and `<CRON_SECRET>` placeholders** before the migration will work.

**Extensions required**: `pg_cron` (in `extensions` schema), `pg_net` (in `extensions` schema), `pgcrypto` (for `gen_random_uuid()`).

### 7.11 Repository → table usage map

| Repository | Tables read | Tables written |
|-----------|------------|----|
| `VaultRepository` | vault | vault (insert/update/delete/restore) |
| `CollectionRepository` | collections, collection_entries | collections (CRUD + archive), collection_entries (CRUD + reorder + move) |
| `DashboardRepository` | vault, collections, collection_entries, episode_progress | — (read-only) |
| `DiscoverRepository` | vault, collections, collection_entries, curated_universes, curated_universe_entries, user_universe_subscriptions | — (read-only) |
| `EpisodeProgressRepository` | episode_progress | episode_progress (upsert, markCompleted, clear, deleteFrom) |
| `PresetRepository` | user_presets | user_presets (create, rename, delete) |
| `ProfileRepository` | profiles, user_preferences | profiles (create, update, avatar, bio, metadata, scheduleDeletion, restore, permanentlyDelete), user_preferences (upsert) |
| `animeMapping.ts` (free functions) | anime_mappings | anime_mappings (via `/api/anime-mappings` on browser, direct upsert on server) |
| `activityLog.ts` | — | activity_log (fire-and-forget insert) |
| `loginHistory.ts` | login_history | login_history (insert) |
| `sessions.ts` | — | (uses Supabase Auth API: `mfa.listFactors`, `mfa.unenroll`, `signOut({scope:"global"|"local"})`) |
| `settings.ts` | user_preferences | user_preferences (getUserSettings, saveUserSettings, saveUserPreference, saveExtendedPreference, resetUserSettings) |
| `stats.ts` | — | (pure functional calculators over in-memory `WatchlistItem[]`, no DB I/O) |
| `upcoming.ts` | notifications, user_reminders | notifications (insert), user_reminders (insert/delete) |

### 7.12 Unused / suspicious fields

**Confirmed unused (in `database.types.ts` but no code reads them)**:
- `import_export_jobs` table — defined in types and migration but **no repository or hook reads/writes it**. Reserved for future infrastructure.
- `external_ids` table — defined and has RLS policies fixed (migration 05), but migration comment says "currently empty (0 rows at audit time)" and no application code references it.
- `universe_phases.before_entry_id` — stored as TEXT (not UUID) to hold either a `curated_universe_entries.id` OR a TMDB id-as-string. Confusing dual-purpose column.
- `curated_universe_entries.position`/`release_position`/`story_position`/`timeline_position` — kept for backward-compat but `incident_year` is now the primary sort driver.
- `profiles.banner_override_path` — superseded by `banner_type` + `banner_url` per migration 03.
- `app_config` keys: `global_settings`, `tmdb_cache_stats`, `analytics_last_refresh` — seeded in migrations but `tmdb_cache_stats` not read by any code; `analytics_last_refresh` is read by `/api/admin/analytics`.

### 7.13 `database.types.ts` drift (outdated)

The `database.types.ts` file is **months out of date**:
- **Includes** `follows` table — **DROPPED** in migration 20260802.
- **Includes** `profiles.social_links` column — **DROPPED**.
- **Includes** `profiles.is_public` column — **DROPPED**.
- **Includes** `get_public_profile_by_username` and `get_public_vault_by_user` functions — **DROPPED**.
- **Missing** (exist in DB but not in types file): `admin_actions`, `app_config`, `announcements`, `featured_content`, `maintenance_runs` tables; all admin maintenance functions; `get_user_email`, `get_users_for_weekly_recap`, `mark_weekly_recap_sent` functions; `notifications`, `user_reminders`, `push_subscriptions`, `login_history` tables; `universe_phases` table; `user_preferences.prefs_json` and `weekly_recap_last_sent` columns; `vault.rewatch_dates`, `season_dates`, `season_rewatch_count`, `season_rewatch_dates` columns; `profiles.is_admin`, `admin_disabled_at` columns; `curated_universe_entries.incident_year` column.

**Recommendation**: Run `supabase gen types` to regenerate `database.types.ts` from the live schema.

### 7.14 Schema inconsistencies

1. **`database.types.ts` drift** (see §7.13) — the most significant inconsistency.
2. **`curated_universe_entries` has 4 position columns** but only `position` is actively used by the admin UI.
3. **`universe_phases.before_entry_id` is TEXT** storing either UUIDs or TMDB-id-strings — no constraint enforces which.
4. **`profiles.id` has no explicit FK to `auth.users.id`** in the types file, but the application assumes this 1:1 relationship everywhere.
5. **`activity_log.entity_id` is UUID** but application stores TMDB ids (numbers) in `metadata.tmdb_id` instead, leaving `entity_id` NULL.
6. **`vault.id` is typed as `text` in `get_public_vault_by_user` return** but as `uuid` in the table — the function casts `v.id::text`.
7. **`app_config.value` JSONB stores heterogeneous shapes** — strings (`vapid_public_key` as JSON string), objects (`feature_flags`, `homepage_sections`, `site_settings`), and objects-with-nested-objects. The client code at `usePushSubscription.ts:218-231` defensively handles both string and object shapes for `vapid_public_key`.
8. **Social module removal left orphaned migration** — migration `20260802_follows_anon_read.sql` added an anon-read policy on `follows`, then migration `20260802_remove_social_module.sql` (same day) dropped the entire table.

### 7.15 Database improvements

1. **Regenerate `database.types.ts`** via `supabase gen types`.
2. **Add `rules` JSONB column to `collections`** for smart rule persistence (currently throws `UnsupportedFeatureError`).
3. **Add `is_hidden` column to `user_universe_subscriptions`** (currently the `hiddenUniverses` memo always returns empty).
4. **Add explicit FK from `profiles.id` to `auth.users.id`**.
5. **Change `activity_log.entity_id` to TEXT** (or remove the column — TMDB ids are in `metadata.tmdb_id`).
6. **Constrain `universe_phases.before_entry_id`** to UUID OR add a `before_entry_kind` enum.
7. **Deprecate redundant position columns** on `curated_universe_entries`.
8. **Wire the `purge_soft_deleted_profiles` pg_cron job** — scheduled-deletion flow is documented but not automated.
9. **Run `scripts/migrate_data_url_banners.ts`** to backfill existing data-URL banners to Storage.
10. **Add DB-level UNIQUE constraint on `(user_id, name='Favorites')`** to prevent duplicate Favorites creation across concurrent tabs.

---

## 8. Authentication Audit

### 8.1 Google OAuth flow (PKCE)

- **Configuration** (`src/lib/supabase/browser.ts:132-139`): `persistSession: true`, `autoRefreshToken: true`, `detectSessionInUrl: true`, `flowType: "pkce"`.
- **Flow**:
  1. `signInWithGoogle(returnPath?)` in `useAuthActions.ts:117-137` calls `supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}${returnPath ?? "/profile"}` } })`.
  2. Browser redirects to Google consent screen → Google redirects to Supabase callback → Supabase redirects to `${origin}/auth/callback?code=...`.
  3. `src/routes/auth/callback.tsx` runs on the client (`isServer` guard). Calls `supabase.auth.exchangeCodeForSession(code)`.
  4. **PKCE verifier missing recovery**: If the user cleared browser cache mid-flow, the PKCE `code_verifier` cookie in localStorage is missing. `exchangeCodeForSession` fails with `"PKCE code verifier not found."`. The page then calls `supabase.auth.getSession()` — if a valid session exists, treats login as successful.
  5. Progressive UX: 4 status messages (`exchanging` → `checking` → `finalizing` → `redirecting`) with 300ms delay before final redirect.
  6. Redirect target: `getRedirectTarget(next)` only accepts relative paths starting with `/` (open-redirect protection). Default `/discover`.
- **Race condition fix** (`useAuth.ts:25-38, 188-258`): If `onAuthStateChange` listener is registered AFTER the URL has been parsed, the initial event is missed. Fix: `checkInitialSession()` runs once per browser session on first `useAuth()` mount, calling `getBrowserSession()` explicitly.

### 8.2 Email/password auth

- `signInWithEmail(email, password)` — `supabase.auth.signInWithPassword({ email, password })`.
- `signUpWithEmail(email, password)` — `supabase.auth.signUp({ email, password })`. If `data.session` is returned, email confirmation is OFF (immediate sign-in). If not, confirmation is ON (toast: "Check your email to confirm your account.").
- `signOut()` — `supabase.auth.signOut()` (default scope: `global`). **NOTE**: This signs the user out of ALL devices, not just the current one. The explicit `signOutGlobal()` exists for "Sign out everywhere" intent, suggesting the default should use `scope: "local"`.

### 8.3 Magic link

**Not implemented.** Searched for `signInWithOtp` — no matches. Supabase supports magic link via `supabase.auth.signInWithOtp({ email })` but CineLog does not use it.

### 8.4 Guest mode

**What works without auth**:
- Discover page (all TMDB calls go through `/api/media/*` proxy, no auth required).
- AniList enrichment (anon GraphQL queries via `/api/anilist` proxy).
- All public endpoints: `/api/feature-flags`, `/api/featured-content`, `/api/homepage-config`, `/api/anime-settings`, `/api/announcements`, `/api/tmdb-cache` (read), `/api/media/ratings`, `/api/anime-mappings` (POST — public writes allowed).
- Anime carousels on Discover.
- Spotlight, genre explorer, all Discover rails.
- Deep-link routes `/movie/:id` and `/tv/:id` (render Details modal with vault-aware state — guests see "Add to vault" CTA).

**What requires auth**:
- Vault (any read/write — RLS enforces `user_id = auth.uid()`).
- Collections (user collections; curated universes are public-read).
- Episode progress.
- User preferences sync.
- Profile page (own profile).
- Settings page.
- Push notifications (`usePushSubscription.ts` checks `isSignedIn()` in `onMount`).
- Email send.
- Account deletion.
- Admin panel.

**`useAuthModal`**: Module-level signal `authModalOpen`. Any component can call `openAuthModal()` to prompt sign-in. The `AuthModal` is rendered once in `AppShell`.

### 8.5 Identity linking (Google + email)

- **`linkProvider(provider: "google" | "apple")`** — `supabase.auth.linkIdentity({ provider, options: { redirectTo: `${origin}/settings/account` } })`.
- **`unlinkProvider(identity: UserIdentity)`** — `supabase.auth.unlinkIdentity(identity)`. Requires the full `UserIdentity` object. Supabase refuses to unlink the LAST identity. After successful unlink, calls `refreshUserFromServer()` to update the local `providers` array (because `unlinkIdentity` doesn't fire `onAuthStateChange`).
- **`linkEmailPassword(email, newPassword)`** — for OAuth-only users adding email/password. Calls `supabase.auth.updateUser({ email, password })`:
  - If `email` matches current email → just sets password, adds `email` to `providers`. No confirmation email.
  - If `email` differs → sends confirmation email to NEW address AND sets password. Password is usable immediately with the OLD email until the new email is confirmed.
- **`getUserIdentities()`** — `supabase.auth.getUserIdentities()` returns `UserIdentity[]` with `identity_id`, `provider`, `identity_data`.
- **`User.providers` field**: Derived from `supabaseUser.app_metadata?.providers ?? []` — single source of truth for which providers are connected.

### 8.6 2FA setup (`TwoFactorSetup.tsx`)

- **Flow**:
  1. On mount, `refreshFactors()` calls `supabase.auth.mfa.listFactors()`. Filters `data.totp` for `status === "verified"`.
  2. `startEnrollment()`: `supabase.auth.mfa.enroll({ factorType: "totp", issuer: "CineLog", friendlyName: "Authenticator app" })` → returns `{ id, totp: { qr_code, secret, uri } }`. Renders the `otpauth://` URI as a PNG data URL via the `qrcode` npm library.
  3. `verifyCode()`: `supabase.auth.mfa.challengeAndVerify({ factorId, code })` — single call that challenges AND verifies. On success: toast "Two-factor authentication enabled".
  4. `unenroll(factorId)`: `supabase.auth.mfa.unenroll({ factorId })`.
- **Security note**: After enabling 2FA, the current session stays at `aal1` (Authenticator Assurance Level 1) until the user re-authenticates. New device sign-ins will require the TOTP code (aal2). Standard Supabase MFA behavior.

### 8.7 Session management

- **Token storage**: **localStorage** (not cookies). The Supabase browser client is configured with `persistSession: true`, which stores the session JSON (access_token + refresh_token + user) under `sb-<project-ref>-auth-token` in localStorage.
- **Cookies**:
  - `sb-*-auth-token*` — Supabase session cookies. Set by the Supabase SDK itself. Parsed server-side by `getSupabaseAccessToken()` in `src/lib/supabase/admin/sessionCookie.ts` (handles chunked + base64-URL + plain JSON + raw JWT formats).
  - `cinelog_admin_session` — admin JWT cookie. HttpOnly, Secure, SameSite=Strict, Path=/, Max-Age=4h.
- **Refresh tokens**: `autoRefreshToken: true` on the browser client — Supabase refreshes the JWT in the background before expiry. Server client has `autoRefreshToken: false, persistSession: false`.
- **Multi-device**: Each browser/tab gets its own session in localStorage. `revokeAllSessions()` calls `supabase.auth.signOut({ scope: "global" })` which revokes ALL refresh tokens for the user across every device. `revokeCurrentSession()` uses `scope: "local"`.
- **SSR contract** (`session.ts:16-21`): The server has no localStorage, so `getServerSession()` always returns `null`. SSR renders the signed-out state; after hydration the browser client resolves the real session. Cookie forwarding is NOT implemented.

### 8.8 Admin auth (PIN + JWT + adminGuard)

- **Three-layer verification** (`adminGuard.ts:89-137`):
  1. **Cookie + JWT verification**: `getAdminCookie(event)` extracts `cinelog_admin_session`. `verifyAdminToken(token)` splits token into 3 parts, recomputes HMAC-SHA256 using `ADMIN_JWT_SECRET`, **constant-time comparison** of signatures, decodes payload, checks `exp > now`, validates `admin_id` and `email` are strings.
  2. **Database lookup**: `createAdminClient()` queries `profiles` for `id = payload.admin_id` where `deleted_at IS NULL`. Checks `is_admin = TRUE` and `admin_disabled_at IS NULL`.
  3. **PIN already verified**: The PIN was checked when the cookie was issued (in `/api/admin/auth` POST), so `requireAdmin()` does NOT re-check the PIN. The 4-hour cookie lifetime is the trust window.
- **Login flow** (`/api/admin/auth` POST):
  - Two paths: `mode: "session"` (OAuth user with access_token in body or cookie) or `mode: "password"` (email + password).
  - Both paths then call `verifyProfileAndIssueAdmin()`:
    - Looks up `profiles` (service-role client bypasses RLS).
    - Checks `is_admin = TRUE`, `admin_disabled_at IS NULL`.
    - **PIN verification (constant-time)**: `constantTimeEqual(pin, expectedPin)` where `expectedPin = process.env.ADMIN_PIN`.
    - Signs admin JWT via `signAdminToken({ admin_id, email })` (HS256, 4h exp).
    - Sets `cinelog_admin_session` cookie.
    - Audit logs to `admin_actions` with `{ action: "auth.login", payload: { email, ip, method } }`.
  - In-memory rate-limit: 5 failures per IP → 15-min lockout. State lost on cold-start.
- **Logout** (`DELETE /api/admin/auth`): Clears cookie. Best-effort audit log of `auth.logout`. Does NOT revoke the underlying Supabase session (the user stays signed into CineLog — admin access is revoked but consumer access remains).
- **Session check** (`GET /api/admin/auth`): Returns `{ ok: true, admin }` if `requireAdmin()` passes, else `{ ok: false }`.

### 8.9 Account deletion flow (`/api/account/delete`)

- **Why a server route**: The previous flow called `profileRepo.permanentlyDeleteProfile(uid)` directly from the browser using the anon-key client. But `profiles` RLS is `SELECT/UPDATE: id = auth.uid()` — DELETE is NOT included — so the call fails with RLS error.
- **Current flow**:
  1. `DeactivateAccountSheet` UI collects `confirmation` (must match user's email) and sends `{ confirmation, accessToken }` to `/api/account/delete`.
  2. Server resolves access_token from body OR cookie via `getSupabaseAccessToken()`.
  3. Verifies session via anon client `supabase.auth.getUser(accessToken)`.
  4. Verifies `confirmation.toLowerCase() === userEmail.toLowerCase()`.
  5. Hard-deletes `auth.users` row via `adminClient.auth.admin.deleteUser(userId)` — invalidates all refresh tokens immediately.
  6. Hard-deletes `profiles` row via `adminClient.from("profiles").delete().eq("id", userId)` — cascades to vault, collections, collection_entries, episode_progress, user_presets, user_preferences, user_universe_subscriptions, login_history, notifications, user_reminders, push_subscriptions, import_export_jobs.
  7. `activity_log` rows are NOT deleted (no FK to profiles) — anonymized via the `admin_id` SET NULL cascade on `admin_actions`. User activity_log rows reference `user_id` but the table has no FK constraint, so they remain (intentional for analytics).
  8. Idempotency: if `auth.users` row is already gone, continues with profile delete.
  9. Rate-limited per IP: 5 failures → 15-min lockout (in-memory, lost on cold-start).

### 8.10 Login history tracking

- `logLogin(userId, ip, userAgent)` inserts a row into `login_history`. IP is null (can't be reliably obtained client-side); userAgent from `navigator.userAgent`.
- Called from `useAuth.ts` in three places:
  1. `SIGNED_IN` event — only if `isFreshSignIn(session)` (session `created_at` within last 60 seconds).
  2. `TOKEN_REFRESHED` event — only if `shouldLogRefresh()` returns true. Rate-limited via localStorage key `cinelog:last_login_log:{uid}` with 6-hour window.
  3. `checkInitialSession()` — only if `isFreshSignIn(session) && shouldLogRefresh()`.
- RLS: owner-only SELECT/INSERT; no UPDATE/DELETE policy (can't tamper with audit trail).

### 8.11 Security: token storage, CSRF protection

- **Token storage**:
  - User sessions: localStorage (NOT httpOnly cookie). XSS-vulnerable (mitigated by strict CSP, but CSP allows `'unsafe-inline'` and `'unsafe-eval'`).
  - Admin sessions: httpOnly cookie (`cinelog_admin_session`). Not accessible to JavaScript. HttpOnly + Secure + SameSite=Strict.
  - Service-role key: server-only env var. `createAdminClient()` throws if `isServer` is false.
  - TMDB/OMDB/MDBList/AniList/Resend/VAPID private keys: server-only env vars (no `VITE_` prefix).
  - VAPID public key: stored in `app_config.vapid_public_key` JSONB (intentionally public).
  - **OMDB key regression**: `OMDB_KEY = import.meta.env.VITE_OMDB_API_KEY` in `core/omdb/omdb.ts:5` — this key IS in the browser bundle.
- **CSRF protection**:
  - **SameSite=Strict** on the admin cookie — blocks cross-site requests.
  - **No CSRF tokens** anywhere. SameSite=Strict is the sole CSRF defense for admin routes.
  - For user routes (`/api/account/delete`, `/api/push/send`, `/api/email/send`), the access_token is sent in the request body (not as a cookie) — CSRF not applicable.

### 8.12 Logout flow

- `signOut()` in `useAuthActions.ts:82-95`: `supabase.auth.signOut()` (default scope `global`). Toasts "Signed out". `onAuthStateChange` fires `SIGNED_OUT` → `useAuth.ts:175-179` calls `stopPrefsSync()`.
- `signOutGlobal()` in `accountActions.ts:386-399`: Explicit `supabase.auth.signOut({ scope: "global" })`.
- `revokeCurrentSession()` in `sessions.ts:179-189`: `supabase.auth.signOut({ scope: "local" })`.
- Admin logout: `useAdminAuth.logout()` calls `DELETE /api/admin/auth` which clears the `cinelog_admin_session` cookie. Does NOT revoke the underlying Supabase session.

### 8.13 Auth bugs / limitations

1. **`database.types.ts` is severely outdated** (see §7.13).
2. **OMDB API key exposed in browser bundle** (`core/omdb/omdb.ts:5`).
3. **Rate limits in `app_config` are not enforced.**
4. **`get_user_email` RPC called N times** (one per visible user) via `Promise.all` in `/api/admin/users` GET — N round-trips.
5. **`refresh_admin_analytics()` MV refresh runs hourly** — admin analytics can be up to 1 hour stale.
6. **PKCE verifier recovery is a workaround, not a fix.**
7. **Admin JWT secret minimum is 16 chars** (`adminJwt.ts:89`) — too weak for production.
8. **`weekly_recap` pg_cron job requires manual placeholder replacement**.
9. **`activity_log.entity_id` is UUID-typed but unused**.
10. **`profiles.id` has no explicit FK to `auth.users.id`**.
11. **`universe_phases.before_entry_id` is TEXT** storing either UUIDs or TMDB-id-strings.
12. **`curated_universe_entries` has 4 redundant position columns**.
13. **Social module removal left orphaned migration**.
14. **`signOut()` default scope is `global`** — may surprise users.
15. **No CSRF token** for admin routes.
16. **`useAuth.ts` module-level signals** are shared across all components — SSR renders with `user=null` and `authReady=false` — every page flashes the signed-out state until hydration completes.
17. **In-memory rate limiters reset on every Vercel cold-start.**
18. **`banners` bucket was missing until migration 20260805** — existing banner uploads fell back to ~270KB base64 data URLs. No migration backfills them.

---

## 9. State Management Audit

CineLog V2 uses **four different reactive patterns**, all built on SolidJS primitives:

| Pattern | Used by | Notes |
|---|---|---|
| Module-level signals | `useAuth`, `useToast`, `useModalState`, `useCollectionModal`, `useAuthModal`, `theme`, all `core/preferences/*` | Survive HMR, never unmount, shared across components without a Provider |
| React-like Context + Provider | `SearchProvider`, `UserLibraryProvider`, `VaultProvider`, `CollectionsProvider` | One instance per app; consumer hook throws if used outside provider |
| Module-level mutable cache + signals | `featureFlags`, `homepageConfig`, `announcements` | TTL-cached; auto-fetched on module load |
| Supabase as primary store | `useUserLibrary`, `useCollections`, `useVaultPresets`, `push_subscriptions`, `login_history`, `user_preferences` | localStorage is secondary / cache |

### 9.1 Stores / Contexts inventory

| Store / Context | File | Pattern | What it owns | Persistence |
|---|---|---|---|---|
| `SearchContext` | `src/shared/contexts/SearchContext.tsx` | Context + Provider | `searchOpen` + `useSearch()` instance | In-memory only |
| `UserLibraryProvider` | `src/shared/hooks/useUserLibrary.tsx` | Context + Provider | `watchlist: Accessor<WatchlistItem[]>`, `loading`, `isGuest`, `error`, `refresh()`, `updateItem()`, `removeItem()` | Supabase (no localStorage cache) |
| `VaultProvider` | `src/features/watchlist/useVault.tsx` | Context + Provider (compatibility wrapper around `useUserLibrary`) | Optimistic write helpers (`runWriteOptimistic`) | Supabase |
| `CollectionsProvider` | `src/features/collections/hooks/useCollections.tsx` | Context + Provider | `userCollections`, `loading`, `favoritesCollectionId`, `favoritesSet`, 13 mutation methods | Supabase (no localStorage cache) |
| `useAuth` | `src/shared/hooks/useAuth.ts` | Module-level signals | `user`, `authReady`, `isSignedIn` (computed) | Supabase + localStorage |
| `useAuthModal` | `src/shared/hooks/useAuthModal.ts` | Module-level signal | `authModalOpen` | In-memory only |
| `useModalState` | `src/shared/hooks/useModalState.ts` | Module-level signal | `selectedItem` + browser history integration | In-memory; history state via `pushState` |
| `useCollectionModal` | `src/shared/hooks/useCollectionModal.ts` | Module-level signal | `collectionSelectedItem` | In-memory only |
| `useToast` | `src/shared/hooks/useToast.ts` | Module-level signal | `toasts: Toast[]` + monotonic counter | In-memory only |
| `useAuthActions` | `src/shared/hooks/useAuthActions.ts` | Pure functions | — | — |
| `theme` | `src/core/theme/theme.ts` | Module-level signal | `theme: Accessor<Theme>` (8 presets) | localStorage `cinelog_theme` |
| `themeMode` | `src/core/preferences/themeMode.ts` | Module-level signal + matchMedia listener | `themeMode: Accessor<"dark"|"light"|"system">` | localStorage `cinelog_theme_mode` |
| 18 preferences | `src/core/preferences/*` | Module-level signals + createEffect | Each preference (density, fontSize, hideSpoilers, reducedMotion, highContrast, customAccent, posterQuality, language, fallbackLanguage, streamingProviders, defaultDiscoverTab, ratingScale, calendar, notifications, contentFilters, hideRatingsScreenshots, vaultStatus, syncCadence, dateFormat) | localStorage `cinelog_*` |
| `featureFlags` | `src/lib/featureFlags.ts` | Module-level signals + auto-fetch | `flags`, `ready` | In-memory only (re-fetched every page load) |
| `homepageConfig` | `src/lib/homepageConfig.ts` | Module-level cache + signals | `config: Accessor<HomepageConfig>` (16 section toggles) | In-memory 5-min TTL cache |
| `announcements` | `src/lib/announcements.ts` | Module-level cache + signals | `announcements`, `visibleBanners`, `visibleToasts`, `visibleModals` | In-memory 2-min TTL cache + localStorage dismissals (24h) |

### 9.2 Persistence summary

| Layer | localStorage keys | Supabase tables | In-memory only |
|---|---|---|---|
| Auth | (Supabase SDK manages its own) | `auth.users`, `profiles`, `login_history` | `user`, `authReady` |
| Vault | — | `vault`, `episode_progress` | `watchlist`, `loading` |
| Collections | — | `collections`, `collection_entries` | `userCollections` |
| Presets | — | `presets` | `presets` |
| Preferences | 18× `cinelog_*` keys + `cinelog_prefs_synced_at` | `user_preferences.prefs_json` | signals (mirror localStorage) |
| Theme | `cinelog_theme` | (**NOT in `PreferencesSnapshot` — sync gap**) | signal |
| Custom accent | `cinelog_custom_accent` | (synced via prefs — IS in `PreferencesSnapshot`) | signal |
| Feature flags | — | `feature_flags` | module-level cache |
| Homepage config | — | `homepage_config` | 5-min TTL cache |
| Announcements | `cinelog:dismissed-announcements` | `announcements` | 2-min TTL cache |
| Push | (SW manages subscription in IndexedDB; keys in `push_subscriptions` row) | `push_subscriptions`, `app_config.vapid_public_key` | hook-local signals |
| Search | `cinelog_search_history` (via `searchStorage.ts`) | — | `query`, `results`, `searchOpen` |
| Modals | — | — | `selectedItem`, `collectionSelectedItem`, `authModalOpen`, `toasts` |

### 9.3 Caching, persistence, synchronization

- **Cross-tab sync**: Only `announcements` has a `storage` event listener for cross-tab dismiss sync. All other state is per-tab.
- **Cross-device sync**: Preferences sync to Supabase `user_preferences.prefs_json` via debounced (1.5s) auto-pusher in `preferencesSync.ts`. Vault, collections, presets sync via direct Supabase reads/writes (no Realtime subscriptions).
- **Cleanup on logout**: `stopPrefsSync()` (called by `useAuth` on `SIGNED_OUT` event) clears the push timer and fires one last push (fire-and-forget) so the last change before logout isn't lost. `activeUserId` is set to `null` so subsequent signal changes during the signed-out window don't queue more pushes.
- **No preference is ever reset on logout** — `cinelog_*` localStorage keys persist across users on a shared device. The `clearAllCinelogStorage()` utility exists in `src/shared/utils/clearStorage.ts` but is only invoked by the Privacy page's nuclear reset.

### 9.4 Race-condition handling

- **`useUserLibrary`**: `isFetching` boolean guard + `fetchUid` tracking so a stale fetch from a logged-out user cannot overwrite the next user's data. 15s safety-net timer unblocks UI if fetch hangs.
- **`useCollections`**: `lastFetchUid` tracks the latest in-flight uid. The previous duplicate `onSessionChange` listener was removed in favor of a single auth listener (in `useAuth`).
- **`useAuth`**: `initialSessionChecked` is intentionally NOT reset on HMR — documented in comments. `_resetAuthStateForTesting()` exported for test isolation.
- **`useVault.runWriteOptimistic`**: applies `localUpdate` immediately via `updateItem`, shows success toast immediately, awaits Supabase write, on failure calls `refresh()` to restore server truth + shows error toast.
- **`useCollections.makeTempId`**: returns `temp-${Date.now()}-${++_tempIdCounter}`. Subsequent operations on a temp-ID'd collection await `waitForRealId(collectionId)` which returns a Promise stored in `pendingTempIds` Map.

### 9.5 State management problems

1. **Theme (8 accent presets) is NOT in `PreferencesSnapshot`** — `cinelog_theme` localStorage key is synced only locally, not to Supabase. A user who picks "matrix" on their laptop sees "cinematic" (default) on their phone.
2. **No broadcast channel for cross-tab state**. Preferences updated in tab A don't propagate to tab B until reload.
3. **Module-level signals lack test-reset helpers** (except `useAuth`).
4. **`stopPreferenceSync()` doesn't dispose the createEffect** — it just nulls `activeUserId`. The effect continues to track signals and re-fire, but the push is gated by `if (activeUserId)`. Minor leak.
5. **Optimistic updates have no conflict resolution**. If two tabs write to the same item, last-writer-wins on the server.
6. **`useVault` is marked `@deprecated`** but still wired through `VaultProvider`. Migration to `useUserLibrary` is incomplete.
7. **`useUserLibrary.updateItem` does a shallow merge** — nested fields like `watchProgress` will be replaced, not merged.
8. **`useToast` has no deduplication** — calling `showToast("Saved", "success")` twice shows two stacked toasts.
9. **`useModalState.historyEntryOurs` is module-level** — assumes only one Details modal at a time.
10. **`useCollectionModal` has no history integration** (unlike Details modal) — pressing Back while the Collection modal is open will navigate away.

### 9.6 Derived state

- `useStats` — pure memo over `useUserLibrary().watchlist()` via `getStatsData(list)` pure calculators.
- `useVaultFiltering.filtered()` — memo over `watchlist()` + filters signal + searchInput (debounced).
- `useVaultSections` — adaptive shelf builder via `claimed` Set dedup.
- `useDiscoverTaste` — derives `TasteProfile` from vault.
- `usePersonalizedDiscover` — derives daily seed via FNV-1a hash of `{date}:{uid}:{candidateCount}`.
- `useCollections.favoritesSet` — memo for O(1) favorites lookup.

---

## 10. Search System Audit

### 10.1 How search works

- **Trigger**: User clicks search icon in AppHeader (mobile overlay or desktop inline). `useGlobalSearch().setSearchOpen(true)` opens the `SearchOverlay` rendered in AppShell.
- **Hook**: `useSearch.ts` (292 LOC) — two modes:
  1. **Text search** — 250ms debounced `searchMulti`, results grouped into Movies/Series/People.
  2. **Genre browse** — `discoverMovies` + `discoverTv` by genre ID, paginated, interleaved.
- **Anime fallback**: if TMDB returns 0 results AND `looksLikeAnimeQuery(query)`, fires AniList `searchAnime` → maps to TMDB via `getTmdbId` (no auto-map during search).
- **Cold-start**: Loads trending (12 items) on mount for empty-query state.
- **Vault awareness**: `vaultKeys` memo via `buildVaultKeySet` for O(1) in-vault checks.

### 10.2 Ranking

- TMDB `/search/multi` ranking is TMDB's own (popularity-weighted).
- AniList fallback uses AniList's `searchMatch` ranking (fuzzy title match).
- No client-side re-ranking or personalization.

### 10.3 Caching

- TMDB `searchMulti` uses `cachedFetch` with 10-min TTL (apiCache.ts).
- AniList `searchAnime` uses 5-min in-memory cache (anilist/client.ts).
- No localStorage caching of search results — each search hits the network (after debounce).

### 10.4 TMDB interaction

- All TMDB calls go through `/api/media/*` proxy (server injects `TMDB_API_KEY`).
- `searchMulti` returns Movies, TV, and People. CineLog groups them but **does not render People results** (only Movies / Series / Anime).

### 10.5 Filtering

- Text search: no client-side filters (relies on TMDB's `include_adult={true|false}` based on `adultContentFilter` preference).
- Genre browse: `fetchGenrePage` fetches movies + TV in parallel, interleaves, dedupes by `{media_type}/{id}`.

### 10.6 Recent searches

- `searchStorage.ts` (37 LOC) — localStorage helpers for recent searches (max 8, deduped, MRU first, SSR-safe).
- Stored under `cinelog_search_history` key.
- Click a recent search → re-runs that query.
- `saveRecent` silently catches quota errors — user won't know if recent searches aren't being saved.

### 10.7 Performance

- 250ms debounce prevents excessive API calls.
- `vaultKeys` Set for O(1) in-vault checks.
- IntersectionObserver for lazy IMDb ratings on result rows.

### 10.8 Weaknesses

- AniList fallback only fires when TMDB returns 0 results — doesn't merge with TMDB results.
- No people search results UI (people are fetched but not rendered separately).
- No search history beyond 8 recent searches.
- No fuzzy matching / typo correction.
- `useSearch` declares both `query` and `debouncedQuery` signals but the `SearchOverlay` consumes from `useGlobalSearch`, not `useSearch` directly — `useSearch` appears to be used by `SearchResults` indirectly; the relationship is unclear.

### 10.9 Improvements

1. Merge AniList results with TMDB results (with deduplication).
2. Render People results (with `PersonModal` for details).
3. Add fuzzy matching / typo correction (e.g., Levenshtein distance).
4. Increase recent searches limit or add pagination.
5. Add "saved searches" / "search to collection" feature.
6. Add "search inside a collection" (currently separate `useCollectionSearch` hook).

---

## 11. Discover System Audit

### 11.1 Sections

Discover page renders up to 16 sections (toggleable via `/api/homepage-config`):

1. **Spotlight** — daily-rotating cinematic hero
2. **GenreExplorer** — interactive genre chips with roving-tabindex arrow nav + lazy per-genre carousel
3. **Continue Universes** — subscribed curated universes with progress
4. **Insight Strip** — taste-driven insights (top genre, avg rating, etc.)
5. **Trending** — TMDB trending movies + TV
6. **Theatres** — now playing in theatres
7. **Because You Love** — recommendation based on user's top-rated vault title
8. **Surprise Me** — random picker (feature flag `random_picker`)
9. **Weekend Picks** — curated weekend watchlist
10. **Step Outside** — outside-comfort-zone picks
11. **Hidden Gems** — low-popularity high-rated titles
12. **Top Rated Movies** — TMDB top-rated movies
13. **Top Rated Series** — TMDB top-rated TV
14. **New on OTT** — new streaming releases (region-aware)
15. **New Seasons** — upcoming TV seasons
16. **Coming Soon** — upcoming releases

### 11.2 Algorithms

- **Spotlight daily-rotation** (`useSpotlight.ts`, 560 LOC): Strategy chain — because-you-watched → hidden-gems → genre-deep-dive → acclaimed-fallback → trending. 30-day no-repeat via `seenTitles` localStorage per-uid. Cached daily pick (synchronous on refresh). 3-second safety timer if `authReady()` never resolves.
- **Personalization** (`usePersonalizedDiscover.ts`, 301 LOC): FNV-1a hash of `{date}:{uid}:{candidateCount}` derives daily seed. `topGenreName`, `excludedKeys` Set, `trackedTvSeasons` Map (for the "NEW SEASON OUT" exception).
- **Taste derivation** (`useDiscoverTaste.ts`, 166 LOC): Derives `TasteProfile` (topGenres, topDirectors, activeFranchises, avgImdb, seedTitle, isColdStart) from vault. Architectural seam for future ML/LLM-based recommendations.
- **Global dedup chain**: Every row receives the prior row's `renderedIds` Set so a title never appears twice.
- **Filter feed**: Vault exclusion + new-season exception + global dedup.

### 11.3 Random picker

- "Surprise Me" section — random title from trending or top-rated.
- Spotlight shuffle button — records current pick as seen (30-day cooldown), refetches new pick.
- Feature flag `random_picker` (default true).

### 11.4 Recommendation logic

- "Because You Love" — uses user's top-rated vault title as seed, fetches TMDB `/movie/{id}/recommendations` or `/tv/{id}/recommendations`.
- "Step Outside" — picks titles outside user's top genre.
- No collaborative filtering or ML-based recommendations — all derived client-side from the vault.

### 11.5 Genre explorer

- `GenreExplorer.tsx` (669 LOC) — interactive genre chips with roving-tabindex arrow nav (WAI-ARIA Tabs pattern), lazy per-genre carousel with continuous "Load more" + cache, interleaved movies+TV.
- `GENRE_PILLS` constant (8 genres with icons) in `searchConstants.ts`.
- `genreBrowseUtils.ts` (97 LOC) — `fetchGenrePage` fetches movies + TV in parallel, interleaves, dedupes by `{media_type}/{id}`.

### 11.6 Trending / Popular

- `getTrending` — TMDB `/trending/all/day` (daily trending).
- `getTopRatedMovies` / `getTopRatedTv` — TMDB `/movie/top_rated` / `/tv/top_rated`.
- `getNowPlaying` — TMDB `/movie/now_playing`.
- `getOnTheAir` — TMDB `/tv/on_the_air`.
- All wrapped in `cachedFetch(buildCacheKey(...), TMDB_TTL, async () => fetchWithRetry(...))`.

### 11.7 OTT rails

- `OttDropdown.tsx` (312 LOC) — dynamic region provider list (no hardcoded names/logos); auto-selects first provider when user has no `streamingProviders` pref.
- `ottProviderRegistry.ts` (318 LOC) — canonical TMDB ID → provider-key map (Netflix, JioHotstar, Prime Video, SonyLIV, ZEE5, Crunchyroll, Apple TV+, Disney+, …). Alias-merging: e.g. all 4 Amazon IDs → "Prime Video".
- `discoverMoviesWithProvider` / `discoverTvWithProvider` — TMDB `/discover/movie` + `/discover/tv` with `with_watch_providers` filter.

### 11.8 Anime carousels

- `useAnimeCarousels.ts` (159 LOC) — fetches 7 AniList carousels (trending, seasonal, upcoming, topRated, popular, hiddenGems, movies) gated by `useAnimeSettings().enabled()` plus per-carousel flags.
- Detects AniList outage (`temporarily disabled` / `severe stability issues`) and surfaces a dedicated `outage()` signal.
- `animeCarousels.ts` (338 LOC) — AniList → TMDB bridge. For each AniList Media: looks up `getTmdbId`, falls back to `searchMulti` + scoring (year, format, popularity), persists mapping fire-and-forget. Cached per-carousel (6h–24h TTLs).

### 11.9 Discover weaknesses

- `RelationshipPill.tsx` is orphaned.
- `useDiscoverFeeds` returns unused signals (`topRatedMovies`, `topRatedTv`, `newSeasons`, `nowPlaying`) — fetched on every region change but only `upcoming` is consumed.
- Anime carousels skip items lacking a TMDB mapping and don't auto-map on Discover (mapping only happens on the Details page).
- 100+ IntersectionObservers on Discover (one per card; should be a shared pool).
- No `<link rel="preload" as="image">` for above-the-fold LCP posters.
- No persisted "Not interested" / dismiss action on individual cards.
- No server-side personalization (all derived client-side from the vault).

### 11.10 Discover improvements

1. Remove unused `RelationshipPill.tsx`.
2. Remove unused feed signals in `useDiscoverFeeds`.
3. Implement shared IntersectionObserver pool.
4. Add `<link rel="preload" as="image">` for first 3 above-the-fold posters.
5. Add "Not interested" dismiss action with persistence.
6. Add server-side personalization (e.g., Supabase Edge Function returning user-specific recommendations).

---

## 12. Watchlist Audit

### 12.1 Sorting

- `added_date` (default), `title`, `rating`, `watch_date`, `year`, `runtime`.
- `sortField` + `sortDirection` (asc/desc).
- Timeline view forces `Completed` status + `watch_date desc`.

### 12.2 Filtering

- **Status tabs** (All / Watching / Planned / Completed / Dropped) via `QuickFilterTabs`.
- **Advanced filters** via `FilterControls` (612 LOC): genre (multi-select), platform (multi-select), tag (multi-select), year range, rating range, runtime range.
- **Search** with 120ms debounce via `useVaultFiltering`.
- **URL sync** — `?status=Watching` from Dashboard stat cards.
- `vaultFilterUtils.ts` (658 LOC) — pure filter/sort helpers with WeakMap-cached per-item search index (includes cast, director, genres, year, platforms).
- Region detection (`Indian` via origin_country IN + spoken_languages codes).

### 12.3 Collections integration

- Vault items can be added to collections via `AddToFolderSheet` in Details modal.
- `removeVaultItemFromAllCollections` cascade-deletes collection_entries when a vault item is deleted.

### 12.4 Progress

- `episode_progress` table per (vault_id, season, episode).
- `useDetailsProgress` bidirectional toggle (delete-forward + rewind).
- `progress_minutes` field on vault.
- `enrichWithEpisodeProgressAsync` — batch fetch for vault reads.
- `enrichWithEpisodeProgress` (sync version) is a stub returning items unchanged — dead code.

### 12.5 Continue watching

- `useVaultSections` builds adaptive shelf: Continue Watching → Watching → Planned → Recently Completed → All Titles.
- Continue Watching = vault items with status=watching + recent `last_activity_at`.

### 12.6 Status

- 5 statuses: `planned`, `watching`, `completed`, `on_hold`, `dropped`.
- Status cycle in Details: Planned → Watching → Completed → Planned.

### 12.7 Relationships

- Vault items reference TMDB ids (not unique across movie/tv).
- `findInVault(vault, baseItem)` matches on `id` AND `media_type`.
- Collection entries reference vault_id (UUID FK).

### 12.8 Bulk actions

- No bulk select in Watchlist (only individual item actions).
- Bulk actions exist in Trash (Restore All / Clear Trash).

### 12.9 Watchlist weaknesses

- 5 separate `getVaultByStatus` queries (N+1 risk on huge vaults, mitigated by `limit: 1000`).
- `enrichWithEpisodeProgress` (sync) is a stub returning items unchanged — only `enrichWithEpisodeProgressAsync` actually fetches.
- `useVault()` marked deprecated but still used by 25+ consumers.
- Auto-purge of soft-deleted items happens client-side on Trash page visit only.
- `WatchlistView.handleScroll` doesn't debounce — `setDisplayLimit` fires on every scroll event past the threshold (SolidJS signal dedup mitigates).
- MovieCard status badge is `aria-hidden="true"` — invisible to screen readers.
- No tag CRUD UI (tags only editable from Details modal).
- No "watch next" auto-suggestion within a shelf.

### 12.10 Watchlist improvements

1. Single query with `IN (statuses)` filter instead of 5 parallel.
2. Implement sync `enrichWithEpisodeProgress` or remove it.
3. Migrate MovieCard status badge to GlassBadge.
4. Complete `useVault` deprecation.
5. Add tag CRUD UI in Watchlist.
6. Add "watch next" auto-suggestion.

---

## 13. Collections Audit

### 13.1 Architecture

Two halves: (1) user-created folders with CRUD + entries + drag-and-drop reorder, (2) subscribed curated universes from Supabase `curated_universes`. Plus smart collections (rule-based, client-side evaluation).

- `CollectionsPage.tsx` (522 LOC) — hub page.
- `CollectionDetailPage.tsx` (1027 LOC) — single collection OR curated universe view.
- 7 adapters (`collectionAdapter`, `collectionEntryAdapter`, `curatedUniverseAdapter`, `universePreferencesAdapter`, `collectionMapper`, `collectionErrors`, `animeSmartCollections`).
- 7 hooks (`useCollections`, `useCollectionSearch`, `useCollectionSort`, `useCollectionFilter`, `useCuratedUniverses`, `useUniversePrefs`, `collectionQueries`).
- 17 components (~5600 LOC).

### 13.2 Smart collections

- `evaluateSmartRules.ts` (125 LOC) — pure rule evaluator (director, genre, franchise, year, rating, status, release_date, keyword). AND-combined.
- `SmartCollectionBuilder.tsx` (568 LOC) — UI for building rules.
- `animeSmartCollections.ts` (213 LOC) — 4 AniList-sourced smart collections (Currently Airing, Completed Classics, Top Rated, Seasonal Picks). Read-only, cached 6h–24h.
- **LIMITATION**: Smart rules are NOT persisted — `collections.collection_type='smart'` exists but there is NO rules JSONB column. `useCollections.updateSmartRules()` throws `UnsupportedFeatureError` if rules are non-empty.

### 13.3 Folders

- User-created folders with name, description, color, cover_url, banner_url.
- Archive/unarchive via `archived_at` column.
- Soft-delete via `deleted_at` column.
- `FolderEditor.tsx` (575 LOC) — full editor.

### 13.4 Relationships

- `collection_entries` table links collections to vault items.
- `addEntryToCollectionByTmdbId` resolves vault_id from TMDB identity (creates vault row if missing).
- `removeVaultItemFromAllCollections` cascade-deletes entries when vault item is deleted.
- Drag-and-drop reorder via `@thisbeyond/solid-dnd` in `ReorderModal.tsx` (661 LOC).

### 13.5 Curated universes

- `curated_universes` table — admin-managed franchises (MCU, Star Wars, Harry Potter, etc.).
- `curated_universe_entries` — titles in each universe with `incident_year` for timeline sorting.
- `universe_phases` — narrative phase dividers (e.g., "Phase 1", "Phase 2").
- 4 view modes: timeline, release, story, franchise.
- `user_universe_subscriptions` — per-user subscription with custom color/cover/banner/sort.

### 13.6 Limitations

- **Smart collection rules cannot persist** — no rules column in DB.
- `isHidden` not in `user_universe_subscriptions` schema — `hiddenUniverses` memo always returns empty.
- `saveOverrides` method still exists on `useCollections` for compat but no UI invokes it (universe overrides removed in v4).
- Custom Entry creation removed in v4 — existing custom entries still render but can't be edited.
- `duplicateCollectionInSupabase` sequentially calls `addEntryToCollectionByTmdbId` per entry — slow for large collections (no batch insert).
- `ensureFavoritesExistsInSupabase` uses a module-level mutex but two concurrent tabs would still race (no DB-level unique constraint on `(user_id, name='Favorites')`).

### 13.7 Improvements

1. Add `rules` JSONB column to `collections` table for smart rule persistence.
2. Add `is_hidden` column to `user_universe_subscriptions`.
3. Batch insert for `duplicateCollectionInSupabase`.
4. Add DB-level UNIQUE constraint on `(user_id, name='Favorites')`.
5. Add collection sharing / public URLs (if social returns).
6. Add bulk entry operations (multi-select add/remove).

---

## 14. Profile Audit

### 14.1 Statistics

- `useStats.ts` (283 LOC) — derives `StatsData` from watchlist (totals, runtime, movie/TV ratio, top genres, decades, top directors, heatmap, monthly counts, weekday/weekend split, avg rating, topRated, mostRewatched).
- All computed client-side via pure calculators in `~/lib/supabase/repositories/stats` (no DB I/O).
- `StatsData` consumed by `StatisticsPage` + `StatsOverview` + `ProfileStatsRow`.

### 14.2 History

- `HistoryPage.tsx` (476 LOC) — chronological diary grouped by Today/Yesterday/This Week/Last Week/This Month/This Year/2024/2023...
- Filter + search.
- Derived from `useUserLibrary().watchlist()` `addedAt` / `updatedAt` / `watchDate`.

### 14.3 Favorites

- `FavoritesGrid.tsx` (173 LOC) — fetches Favorites collection, renders 10 titles.
- `ensureFavoritesExistsInSupabase` — auto-creates Favorites collection on first sign-in (with mutex + duplicate cleanup).
- `TasteCard.tsx` (467 LOC) — favorites with different visual weight (movie dominates, series, director, genre).

### 14.4 Progress

- Profile stats row shows completion rings for each stat (Titles, Movies, Series, Hours, Avg Rating).
- Achievement progress bars on `AchievementsPage`.

### 14.5 Data calculations

- `storyGenerator.ts` (581 LOC) — pure deterministic narrative engine. Generates "Your Story" reflection, Identity Chips, Favorite Reasons, Activity Reactions, One-Word Reactions. Priority order: genre shift → director obsession → decade affinity → comfort pattern → weekend ritual → volume milestone → default.
- `useStats.ts` — pure memo over watchlist. O(n) per chart; fine for <10k items.

### 14.6 Limitations

- All stats computed in-memory on every watchlist change — won't scale past ~10k items.
- `AchievementsPreview` duplicates the BADGES array from `AchievementsPage` (acknowledged tech debt).
- `ProfileBanner.onChooseBanner` prop is dead.
- Two `UpcomingPage.tsx` files exist (the profile one is 1355 LOC and DEAD).
- `ProfilePage.handleShare` always copies `/profile` URL (no username slug).
- No public profile URL (social removed).
- No follower/following counts.
- No profile export.
- No date-range filter for stats (all-time only).

### 14.7 Future opportunities

1. Public profile URL (if social returns).
2. Follower/following counts.
3. Profile export.
4. Date-range filter for stats.
5. Year-over-year comparison.
6. Per-genre deep-dive (clicking a genre bar filters the watchlist).

---

## 15. Settings Audit

### 15.1 Appearance

- `AppearanceSection.tsx` (367 LOC) — theme cards (8 presets), accent swatches (8 presets + custom hex with dynamic color extraction), density (compact/comfortable/spacious), font size (small/medium/large), poster quality (low/medium/high), hide spoilers, date format, reduced motion (system/on/off), high contrast.

### 15.2 Theme

- 8 themes: cinematic (default, cinema gold), pearl (white), sage (mint green), matrix (neon green), netflix (red), interstellar (cyan), neonhorizon (magenta), vibranium (purple).
- Theme switching applies `theme-${theme()}` class to both `<html>` and `<body>`.
- Custom accent overrides via inline styles on `<html>` for 10 CSS variables.

### 15.3 Accent

- 8 presets + custom hex.
- `applyAccentToDocument(hex)` sets inline styles on `<html>` for `--p`, `--p2`, `--p-glow`, `--p-dim`, `--p-border`, `--p-hover`, `--active-bg`, `--active-text`, `--active-border`, `--active-glow`.
- `contrastOn(hex)` computes WCAG luminance and returns `#08080D` or `#ffffff` for `--active-text`.
- `hexToRgba(hex, alpha)` only handles 6-digit hex (3-digit falls back to sage green — silent default).
- Dynamic color extraction from favorite movie poster via `colorExtractor.ts`.

### 15.4 Backup

- `BackupCards.tsx` (120 LOC) — JSON backup download.
- `BackupService.ts` (1207 LOC) — single entry point for backup creation, export, parsing, restore.

### 15.5 Export

- `CsvExportCard.tsx` (128 LOC) — CSV export (Letterboxd/Trakt/IMDb compatible).
- `csvExport.ts` (221 LOC) — RFC 4180 escaping.

### 15.6 Import

- `ImportHub.tsx` (136 LOC) — source picker.
- `CsvImportCard.tsx` (573 LOC) — CSV import (multi-source auto-detect).
- `JsonImportWizard.tsx` (508 LOC) — JSON backup import wizard.
- `ImportSource.ts` (150 LOC) — plugin contract for new sources.

### 15.7 Privacy

- `PrivacyCard.tsx` (27 LOC) — visibility (read-only reassurance), screenshot blur toggle, clear search history, link to export and delete-account.
- `hideRatingsInScreenshots` preference — toggles `data-hide-ratings-ss` attr + `visibilitychange` listener that toggles `data-ss-hidden`.

### 15.8 Developer settings

- `/settings/developer` redirects to `/settings/about` (file comment says moved to `/admin/developer` — misleading).
- Real developer tools live at `/admin/developer` (admin-gated).

### 15.9 Hidden settings

- No hidden settings discovered. All settings are surfaced in the UI.

### 15.10 Settings limitations

- `accentHelpers.ts` duplicates `~/core/preferences/customAccent` verbatim — acknowledged tech debt.
- `useSettingsState` is 1155 LOC — large but well-organized.
- `applyAccentToDocument` accepts 3-digit hex shorthand in regex but `hexToRgbaLocal` only handles 6-digit — silent fallback to green.
- `SessionList` says Supabase doesn't expose "list all my sessions" — only shows current device.
- `ChangePasswordSheet` asks for current password in UI even though Supabase ignores it (`secure_password_change = false`).
- No "reset to defaults" per-section.
- No settings import/export.
- No settings preview (changes apply immediately).

---

## 16. Theme & Design System Audit

### 16.1 Design tokens

Organized under `src/styles/tokens/`:

| Token file | Tokens defined |
|---|---|
| `colors.css` | Surface tiers (`--void`, `--deep`, `--surface`, `--raised`), borders, text, active-state, accent variants, semantic colors (primary, surface, background, border, text, feedback success/warning/danger/info with `-bg`/`-border`/`-text` variants, watch status, rating sources, collection colors), Phase 2.1 redesign (`--tier-0` through `--tier-4`, hairlines, text-strong/body/soft/muted/dim, glass-bg/bg-strong/border/blur), Cinematic Dark Theme (`--cine-bg`, `--cine-glass`, `--cine-border`, `--cine-blur`) |
| `spacing.css` | `--sp-1` through `--sp-12` (4/8/12/16/20/24/28/32/40/48px); semantic `--space-1` through `--space-20` (adds 14=56, 16=64, 20=80). **Duplicates**: `--sp-N` and `--space-N` map to same values |
| `radius.css` | `--radius-sm` (10px), `--radius-md` (14px), `--radius-card` (14px == md), `--radius-lg` (18px), `--radius-xl` (24px), `--radius-2xl` (28px), `--radius-modal` (24px == xl), `--radius-pill` (999px), `--radius-full` (999px == pill), `--radius-xs` (5px), `--radius-2xs` (3px), `--radius-3xs` (2px), `--radius-4` (5px == xs), `--radius-5` (6px), `--radius-6` (8px), `--touch-min` (44px). **Duplicates**: `--radius-md` == `--radius-card`, `--radius-xl` == `--radius-modal`, `--radius-pill` == `--radius-full`, `--radius-xs` == `--radius-4` |
| `typography.css` | Font families (Bebas Neue, Outfit, Azeret Mono), font sizes (17 sizes from `--font-size-2xs` 7px to `--font-size-12xl` 52px), font weights (regular/black), line heights (none/relaxed), letter spacing (12 tokens) |
| `motion.css` | Easings (spring, smooth, out, in-out, standard, emphasized, decelerate, accelerate), durations (fast 150ms, base 220ms, modal 280ms, page 320ms, slow 450ms, micro 80ms, duration-fast, duration-normal, duration-slow), stagger (50ms, 60ms), 18 keyframes (shimmer, fadeUp, fadeIn, slideUp, slideDown, slideInRight, popIn, popInSpring, glowPulse, scaleIn, scaleFade, timelineItemIn, barGrow, toastIn, toastOut, sheetUp, softPulse, shimmerSlow), 13 `.animate-*` utility classes |
| `z-index.css` | `--z-base` (0), `--z-overlay` (1), `--z-content` (2), `--z-badge` (3), `--z-media` (5), `--z-indicator` (10), `--z-sticky` (30), `--z-dropdown` (40), `--z-overlay-high` (50), `--z-modal` (100), `--z-toast` (9999), `--z-tooltip` (10000), `--z-max` (999999), nav tokens (`--nav-height` 4rem, `--nav-safe-area`, `--nav-total-height`) |
| `blur.css` | `--blur-xs` (4px), `--blur-sm` (8px), `--blur-md` (12px), `--blur-lg` (20px), `--blur-xl` (24px), `--blur-2xl` (28px), `--blur-3xl` (60px). Comments note `--glass-blur` is defined in `colors.css` (24px, set in `:root` not via `--blur-xl`) |
| `opacity.css` | `--opacity-disabled` (0.5), `--opacity-muted` (0.65), `--opacity-overlay` (0.72), `--opacity-hover` (0.85), `--opacity-hidden` (0), `--opacity-ambient` (0.4), `--opacity-soft` (0.7), `--opacity-medium` (0.75), `--opacity-strong` (0.92), `--opacity-near` (0.96), `--opacity-full` (1) |
| `shadows.css` | Original (`--shadow-card`, `--shadow-raised`, `--shadow-float`, `--shadow-glow`), Cinema redesign (`--shadow-premium`, `--shadow-elevated`, `--shadow-hero`), Semantic scale (`--shadow-xs`, `--shadow-sm`, `--shadow-md`, `--shadow-lg`, `--shadow-xl`). **Duplicates**: `--shadow-sm` == `--shadow-card`, `--shadow-md` == `--shadow-raised`, `--shadow-xl` == `--shadow-hero` |
| `preferences.css` | Font scale baseline (`--font-scale`), app header height, density overrides (compact/comfortable/spacious), light theme overrides, high contrast overrides, reduced motion overrides, hide spoilers blur, light-mode component overrides |
| `design-system.css` | Phase 3 cinematic design system: color hierarchy, background system (ambient gradient), glass system (5 variants: subtle, default, medium, strong, heavy), glass highlights, elevation system (4 levels), typography roles (display/hero/heading/title/subtitle/body/body-sm/caption/label/label-sm/mono/button/overline), component metrics (input/button heights, tab/chip heights, row heights, icon sizes, touch targets, poster sizes, avatar sizes), motion additions (spring physics, duration extensions, stagger tokens, transition presets, animation presets), light mode + high contrast overrides for Phase 3 tokens |

### 16.2 Colors

- **Dark Cinema Glass** palette (default): `--void: #0a0a0a`, `--surface: #0f0f16`, `--raised: #181820`. Warm gold borders (`--border: rgba(232, 183, 74, 0.06)`). Cream text (`--text: #f0ece2`).
- **Light theme** (`[data-theme-resolved="light"]`): "Cinema Cream" warm paper scale (`--void: #faf7f2`, `--surface: #ffffff`, `--raised: #f0ede5`).
- **High contrast**: pure white text (dark) or pure black text (light), stronger borders.
- **Watch status colors**: watching `#4ade80`, completed `#60a5fa`, planned `#c084fc`, paused `#fbbf24`, dropped `#f87171`.

### 16.3 Spacing

- Original `--sp-1` through `--sp-12` (4-48px).
- Semantic `--space-1` through `--space-20` (adds 56, 64, 80).
- **Duplicates** for backward compat.

### 16.4 Radius

- 16 radius tokens. **Duplicates** for semantic vs component naming (md == card, xl == modal, pill == full, xs == 4).

### 16.5 Glass system

5 variants defined in `design-system.css`:
- `--glass-subtle-*` (40% opacity, blur-md, subtle)
- `--glass-default-*` (uses `--glass-bg`, blur-xl, workhorse)
- `--glass-medium-*` (82% opacity, blur-2xl, headers)
- `--glass-strong-*` (uses `--glass-bg-strong`, blur-2xl, modals)
- `--glass-heavy-*` (94% opacity, blur-3xl, toasts/inputs)

**Glass highlights**: `--glass-highlight: inset 0 1px 0 rgba(232, 183, 74, 0.06)`, `--glass-highlight-hover`, `--glass-inner-glow`.

### 16.6 Typography

- Font families: Bebas Neue (display), Outfit (body + heading), Azeret Mono (label + mono).
- 17 font sizes from 7px to 52px.
- 6 font weights.
- 5 line heights.
- 12 letter-spacing tokens.

### 16.7 Elevation

4 levels: flat / raised / floating / overlay — each bundles bg, blur, border, shadow, z-index, and a `*-shadow-composite` (shadow + glass-highlight).

### 16.8 Animations

- 18 keyframes.
- 13 `.animate-*` utility classes.
- Stagger utilities (`.stagger > *:nth-child(N)` for N=1..6 with 50ms increments, `.timeline-stagger` with 60ms increments).
- Transition presets (`--transition-fast`, `--transition-base`, `--transition-modal`, `--transition-page`, `--transition-slow`, `--transition-spring`, `--transition-focus`).

### 16.9 Theme switching

- `theme` signal applies `theme-${theme()}` class to **BOTH** `<html>` and `<body>`.
- `<html>` is needed because `:root { --active-bg: var(--p); }` resolves `var(--p)` at the same element where it's consumed — `--p` is only set by `body.theme-*` rules.
- `<body>` is kept for backwards-compat with rules that select `body.theme-*`.

### 16.10 Dark mode / Light mode

- `themeMode` signal (`dark | light | system`) writes `data-theme-mode` and `data-theme-resolved` attributes.
- `data-theme-resolved` is the **effective** mode (`system` → `dark` or `light` via `matchMedia`).
- CSS keys off `[data-theme-resolved="light"]` to swap surface tiers, borders, text, glass, shadows, plus component-specific overrides.
- A `matchMedia("(prefers-color-scheme: light)")` listener updates `data-theme-resolved` when the system theme changes (only when mode is `system`).
- **Accent tokens (`--p`, `--p2`, etc.) are NOT swapped in light mode** — they come from the theme-* class.

### 16.11 Accent colors

- 8 theme presets define `--p`, `--p2`, `--p-glow`, `--p-dim`, `--p-border`, `--p-hover`, `--active-text` via `.theme-*` classes.
- Custom hex override sets inline styles on `<html>` for 10 CSS variables (overrides class-based rules).

### 16.12 Architecture consistency

- Well-organized `tokens/` directory with one file per token category.
- Barrel `index.css` files in every directory.
- Every preference has its own file with a consistent pattern.
- Tailwind config maps every token category to utilities.

### 16.13 Unused tokens

- `--cine-bg`, `--cine-glass`, `--cine-border`, `--cine-blur` — defined in colors.css and mapped in tailwind config (with hardcoded values, not `var()` references), but only `--cine-bg` and `--cine-glass` are referenced. The hardcoded tailwind values mean these tokens don't actually drive the Tailwind utilities.
- `--nav-float-margin`, `--nav-float-inset`, `--nav-float-extra` — defined but only used by the floating nav CSS.
- `--font-size-2xs-px`, `--font-size-xs-px` — pixel variants defined alongside the rem versions; usage not confirmed.
- `--shadow-color` — defined in preferences.css for both dark and light; used by some box-shadow utilities.

### 16.14 Duplicate tokens

- `--sp-N` vs `--space-N` (spacing) — intentional aliases.
- `--dur-N` vs `--duration-N` (motion) — intentional aliases.
- `--ease-standard` == `--ease-emphasized` — exact duplicate.
- `--radius-md` == `--radius-card` (14px).
- `--radius-xl` == `--radius-modal` (24px).
- `--radius-pill` == `--radius-full` (999px).
- `--shadow-sm` == `--shadow-card`, `--shadow-md` == `--shadow-raised`, `--shadow-xl` == `--shadow-hero`.
- `--glass-bg` / `--glass-bg-strong` defined in `colors.css` then **silently overridden** in `glass-system.css`.
- Accent helpers duplicated in `customAccent.ts` and `accentHelpers.ts`.

### 16.15 Inconsistencies

- `backdropBlur.glass: '16px'` is hardcoded in tailwind config — should be `var(--glass-blur)`.
- `colors.cine-bg` etc. are hardcoded in tailwind config instead of `var(--cine-bg)`.
- `colors.glass-medium` maps to `var(--glass-medium-bg)` but `colors.glass-strong` maps to `var(--glass-bg-strong)` — different variable naming conventions.
- `_phase21.css` and `_phase22_sprint1.css` are kept "as-is to avoid CSS modifications" — should be refactored.
- `layout/container.css` and `utilities/visibility.css` are explicitly empty (kept "for architecture completeness"). Dead files.
- The `--font-family-body` and `--font-family-heading` are both `"Outfit"` — redundant distinction.
- `--text-soft` (rgba 0.72 alpha) and `--muted` (rgba 0.62 alpha) both exist — `--muted` is "legacy" per comments but still defined.
- **Silent cascade override** of `--glass-bg` and `--glass-bg-strong`: the values in `colors.css` are NOT what gets applied. The glass-system.css values win because it's imported AFTER colors.css. This is a maintainability trap.

---

## 17. UI Architecture

### 17.1 Page layout

- **AppShell** (`src/app/AppShell.tsx`) wraps every consumer route with:
  - `<AppHeader />` — top bar.
  - `<AnnouncementsBanner />` — fetched from `/api/announcements`.
  - `<DesktopSidebar />` — desktop-only nav (CSS-controlled).
  - `<main id="main-content">{props.children}</main>` — single `<main>` landmark (WCAG 2.4.1).
  - `<DesktopUtilityPanel />` — desktop-only.
  - `<SearchOverlay />` — global search.
  - `<ToastContainer />` — aria-live region.
  - `<BottomNavigation />` — mobile bottom nav.
  - `<AuthModal />` — Portal-driven.
  - `<Show when={selectedItem()}><Suspense fallback={Portal…spinner}><DetailsModal /></Suspense></Show>` — lazy-loaded.
  - `<Show when={collectionSelectedItem()}><Suspense …><CollectionModal /></Suspense></Show>` — lazy-loaded.
- **Admin routing short-circuit**: `createMemo(() => location.pathname.startsWith("/admin"))` branch bypasses the consumer chrome for any `/admin/*` URL. Admin routes must wrap themselves in `<AdminShell>` to get the sidebar, topbar, and session gate.

### 17.2 Navigation

- **BottomNavigation** (mobile): 4 items — Discover, Watchlist, Collections, Profile. Opaque (NOT glass) so content scrolling underneath never bleeds through.
- **DesktopSidebar** (desktop, ≥1024px): 7 items — Discover, Watchlist, Collections, Upcoming, Statistics, Profile, Settings. Collapsible. Replaces BottomNavigation on desktop.
- **AppHeader**: Mobile `[CINELOG] .............. [🔍] [🔔]`. Desktop `[CINELOG] [search bar] .. [quick-add] [sync] [🔔] [avatar]`.

### 17.3 Header

- Sticky application header with mobile + desktop variants.
- Mobile: CINELOG logo + search icon + notification bell.
- Desktop: CINELOG logo + inline search bar + quick-add button + sync button + notification bell + avatar.

### 17.4 Bottom navigation

- 4 items: Discover (`explore` icon → `/discover`), Watchlist (`visibility` icon → `/watchlist`), Collections (`collections_bookmark` icon → `/collections`), Profile (`person` icon → `/profile`).
- Profile tab: If `isSignedIn()` is false, tapping Profile calls `openAuthModal()` instead of navigating.
- Each NavButton has 64px touch target, glowing dot indicator, scale-1.08 active icon lift, route prefetch on hover/touch/focus.

### 17.5 Dialogs

- **Three primary modals**: DetailsModal (z-999999), CollectionModal (z-999998), AuthModal (z-9999).
- Each with its own state hook + lazy-loaded component.
- Body scroll lock via `document.body.style.overflow = "hidden"` whenever any modal is open.
- **No `inert` / `aria-hidden` on the background wrapper** — deliberately avoided (Vercel/Lighthouse false positives). Instead, `aria-modal="true"` on each dialog handles AT hiding, and the focus trap (in DetailsModal/GlassModal/GlassSheet) handles keyboard users.

### 17.6 Overlays

- Portal-mounted modals (`GlassModal`, `GlassSheet`, `AuthModal`, `DetailsModal`, `CollectionModal`).
- Portal-mounted toasts (`ToastContainer`).
- Portal-mounted banners (`OfflineBanner`, `AnnouncementsBanner` — these are NOT portals, they're inline).

### 17.7 Glass system

- 21 Glass components in `src/shared/ui/glass/`.
- Architecture: `GlassSurface` (atomic) → `GlassCard` / `GlassModal` / `GlassSheet` (overlays) → `GlassPosterCard` / `GlassStatCard` / `GlassSearchBar` (composites).
- 5 glass variants in CSS: subtle, default, medium, strong, heavy.

### 17.8 Responsive system

- CSS-driven, not JS-driven. Tailwind `sm:` / `md:` / `lg:` breakpoints + custom CSS classes.
- **Mobile-first**: All base styles target mobile. Desktop enhancements via `lg:` prefix.
- **AppHeader**: `.app-header__search-desktop` (visible ≥ lg) vs `.app-header__search-mobile` (visible < lg).
- **BottomNavigation vs DesktopSidebar**: Both always rendered. CSS hides BottomNavigation on ≥ lg, hides DesktopSidebar on < lg. They coexist in the DOM.
- **DesktopUtilityPanel**: CSS-hidden on < lg.
- **PageContainer**: `px-5` mobile → `lg:px-12` desktop. Max-width varies by `size` prop.
- **Touch target sizes**: GlassIconButton `default` = 44×44px (WCAG 2.5.5). NavButton = 64px. OfflineBanner buttons = 36px (compromise). AuthModal close button = 32px (below HIG).

### 17.9 Rendering strategy

- **SolidStart SSR** with `createHandler` / `StartServer`.
- **`deferStream: true`** on deep-link routes (`/movie/[id]`, `/tv/[id]`) so SSR waits for TMDB data before sending HTML.
- **Hydration after `mount()`** — `entry-client.tsx:30` mounts first; Speed Insights and SW registration are deferred via `requestIdleCallback` / `window.load` event.
- **Per-route Suspense + ErrorBoundary** for graceful degradation.
- **Lazy-loaded heavy modals** (DetailsModal, CollectionModal) — each has a Portal-based Suspense fallback.
- **Dynamic `import()`** for the heaviest library (`html2canvas` ~300KB) — only loaded on share-card generation.

---

## 18. Performance Audit

### 18.1 Current optimizations

1. **Three-layer TMDB caching**: in-memory `apiCache.ts` (10 min) → localStorage `cinelog_tmdb_cache` (24h) → Supabase `tmdb_cache` table (7d SWR, shared cross-user).
2. **Triple-dedup IMDb ratings**: LRU cache (500 entries) → in-flight Set → IntersectionObserver (disconnects after first intersection).
3. **Lazy-loaded heavy modals** (DetailsModal, CollectionModal) — each with Portal-based Suspense fallback.
4. **Dynamic import for html2canvas** (~300KB, only loaded on share-card generation).
5. **Module-level style constants in MovieCard** (avoids ~1000 object allocations per page mount with ~100 cards).
6. **Local `localIsFav` signal in MovieCard** (INP optimization — avoids re-evaluating `isFavourite()` on every card when collections mutate).
7. **`createMemo` for derived reactive styles** in MovieCard (stable object identity between unrelated reactive updates).
8. **`createMemo` + `createResource` source key** in `useMdbListRatings` (combines `tmdbId` + `mediaType` into a single memo so refetch only fires on real identity change).
9. **`deferStream: true`** for SEO-critical deep links (chat-app scrapers see real posters).
10. **Per-route Suspense + ErrorBoundary** for graceful degradation.
11. **Route prefetch on hover/touch/focus** (`prefetchRoute(path)` memoized `import()` fire-and-forget).
12. **Vercel Speed Insights** wired via `requestIdleCallback`.
13. **CDN preconnect** to `image.tmdb.org`, `fonts.googleapis.com`, `fonts.gstatic.com`.
14. **`SafeImage.tsx`** wrapper with `loading="lazy"` + `decoding="async"` defaults + width/height for CLS reservation.
15. **MovieCard** uses `loading="lazy"` + `decoding="async"` + intrinsic `width={342|500}` / `height={513|750}` (fixes CLS).
16. **Poster quality tiers** user-configurable.
17. **Banner compression** (Canvas resize to 1920×600 at JPEG quality 0.85 before upload).
18. **`fetchWithTimeout`** (10s AbortController) + `fetchWithRetry` (1 retry, 1s/2s backoff, never retries AbortError/4xx).
19. **In-flight dedup** in `apiCache.ts` + `anilist/client.ts` (shares Promise for concurrent identical requests).
20. **Chunked parallel fetch** for `fetchTmdbMetadataBatch` (`CHUNK_SIZE=20`) — prevents main-thread blocking on 1000+ item vaults.
21. **FOUT prevention for Material Symbols** (inline `<script>` adds `.mat-syms-loaded` class after `document.fonts.ready` resolves OR 800ms fallback timeout).
22. **Unhandled rejection handler** in `entry-server.tsx` (prevents Node crashes from transient API errors during SSR).
23. **Per-route code splitting** via `lazy(() => import(...))` for non-trivial route pages.

### 18.2 Bundle splitting

- File-routes (built-in via SolidStart/Vinxi).
- Explicit `lazy()` for heavy modals.
- Dynamic `import()` for html2canvas.
- Route prefetch on hover/touch/focus.

### 18.3 Memoization

- `createMemo` for derived reactive styles + source keys.
- Module-level constants to avoid per-render allocations.
- Local signals for INP optimization.

### 18.4 Caching

See §6.8 for full caching layers summary.

### 18.5 Rendering

- SolidStart SSR.
- `deferStream: true` for SEO-critical routes.
- Hydration after `mount()`.
- Per-route Suspense + ErrorBoundary.

### 18.6 Images

- `SafeImage.tsx` wrapper with lazy loading + async decoding + width/height.
- MovieCard intrinsic dimensions for CLS.
- Poster quality tiers.
- Banner compression.
- CDN preconnect.

### 18.7 Fonts

- Google Fonts: Bebas Neue, Outfit (6 weights), Azeret Mono, Material Symbols Outlined.
- `&display=swap` on every request.
- FOUT prevention for Material Symbols via inline script.
- Preconnect to `fonts.googleapis.com` + `fonts.gstatic.com`.

### 18.8 PWA

- Service worker registered in production (push only — no fetch handler).
- No offline support.

### 18.9 Network

- `fetchWithTimeout` (10s) + `fetchWithRetry` (1 retry).
- In-flight dedup.
- Chunked parallel fetch.
- CDN caching strategy well-tuned (5-30 min for public, 60s for user-specific, no-store for mutations).

### 18.10 Largest bottlenecks

1. **Two duplicate `UpcomingPage.tsx` files** — `src/features/profile/UpcomingPage.tsx` (1355 lines) is dead; risks accidental import / inflation.
2. **Vitest coverage `include` list references non-existent files** (`features/dashboard/recommendationEngine.ts`, `features/dashboard/dashboardAdapter.ts` — directory doesn't exist).
3. **Pervasive inline `style={{...}}` literals** in JSX (60+ matches) — each creates a new object per render. `MovieCard.tsx` extracted these to module constants (good pattern), but most other components have not.
4. **Per-card `IntersectionObserver`** in `useLazyImdbRating` — 100+ observers on Discover. Should be a shared pool.
5. **CSS bundle** — 17 feature CSS files + 14 component CSS files + 11 token CSS files imported via `globals.css` cascade. Could benefit from critical-CSS extraction for the Discover route.
6. **Render-blocking Google Fonts CSS request** — could self-host via `@fontsource/*`.
7. **`html2canvas` is 300 KB** and has known issues with modern CSS (`backdrop-filter`, `aspect-ratio`).
8. **`stats.ts` computes all stats client-side** after TMDB enrichment — O(n) per chart; won't scale past ~10k items.

### 18.11 Future improvements

- Adopt a **shared `IntersectionObserver` pool** for `useLazyImdbRating` (single observer with `WeakMap<element, callback>`).
- **Migrate inline `style={{...}}` to Tailwind classes** or to module-level constants (following the `MovieCard.tsx` pattern).
- **`<link rel="preload" as="image">`** for the first 3 Discover posters (above-the-fold LCP).
- **Self-host Google Fonts** via `@fontsource/*` to eliminate the render-blocking `fonts.googleapis.com` CSS request.
- **Replace `html2canvas`** with `dom-to-image-more` or server-side rendering via Playwright/Puppeteer in a serverless function.
- **`stale-while-revalidate` on TMDB image CDN** via `Cache-Control` on `image.tmdb.org` (currently relies on browser HTTP cache only).
- **Implement runtime caching for the app shell** in the service worker (Cache-First for static assets, Network-First for HTML, Stale-While-Revalidate for API calls).
- **Move stats computation server-side** (materialized view or Supabase Edge Function).

---

## 19. PWA Audit

### 19.1 Manifest (`public/manifest.json`)

```json
{
  "name": "CineLog V2",
  "short_name": "CineLog",
  "description": "Your cinematic watchlist and discovery app",
  "start_url": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#0f0f0f",
  "theme_color": "#7c3aed",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

**Missing fields**: `lang`, `dir`, `scope`, `id`, `display_override`, `categories`, `shortcuts`, `screenshots`, `prefer_related_applications` / `related_applications`, `launch_handler`, `edge_side_panel`, `handler_url`.

**Issues**:
- **`theme_color` mismatch**: manifest says `#7c3aed` (purple), entry-server `<meta name="theme-color" content="#7c3aed">` matches, BUT default theme `cinematic` uses `--p: #e8b74a` (cinema gold). Status bar / splash / home-screen icon will be purple while app content is gold.
- `background_color: "#0f0f0f"` — doesn't match `--void: #0a0a0a` (dark) or `--void: #faf7f2` (light).
- Icons are auto-generated "C" monogram with purple accent — placeholder quality.
- Maskable icon has no safe-zone padding (will be cropped on circular/squircle masks).
- Missing: 192px maskable, SVG icon, 180px apple-touch-icon, monochrome icon.

### 19.2 Service worker (`public/sw.js`)

**Scope**: `/`. **Lifetime**: persistent; survives tab close. Activated immediately via `skipWaiting()` + `clients.claim()`.

**Events handled**:
- `install` → `self.skipWaiting()`.
- `activate` → `self.clients.claim()`.
- `push` → parses JSON payload, calls `self.registration.showNotification(title, options)`. Defaults: `icon/badge = /favicon.ico`, `tag = "default"`, `requireInteraction: true`.
- `notificationclick` → closes notification, matches existing tabs at `notification.data.url`, focuses one if found, otherwise `clients.openWindow(url)`.
- `message` → handles `"SKIP_WAITING"` message from the page.

**What's missing**:
- **No `fetch` event handler** — the SW does NOT cache any requests. The app shell, API calls, images, fonts — nothing is cached. **The app has NO offline support.**
- **No `pushsubscriptionchange` event handler** — subscription rotation silently breaks push delivery.
- **No `periodicsync` event handler**.
- **No `sync` event handler**.
- **No Cache API usage**.
- **No versioning strategy**.
- **No `navigationpreload`**.
- **`requireInteraction: true` hardcoded** — all notifications stay until dismissed, even low-priority ones.

### 19.3 Service worker registration (`src/entry-client.tsx`)

- Registered on `window.load` (deferred so it doesn't compete with hydration).
- Production only (`import.meta.env.PROD`).
- Watches `updatefound` → `statechange` → if new SW is `installed` and a controller exists, posts `SKIP_WAITING`.
- Failures logged via `console.warn`, not propagated.

**Issues**:
- **No user-facing update notification** — new SW activates silently on next navigation.
- **No `controllerchange` listener** — after `SKIP_WAITING`, the page doesn't reload.
- **Dev mode gets no SW** — can't test push notifications locally.

### 19.4 Installability criteria

- ✅ Served over HTTPS (Vercel).
- ✅ Has manifest with required fields.
- ❌ **Has a registered service worker with a `fetch` handler** — **the SW has NO fetch handler.** Chrome historically required this; some Chrome versions relaxed this. The app may be installable in some browsers but not others.

### 19.5 Offline behavior

**What works offline**: Push notifications (if SW active), browser HTTP cache for static assets, localStorage, Supabase session (if previously stored).

**What does NOT work offline**: App shell (HTML/JS/CSS bundles), API calls, Supabase calls, TMDB image CDN, Google Fonts.

**Effectively, the app is NON-FUNCTIONAL offline.** The user sees a blank page or browser-level "You are offline" error.

### 19.6 Push notification support

- Full round-trip: subscribe → server send → SW shows notification → click-through.
- Test endpoint: `usePushSubscription.sendTest()`.
- Cleanup: `unsubscribe()` calls `subscription.unsubscribe()` (browser) AND deletes the `push_subscriptions` row (server).

### 19.7 Icon coverage

| File | Size | Purpose |
|---|---|---|
| `icon-192.png` | 33,648 bytes | 192×192, purpose `any` |
| `icon-512.png` | 221,976 bytes | 512×512, purpose `any` |
| `icon-512-maskable.png` | 221,976 bytes | identical to `icon-512.png`, purpose `maskable` (no safe-zone padding) |
| `favicon.ico` | 1,708 bytes | |

**Missing**: 192px maskable, SVG icon, 180px apple-touch-icon, monochrome icon, favicon variants (16/32/48px PNGs).

### 19.8 PWA limitations

1. **No offline support** — SW has no `fetch` handler.
2. **May fail Chrome installability** — missing fetch handler.
3. **Theme color mismatch** — purple vs gold.
4. **Icons are placeholders** — auto-generated "C" monogram.
5. **Maskable icon has no safe-zone padding**.
6. **No `pushsubscriptionchange` handling** — subscription rotation silently breaks push delivery.
7. **No update notification** — new SW activates silently.
8. **Dev mode gets no SW** — can't test push locally.
9. **`requireInteraction: true` hardcoded**.
10. **`robots.txt` references a non-existent sitemap** (`https://cinelog.app/sitemap.xml` — 404s).
11. **Domain ambiguity** — `cinelog.app` (canonical, robots) vs `cinelogv2.vercel.app` (auth redirect comment).

---

## 20. Accessibility Audit

### 20.1 Keyboard navigation

- **Focus-visible baseline** in `src/styles/base/base.css:130-143`: `:focus-visible { outline: 2px solid var(--p); outline-offset: 2px; }`.
- **Roving tabindex on `GlassTabs`** — full WAI-ARIA Tabs pattern. Arrow Left/Right/Up/Down, Home/End. Active tab `tabindex=0`, inactive `tabindex=-1`. Auto-activation model.
- **Focus trap in `GlassModal`** + `GlassSheet` — Tab + Shift+Tab wrap correctly. Uses `FOCUSABLE_SELECTOR` constant.
- **Focus restore on modal close** — `previouslyFocused` saved on open, restored via `requestAnimationFrame` on close.
- **ESC key** closes modals/sheets unless `disableBackdropClose`.
- **Auto-focus** on close button (preferred) or first focusable when modal opens.
- **MovieCard as button** — `role="button"` + `tabindex={0}` + `onKeyDown` for Enter/Space.

### 20.2 Screen reader support (ARIA)

- **Landmark roles**: `<header role="banner">`, `<nav role="navigation" aria-label="Primary navigation">`, `<aside role="navigation" aria-label="Desktop navigation">`, `<main id="main-content">` (single `<main>` per page — WCAG 1.3.1, 2.4.1).
- **`aria-current="page"`** on active NavButton.
- **`aria-modal="true"`** on every dialog.
- **`aria-labelledby`** wiring using `${id}-title` pattern.
- **`aria-label` on every icon-only button**.
- **`aria-pressed`** on toggle buttons.
- **Live regions**: `ToastContainer` has `aria-live="polite"` + `role="region"` + `aria-label="Notifications"`. Per-toast `role="status"` for info/success/action, `role="alert"` for errors.

### 20.3 Color contrast

- **Dark theme (default)**: text colors defined in `src/styles/tokens/colors.css`.
- **Light theme**: "Cinema Cream" palette with WCAG 2.1 AA tuning: muted 0.55→0.68 (3.38:1→4.5:1), dim 0.32→0.62 (1.91:1→4.0:1 for decorative/icon use, large text only).
- **High contrast mode**: boosts text to pure white (dark) or pure black (light), stronger borders.

### 20.4 Focus

- `:focus-visible` outline with accent color.
- Focus trap in modals.
- Restore focus on close.
- Auto-focus on open.

### 20.5 Contrast

See §20.3.

### 20.6 Reduced motion

- **Two layers**: OS-level `@media (prefers-reduced-motion: reduce)` universal selector with `!important` + user-explicit `[data-reduced-motion-active="true"]` opt-in preference.
- Named entrance animations get 120ms duration instead of 0.01ms.
- `ScrollToTop` respects reduced motion via `window.matchMedia?.("(prefers-reduced-motion: reduce)")` — uses `behavior: "auto"` instead of `"smooth"`.

### 20.7 Touch targets

- `NavButton` — 64px (exceeds WCAG 2.5.5 44px).
- MovieCard selection-mode checkbox — 44×44px.
- AppHeader action buttons — 36×36px (**below WCAG 2.5.5**).
- AuthModal close button — 32px (below HIG).

### 20.8 Skip links

**MISSING.** `<main id="main-content">` exists but no `<a href="#main-content" class="skip-link">` is rendered. WCAG 2.4.1 (Bypass Blocks) failure.

### 20.9 ARIA

See §20.2.

### 20.10 Accessibility problems

| Severity | Description | Files |
|----------|-------------|-------|
| Major | No skip-link to main content. | `AppShell.tsx` |
| Minor | AppHeader action buttons are 36×36px, below WCAG 2.5.5. | `AppHeader.tsx` |
| Minor | `AuthModal.tsx` uses its own dialog implementation rather than `GlassModal` — duplicates focus-trap logic. | `AuthModal.tsx` |
| Minor | Many decorative status badges use `aria-hidden="true"` even when they convey meaningful state (`MovieCard.tsx:442`). | `MovieCard.tsx` |
| Cosmetic | `<html lang="en">` is set but not overridable per-route for future i18n. | `entry-server.tsx` |
| UX | `AppShell.tsx:44-63` explicitly avoids `inert` on the background when a modal is open. Keyboard users on older AT may tab into the background. | `AppShell.tsx` |

---

## 21. Security Audit

### 21.1 Secrets / Environment variables

All env vars read via `process.env.*` (server-only). The browser client reads only `import.meta.env.VITE_*`. Verified secrets never reach the client bundle:

- `SUPABASE_SERVICE_ROLE_KEY` — server-only. `createAdminClient()` throws if called on browser.
- `ADMIN_PIN` — server-only, compared constant-time.
- `ADMIN_JWT_SECRET` — server-only, requires ≥16 chars (should be 32+).
- `MDBLIST_API_KEY`, `TMDB_API_KEY` — server-only.
- `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_CONTACT_EMAIL` — server-only.
- `CRON_SECRET` — server-only, compared constant-time.
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL` — server-only.
- `ANILIST_ACCESS_TOKEN` — server-only.

**Regression**: `OMDB_KEY = import.meta.env.VITE_OMDB_API_KEY` in `core/omdb/omdb.ts:5` — this key IS in the browser bundle.

### 21.2 CSRF protection

- **Cookie-based CSRF not used** — consumer Supabase client stores sessions in localStorage. Browser→server auth uses `Authorization: Bearer` header or `body.accessToken`.
- **Admin cookie** uses `SameSite=Strict` — strongest CSRF defense.
- **Cron routes** use `x-cron-secret` header or `Authorization: Bearer` — constant-time compared.
- **No CSRF tokens** anywhere. SameSite=Strict is the sole CSRF defense for admin routes.

### 21.3 XSS prevention / CSP

- **Strict CSP** in `vercel.json`: `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live; ...`.
- **`'unsafe-inline'` and `'unsafe-eval'`** in `script-src` — needed for SolidStart's hydration inline script. Could be tightened with nonce-based CSP.
- **Single `innerHTML` usage** — `entry-server.tsx:137`. Static string with no user input — no XSS vector.
- **No `dangerouslySetInnerHTML`** (React API; SolidJS uses `prop:innerHTML`).
- **`html2canvas` renders user-generated content** to Canvas (not DOM) — no XSS risk.

### 21.4 SQL injection risks

- **All DB access via Supabase SDK** — uses parameterized queries. No raw SQL strings.
- **`.rpc()` calls** invoke stored procedures with named parameters — no string concatenation.
- **`.ilike()` / `.eq()` / `.or()`** use parameterized values.
- **Risk: LOW.** No raw SQL injection vectors found.

### 21.5 Rate limiting

| Endpoint | Limit | Storage | Effective? |
|---|---|---|---|
| `/api/admin/auth` | 5 failures / 15 min | In-memory | **No-op on Vercel serverless** |
| `/api/account/delete` | 5 failures / 15 min | In-memory | **No-op on Vercel serverless** |
| `/api/push/send` | 30 sends / 1 min | In-memory | No-op on Vercel |
| `/api/push/status` | 20 requests / 1 min | In-memory | No-op on Vercel |
| `/api/email/send` | 10 sends / 24 h | In-memory | No-op on Vercel |
| All `/api/admin/*` mutations | **NONE** | — | — |

**Critical gap**: In-memory rate limiters reset on every Vercel cold-start.

### 21.6 Authentication security

- **Supabase Auth with PKCE flow**.
- **Sessions in localStorage** (NOT cookies) — XSS-vulnerable (mitigated by strict CSP, but CSP allows `'unsafe-inline'` and `'unsafe-eval'`).
- **`autoRefreshToken: true`** + `detectSessionInUrl: true`.
- **Admin cookie** — `HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=14400` (4 hours). HttpOnly prevents JS exfiltration. SameSite=Strict prevents CSRF. Max-Age=4h limits exposure window.
- **Admin JWT** is HS256, signed with `ADMIN_JWT_SECRET` (≥16 char enforced, should be 32+). Verification uses constant-time comparison.
- **PKCE verifier missing** recovery path in `auth/callback.tsx`.

### 21.7 Authorization

- **`requireAdmin()`** — three-layer verification: JWT cookie signature + DB lookup + PIN already verified.
- **RLS** is enforced on the user-facing Supabase client (anon key). The admin client (service role) bypasses RLS — appropriate for admin-only routes.
- **Per-route authorization checks** — every `/api/admin/*` route calls `requireAdmin()` first.
- **Self-only mutations** — `/api/push/send` and `/api/email/send` enforce `callerUid === userId`.
- **Audit logging** — `logAdminAction()` called for every admin mutation.

### 21.8 Input validation

- `typeof body.field === "string"` checks.
- Enum validation via `normalizeDefaultView()` — accepts only known values.
- Pagination bounds: `Math.min(100, Math.max(1, parseInt(...)))`.
- Confirmation text matching for destructive ops.
- **Gap**: Admin route input validation doesn't check enum values before DB insert (`admin/announcements.ts`, `admin/content.ts`). Postgres rejects invalid enums with leaky 500.
- **Gap**: No length limits on admin string inputs.

### 21.9 File upload security (banners bucket)

- Client-side compression (Canvas resize to 1920×600, JPEG quality 0.85).
- Upload path: `${userId}/banner.jpg` — RLS enforces per-uid folder.
- `upsert: true` — overwrites previous banner.
- `contentType: "image/jpeg"` hardcoded — prevents MIME-type confusion.
- Fallback to base64 data URL on upload failure (bloats DB row).
- **Gap**: No client-side file type validation before compression.
- **Gap**: No file size limit on the client before compression.

### 21.10 Potential risks

1. **In-memory rate limiters reset on Vercel cold-start** — `/api/account/delete` limiter is effectively a no-op.
2. **Admin mutation routes have no rate limiting** — compromised admin token could spam DB writes.
3. **OMDB API key exposed in browser bundle**.
4. **Sessions in localStorage** — XSS-exfiltrable.
5. **`script-src 'unsafe-inline' 'unsafe-eval'`** in CSP — could be tightened with nonces.
6. **No CSRF token** for admin routes — SameSite=Strict is the sole defense.
7. **Admin JWT secret minimum 16 chars** — too weak for production.
8. **No enum validation on admin inputs** — leaky 500 errors.
9. **No file size validation for banner uploads** — OOM risk on low-end devices.
10. **`signOut()` default scope is `global`** — may surprise users.
11. **`weekly_recap` pg_cron migration has unresolved placeholders**.
12. **`database.types.ts` is severely outdated** — TypeScript can't catch schema mismatches.

---

## 22. Dependency Audit

### 22.1 Runtime dependencies

| Package | Version | Purpose | Still needed? | Heavy? | Notes |
|---------|---------|---------|---------------|--------|-------|
| `@solidjs/meta` | `^0.29.4` | `<Title>` / `<Meta>` tags for per-route SEO | ✅ Yes | ~3KB | Used in 42+ files |
| `@solidjs/router` | `^0.14.5` | Client + SSR router | ✅ Yes | ~15KB | Used in 42 files |
| `@solidjs/start` | `^1.0.10` | SolidStart meta-framework | ✅ Yes | Framework | — |
| `@supabase/supabase-js` | `^2.110.2` | Supabase client | ✅ Yes | ~50KB gzipped | Used in 26 files |
| `@thisbeyond/solid-dnd` | `^0.7.5` | Drag-and-drop | ✅ Yes | ~15KB | Only loaded when ReorderModal opens |
| `@vercel/speed-insights` | `^2.0.0` | Real-user monitoring | ✅ Yes (if on Vercel) | ~3KB | No-op in dev |
| `date-fns` | `^4.4.0` | `format`, `parseISO` | ⚠️ Marginal | Tree-shakeable, but only 2 functions used in 1 file | Replace with native `Intl.DateTimeFormat` + `Date.parse` |
| `html2canvas` | `^1.4.1` | Rasterize share cards to PNG | ✅ Yes (for share feature) | **~300KB** | Dynamically imported. Consider server-side Playwright |
| `qrcode` | `^1.5.4` | 2FA QR code PNG generation | ✅ Yes | ~25KB | Could use `qrcode-generator` (smaller) |
| `solid-js` | `^1.9.3` | The framework | ✅ Yes | Framework | Used in 250+ files |

### 22.2 Dev dependencies

| Package | Version | Purpose | Still needed? | Notes |
|---------|---------|---------|---------------|-------|
| `@solidjs/testing-library` | `^0.8.10` | Solid-specific `render()`, `fireEvent` | ✅ Yes | — |
| `@testing-library/jest-dom` | `^6.9.1` | Custom matchers | ✅ Yes | — |
| `@types/node` | `^20.12.7` | Node types | ✅ Yes | — |
| `@types/qrcode` | `^1.5.6` | TypeScript types for `qrcode` | ✅ Yes | — |
| `@types/web-push` | `^3.6.4` | TypeScript types for `web-push` | ✅ Yes | — |
| `@typescript-eslint/eslint-plugin` | `^7.8.0` | TS-specific lint rules | ✅ Yes | — |
| `@typescript-eslint/parser` | `^7.8.0` | TS parser for ESLint | ✅ Yes | — |
| `@vitest/coverage-v8` | `^4.1.10` | V8 native coverage | ✅ Yes | — |
| `autoprefixer` | `^10.4.19` | PostCSS plugin | ✅ Yes | — |
| `eslint` | `^8.57.0` | Linter | ✅ Yes | **v8 is EOL** — upgrade to v9 |
| `eslint-plugin-solid` | `^0.14.5` | Solid-specific lint rules | ✅ Yes | — |
| `jsdom` | `^^29.1.1` | DOM environment for Vitest | ✅ Yes | — |
| `postcss` | `^8.5.18` | CSS post-processor | ✅ Yes | — |
| `prettier` | `^3.2.5` | Code formatter | ✅ Yes | — |
| `prettier-plugin-tailwindcss` | `^0.5.14` | Sorts Tailwind classes | ✅ Yes | — |
| `supabase` | `^2.109.1` | Supabase CLI | ✅ Yes | — |
| `tailwindcss` | `^3.4.3` | Utility-first CSS framework | ✅ Yes | Consider upgrading to v4 |
| `typescript` | `^5.4.5` | Type checker | ✅ Yes | — |
| `vinxi` | `^0.5.7` | SolidStart's build orchestrator | ✅ Yes | — |
| `vitest` | `^4.1.10` | Test runner | ✅ Yes | — |
| `web-push` | `^3.6.7` | VAPID signing + Web Push protocol | ✅ Yes | — |

### 22.3 Dependency recommendations

1. **`date-fns`** — used for only 2 functions in 1 file. Replace with `Intl.DateTimeFormat` and `new Date(isoString)`.
2. **`html2canvas`** — 300 KB is significant. Consider server-side rendering via Playwright.
3. **`tailwindcss`** — consider v4 upgrade for CSS-first config and 2-3× faster builds.
4. **`eslint`** — v8.57 is EOL. Upgrade to v9 (flat config required).
5. **`@typescript-eslint/*`** — v7.x pairs with eslint v8. When eslint upgrades to v9, upgrade to v8.x.
6. **No unused dependencies found** — every runtime dep has at least one usage.

### 22.4 Firebase remnants

**Zero runtime dependencies on Firebase.** No imports of `firebase`, `firebase-admin`, `firebase/app`, `firebase/auth`, `firebase/firestore`, etc. `package.json` does not list any Firebase package. `supabase/config.toml:351-354` contains a commented-out `[auth.third_party.firebase]` block — this is the default Supabase config template, NOT a CineLog integration. 18+ files have historical/migration comments referencing Firebase — all documentation only.

---

## 23. Dead Code Audit

### 23.1 Unused files (verified via grep)

| File | Status | Evidence |
|------|--------|----------|
| `src/features/profile/UpcomingPage.tsx` (1355 LOC) | **DEAD** | 0 imports — duplicate of `features/upcoming/UpcomingPage.tsx` |
| `src/shared/ui/primitives/Button.tsx` | **DEAD** | 0 imports via `~/shared/ui` barrel |
| `src/shared/ui/primitives/Skeleton.tsx` | **DEAD** | 0 imports via `~/shared/ui` barrel |
| `src/shared/ui/glass/GlassChip.tsx` | **DEAD** | Only barrel export references it |
| `src/shared/ui/glass/GlassDivider.tsx` | **DEAD** | Only barrel export references it |
| `src/shared/ui/glass/GlassListItem.tsx` | **DEAD** | Only barrel export references it |
| `src/shared/ui/glass/GlassSearchBar.tsx` | **DEAD** | Only barrel export references it |
| `src/shared/ui/glass/GlassSectionHeader.tsx` | **DEAD (transitively)** | Only used by SectionContainer, which is also dead |
| `src/shared/ui/layout/SectionContainer.tsx` | **DEAD** | 0 imports outside `layout/` directory |
| `src/features/discover/components/RelationshipPill.tsx` | **DEAD** | Only mentioned in a comment in `franchises.ts` |

### 23.2 Unused CSS files

- `src/styles/layout/container.css` and `src/styles/utilities/visibility.css` are explicitly empty (kept "for architecture completeness"). Dead files.
- `_phase21.css` and `_phase22_sprint1.css` contain some classes noted as "removed (dead)" in comments but the files still exist.

### 23.3 Unused functions

- `enrichWithEpisodeProgress` (sync) in `vaultReadAdapter.ts` returns `items` as a placeholder — never actually enriches; only `enrichWithEpisodeProgressAsync` is called.
- `ProfileBanner.onChooseBanner` prop — dead (V3.1 cleanup note in file).
- `saveOverrides` method on `useCollections` — for compat but no UI invokes it (universe overrides removed in v4).

### 23.4 Unused exports

- `primitives/Button.tsx` and `primitives/Skeleton.tsx` are exported from `~/shared/ui/index.ts` barrel but never imported by any consumer.
- Glass components `GlassChip`, `GlassDivider`, `GlassListItem`, `GlassSearchBar`, `GlassSectionHeader` are exported from `~/shared/ui/glass/index.ts` barrel but never imported by any consumer.

### 23.5 Commented-out code blocks

Found various inline comments documenting past bug fixes (e.g., `BUG 1 fix`, `BUG 2 fix`, `BUG 3 fix` in `DetailsModal.tsx`, `SeasonNavigator.tsx`, `useModalState.ts`). These are documentation, not dead code.

### 23.6 TODO / FIXME / BUG / HACK comments

| File:Line | Tag | Comment Summary |
|-----------|-----|-----------------|
| `routes/api/admin/tmdb-cache.ts:14` | TODO | "POST /api/admin/tmdb-cache/refresh?id=<uuid> — re-fetch from TMDB (TODO)" — endpoint not implemented |
| `features/profile/UpcomingPage.tsx:562` | TODO | "to avoid hammering TMDB. The rest lazy-load on scroll (TODO)." — but this file is dead |
| `features/details/DetailsModal/DetailsModal.tsx:260, 310` | BUG 1, BUG 2 | "if the modal unmounts unexpectedly (BUG 1 fix)" — already fixed |
| `features/details/components/SeasonNavigator.tsx:87` | BUG | "v2.5 — FIXED THE 'DOUBLE-CLICK' BUG:" — fixed |
| `routes/auth/callback.tsx:19` | BUG | "BUG: After logout + clear browser cache + login, the PKCE code verifier cookie is missing" — fixed via getSession fallback |
| `routes/movie/[id].tsx:26, 139` | BUG | "MODAL CLOSE BUG" — fixed by calling `setSelectedItem()` directly instead of `openTitle()` |
| `features/collections/__tests__/collectionAdapter.test.ts:291` | BUG 3 | Regression test for ilike search matching "favorites" |
| `features/sync/backup/BackupService.ts:675` | BUG HISTORY | Documents past bugs in backup |
| `shared/hooks/useModalState.ts:35` | BUG 3 | "HISTORY SYNC (BUG 3 fix)" — fixed |

### 23.7 Duplicate code

- **Two `UpcomingPage.tsx` files** — `features/profile/` (dead, 1355 LOC) vs `features/upcoming/` (live, 659 LOC).
- **Two `PageContainer.tsx` files** — `shared/ui/PageContainer.tsx` (legacy, used by ~22 routes) vs `shared/ui/layout/PageContainer.tsx` (newer, used by `ProfilePage` only).
- **`accentHelpers.ts` duplicates `~/core/preferences/customAccent`** verbatim — acknowledged tech debt.
- **`AchievementsPreview` duplicates the BADGES array from `AchievementsPage`** — acknowledged tech debt.
- **Focus trap logic duplicated** between `GlassModal` and `GlassSheet` — should be extracted to a shared hook.
- **Inline `style={{...}}` literals** pervasive (60+ matches) — MovieCard extracted to module constants as the gold-standard pattern; the rest haven't followed.
- **Style constants duplicated** in `AppHeader` (`HEADER_ACTION_STYLE`, `AVATAR_STYLE`) — should use `GlassIconButton`.
- **Status badge CSS** in MovieCard (`tag-chip` + `status-badge-*` classes) — should use `GlassBadge`.

### 23.8 Unused routes

- `/search` — redirects to `/discover` (search was merged). Old links preserved.
- `/details/movie/[id]` and `/details/tv/[id]` — backwards-compat redirects to `/movie/:id` and `/tv/:id`.
- `/settings/developer` — redirects to `/settings/about`.

### 23.9 Unused imports

Found ~80 `!` non-null assertions (mostly safe inside `<Show>` blocks but a TS narrowing gap). ~50 `as unknown` casts (mostly Supabase JSON column casts — necessary). 40+ silent `catch {}` blocks (mostly safe best-effort cleanup).

---

## 24. Bug Audit

### 24.1 Critical

| ID | Description | Files | Cause | Recommendation |
|----|-------------|-------|-------|----------------|
| **Crit-1** | In-memory rate limiter on `/api/account/delete` is a no-op on Vercel serverless (cold starts reset state). A malicious user could brute-force the email-confirmation string with no effective throttle. | `routes/api/account/delete.ts:89-128` | In-memory `Map` doesn't persist across serverless invocations | Migrate to DB-backed rate limiter or Vercel KV / Upstash Redis |

### 24.2 Major

| ID | Description | Files | Cause | Recommendation |
|----|-------------|-------|-------|----------------|
| **Maj-1** | 1355-line dead duplicate `UpcomingPage.tsx` inflates the repo and risks accidental import. | `src/features/profile/UpcomingPage.tsx` | Stale file from before the `features/upcoming/` refactor | Delete the file |
| **Maj-2** | Vitest coverage config references non-existent files (`features/dashboard/recommendationEngine.ts`, `features/dashboard/dashboardAdapter.ts`). | `vitest.config.ts:83-95` | Dashboard feature was removed; config not updated | Remove the dead `include` entries |
| **Maj-3** | Admin mutation routes (POST/PATCH/DELETE on `/api/admin/*`) have no rate limiting. A compromised admin token could spam DB writes. | `routes/api/admin/collections.ts`, `content.ts`, `announcements.ts`, `users.ts`, etc. | Only `requireAdmin()` is called | Add per-admin rate limiter |
| **Maj-4** | `/admin/collections/[id]` does NOT wrap with `<AdminShell>` and does NOT call `useAdminAuth()` / `requireAdmin()`. Non-admin visitors can render the editor chrome (UI shell not gated). API calls are still protected server-side, so this is a UX/consistency bug, not a data-leak. | `routes/admin/collections/[id]/index.tsx` | Inconsistent with every other `/admin/*` route | Wrap with `<AdminShell>` like every sibling admin route |
| **Maj-5** | No `[...404].tsx` catch-all route exists. Unknown URLs render SolidStart's default (likely blank). | `src/routes/` | Oversight | Add `src/routes/[...404].tsx` |

### 24.3 Minor

| ID | Description | Files | Cause | Recommendation |
|----|-------------|-------|-------|----------------|
| **Min-1** | Admin route input validation doesn't check enum values before DB insert. Postgres rejects invalid enums with a 500 error that leaks DB error message. | `admin/announcements.ts:95-108`, `admin/content.ts:114-126` | `body.type`, `body.severity`, etc. cast without validation | Add explicit `if (!["banner","toast","modal"].includes(body.type)) return 400` |
| **Min-2** | No client-side file size validation for banner uploads. A 50MB photo loads into memory before canvas compression. | `imageCompress.ts:35` | Missing `file.size` check | Add `if (file.size > 10_000_000) throw new Error("File too large")` |
| **Min-3** | AppHeader action buttons are 36×36px, below WCAG 2.5.5 (44×44). | `AppHeader.tsx:29-30` | Design choice | Increase to 44×44px |
| **Min-4** | No skip-link to main content. | `AppShell.tsx` | Oversight | Add `<a href="#main-content" class="skip-link">Skip to content</a>` |
| **Min-5** | `AuthModal.tsx` uses its own dialog implementation instead of `GlassModal`, duplicating focus-trap logic. | `AuthModal.tsx:134` | Refactor incomplete | Migrate to `GlassModal` |
| **Min-6** | 7 Glass UI components (`GlassChip`, `GlassDivider`, `GlassListItem`, `GlassSearchBar`, `GlassSectionHeader`, `SectionContainer`, `primitives/Button`, `primitives/Skeleton`) are dead code. | `src/shared/ui/glass/*`, `src/shared/ui/layout/SectionContainer.tsx`, `src/shared/ui/primitives/*` | Refactor left orphans | Delete or remove from barrel exports |
| **Min-7** | `RelationshipPill.tsx` is dead — only a comment in `franchises.ts` references it. | `src/features/discover/components/RelationshipPill.tsx` | Refactor orphan | Delete |
| **Min-8** | `/collections/[id]` is missing `<Title>` tag (every other route sets one). | `routes/collections/[id]/index.tsx` | Oversight | Add `<Title>` |
| **Min-9** | `/settings/developer` redirect target inconsistent with file comment. Comment says "moved to /admin/developer" but redirects to `/settings/about`. | `routes/settings/developer.tsx` | Misleading comment | Either update the comment or change the redirect |
| **Min-10** | `routes/api/admin/users.ts` file header documents `DELETE /api/admin/users?id=<uuid>` but only `GET` and `PATCH` are exported. | `routes/api/admin/users.ts` | Stale header comment | Update header or implement DELETE |
| **Min-11** | `routes/api/admin/content.ts` header documents `POST /api/admin/content/reorder` as a separate route but it doesn't exist. | `routes/api/admin/content.ts` | Stale header comment | Update header or implement reorder route |
| **Min-12** | `routes/api/admin/tmdb-cache.ts` header documents `POST /api/admin/tmdb-cache/refresh?id=<uuid>` as TODO — not implemented. | `routes/api/admin/tmdb-cache.ts` | TODO not done | Implement or remove from header |
| **Min-13** | AppHeader searchInputRef collision — both desktop and mobile `<input>` elements write to the same `searchInputRef`. | `AppHeader.tsx` | Subtle bug | Use separate refs |
| **Min-14** | GlassSheet swipe-down claim is false — doc comment says "swipe down" closes the sheet, but there is no swipe gesture handler. | `glass/GlassSheet.tsx` | Documentation lies | Remove "swipe down" claim or implement swipe-down gesture |
| **Min-15** | GlassSheet no exit animation — only entrance (`animate-slide-up`) is animated. Close just unmounts via `<Show>`. | `glass/GlassSheet.tsx` | Missing exit transition | Add exit animation |
| **Min-16** | GlassAvatar.getInitials returns single char — function name lies. | `glass/GlassAvatar.tsx` | Misleading function name | Return real initials or rename to `getInitial` |
| **Min-17** | `accentHelpers.ts` `applyAccentToDocument` accepts 3-digit hex shorthand in regex but `hexToRgbaLocal` only handles 6-digit — silent fallback to green. | `features/settings/accentHelpers.ts` | Inconsistent regex | Either support 3-digit hex or reject it |
| **Min-18** | `useNotifications` fires browser notifications on mount for ALL due reminders — could spam. No rate-limit. | `features/upcoming/hooks/useNotifications.ts` | Missing rate-limit | Add per-session rate-limit |
| **Min-19** | Two `UpcomingPage.tsx` files exist — divergence risk. | `features/profile/UpcomingPage.tsx` vs `features/upcoming/UpcomingPage.tsx` | Stale file | Delete the dead one |
| **Min-20** | `ensureFavoritesExistsInSupabase` uses a module-level mutex but two concurrent tabs would still race (no DB-level unique constraint on `(user_id, name='Favorites')`). | `features/collections/hooks/useCollections.tsx` | Missing DB constraint | Add DB-level UNIQUE constraint |
| **Min-21** | `duplicateCollectionInSupabase` sequentially calls `addEntryToCollectionByTmdbId` per entry — slow for large collections (no batch insert). | `features/collections/collectionAdapter.ts` | No batch API | Implement batch insert |
| **Min-22** | `autoPurgeExpired` in trash runs on every `refetch()` — could delete items the user intended to restore if they wait too long. | `features/trash/hooks/useTrashData.ts` | Aggressive purge timing | Only run on first load |
| **Min-23** | `useTrashData` mutators return inconsistent types (boolean vs counts). | `features/trash/hooks/useTrashData.ts` | Inconsistent API | Standardize return types |
| **Min-24** | `AdminDashboard` polls every 60s — if the tab is left open, polls indefinitely (no pause on visibility change). | `features/admin/AdminDashboard.tsx` | Missing visibility check | Pause polling on `document.hidden` |
| **Min-25** | `useAdminAuth` uses module-level signals — if multiple admin tabs are open, they share state. | `features/admin/hooks/useAdminAuth.ts` | Module-level singleton | Document or use BroadcastChannel for cross-tab sync |
| **Min-26** | `usePushSubscription` doesn't handle the case where the user grants permission but `pushManager.subscribe` fails (e.g. VAPID key invalid) — leaves permission granted but no subscription. | `features/notifications/hooks/usePushSubscription.ts` | Missing error recovery | Reset permission state on subscribe failure |
| **Min-27** | `useAnimeSettings` `refresh()` clears cache but doesn't broadcast to other hook instances in the same tab. | `features/anime/useAnimeSettings.ts` | No broadcast | Use BroadcastChannel or module-level event |
| **Min-28** | `useDiscoverFeeds` returns `topRatedMovies`, `topRatedTv`, `newSeasons`, `nowPlaying` but DiscoverPage.tsx only consumes `upcoming` — dead signals still fetched on every region change. | `features/discover/hooks/useDiscoverFeeds.ts` | Refactor leftover | Remove unused signals |
| **Min-29** | OMDB API key exposed in browser bundle (`core/omdb/omdb.ts:5`). | `core/omdb/omdb.ts` | VITE_ prefix | Wrap in server proxy or delete |
| **Min-30** | `signOut()` default scope is `global` — signs user out of ALL devices. | `shared/hooks/useAuthActions.ts:86` | Default Supabase scope | Use `scope: "local"` for default sign-out |

### 24.4 Visual

| ID | Description | Files | Recommendation |
|----|-------------|-------|----------------|
| **Vis-1** | 60+ inline `style={{...}}` literals create per-render object allocations. | Many feature components | Migrate to Tailwind classes or module-level constants |
| **Vis-2** | Two `PageContainer` components exist (simple + premium). Only the premium one is used by `ProfilePage`; all other 22 pages use the simple one. | `src/shared/ui/PageContainer.tsx`, `src/shared/ui/layout/PageContainer.tsx` | Consolidate to one component |
| **Vis-3** | PWA identity mismatch — manifest `theme_color: #7c3aed` (purple) vs app default theme `cinematic` `--p: #e8b74a` (cinema gold). | `public/manifest.json`, `entry-server.tsx` | Align PWA identity with app identity |
| **Vis-4** | PWA icons are auto-generated "C" monogram with purple accent — placeholder quality. Maskable icon has no safe-zone padding. | `public/icon-*.png` | Generate proper designed icons |
| **Vis-5** | MovieCard status badge is `aria-hidden="true"` — invisible to screen readers. | `MovieCard.tsx:440-445` | Remove `aria-hidden` or add `aria-label` |
| **Vis-6** | `glass-system.css` silently overrides `--glass-bg` and `--glass-bg-strong` from `colors.css`. | `src/styles/components/glass-system.css` | Document or consolidate |

### 24.5 Logic

| ID | Description | Files | Recommendation |
|----|-------------|-------|----------------|
| **Log-1** | `apiCache.setInFlight` uses `.then(onFulfilled, onRejected)` instead of `.finally()` to avoid unhandled rejection noise — produces "uncaught (in promise)" warnings in dev tools. | `apiCache.ts:119-125` | Catch the derived promise explicitly OR document that the pattern is intentional |
| **Log-2** | The `useLazyImdbRating` hook creates one `IntersectionObserver` per card. With 100+ cards on Discover, this is 100+ observers. | `useLazyImdbRating.ts:242-269` | Implement a shared observer pool |
| **Log-3** | `useDetailsActions.handleSelectItem` calls `setSelectedItemDirect` instead of `useModalState.setSelectedItem` — bypasses history sync. | `features/details/DetailsModal/useDetailsActions.ts` | Use `setSelectedItem` |
| **Log-4** | `DetailsModal` registers a `keydown` listener on `window` but doesn't check if another modal (e.g. AddToFolderSheet) is open — Escape could close both simultaneously. | `features/details/DetailsModal/DetailsModal.tsx` | Check for nested modal state |
| **Log-5** | `useDetailsProgress.handleEpisodeUnmark` requires the caller (SeasonNavigator) to compute the rewind position — logic split across two files; if navigator computes wrong, the tracker corrupts. | `useDetailsProgress.ts`, `SeasonNavigator.tsx` | Consolidate logic |
| **Log-6** | Theme (8 accent presets) is NOT in `PreferencesSnapshot` — `cinelog_theme` localStorage key is synced only locally, not to Supabase. | `core/preferences/preferencesSync.ts` | Add `theme` to `PreferencesSnapshot` |
| **Log-7** | `stopPreferenceSync()` doesn't dispose the createEffect — it just nulls `activeUserId`. The effect continues to track signals and re-fire. | `core/preferences/preferencesSync.ts` | Dispose the effect properly |
| **Log-8** | `useUserLibrary.updateItem` does a shallow merge — nested fields like `watchProgress` will be replaced, not merged. | `shared/hooks/useUserLibrary.tsx` | Use deep merge for nested fields |
| **Log-9** | `useToast` has no deduplication — calling `showToast("Saved", "success")` twice shows two stacked toasts. | `shared/hooks/useToast.ts` | Add deduplication |
| **Log-10** | `useCollectionModal` has no history integration (unlike Details modal) — pressing Back while the Collection modal is open will navigate away. | `shared/hooks/useCollectionModal.ts` | Add history integration |
| **Log-11** | `useModalState.historyEntryOurs` is module-level — assumes only one Details modal at a time. | `shared/hooks/useModalState.ts` | Document or refactor |
| **Log-12** | `weekly_recap` pg_cron migration has unresolved placeholders (`<APP_URL>`, `<CRON_SECRET>`). | `supabase/migrations/20260803_add_weekly_recap_preferences.sql` | Replace with env vars or document |
| **Log-13** | `banners` bucket was missing until migration 20260805 — existing banner uploads fell back to data URLs. No migration backfills them. | `scripts/migrate_data_url_banners.ts` | Run the backfill script |

### 24.6 Performance

(Covered in §18.10)

### 24.7 Security

(Covered in §21.10)

### 24.8 UX

| ID | Description | Files | Recommendation |
|----|-------------|-------|----------------|
| **UX-1** | `AppShell.tsx:44-63` explicitly avoids `inert` on the background when a modal is open. Keyboard users on older AT may tab into the background. | `AppShell.tsx` | Add `inert` as a progressive enhancement |
| **UX-2** | MovieCard status badge is `aria-hidden="true"` — the status text ("Watching", "Completed") is invisible to screen readers. | `MovieCard.tsx:440-445` | Remove `aria-hidden` or add an `aria-label` conveying the status |
| **UX-3** | No "New version available" toast on SW `controllerchange`. | `entry-client.tsx` | Add update notification |
| **UX-4** | No offline support — user sees blank page if network drops. | `public/sw.js` | Add `fetch` handler + Cache API |
| **UX-5** | `requireInteraction: true` hardcoded in SW — all notifications stay until dismissed, even low-priority ones. | `public/sw.js` | Allow server to set per-notification |
| **UX-6** | `DesktopUtilityPanel` is mostly empty placeholder text. | `shared/ui/DesktopUtilityPanel.tsx` | Wire to real content or remove |

---

## 25. Improvement Opportunities

### 25.1 Easy (low effort, low risk)

1. **Delete `src/features/profile/UpcomingPage.tsx`** (1355 lines of dead code).
2. **Delete dead Glass/primitive components** (`GlassChip`, `GlassDivider`, `GlassListItem`, `GlassSearchBar`, `GlassSectionHeader`, `SectionContainer`, `primitives/Button`, `primitives/Skeleton`) + clean barrel exports.
3. **Delete `RelationshipPill.tsx`** and remove from `franchises.ts` comment.
4. **Fix `vitest.config.ts` coverage `include` list** — remove dead `features/dashboard/*` references.
5. **Add skip-link** in `AppShell.tsx`.
6. **Add enum validation** to admin routes (`announcements.ts`, `content.ts`).
7. **Add file size validation** to banner upload (`imageCompress.ts`).
8. **Increase AppHeader action button size** to 44×44px.
9. **Add `<Title>` tag** to `/collections/[id]` route.
10. **Fix `/settings/developer` redirect** — either update the comment or change the redirect.
11. **Update stale header comments** in `routes/api/admin/users.ts`, `routes/api/admin/content.ts`, `routes/api/admin/tmdb-cache.ts`.
12. **Fix `GlassAvatar.getInitials`** — return real initials or rename.
13. **Fix `GlassSheet` docs** — remove "swipe down" claim or implement swipe-down gesture.
14. **Add exit animation** to GlassSheet.
15. **Consolidate duplicate `PageContainer`** components.
16. **Migrate AuthModal to GlassModal** — replaces ~400 lines of hand-rolled Portal + GlassSurface + inline styles.
17. **Migrate MovieCard status badge to GlassBadge** — removes the parallel `tag-chip` + `status-badge-*` CSS.
18. **Migrate AppHeader buttons to GlassIconButton** — replaces `HEADER_ACTION_STYLE` / `AVATAR_STYLE` constants.
19. **Migrate AppHeader search to GlassInput / GlassSearchBar** — eliminates the duplicate desktop/mobile input ref bug.
20. **Run `scripts/migrate_data_url_banners.ts`** to backfill existing data-URL banners to Storage.
21. **Replace `date-fns`** with native `Intl.DateTimeFormat` (saves ~5KB gzipped).
22. **Add `[...404].tsx` catch-all route.**
23. **Add `lang`, `scope`, `categories`, `shortcuts`, `screenshots`** to manifest.
24. **Add per-mode `theme-color` meta tags** (dark/light) in `entry-server.tsx`.
25. **Add `apple-touch-startup-image`** for iOS splash.
26. **Generate or remove the `sitemap.xml` reference** in `robots.txt`.

### 25.2 Medium (moderate effort, moderate risk)

1. **Fix `/api/account/delete` rate limiter** — migrate to DB-backed or Vercel KV.
2. **Add rate limiting to admin mutation routes** (`/api/admin/*` POST/PATCH/DELETE).
3. **Regenerate `database.types.ts`** via `supabase gen types` to sync with live schema.
4. **Remove or proxy the OMDB integration** — either delete `core/omdb/omdb.ts` (it's superseded by MDBList) or wrap it in a server proxy like `/api/media/omdb-ratings`.
5. **Increase `ADMIN_JWT_SECRET` minimum to 32 chars** in `adminJwt.ts:89`.
6. **Replace `signOut()` default scope to `"local"`** in `useAuthActions.ts:86`.
7. **Add a CSRF token** for admin routes as defense-in-depth.
8. **Wire the `purge_soft_deleted_profiles` pg_cron job** — scheduled-deletion flow is documented but not automated.
9. **Add `rules` JSONB column to `collections`** for smart rule persistence.
10. **Add `is_hidden` column to `user_universe_subscriptions`**.
11. **Add DB-level UNIQUE constraint on `(user_id, name='Favorites')`**.
12. **Add `theme` to `PreferencesSnapshot`** so theme syncs across devices.
13. **Implement shared `IntersectionObserver` pool** for `useLazyImdbRating`.
14. **Migrate inline `style={{...}}` to module-level constants** (follow `MovieCard.tsx` pattern).
15. **Self-host Google Fonts** via `@fontsource/*` to eliminate the render-blocking `fonts.googleapis.com` CSS request.
16. **Replace `html2canvas`** with server-side Playwright snapshot.
17. **Upgrade `eslint` v8 → v9** (v8 is EOL).
18. **Tighten CSP** to nonce-based `script-src` (long-term).
19. **Add `inert` to background** when modal is open (progressive enhancement).
20. **Add `fetch` event handler to `sw.js`** (even a no-op) to satisfy installability.
21. **Implement runtime caching for the app shell** in the service worker.
22. **Add `pushsubscriptionchange` handler** to re-subscribe and update the server.
23. **Align PWA identity with app identity** — change `theme_color` to `#0a0a0a` or `#e8b74a`, regenerate icons with cinema-gold accent.
24. **Generate proper designed icons** (192, 192-maskable, 512, 512-maskable, 180-apple-touch, SVG, monochrome).
25. **Add "New version available" toast** on SW `controllerchange`.
26. **Allow server to set `requireInteraction` per notification** (read from push payload).
27. **Add tests** for Details, Settings, Sync, Account, Trash, Admin, Notifications, Anime features (high-risk untested features).
28. **Split large files** — `BackupService.ts`, `useSettingsState.tsx`, `SvgChart.tsx`, `useNotifications.ts` into smaller modules.
29. **Fix `enrichWithEpisodeProgress` stub** — either implement sync version or remove it (keep only async).
30. **Add `worker-src 'self'`** to CSP (explicitly allows `/sw.js`).
31. **Add `Cross-Origin-Opener-Policy: same-origin`** + `Cross-Origin-Embedder-Policy: require-corp` for process isolation.

### 25.3 Large (significant effort, higher risk)

1. **Implement full PWA offline support** — app shell caching, runtime caching strategies, background sync, periodic sync.
2. **Add Supabase Realtime subscriptions** for cross-device vault/collections sync (currently requires manual refresh).
3. **Move stats computation server-side** — materialized view or Supabase Edge Function (won't scale past ~10k items client-side).
4. **Implement collaborative filtering / ML-based recommendations** — server-side personalization using vault data.
5. **Implement social features** — public profiles, follows, shared collections (currently removed).
6. **Add i18n / multi-language support** — currently English-only.
7. **Migrate user sessions from localStorage to httpOnly cookies** (Supabase cookie storage) — eliminates XSS-exfiltration risk.

### 25.4 Future

1. **Add JustWatch / MAL / Kitsu providers** via the existing `MetadataProvider` plugin architecture.
2. **Add streaming integration** (deep-link to Netflix/Prime Video/Disney+ when user has the app installed).
3. **Add watch party / co-browsing** feature.
4. **Add AI-powered "what should I watch"** natural language query.
5. **Add Chromecast / AirPlay support** for trailers.
6. **Add calendar export** (iCal / Google Calendar) for upcoming releases.
7. **Add RSS feed** for upcoming releases.
8. **Add public API** for third-party integrations.

### 25.5 Technical debt

1. **`database.types.ts` drift** — months out of date.
2. **8 dead Glass/primitive components** still in the barrel.
3. **2 duplicate `PageContainer.tsx` files**.
4. **`accentHelpers.ts` duplicates `customAccent.ts`**.
5. **`AchievementsPreview` duplicates BADGES** from `AchievementsPage`.
6. **4 redundant `position` columns** on `curated_universe_entries`.
7. **`activity_log.entity_id` is UUID-typed but unused**.
8. **`universe_phases.before_entry_id` is TEXT** storing either UUIDs or TMDB-id-strings.
9. **Vitest coverage config references non-existent files**.
10. **`_phase21.css` and `_phase22_sprint1.css`** kept "as-is to avoid CSS modifications".
11. **2 empty CSS files** (`layout/container.css`, `utilities/visibility.css`).
12. **`useVault()` marked deprecated** but still used by 25+ consumers.
13. **60+ inline `style={{...}}` literals** in feature components.

### 25.6 UX

1. **Add skip-link** for keyboard users.
2. **Add "New version available" toast** on SW update.
3. **Add offline support** — blank page on network drop is unacceptable for a PWA.
4. **Add "Not interested" dismiss action** on Discover cards.
5. **Add bulk select** in Watchlist (multi-item status change, delete, move to collection).
6. **Add tag CRUD UI** in Watchlist (currently only editable from Details modal).
7. **Add "watch next" auto-suggestion** within a Watchlist shelf.
8. **Add snooze/dismiss** for individual notifications.
9. **Add "expires in X days" countdown** on Trash cards.
10. **Add date-range filter** for Stats.
11. **Add per-genre deep-dive** in Stats (clicking a genre bar filters the watchlist).
12. **Add public profile URL** (if social returns).
13. **Add session listing** in Settings (Supabase doesn't expose client-side, but a server-side endpoint could).
14. **Add login notification email**.
15. **Add account recovery flow** beyond password reset.

### 25.7 Performance

1. **Implement shared `IntersectionObserver` pool** for `useLazyImdbRating`.
2. **Migrate inline `style={{...}}` to module-level constants**.
3. **Add `<link rel="preload" as="image">`** for above-the-fold LCP posters.
4. **Self-host Google Fonts** via `@fontsource/*`.
5. **Replace `html2canvas`** with server-side Playwright snapshot.
6. **Implement runtime caching** in the service worker.
7. **Move stats computation server-side**.
8. **Single query with `IN (statuses)` filter** instead of 5 parallel for vault.
9. **Batch insert for `duplicateCollectionInSupabase`**.
10. **Add `interest-cohort=()` is already set** — good.

### 25.8 Architecture

1. **Migrate AuthModal to GlassModal** — replaces ~400 lines of hand-rolled Portal + GlassSurface.
2. **Migrate DetailsModal and CollectionModal to GlassModal** — currently hand-roll their own backdrop + dialog.
3. **Extract focus trap logic** from GlassModal + GlassSheet into a shared hook.
4. **Consolidate duplicate `PageContainer`** components.
5. **De-duplicate `accentHelpers`** into `~/core/preferences/customAccent`.
6. **Refactor `GlassSkeleton`** — replace the 6-deep `<Show>` nesting with a lookup table.
7. **Wrap TMDB and MDBList as `MetadataProvider`s** — currently only AniList is registered.
8. **Add admin 2FA + audit trail UI**.
9. **Document the modal z-index hierarchy** in a single place.
10. **Wire `DesktopUtilityPanel` to real content** or remove it.

### 25.9 Developer Experience

1. **Module-level signals lack test-reset helpers** (except `useAuth`) — test isolation is brittle.
2. **Add `pre-push` hook** to run lint + tests.
3. **Add `npm audit --audit-level=moderate`** in CI.
4. **Add TypeScript strict null checks** for repository return types (currently many `as unknown` casts).
5. **Add Storybook** for Glass component development.
6. **Add e2e tests** (Playwright) for critical flows.
7. **Add CI/CD pipeline** with preview deployments.
8. **Add error reporting** (Sentry) — currently only `console.error`.
9. **Add structured logging** (e.g., Pino) for server routes.
10. **Add OpenAPI spec** for API routes.

---

## 26. Missing Features

Based ONLY on the current repository, the following obvious capabilities are missing. These are not invented ideas — they are natural extensions of existing features that a user would expect.

### 26.1 PWA offline support
The app is installable but provides **zero offline functionality**. A user who installs the PWA and loses network connectivity sees a blank page. This is the most glaring gap for a "PWA" badge. The service worker handles push notifications only — no `fetch` handler, no Cache API usage.

### 26.2 Real-time cross-device sync
Vault, collections, and preferences sync across devices **only via manual refresh**. If a user adds a title to their vault on their phone, the change doesn't appear on their laptop until they reload the page. Supabase Realtime subscriptions would solve this — the SDK supports it natively, but CineLog doesn't use it.

### 26.3 Smart collection rule persistence
The `collections` table has `collection_type='smart'` enum value, but there is **no rules JSONB column**. Smart collections exist only in-memory — refreshing the page loses the rules. The `useCollections.updateSmartRules()` method throws `UnsupportedFeatureError` if rules are non-empty.

### 26.4 Public profile / sharing
Social features were removed in migration 20260802 (which dropped the `follows` table, `get_public_profile_by_username`, `get_public_vault_by_user`, `profiles.social_links`, `profiles.is_public`). The `ProfilePage.handleShare` always copies `/profile` URL (no username slug). There's no way to share your profile or see another user's profile.

### 26.5 Server-side auto-purge for Trash
Soft-deleted vault items + collections have a 30-day retention policy, but auto-purge runs **client-side only** when the user visits the Trash page. If a user never visits Trash, items linger past 30 days indefinitely. The `purge_soft_deleted_vault` RPC exists but no pg_cron job is wired to call it.

### 26.6 Server-side personalization
All Discover personalization (Spotlight daily-rotation, "Because You Love", "Step Outside") is derived **client-side from the vault**. There's no server-side recommendation engine. The `useDiscoverTaste` hook is documented as an "architectural seam for future ML/LLM-based recommendations" but nothing is wired.

### 26.7 Email notifications
The email system exists (`src/lib/email/*` with 6 templates) and the `/api/email/send` endpoint works, but **only the weekly recap cron uses it**. Episode reminders, new season alerts, and continue-watching notifications are browser-push-only — `renderEmailTemplate` is imported in `useNotifications.ts` but not actually invoked for sending.

### 26.8 Multi-device push management
Each device manages its own push subscription. There's no UI to see "all my devices" or revoke a specific device's subscription. The `push_subscriptions` table has the data but no admin/user UI surfaces it.

### 26.9 Push categories
Push subscription is **all-or-nothing**. A user can't subscribe to "new season alerts" without also receiving "weekly recap". The `notifPrefs` has per-category toggles (newSeason, continueWatching, weeklyRecap, recommendations, syncStatus) but they only gate browser notifications, not push.

### 26.10 Episode-level rating
Ratings are series-level only. There's no way to rate individual episodes. The `episode_progress` table tracks `is_completed` + `progress_minutes` + `watched_at` but no `rating` column.

### 26.11 Watch-progress scrubber
For streaming integration, there's no watch-progress scrubber. The `progress_minutes` field exists on vault but is not surfaced in the UI as a scrubber.

### 26.12 Tag CRUD UI
Tags exist on vault items (editable from Details modal) but there's no Watchlist-level UI to add/remove tags across multiple items.

### 26.13 Bulk select in Watchlist
No multi-select in Watchlist. Only individual item actions. Bulk operations exist only in Trash (Restore All / Clear Trash).

### 26.14 Date-range filter for Stats
Stats are all-time only. No way to filter by year, month, or custom date range.

### 26.15 Year-over-year comparison
Stats show all-time numbers. No way to compare "this year vs last year" or "this month vs last month".

### 26.16 Per-genre deep-dive in Stats
Clicking a genre bar in the Stats chart doesn't filter the watchlist or show genre-specific details.

### 26.17 Saved searches
Search history is limited to 8 recent searches. No way to save a search as a named collection or set up a search subscription.

### 26.18 Search inside a collection
`useCollectionSearch` exists for AddTitlesModal, but there's no UI to search within an existing collection's entries.

### 26.19 Fuzzy matching / typo correction in search
Search uses exact TMDB `searchMulti` and AniList `searchAnime`. No Levenshtein distance or typo correction.

### 26.20 People search results UI
TMDB `searchMulti` returns People results, but CineLog doesn't render them. Only Movies / Series / Anime sections are shown.

### 26.21 Collection sharing
No way to share a collection with another user or make it public (social features removed).

### 26.22 Bulk entry operations in collections
No multi-select add/remove in collections. Only individual entry operations.

### 26.23 "Add all to vault" in franchise modal
The CollectionModal shows a franchise timeline with vault-aware badges, but there's no "Add all to vault" bulk action.

### 26.24 "Go back" history within Details modal
Forward-only navigation via recommendations. No way to go back to the previously-viewed title within the modal.

### 26.25 Snooze / dismiss for individual notifications
Notifications can be marked read or cleared, but there's no snooze (delay) or dismiss (delete without reading) action.

### 26.26 "Notify all" bulk action in Upcoming
No way to set reminders for all upcoming titles matching a filter.

### 26.27 Settings import/export
No way to export settings to a file or import them on another device (preferences sync via Supabase, but no explicit export/import).

### 26.28 Settings preview
Changes apply immediately — no preview. A user can't see what a theme looks like before committing.

### 26.29 "Reset to defaults" per settings section
No per-section reset. The Privacy page has a nuclear "clear all CineLog storage" but no granular reset.

### 26.30 Admin 2FA
Admin auth uses email + password + 6-digit PIN. No TOTP 2FA for admin accounts (only for user accounts via `TwoFactorSetup`).

### 26.31 Admin audit trail UI
The `admin_actions` table stores every admin mutation, but there's no UI to view it (only the `/admin/logs` page which shows audit logs but not as a per-admin activity timeline).

### 26.32 Admin bulk user operations
Only per-user actions (disable/enable/delete/reset_preferences). No bulk operations.

### 26.33 Public API for third-party integrations
No public API for third-party apps to read/write a user's vault (with OAuth).

### 26.34 Calendar export (iCal / Google Calendar)
Upcoming releases can be viewed in a calendar UI, but there's no export to iCal or Google Calendar.

### 26.35 RSS feed for upcoming releases
No RSS feed for upcoming releases.

### 26.36 Chromecast / AirPlay support for trailers
Trailers play in a modal via YouTube embed, but there's no Cast/AirPlay button.

### 26.37 Streaming deep-links
Where-to-watch shows provider chips, but there's no deep-link to open the title in Netflix/Prime Video/Disney+ when the user has the app installed.

### 26.38 JustWatch / MAL / Kitsu provider integration
The `MetadataProvider` plugin architecture exists, but only AniList is registered. TMDB and MDBList are NOT wrapped as providers.

### 26.39 i18n / multi-language support
The app is English-only. No i18n framework (i18next, etc.) is configured. `<html lang="en">` is hardcoded.

### 26.40 Sentry / error reporting
Errors are only logged to `console.error`. No Sentry or similar error reporting service is wired.

---

## 27. Future Roadmap Suggestions

### 27.1 Immediate (next 1-2 sprints, high value, low regression)

1. **Delete dead code** — `features/profile/UpcomingPage.tsx` (1355 LOC), 8 dead Glass/primitive components, `RelationshipPill.tsx`. Reduces bundle size and maintenance burden.
2. **Fix `vitest.config.ts` coverage `include` list** — remove dead `features/dashboard/*` references.
3. **Regenerate `database.types.ts`** via `supabase gen types` — TypeScript can catch schema mismatches.
4. **Add `[...404].tsx` catch-all route** — improves UX and SEO.
5. **Add skip-link** in AppShell — WCAG 2.4.1 compliance.
6. **Add enum validation** to admin routes — prevents leaky 500 errors.
7. **Add file size validation** to banner upload — prevents OOM on low-end devices.
8. **Increase AppHeader action button size** to 44×44px — WCAG 2.5.5 compliance.
9. **Add `<Title>` tag** to `/collections/[id]` route — consistency.
10. **Update stale header comments** in API routes — reduces confusion.
11. **Migrate AuthModal to GlassModal** — replaces ~400 lines of hand-rolled code, gains focus trap + auto-focus + restore-focus for free.
12. **Consolidate duplicate `PageContainer`** components.
13. **Run `scripts/migrate_data_url_banners.ts`** to backfill existing data-URL banners.
14. **Replace `date-fns`** with native `Intl.DateTimeFormat` — saves ~5KB.
15. **Add `fetch` event handler to `sw.js`** (even a no-op) — satisfies Chrome installability.
16. **Add per-mode `theme-color` meta tags** (dark/light) in entry-server.
17. **Generate or remove the `sitemap.xml` reference** in robots.txt.

### 27.2 Short term (next 3-6 sprints, high impact)

1. **Fix `/api/account/delete` rate limiter** — migrate to DB-backed (Vercel KV or `rate_limits` table).
2. **Add rate limiting to admin mutation routes**.
3. **Remove or proxy the OMDB integration** — eliminates API key exposure.
4. **Increase `ADMIN_JWT_SECRET` minimum to 32 chars**.
5. **Replace `signOut()` default scope to `"local"`**.
6. **Add `rules` JSONB column to `collections`** for smart rule persistence.
7. **Add `is_hidden` column to `user_universe_subscriptions`**.
8. **Add DB-level UNIQUE constraint on `(user_id, name='Favorites')`**.
9. **Add `theme` to `PreferencesSnapshot`** so theme syncs across devices.
10. **Implement shared `IntersectionObserver` pool** for `useLazyImdbRating`.
11. **Migrate inline `style={{...}}` to module-level constants** across feature components.
12. **Self-host Google Fonts** via `@fontsource/*`.
13. **Add tests** for Details, Settings, Sync, Account, Trash, Admin, Notifications, Anime features.
14. **Split large files** — `BackupService.ts`, `useSettingsState.tsx`, `SvgChart.tsx`, `useNotifications.ts`.
15. **Wire `purge_soft_deleted_profiles` pg_cron job** — automate trash auto-purge.
16. **Add "New version available" toast** on SW `controllerchange`.
17. **Align PWA identity with app identity** — change `theme_color` to cinema gold, regenerate icons.
18. **Implement runtime caching for the app shell** in the service worker (Cache-First for static assets, Network-First for HTML, Stale-While-Revalidate for API calls).
19. **Add `pushsubscriptionchange` handler** to re-subscribe and update the server.
20. **Add `worker-src 'self'`** + `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp` to CSP.
21. **Add Sentry error reporting** — replaces `console.error` for production error tracking.
22. **Upgrade `eslint` v8 → v9** (v8 is EOL).
23. **Add `pre-push` hook** to run lint + tests.
24. **Add `npm audit --audit-level=moderate`** in CI.

### 27.3 Medium term (next 6-12 sprints, strategic)

1. **Implement full PWA offline support** — app shell caching, runtime caching strategies, background sync, periodic sync.
2. **Add Supabase Realtime subscriptions** for cross-device vault/collections sync.
3. **Move stats computation server-side** — materialized view or Supabase Edge Function.
4. **Implement server-side personalization** — recommendation engine using vault data (collaborative filtering or content-based).
5. **Migrate user sessions from localStorage to httpOnly cookies** — eliminates XSS-exfiltration risk.
6. **Add admin 2FA + audit trail UI**.
7. **Wrap TMDB and MDBList as `MetadataProvider`s** — completes the provider plugin architecture.
8. **Add JustWatch / MAL / Kitsu provider integration** via the plugin architecture.
9. **Add streaming deep-links** — open Netflix/Prime Video/Disney+ when user has the app installed.
10. **Add calendar export** (iCal / Google Calendar) for upcoming releases.
11. **Add RSS feed** for upcoming releases.
12. **Add episode-level rating** — add `rating` column to `episode_progress`.
13. **Add bulk select** in Watchlist (multi-item status change, delete, move to collection).
14. **Add date-range filter** for Stats.
15. **Add year-over-year comparison** in Stats.
16. **Add per-genre deep-dive** in Stats (clicking a genre bar filters the watchlist).
17. **Replace `html2canvas`** with server-side Playwright snapshot.
18. **Add Storybook** for Glass component development.
19. **Add e2e tests** (Playwright) for critical flows.
20. **Add OpenAPI spec** for API routes.

### 27.4 Long term (12+ sprints, visionary)

1. **Implement social features** — public profiles, follows, shared collections (currently removed).
2. **Add i18n / multi-language support**.
3. **Add AI-powered "what should I watch"** natural language query.
4. **Add watch party / co-browsing** feature.
5. **Add Chromecast / AirPlay support** for trailers.
6. **Add public API** for third-party integrations (with OAuth).
7. **Implement collaborative filtering / ML-based recommendations** — server-side personalization using vault data.
8. **Add streaming integration** — deep-link to Netflix/Prime Video/Disney+ with playback progress sync.
9. **Add watch-progress scrubber** for streaming integration.
10. **Add saved searches / search subscriptions**.
11. **Add multi-device push management UI** — see all devices, revoke specific subscriptions.
12. **Add push categories** — per-category subscription (new season alerts without weekly recap).
13. **Add snooze/dismiss** for individual notifications.
14. **Add "Notify all" bulk action** in Upcoming.
15. **Add settings import/export**.
16. **Add settings preview** — see what a theme looks like before committing.
17. **Add "Reset to defaults" per settings section**.
18. **Add admin bulk user operations**.
19. **Add tag CRUD UI** in Watchlist.
20. **Add "watch next" auto-suggestion** within a Watchlist shelf.
21. **Add "expires in X days" countdown** on Trash cards.
22. **Add public profile URL** (if social returns).
23. **Add session listing** in Settings (server-side endpoint).
24. **Add login notification email**.
25. **Add account recovery flow** beyond password reset.
26. **Add "Not interested" dismiss action** on Discover cards with persistence.
27. **Add "Add all to vault" bulk action** in franchise modal.
28. **Add "Go back" history** within Details modal.
29. **Add people search results UI**.
30. **Add fuzzy matching / typo correction** in search.

### 27.5 Prioritization framework

**High value + Low regression + High impact** = do first:
- Delete dead code (reduces bundle, improves maintainability, zero regression risk).
- Fix `vitest.config.ts` coverage list (correctness, zero risk).
- Regenerate `database.types.ts` (TypeScript safety, zero risk).
- Add `[...404].tsx` (UX + SEO, zero risk).
- Add skip-link (a11y compliance, zero risk).
- Migrate AuthModal to GlassModal (UX + code quality, low risk).
- Add `fetch` handler to SW (PWA installability, low risk).

**High value + High regression** = plan carefully:
- Migrate sessions from localStorage to cookies (security, but touches every auth flow).
- Implement PWA offline support (UX, but requires careful cache invalidation strategy).
- Add Supabase Realtime (UX, but adds complexity + potential race conditions).
- Move stats server-side (scalability, but requires schema changes + Edge Function).

**Low value + Low regression** = nice-to-have:
- Add per-mode `theme-color` meta tags.
- Add `lang` / `scope` / `categories` to manifest.
- Replace `date-fns` with native APIs.
- Update stale header comments.

**Low value + High regression** = skip:
- Migrate TMDB to `MetadataProvider` interface (low value — works fine as-is; high regression — touches 50+ call sites).

---

## 28. Repository Health Score

| Dimension | Score | Explanation |
|---|---|---|
| **Architecture** | **8.5 / 10** | Clean 4-layer separation (core/lib/shared/features). Repository pattern decouples data access. Provider plugin architecture for future metadata providers. Feature modules are self-contained. Per-domain repository organization. Barrel exports everywhere. Comprehensive inline documentation of architecture + data flow + bug-fix history. **Minus 1.5**: `database.types.ts` drift, duplicate PageContainer, dead Glass components in barrel, `_phase21.css`/`_phase22_sprint1.css` kept as-is, 2 empty CSS files, `useVault` deprecated but not migrated. |
| **Performance** | **7.5 / 10** | Three-layer TMDB caching. Triple-dedup IMDb ratings. Lazy-loaded heavy modals. Dynamic import for html2canvas. Module-level style constants in MovieCard. `deferStream: true` for SEO-critical routes. Per-route Suspense + ErrorBoundary. Route prefetch. Vercel Speed Insights. CDN preconnect. **Minus 2.5**: 60+ inline `style={{...}}` literals, 100+ IntersectionObservers, render-blocking Google Fonts, no `<link rel="preload">` for LCP posters, no PWA offline, `stats.ts` client-side only. |
| **Maintainability** | **7 / 10** | Clean layering, extensive inline documentation, idempotent migrations, TypeScript strict mode, test coverage on pure-functional core. **Minus 3**: Dead code accumulating (8 Glass components, duplicate UpcomingPage), outdated `database.types.ts`, large files (`BackupService.ts` 1207 LOC, `useSettingsState.tsx` 1155 LOC, `AdminCollectionEditorPage.tsx` 1045 LOC, `CollectionDetailPage.tsx` 1027 LOC, `ShareSheet.tsx` 893 LOC, `SvgChart.tsx` 975 LOC, `useNotifications.ts` 609 LOC, `normalizeBackup.ts` 690 LOC), no test coverage for Details/Settings/Sync/Account/Trash/Admin/Notifications/Anime features, duplicate PageContainer / accentHelpers. |
| **Scalability** | **7 / 10** | Supabase scales horizontally. Repository pattern decouples data access. Provider plugin architecture. CDN caching strategy well-tuned. **Minus 3**: `stats.ts` client-side only (won't scale past ~10k items), 5 separate `getVaultByStatus` queries (N+1 risk), `get_user_email` RPC called N times per admin users page, in-memory rate limiters don't scale across serverless instances, no Supabase Realtime subscriptions. |
| **UX** | **8 / 10** | Polished glass design system. Mobile-first responsive. Bottom navigation with prefetch. Toast system with haptics + ARIA live regions. Cinematic Details modal with focus trap + body scroll lock + history sync. Optimistic updates everywhere. Smart Share. Reduced-motion + high-contrast + spoiler-blur preferences. **Minus 2**: Skip-to-main-content link missing (WCAG 2.4.1), AppHeader action buttons 36×36px (below WCAG 2.5.5), no `[...404].tsx`, no "New version available" toast, PWA has no offline support, MovieCard status badge `aria-hidden`. |
| **Design** | **8.5 / 10** | Comprehensive token system (colors, spacing, radius, typography, motion, opacity, blur, shadows, z-index). 8 themes with custom accent override. Density + font size scaling. Reduced motion + high contrast support. 5 glass variants. 18 keyframes + 13 `.animate-*` utility classes. **Minus 1.5**: Duplicate/alias tokens everywhere, silent cascade override of `--glass-bg` in `glass-system.css`, hardcoded values in tailwind config for `cine-*` and `backdrop-blur-glass`, `_phase21.css`/`_phase22_sprint1.css` not refactored, PWA identity mismatch (purple vs gold). |
| **Security** | **7.5 / 10** | Defense-in-depth on admin routes (cookie JWT + DB lookup + PIN + audit log). Constant-time comparisons on all secrets. Service-role key never reaches browser. RLS on every table. `protect_admin_columns()` trigger. Strict CSP + HSTS + X-Frame-Options DENY + Permissions-Policy. Comprehensive audit trail. **Minus 2.5**: In-memory rate limiters (no-op on Vercel), no rate limit on admin mutations, OMDB key in browser bundle, sessions in localStorage (XSS-exfiltrable), `script-src 'unsafe-inline' 'unsafe-eval'`, admin JWT secret minimum 16 chars, no CSRF token, no enum validation on admin inputs. |
| **Testing** | **6 / 10** | ~27 test files, 600+ tests. Coverage thresholds enforced (75 statements, 65 branches, 75 functions, 75 lines). Tests cover pure-functional core (utilities, repositories, adapters, business logic). SolidJS testing library + jsdom + jest-dom matchers. **Minus 4**: No tests for Details, Settings, Sync, Account, Trash, Admin, Notifications, Anime features (high-risk untested). No e2e tests. No CI/CD pipeline visible. Module-level signals lack test-reset helpers (except `useAuth`). Coverage `include` list references non-existent files. |
| **Documentation** | **8 / 10** | Extensive inline documentation of architecture + data flow + bug-fix history. Most non-trivial files have header comments explaining the design. README is comprehensive (stack, features, scripts, project layout, AniList integration). SQL migrations have descriptive comments. **Minus 2**: No CONTRIBUTING.md, no ARCHITECTURE.md, no API documentation (OpenAPI spec), no Storybook for Glass components, stale header comments in 3 API routes, `database.types.ts` drift. |
| **Overall** | **7.5 / 10** | CineLog V2 is a **production-grade, single-developer PWA** with unusual architectural discipline for a solo project. The codebase is clean, documented, and secure — with defense-in-depth on admin routes, RLS on every table, constant-time comparisons on all secrets, and a comprehensive audit trail. The weaknesses are typical of mature solo projects: tech debt accumulates where the solo dev couldn't justify the refactor (duplicate PageContainer, dead Glass components, outdated database.types.ts), and infrastructure pieces that "work on Vercel free tier" are accepted as good-enough (in-memory rate limiters, no offline PWA). The PWA story is the most glaring gap — installable but providing zero offline utility. The auth security story is solid but undermined by in-memory rate limiters that are effectively no-ops on serverless. The code quality is high (strict TypeScript, zero `as any`, extensive inline docs) but undermined by dead code accumulating and large files that should be split. **Recommendation**: Tackle the "Immediate" roadmap items first (delete dead code, regenerate types, add 404 route, add skip-link, migrate AuthModal to GlassModal, add SW fetch handler). These are high-value, low-regression changes that will meaningfully improve the codebase with minimal risk. Then move to "Short term" items (fix rate limiters, add admin rate limiting, remove OMDB, add smart rule persistence, add theme sync, implement shared IntersectionObserver pool, self-host fonts, add tests for untested features). |

---

*End of audit. This report is the master technical documentation of the current state of CineLog V2 as of commit `3b21d5c` (2026-08-04). All findings are cross-referenced to concrete file paths. No files were modified during this audit — this is a read-only architecture and feature review.*
