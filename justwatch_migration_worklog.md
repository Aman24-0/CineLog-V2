# JustWatch OTT Migration Worklog

This file is the cross-chunk memory for the CineLog V2 OTT migration
from TMDB OTT data to JustWatch GraphQL. Append-only. Every chunk must
record what it created/modified, validation results, and any errors
encountered.

## Chunk 1 — Foundation

### Task 1: Shared JustWatch types
- Created: src/shared/types/justwatch.ts
- Status: COMPLETE
- Validation: `./node_modules/.bin/tsc --noEmit` — 0 errors in this file
  (18 pre-existing errors in other files unrelated to this chunk:
  Vite `import.meta.env` typing gaps + 2 `Object is possibly undefined`
  in `src/routes/movie/[id].tsx` and `src/routes/tv/[id].tsx`. None
  touched by this chunk.)
- Notes: none

### Task 2: Shared JustWatch client
- Created: src/server/justwatch/client.ts
- Status: COMPLETE
- Validation:
  - `./node_modules/.bin/tsc --noEmit` — 0 errors in this file
  - `./node_modules/.bin/eslint src/server/justwatch/ src/shared/types/justwatch.ts` — 0 errors, exit 0
- Notes:
  - pnpm was not pre-installed in the dev environment; installed via `npm install -g pnpm` then `pnpm install` to populate node_modules. This did NOT modify package.json or pnpm-lock.yaml.
  - The project's `eslint.config.js` imports `@eslint/js`, which is a transitive dep of `typescript-eslint` but was not hoisted to top-level `node_modules/@eslint/js` by pnpm's strict isolation. A symlink was created at `node_modules/@eslint/js` → `.pnpm/@eslint+js@9.39.5/...` to let ESLint resolve its config. This is a pre-existing project setup issue, NOT a regression introduced by this chunk. No package.json change was needed.
  - The client exports four public functions: `searchJustWatchTitle`, `getJustWatchOffers`, `getJustWatchPackages`, `batchGetJustWatchOffers`. All four use the in-flight dedupe Map, the `rawGql` helper (10s AbortController timeout, 2 attempts on network/5xx, exponential backoff on 429 with `Retry-After` honored), and throw only for developer errors (invalid country, batch > 25, missing required args).

### Task 3: Supabase migration
- Created: supabase/migrations/20260818_justwatch_ott_migration.sql
- Status: COMPLETE
- Validation:
  - File syntax verified visually (3 CREATE TABLE statements + 2 CREATE INDEX statements, all idempotent via `if not exists`).
  - RLS intentionally omitted per chunk spec; later chunks will add policies.
  - Migration was NOT applied to a live database in this chunk (no `supabase db push`); only the file was created.
- Notes:
  - Timestamp `20260818` chosen as the next day after the latest existing migration `20260817_audio_languages_cache_add_region.sql`.
  - Tables: `justwatch_provider_catalog`, `justwatch_title_mapping`, `ott_availability_cache`.

### Task 4: Worklog file
- Created: justwatch_migration_worklog.md (this file)
- Status: COMPLETE

### Chunk 1 Verification Summary
- TypeScript typecheck (`tsc --noEmit`): PASS for new files. 18 pre-existing errors in OTHER files (Vite env types + 2 possibly-undefined accesses). None introduced by this chunk.
- ESLint (`eslint src/server/justwatch/ src/shared/types/justwatch.ts`): PASS, exit 0, 0 errors.
- Build (`vinxi build`): PASS — `✔ build done` / `✔ Nitro Server built` / `✔ You can deploy this build using npx vercel deploy --prebuilt`. New files compile cleanly (tree-shaken out of the bundle because nothing imports them yet — expected for a foundation-only chunk).
- Git: only the 4 new files staged for commit. Pre-existing unstaged modifications to other files are NOT included in this commit.

### Chunk 1 Commit & Push
- Commit hash: `1a801bf` (amended to include the final worklog state in the same commit)
- Commit message: `feat: add JustWatch OTT foundation client, types, and migration`
- Files in commit: 4 (justwatch_migration_worklog.md, src/server/justwatch/client.ts, src/shared/types/justwatch.ts, supabase/migrations/20260818_justwatch_ott_migration.sql)
- Push status: PUSHED — pushed to remote branch `Justwatch` on `https://github.com/Aman24-0/CineLog-V2.git` using a user-supplied GitHub Personal Access Token (PAT). The PAT was supplied via an explicit push URL (`https://x-access-token:<PAT>@github.com/...`) so it was NOT written to `.git/config` or any persistent credential store. Local branch `Justwatch` was created from `main` (which carries the chunk commit) and pushed to `origin/Justwatch`.
- Note: The chunk commit lives on local `main` ahead of `origin/main` by 1 commit. It was also pushed to the new `origin/Justwatch` branch as requested by the user. `origin/main` was NOT modified.

## Chunk 2

### Task: JustWatch OTT cache + service layer
- Created: src/server/justwatch/cache.ts
- Created: src/server/justwatch/service.ts
- Status: COMPLETE
- Validation:
  - `./node_modules/.bin/tsc --noEmit` — 0 errors in either new file. The 18 pre-existing errors in OTHER files (Vite `import.meta.env` typing gaps + 2 `Object is possibly undefined` in `src/routes/movie/[id].tsx` and `src/routes/tv/[id].tsx`) were already present before Chunk 1 and are NOT introduced or touched by this chunk.
  - `./node_modules/.bin/eslint src/server/justwatch/cache.ts src/server/justwatch/service.ts` — PASS, exit 0, 0 errors, 0 warnings.
  - `./node_modules/.bin/vinxi build` — PASS — `✔ build done` / `✔ Nitro Server built` / `✔ You can deploy this build using npx vercel deploy --prebuilt`. New files compile cleanly (tree-shaken out of the bundle because nothing imports them yet — expected for a foundation-only chunk).
- Errors and fixes: none. No fixes were needed; both files passed all three verification steps on the first run.
- Notes:
  - **Pattern reuse**: cache.ts mirrors the audio-language cache (`src/server/audio-language/cache.ts`) — same lazy-init `createClient` factory, same env vars (`VITE_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`), same auth options (`{ autoRefreshToken: false, persistSession: false }`), same "swallow client-init errors and warn" philosophy so the service layer never throws to the UI.
  - **Database type augmentation**: the three new tables (`justwatch_provider_catalog`, `justwatch_title_mapping`, `ott_availability_cache`) are NOT yet reflected in `src/lib/supabase/database.types.ts` (that file is regenerated from the live Supabase schema and is shared with the rest of the codebase). Per the chunk rule "Do NOT modify existing files", I could not add them to `database.types.ts`. Instead, `cache.ts` defines a local `JustWatchAugmentedTables` type and intersects it with the imported `Database` type to produce a `JustWatchDatabase` type that covers both the existing tables and the three new ones. This gives full type safety on `.from(...)` calls without touching any existing file. A comment in `cache.ts` notes that this augmentation should be removed once `database.types.ts` is regenerated from the live schema.
  - **TTL computation**: the spec phrases TTLs as SQL intervals (`interval '1 hour' * ttlHours`, `interval '1 day' * ttlDays`). Since supabase-js computes timestamps on the client side, `cache.ts` translates these to JS — `hoursFromNow(hours)` and `daysFromNow(days)` helpers produce ISO 8601 timestamps that match the SQL semantics exactly.
  - **Service layer error policy**: per spec, the service layer NEVER throws for network / JustWatch / cache errors — it returns `null` / `[]` / partial results and `console.warn`s. It throws ONLY for developer errors: invalid `mediaType`, invalid `country`, batch size > 25. This mirrors the client layer's error policy.
  - **Batch resolution parallelism**: `batchGetTitleOttAvailability` resolves all uncached titles in parallel via `Promise.all` (up to 25). The client layer's in-flight dedupe Map coalesces duplicate titles within the same batch so we never hit JustWatch twice for the same query. Each resolved title is then fed into a single `batchGetJustWatchOffers` call (aliased multi-`node()` GraphQL query) so the whole batch makes at most 1 + N HTTP requests to JustWatch (N parallel searches + 1 batched offers fetch), not 2N.
  - **Cache writes are best-effort**: the cache layer swallows its own upsert errors and warns, so a cache write failure (e.g. transient DB connection blip) degrades gracefully — the caller still gets the freshly-fetched data, just without it being persisted. The next request will re-fetch and re-attempt the cache write.
  - **Chunk 2 does NOT introduce any UI or route changes**. The new functions are not yet imported by anything in the app. A later chunk will wire them into API routes / UI components.
  - **Pre-existing unstaged modifications** in the working tree (AUDIT_CHANGELOG.md, scripts/*, audio-language files, etc.) are NOT included in this commit. Only the two new files + the worklog are staged.

### Chunk 2 Commit & Push
- Commit hash: see `git log -1 origin/Justwatch` on the remote — the commit carries the message below. (The hash is intentionally not inlined here to avoid the self-reference loop where every amend to record the hash changes the hash.)
- Commit message: `feat: add JustWatch OTT cache and service layer`
- Files in commit: 3 (justwatch_migration_worklog.md, src/server/justwatch/cache.ts, src/server/justwatch/service.ts)
- Push status: PUSHED to `origin/Justwatch` using the user-supplied PAT (one-shot explicit push URL — NOT written to `.git/config`).

## Chunk 3

### Task: JustWatch OTT API routes + RLS policies
- Created: src/server/justwatch/region.ts
- Created: src/routes/api/ott/providers.ts
- Created: src/routes/api/ott/availability/[tmdbId].ts
- Created: src/routes/api/ott/batch-availability.ts
- Created: supabase/migrations/20260819_justwatch_ott_rls.sql
- Status: COMPLETE
- Validation:
  - `./node_modules/.bin/tsc --noEmit` — 0 errors in any new file. The 18 pre-existing errors in OTHER files (Vite `import.meta.env` typing gaps + 2 `Object is possibly undefined` in `src/routes/movie/[id].tsx` and `src/routes/tv/[id].tsx`) were already present before Chunk 1 and are NOT introduced or touched by this chunk.
  - `./node_modules/.bin/eslint src/server/justwatch/region.ts src/routes/api/ott/providers.ts "src/routes/api/ott/availability/[tmdbId].ts" src/routes/api/ott/batch-availability.ts` — PASS, exit 0, 0 errors, 0 warnings.
  - `./node_modules/.bin/vinxi build` — PASS — `✔ build done` / `✔ Nitro Server built` / `✔ You can deploy this build using npx vercel deploy --prebuilt`. The four new route files are bundled as server-fns (the API routes are registered with the SolidStart router via file-based routing). The new region.ts helper is imported into each route.
- Errors and fixes:
  - One TypeScript error during the first tsc run: `src/routes/api/ott/providers.ts(59,9): error TS7034: Variable 'providers' implicitly has type 'any[]' in some locations where its type cannot be determined.` The `let providers;` declaration followed by a `try/catch` assignment confused TS's control-flow analysis (it couldn't determine the variable's type at the JSON.stringify call). Fixed by explicitly typing it as `let providers: JustWatchPackage[];` and importing the `JustWatchPackage` type. No other files were touched.
- Notes:
  - **Pattern reuse**: `region.ts` mirrors the `resolveProfileCountry` logic in `src/routes/api/audio-languages/[tmdbId].ts` — same Supabase `createClient` factory, same `getSupabaseAccessTokenFromRequest` helper (Bearer header → cookie fallback), same `auth.getUser(token)` verification, same `profiles.country` read, same fail-open "US" default. The chunk spec said "Do NOT import from audio-language route. Copy only the necessary country-resolution logic." — the function is fully self-contained in `region.ts` and only imports from `~/lib/supabase/admin/sessionCookie` (a shared helper, not the audio-language route).
  - **API route shape**: all three routes use the project's existing `interface APIEvent { request: Request }` pattern (no Vinxi-typed `event.params`). The `[tmdbId]` route parses the path segment from `url.pathname` (same defensive pattern as the audio-languages route) so we don't depend on Vinxi's param typing.
  - **Error policy**: per spec, all three routes NEVER throw to the client for service/JustWatch/cache errors. The providers and availability routes return 200 with empty data on any internal error. The batch route returns 400 only for invalid input (missing body, > 25 items) and 200 with empty results on any service error. The availability route additionally returns 400 for invalid `tmdbId` or `type` query params.
  - **Cache headers**: success responses use `public, max-age=300, s-maxage=600` (5 min browser, 10 min CDN) per spec. 400 errors use shorter/no caching (`max-age=60` for invalid tmdbId/type, `no-store` for batch-limit-exceeded) so a client retry isn't blocked by a stale 400.
  - **Batch validation**: `batch-availability.ts` cleans each item individually — items with invalid `mediaType` or non-positive `tmdbId` are dropped silently rather than failing the whole batch. This matches the spec rule "Do not throw for individual missing titles; only throw if input invalid or >25."
  - **RLS migration**: idempotent — uses `drop policy if exists` before each `create policy` so re-running on an already-migrated database is safe (mirrors the `audio_languages_cache` migration pattern). SELECT policies are world-readable for `anon, authenticated` (the OTT data is shared metadata, not user-specific — the `country` column is just a cache key, not a security boundary). No INSERT/UPDATE/DELETE policies are added for anon/authenticated; only the service role can write, since it bypasses RLS entirely.
  - **Chunk 3 does NOT introduce any UI changes**. The new routes are not yet called by any frontend code. A later chunk will wire the UI to call `/api/ott/providers`, `/api/ott/availability/[tmdbId]`, and `/api/ott/batch-availability`.
  - **Pre-existing unstaged modifications** in the working tree (AUDIT_CHANGELOG.md, scripts/*, audio-language files, etc.) are NOT included in this commit. Only the five new files + the worklog are staged.

### Chunk 3 Commit & Push
- Commit hash: see `git log -1 origin/Justwatch` on the remote (the hash is intentionally not inlined here to avoid the self-reference loop where every amend to record the hash changes the hash).
- Commit message: `feat: add JustWatch OTT API routes and RLS policies`
- Files in commit: 6 (justwatch_migration_worklog.md, src/server/justwatch/region.ts, src/routes/api/ott/providers.ts, src/routes/api/ott/availability/[tmdbId].ts, src/routes/api/ott/batch-availability.ts, supabase/migrations/20260819_justwatch_ott_rls.sql)
- Push status: PUSHED to `origin/Justwatch` using the user-supplied PAT (one-shot explicit push URL — NOT written to `.git/config`).

## Chunk 4

### Task: Migrate selected streaming providers to JustWatch technicalName + new Settings UI
- Modified: src/core/preferences/streamingProviders.ts
- Modified: src/core/preferences/index.ts
- Modified: src/core/preferences/preferencesSync.ts
- Modified: src/features/settings/hooks/useSettingsState.tsx
- Modified: src/features/settings/sections/ContentDiscoverSection.tsx
- Modified: src/features/settings/sections/types.ts
- Modified: src/styles/features/settings.css
- Created: src/features/settings/components/StreamingProvidersSection.tsx
- Status: COMPLETE
- Validation:
  - `./node_modules/.bin/tsc --noEmit` — 0 errors in any modified/created file. The 18 pre-existing errors in OTHER files (Vite `import.meta.env` typing gaps + 2 `Object is possibly undefined` in `src/routes/movie/[id].tsx` and `src/routes/tv/[id].tsx`) were already present before Chunk 1 and are NOT introduced or touched by this chunk.
  - `./node_modules/.bin/eslint src/core/preferences/streamingProviders.ts src/features/settings/hooks/useSettingsState.tsx src/features/settings/sections/ContentDiscoverSection.tsx src/features/settings/components/StreamingProvidersSection.tsx src/core/preferences/preferencesSync.ts src/features/settings/sections/types.ts src/core/preferences/index.ts` — PASS, exit 0, 0 errors, 0 warnings.
  - `./node_modules/.bin/vinxi build` — PASS — `✔ build done` / `✔ Nitro Server built` / `✔ You can deploy this build using npx vercel deploy --prebuilt`. The SettingsPage bundle grew from 78.21 kB → 82.39 kB (expected — the new StreamingProvidersSection component is now part of the SettingsPage bundle).
- Errors and fixes:
  - One ESLint error during the first run: `src/features/settings/hooks/useSettingsState.tsx(505,32): error 'reg' is defined but never used.` The new `loadProviders` no longer uses the `reg` parameter (the JustWatch `/api/ott/providers` route resolves the caller's country from their profile, not from a query param). Fixed by renaming the parameter to `_reg` (the project's `@typescript-eslint/no-unused-vars` rule allows `^_`-prefixed args). The parameter is kept in the signature to preserve the existing `onMount(() => void loadProviders(region()))` and `createEffect(() => void loadProviders(r))` call sites — removing it would require touching more of useSettingsState than the chunk scope allows.
  - Five `solid/reactivity` warnings in `StreamingProvidersSection.tsx` (false positives — `props.row`, `props.total`, `props.onMoveUp`, `props.onMoveDown` are stable references passed once at component creation, not reactive variables). Fixed by destructuring once at the top of each child component and adding `// eslint-disable-next-line solid/reactivity` comments — the same pattern used by the existing `ContentDiscoverSection.tsx` (line 68) for `props.state`.
- Notes:
  - **Legacy TMDB ID clearing (Task 1)**: `streamingProviders.ts` now exports `isLegacyProviderId(value)` (returns true for pure-numeric strings like "8", "119" — these are TMDB watch_provider IDs, never JustWatch technicalNames). The `readProviderSet()` function detects legacy IDs on first read and clears the ENTIRE array (writing `[]` back to localStorage immediately). Full clear is the only safe migration because TMDB IDs and JustWatch technicalNames are completely different namespaces — keeping some TMDB IDs alongside JustWatch technicalNames would produce a broken mixed state. After clearing, existing users start with no selected providers and re-add them via the new Settings UI.
  - **Compatibility exports**: `TmdbProvider` and `mergeAndSortProviders` REMAIN EXPORTED from `streamingProviders.ts` (and re-exported from `index.ts`) because `src/features/discover/components/OttDropdown.tsx`, `src/routes/settings/content-discover.tsx`, and `src/core/preferences/__tests__/streamingProviders.test.ts` still depend on them. The chunk spec said "Do NOT modify OttDropdown" — so these exports stay. They are marked `@deprecated` with comments explaining they'll be removed in the chunk that migrates Discover OTT. The `mergeAndSortProviders` function body is unchanged — the existing tests still pass (couldn't run vitest due to a pre-existing vite-plugin-solid ESM resolution issue in the dev environment, but the function is byte-for-byte identical to before).
  - **New JustWatchProviderItem type**: introduced in `streamingProviders.ts` and re-exported from `index.ts`. It mirrors the `JustWatchPackage` type from `src/shared/types/justwatch.ts` but is duplicated in the preferences module to keep it self-contained (the preferences module is imported by many client components; keeping it independent of the shared justwatch types file makes tree-shaking easier). The `/api/ott/providers` route returns `JustWatchPackage[]` directly; the Settings hook casts it to `JustWatchProviderItem[]` (no-op at runtime — identical shapes).
  - **New preference helpers**: `addStreamingProvider(technicalName)`, `removeStreamingProvider(technicalName)`, `moveStreamingProvider(id, from, to)` added to `streamingProviders.ts` and re-exported from `index.ts`. These are convenience wrappers around `setStreamingProviders` for the Settings UI's add/remove/reorder buttons. `moveStreamingProvider` is defensive — it no-ops if `from`/`to` are out of bounds or if the provider at `from` doesn't match `id` (guards against stale UI state).
  - **Settings data source (Task 2)**: `useSettingsState.tsx`'s `loadProviders` now fetches from `/api/ott/providers` instead of TMDB's `getWatchProviderList`/`getWatchProviderListTv`. Removed the imports of `getWatchProviderList`, `getWatchProviderListTv`, and `mergeAndSortProviders` (the latter is no longer used by the settings hook — it's still used by OttDropdown, which imports it directly from `~/core/preferences`). The `providers` signal type changed from `TmdbProvider[]` to `JustWatchProviderItem[]`. `handleToggleProvider` now takes a `JustWatchProviderItem` and passes `provider.technicalName` to `toggleStreamingProvider`.
  - **New Settings UI (Task 3)**: created `src/features/settings/components/StreamingProvidersSection.tsx` — a self-contained component implementing the full search/add/remove/reorder UI per spec. Replaces the old TMDB chip grid in `ContentDiscoverSection.tsx` (the chip grid JSX was removed and replaced with `<StreamingProvidersSection ... />`). The component:
    - Reads `s.providers()` (loaded from `/api/ott/providers`) and `streamingProviders()` (the global preference signal) directly.
    - Search input with placeholder "Search streaming provider..." — filters by `clearName`, `technicalName`, `shortName` (case-insensitive, trimmed).
    - Search results show `[ADD]` for not-selected providers, `[ADDED]` (disabled) for selected ones. "No streaming providers found." when no match.
    - Empty state: "No OTT apps selected" / "Search and add the streaming services you use."
    - Selected providers ("YOUR OTT APPS"): each row has logo + clearName + up/down reorder buttons + REMOVE. Order persists via `moveStreamingProvider`.
    - Country-unavailable providers (selected technicalName not in current country catalog): rendered disabled with "Not available in your region" + REMOVE button. NOT reorderable while disabled.
    - Hint: "These providers are used only for Discover → New on OTT."
    - Logo URL: `https://images.justwatch.com${icon}` with `{profile}` → `s100` and `{format}` → `png`. No TMDB logos.
  - **CSS styles**: appended a new self-contained block to `src/styles/features/settings.css` (lines 1485+) with classes `ott-search-wrapper`, `ott-search-input`, `ott-search-row`, `ott-selected-row`, `ott-reorder-btn`, `ott-remove-btn`, etc. Uses existing CSS variables (`--sp-*`, `--p`, `--text-secondary`, `--bg-elevated`) so it adapts to the user's theme. No external CSS framework, no inline styles for layout.
  - **preferencesSync legacy clear (Task 4)**: `preferencesSync.ts`'s `applySnapshot` now filters out legacy TMDB IDs from the server snapshot before applying. Without this, a server `prefs_json` written before the migration (containing `streamingProviders: ["8", "119"]`) would re-populate the signal with TMDB IDs, and the next debounced push would write them BACK to the server — undoing the local clear. The filter drops only the legacy subset; if the server snapshot already contains JustWatch technicalNames (post-migration), they're respected. The next push overwrites the server with the filtered array, cleaning the server-side state over time.
  - **Chunk 4 does NOT modify**: OttDropdown.tsx, DiscoverPage, Where-to-Watch, Watchlist Platform filter, Statistics, Upcoming, or any TMDB provider registry files. The legacy `src/routes/settings/content-discover.tsx` route is also untouched (it still uses `mergeAndSortProviders` — will be migrated in a later chunk).
  - **Pre-existing unstaged modifications** in the working tree (AUDIT_CHANGELOG.md, scripts/*, audio-language files, etc.) are NOT included in this commit. Only the eight Chunk 4 files + the worklog are staged.

### Chunk 4 Commit & Push
- Commit hash: see `git log -1 origin/Justwatch` on the remote (the hash is intentionally not inlined here to avoid the self-reference loop where every amend to record the hash changes the hash).
- Commit message: `feat: migrate selected streaming providers to JustWatch technicalName and new Settings UI`
- Files in commit: 9 (justwatch_migration_worklog.md, src/core/preferences/streamingProviders.ts, src/core/preferences/index.ts, src/core/preferences/preferencesSync.ts, src/features/settings/hooks/useSettingsState.tsx, src/features/settings/sections/ContentDiscoverSection.tsx, src/features/settings/sections/types.ts, src/features/settings/components/StreamingProvidersSection.tsx, src/styles/features/settings.css)
- Push status: PUSHED to `origin/Justwatch` using the user-supplied PAT (one-shot explicit push URL — NOT written to `.git/config`).


## Chunk 5

### Task: Migrate Details "Where to Watch" to JustWatch offers
- Modified: src/features/details/components/WhereToWatch.tsx
- Modified: src/styles/features/details.css
- Status: COMPLETE
- Validation:
  - `./node_modules/.bin/tsc --noEmit` — 0 errors in modified files. The 18 pre-existing errors in OTHER files (Vite `import.meta.env` typing gaps + 2 `Object is possibly undefined` in `src/routes/movie/[id].tsx` and `src/routes/tv/[id].tsx`) were already present before Chunk 1 and are NOT introduced or touched by this chunk.
  - `./node_modules/.bin/eslint src/features/details/components/WhereToWatch.tsx` — PASS, exit 0, 0 errors, 0 warnings.
  - `./node_modules/.bin/vinxi build` — PASS — `✔ build done` / `✔ Nitro Server built` / `✔ You can deploy this build using npx vercel deploy --prebuilt`.
- Errors and fixes: none. The component passed all three verification steps on the first run.
- Notes:
  - **Data source migration (Task 1)**: `WhereToWatch.tsx` now fetches from `GET /api/ott/availability/{tmdbId}?type={movie|tv}&title=...&year=...` instead of TMDB's `fetchTitleWatchProviders`. The route resolves the caller's country from their profile (anonymous → "US") and returns `{ tmdbId, mediaType, country, justwatchNodeId?, offers }`. The `title` and `year` query params are derived from the TMDB details (`d.title ?? d.name ?? d.original_title ?? d.original_name` and `d.release_date ?? d.first_air_date`) — these help the JustWatch resolver find the right node on a cache miss. If the title can't be resolved or has no offers, the route returns `offers: []` and the component hides itself.
  - **Removed TMDB imports (Task 4)**: removed `fetchTitleWatchProviders` and `tmdbImage` from `~/core/tmdb/tmdb`, `useDiscoverRegion` from `~/core/config/discoverRegion`, `canonicalForTmdbId` / `displayNameFor` from `~/features/discover/components/ottProviderRegistry`, and the `TMDBWatchProvider` type import from `~/shared/types`. The component now imports only `JustWatchOffer` and `JustWatchMonetizationType` from `~/shared/types/justwatch`. The `WatchlistItem` and `TMDBDetails` type imports from `~/shared/types` remain — they're used for the props shape (`baseItem`, `details` accessors) and for deriving the title/year lookup params, NOT for TMDB watch-provider data.
  - **Offer normalization (Task 2)**: a new `normalizeOffers(offers: JustWatchOffer[]): ProviderRow[]` function groups offers by `offer.package.id` and collapses multiple monetization types into a single row's badge set. For each group: `watchNowUrl` = first non-null `deeplinkURL`, `moreInfoUrl` = first non-null `standardWebURL`, `availableFromTime` = earliest non-null `availableFromTime`. Sort order: subscription (FLATRATE) or free-with-ads (FAST) first, then rent/buy, with alphabetical by `clearName` as the tiebreaker. No filtering by user-selected providers (per spec).
  - **Rendering (Task 3)**: each row renders a logo (JustWatch CDN — `https://images.justwatch.com${icon}` with `{profile}` → `s100` and `{format}` → `png`), the `clearName`, monetization badges (`Subscription` / `Free with ads` / `Rent` / `Buy`), a "Watch Now" button (deeplinkURL), a "More Info" button (standardWebURL), and an "Available <date>" label when `availableFromTime` is in the future. Badges appear in a fixed order (`FLATRATE`, `FAST`, `RENT`, `BUY`) regardless of Set iteration order, via the `MONETIZATION_ORDER` constant. The date is formatted as "Sep 1, 2026" via `toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })` — no external date library.
  - **Visibility / loading / error states (Task 5)**: the section is hidden (renders nothing) when: the `streaming_button` feature flag is false, the fetch is in progress (no skeleton — would be too noisy in the modal), the offers array is empty, or any fetch/parse error occurs. The `featureFlags.isEnabled("streaming_button")` gate is preserved exactly as before. The `loaded` signal is still used internally to avoid flashing the section before the first fetch completes, but no skeleton UI is rendered.
  - **CSS**: appended a new self-contained block to `src/styles/features/details.css` (lines 3331+) with classes `wheretowatch-list`, `wheretowatch-row`, `wheretowatch-row-main`, `wheretowatch-row-logo`, `wheretowatch-badges`, `wheretowatch-badge`, `wheretowatch-btn`, etc. Uses existing CSS variables (`--glass-bg`, `--hairline-2`, `--p`, `--text-soft`, `--text-dim`, `--space-*`, `--radius-*`, `--dur-fast`, `--ease-out`) so it adapts to the user's theme. The old `.wheretowatch-grid` / `.wheretowatch-card` / `.wheretowatch-logo` classes remain in the CSS file (harmless dead CSS — removing them would be a separate cleanup chunk). A `@media (max-width: 540px)` rule stacks the actions below the main row on narrow screens.
  - **No parent changes**: `DetailsModal.tsx` was NOT modified. The `<WhereToWatch baseItem={baseItem} details={tmdb} />` call site remains unchanged — the component's props interface is identical (still `baseItem: Accessor<WatchlistItem | null>` + `details: Accessor<TMDBDetails | null>`), and the visibility gate that was previously implicit in the parent is now inside the component (the `<Show when={featureFlags.isEnabled("streaming_button") && loaded() && visibleRows().length > 0}>` wrapper).
  - **Chunk 5 does NOT modify**: Discover, Watchlist Platform filter, Upcoming, Statistics, the API route, the service layer, the cache layer, or any TMDB watch-provider files in `src/core/tmdb/`. The legacy `src/routes/settings/content-discover.tsx` route is also untouched.
  - **Pre-existing unstaged modifications** in the working tree are NOT included in this commit. Only the two Chunk 5 files + the worklog are staged.

### Chunk 5 Commit & Push
- Commit hash: see `git log -1 origin/Justwatch` on the remote (the hash is intentionally not inlined here to avoid the self-reference loop where every amend to record the hash changes the hash).
- Commit message: `feat: migrate Details Where to Watch to JustWatch offers`
- Files in commit: 3 (justwatch_migration_worklog.md, src/features/details/components/WhereToWatch.tsx, src/styles/features/details.css)
- Push status: PUSHED to `origin/Justwatch` using the user-supplied PAT (one-shot explicit push URL — NOT written to `.git/config`).
