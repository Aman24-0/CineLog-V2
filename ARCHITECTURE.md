# CineLog V2 — Architecture

This document describes the layered architecture of CineLog V2, the
dependency rules between modules, and the runtime data-flow for the
major features. It is the source of truth for "where does this code
belong?" decisions.

---

## 1. The Four Layers

CineLog V2 organizes code into four concentric layers. Dependencies
flow strictly inward → outward:

```
┌─────────────────────────────────────────────────────────┐
│  features/   (UI + feature-specific orchestration)      │
│  ┌───────────────────────────────────────────────────┐  │
│  │  shared/   (reusable UI, hooks, utils, types)     │  │
│  │  ┌─────────────────────────────────────────────┐  │  │
│  │  │  lib/    (Supabase, AniList, email, Sentry) │  │  │
│  │  │  ┌───────────────────────────────────────┐  │  │  │
│  │  │  │  core/   (pure: TMDB, theme, prefs)   │  │  │  │
│  │  │  └───────────────────────────────────────┘  │  │  │
│  │  └─────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

**The cardinal rule:** a layer may import from itself or any layer
inside it. A layer may NEVER import from a layer outside it.

Concretely:

| Layer      | May import from                  | May NOT import from            |
| ---------- | -------------------------------- | ------------------------------ |
| `core/`    | itself, `node:` builtins         | `lib/`, `shared/`, `features/` |
| `lib/`     | itself, `core/`                  | `shared/`, `features/`         |
| `shared/`  | itself, `lib/`, `core/`          | `features/`                    |
| `features/`| itself, `shared/`, `lib/`, `core/` | (nothing — outermost layer)    |

This rule is enforced by review, not by ESLint (a future task). Violations
are the single most common PR rejection reason.

### 1.1 Why this layering?

- **`core/` is pure** — it can be unit-tested without any mocks, and it
  can be reused in a different app (e.g. a CLI tool) without dragging in
  Supabase. The TMDB client, anime detector, theme engine, and the 18
  preference signals all live here.
- **`lib/` has side effects** — it owns the Supabase clients (browser,
  server, admin), the AniList GraphQL client, the email renderer, the
  Sentry wrappers, and the 18 repositories grouped by domain. Anything
  that touches the network or a database lives here.
- **`shared/` is the UI toolkit** — the Glass design system, the
  reusable hooks (`useAuth`, `useUserLibrary`, `useToast`,
  `useModalState`), the pure utilities (date, format, progress), and
  the shared types. Feature code reaches for these first.
- **`features/` is the product** — 16 self-contained feature modules
  (discover, watchlist, collections, details, profile, stats, upcoming,
  search, settings, sync, account, trash, admin, notifications, anime).
  Each feature is a vertical slice: its UI components, its hooks, its
  feature-specific adapters, and its tests all live in the same folder.

---

## 2. The Adapter Pattern

Between `lib/supabase/repositories/<domain>/` (which returns raw DB
rows) and `features/<domain>/` (which needs domain-shaped objects),
there is an **adapter layer**. Adapters translate the database shape
into the shape the UI expects, and vice-versa.

```
Database row  ──►  Repository.read()  ──►  Adapter.toViewModel()
                                                      │
                                                      ▼
                                              Feature hook / UI

UI mutation   ──►  Adapter.toDbRow()    ──►  Repository.write()
```

### 2.1 Why adapters exist

1. **Decoupling** — the DB schema can change (rename a column, split a
   table) without touching the UI, as long as the adapter is updated.
2. **Validation** — adapters enforce invariants that the DB can't
   (e.g. "movies use `watched_on`, TV uses `started_at` + `completed_at`").
3. **Media-type awareness** — the vault adapter is media-type-aware
   because the DB has CHECK constraints
   (`vault_movie_no_series_cols`, `vault_tv_no_movie_cols`) that reject
   cross-contamination. The adapter maps the right fields based on
   `media_type`.
4. **Testability** — adapters are pure functions, so they're trivial to
   unit-test. The repository layer (which needs Supabase mocks) is
   tested separately.

### 2.2 Where adapters live

Adapters live in `features/<domain>/<name>Adapter.ts` (e.g.
`features/watchlist/vaultAdapter.ts`). They're imported by the feature's
hooks, never by `lib/` or `core/`.

Notable adapters:

| Adapter                              | Translates between                        |
| ------------------------------------ | ----------------------------------------- |
| `vaultAdapter.ts`                    | DB vault row ↔ `WatchlistItem`            |
| `vaultReadAdapter.ts`                | 5 status-bucketed queries → merged vault  |
| `episodeProgressAdapter.ts`          | DB episode_progress row ↔ UI progress     |
| `collectionAdapter.ts`               | DB collection row ↔ `Collection` UI model |
| `collectionMapper.ts`                | TMDB collection → franchise timeline      |
| `collectionEntryAdapter.ts`          | DB collection_entry ↔ timeline entry      |
| `presetAdapter.ts`                   | DB preset ↔ UI preset                     |
| `userLibraryAdapter.ts`              | vault + presets + progress → unified view |
| `trashAdapter.ts`                    | soft-deleted vault row ↔ trash item       |

---

## 3. The Repository Pattern

Each Supabase domain has its own repository folder under
`src/lib/supabase/repositories/<domain>/`. The structure is consistent:

```
src/lib/supabase/repositories/<domain>/
├── <domain>.read.ts          # SELECT queries (pure reads)
├── <domain>.write.ts         # INSERT / UPDATE / DELETE
├── <domain>.utils.ts         # pure helpers (row shaping, validation)
├── <domain>.types.ts         # DB row types, input/output types
├── <domain>.repository.ts    # barrel: combines read + write into one API
├── index.ts                  # public exports
└── __tests__/
    └── <domain>Repository.test.ts
```

### 3.1 Why split read / write?

- **Reads are cached, writes are not.** Read functions can be wrapped
  in `apiCache` (in-memory, 10 min TTL) or routed through the Supabase
  `tmdb_cache` table (7-day SWR). Writes must always hit the live DB.
- **Reads are SSR-safe, writes are client-only.** A read can run during
  SSR (server-side fetch for the initial page render). A write must run
  in the browser (after user interaction) so the optimistic update can
  be applied and reverted on error.
- **Reads use the user-scoped client, writes use the same client but
  with RLS-enforced ownership.** The repository doesn't need to know
  which — it just calls the Supabase client passed to it.

### 3.2 The 12 repository domains

| Domain              | Tables owned                                | Notes |
| ------------------- | ------------------------------------------- | ----- |
| `vault/`            | `vault`                                     | The user's personal library — the central table |
| `collection/`       | `collections`, `collection_entries`, `universe_phases` | User folders + curated universes |
| `profile/`          | `profiles`, `profile_favorites`, `profile_banners` | User profile + favorites + banner uploads |
| `discover/`         | `discover_*` (personalized rows)            | Per-user personalized discover feeds |
| `preset/`           | `user_presets`                              | Saved filter presets for the vault |
| `episodeProgress/`  | `episode_progress`                          | Per-episode watch state for TV |
| `dashboard/`        | (derived — no tables)                       | Aggregates vault + collection for the home view |
| `animeMapping.ts`   | `anime_mappings`                            | TMDB ↔ AniList id joins |
| `activityLog.ts`    | `activity_log`                              | Append-only audit of user actions |
| `loginHistory.ts`   | `login_history`                             | Login attempts for security review |
| `upcoming.ts`       | `user_reminders`, `notifications`           | Upcoming releases + reminder scheduling |
| `shared.ts`         | (no tables — shared helpers)                | Common Supabase query patterns |

---

## 4. Supabase Client Topology

CineLog uses **three** Supabase clients, each with a different trust
level. Knowing which one to use is critical — using the wrong one is a
security bug.

### 4.1 Browser client (`src/lib/supabase/browser.ts`)

- Uses the **anon key** + the user's auth token (from localStorage).
- Enforced by Supabase RLS — can only read/write rows the user owns.
- Used by `shared/hooks/useUserLibrary.tsx`, `useAuth.ts`, and any
  client-side mutation.
- Safe to import from `shared/` and `features/`.

### 4.2 Server client (`src/lib/supabase/server.ts`)

- Uses the **anon key** + the user's cookies (parsed from the request).
- Created per-request by `src/middleware.ts` and stored on
  `event.locals.supabase`.
- Used by API routes (`src/routes/api/*`) and SSR data fetchers.
- RLS still applies — the server client is just the browser client with
  cookie-based auth instead of localStorage-based.

### 4.3 Admin client (`src/lib/supabase/admin/adminClient.ts`)

- Uses the **service-role key** — bypasses RLS entirely.
- **Throws if `isServer` is false.** The service-role key must NEVER
  reach the browser bundle. This is enforced at runtime.
- Used only by admin API routes (`src/routes/api/admin/*`), gated by
  `requireAdmin()` which checks the admin cookie JWT + a DB lookup
  (`is_admin AND admin_disabled_at IS NULL`).
- Every mutation is logged to `admin_actions` (append-only — no
  UPDATE/DELETE policy on the table).

### 4.4 The request middleware (`src/middleware.ts`)

SolidStart auto-discovers `src/middleware.ts`. Its `onRequest` hook:

1. Parses the `Cookie` header from the incoming request.
2. Creates a fresh server client bound to those cookies.
3. Stores `{ client, cookieJar }` on `event.locals.supabase`.

API routes that need a Supabase client read `event.locals.supabase`.
Routes that need to mutate cookies (token refresh, session exchange)
read `event.locals.supabase.cookieJar` and flush its `Set-Cookie`
headers onto the outgoing `Response`.

---

## 5. State Management

CineLog uses **three** state-management primitives, each for a
different scope:

### 5.1 Module-level Solid signals (`shared/hooks/*`)

- `useToast`, `useModalState`, `useCollectionModal`, `useAuthModal`.
- The signal lives at module scope, NOT inside a component. This means
  the state is shared across every component that calls the hook —
  the hook is just a getter for the module-level signal.
- This is why `test/resetModuleState.ts` exists: Vitest reuses the
  module instance per worker, so without an explicit reset, state
  leaks between tests.

### 5.2 `createResource` for SSR-compatible reads

- Used by `useUserLibrary`, `useProfile`, `useDiscoverFeeds`, etc.
- `createResource` is Solid's primitive for async data fetching. It
  works during SSR (the server awaits the resource before flushing
  HTML) and on the client (hydration picks up the SSR-resolved value).
- The source is always a repository function from `lib/supabase/`.

### 5.3 `createSignal` for local component state

- Used inside components for ephemeral UI state (modal open/close,
  filter drawer visibility, sort direction).
- Never escapes the component — dies on unmount.

### 5.4 Context providers (rare)

- `SearchContext.tsx` is the only real context provider. It exists
  because the search overlay can be opened from any route and needs
  to share state between the trigger button and the overlay.
- Most "global" state is module-level signals (5.1), not context.

---

## 6. The Glass Design System

`src/shared/ui/glass/` is the design system. It's a set of 21
components built on the Glassmorphism aesthetic: blurred backgrounds,
subtle borders, and the cinema-gold accent color (`--p: #e8b74a`).

### 6.1 Component inventory

- `GlassSurface`, `GlassCard`, `GlassModal`, `GlassSheet`, `GlassButton`,
  `GlassIconButton`, `GlassInput`, `GlassBadge`, `GlassTabs`,
  `GlassAvatar`, `GlassStatCard`, `GlassPosterCard`, `GlassEmptyState`,
  `GlassLoadingState`, `GlassSkeleton`.
- A few are dead (`GlassChip`, `GlassDivider`, `GlassListItem`,
  `GlassSearchBar`, `GlassSectionHeader`) — kept in the barrel for
  future use but with zero consumers.

### 6.2 Design tokens

All visual properties are tokenized in `src/styles/tokens/`:

- `colors.css` — the palette (`--p` accent, `--bg` background, etc.)
- `typography.css` — font stacks, sizes, weights.
- `spacing.css` — the 4px-based spacing scale.
- `radius.css` — border radii.
- `shadows.css` — elevation tokens.
- `motion.css` — animation durations and easings.
- `blur.css` — backdrop-filter blur amounts.
- `z-index.css` — the layering scale (modal = 999999, etc.).

Components reference tokens via `var(--token-name)`, never with literal
values. This is what allows the theme engine (`core/theme/`) to swap
the entire palette by changing the CSS custom properties on `:root`.

### 6.3 The theme engine

`src/core/theme/` reads the user's theme preference (cinematic default,
matrix, oceanic, etc.) and writes the corresponding token overrides to
`:root`. The preference is stored in localStorage under
`cinelog_theme` — note that this is NOT in the `PreferencesSnapshot`
synced to Supabase, so theme is device-local (a known limitation).

---

## 7. Caching Strategy

CineLog has aggressive multi-layer caching because TMDB is the primary
cost center (rate-limited, slow, occasionally down).

### 7.1 TMDB three-layer cache

```
Browser request
      │
      ▼
┌──────────────────────┐
│ in-memory apiCache   │  10 min TTL, dedupes in-flight requests
│ (src/shared/utils/)  │
└──────────────────────┘
      │ miss
      ▼
┌──────────────────────┐
│ localStorage cache   │  24h TTL, per-device
│ cinelog_tmdb_cache   │
└──────────────────────┘
      │ miss
      ▼
┌──────────────────────┐
│ Supabase tmdb_cache  │  7d SWR, shared across all users
│ table + RLS          │
└──────────────────────┘
      │ miss
      ▼
   TMDB API
```

Every TMDB fetch traverses these layers. Writes propagate upward
(Supabase → localStorage → in-memory) so the next read is a hit.

### 7.2 CDN caching

API routes set explicit `Cache-Control` headers:

- Public read-only endpoints (`/api/announcements`, `/api/feature-flags`,
  `/api/homepage-config`): `s-maxage=300, stale-while-revalidate=600`.
- User-specific endpoints (`/api/stats`, `/api/discover/taste`):
  `s-maxage=60, stale-while-revalidate=120`.
- Mutations (`POST`/`PATCH`/`DELETE`): `no-store`.

### 7.3 AniList rate-limit handling

The AniList client (`src/lib/anilist/client.ts`) reads
`X-RateLimit-Remaining` from every response. When remaining drops below
5, it pauses until the bucket resets. On HTTP 429, it honors
`Retry-After` and retries once with exponential backoff.

---

## 8. Auth Flow

CineLog uses Supabase Auth with **PKCE flow** + magic-link / OAuth.
The flow was refactored multiple times (see commits `0a3d1fe`,
`420e807`, `851ec3f`, `1c0ccc0`) to eliminate race conditions.

### 8.1 Sign-in

1. User clicks "Sign in with email" → Supabase sends a magic link.
2. User clicks the link → browser navigates to `/auth/callback?code=...`.
3. The callback route is a **client component** (not a server route).
   It calls `supabase.auth.exchangeCodeForSession(code)` in the browser.
4. On success, the session is stored in localStorage (Supabase SDK
   default with `persistSession: true`).
5. The app redirects to the originally-requested URL (stored in a
   cookie before the sign-in flow started).

### 8.2 Session persistence

- **Browser:** localStorage key `sb-<project-ref>-auth-token`. Contains
  access + refresh tokens. This is XSS-exfiltrable — mitigated by
  strict CSP (though `'unsafe-inline'` is currently required for the
  inline FOUT-prevention script).
- **Server:** the middleware parses the auth cookie and creates a
  per-request Supabase client. Token refresh happens server-side and
  the refreshed cookie is flushed onto the response.

### 8.3 Admin auth

Admins are regular users with `profiles.is_admin = true`. The admin
auth flow adds:

1. **Cookie JWT** — `adminJwt.ts` issues an HS256 JWT after successful
   admin login. Stored in a separate `cinelog_admin` cookie.
2. **DB lookup** — `requireAdmin()` re-checks `is_admin AND
   admin_disabled_at IS NULL AND deleted_at IS NULL` on every request.
   The JWT alone is not sufficient.
3. **PIN** (optional, when 2FA is enabled) — constant-time compared
   via `crypto.timingSafeEqual`.
4. **Audit log** — every admin mutation writes to `admin_actions`
   (append-only).

---

## 9. PWA & Service Worker

The service worker (`public/sw.js`) is intentionally minimal:

- Handles `push` events (web push notifications).
- Handles `notificationclick` (opens the app and focuses the relevant
  route).
- Does **NOT** handle `fetch` — there is no offline cache. The app is
  non-functional without a network connection.

This is a known limitation (catalogued in the audit). Adding a fetch
handler is a future task — it requires careful cache-strategy design
because the app is highly personalized (the same URL serves different
content for different users).

The service worker is registered in `entry-client.tsx` (production
only) with `skipWaiting()` on `updatefound` so new deploys take effect
on the next navigation. A toast is shown on `controllerchange` to
prompt the user to refresh.

---

## 10. Error Monitoring (Phase 8)

CineLog uses Sentry for error monitoring, wired in Chunk 1 of Phase 8.

### 10.1 Client (`src/lib/sentry/client.ts`)

- Wraps `@sentry/browser`.
- `initSentry()` is called from `entry-client.tsx` after `mount()` —
  non-blocking.
- Reads `VITE_SENTRY_DSN` from env. No-op when absent (dev, tests).
- `beforeSend` strips `ResizeObserver loop` errors and TMDB 401s —
  these are handled in-app and would pollute the Sentry inbox.
- Session replays are enabled with `maskAllText: true` (user vault
  notes may contain personal content).

### 10.2 Server (`src/lib/sentry/server.ts`)

- Wraps `@sentry/node`.
- Initializes at module load (top-level side effect) — `@sentry/node`
  v8+ uses OpenTelemetry and must hook `http`/`https` before any
  outgoing request.
- Reads `SENTRY_DSN` from env. No-op when absent.
- `beforeSend` preserves the TMDB-suppression logic from
  `entry-server.tsx`'s `process.on("unhandledRejection")` handler.
- The unhandled-rejection handler now calls `captureException()` for
  genuine (non-TMDB) rejections, forwarding them to Sentry for
  production monitoring.

### 10.3 Test safety

Both wrappers short-circuit when `VITEST` is truthy. `captureException`
falls back to `console.error` in tests, so vitest captures it as a
test warning rather than making a network call.

---

## 11. File-Route Convention

SolidStart uses file-based routing. `src/routes/` mirrors the URL:

```
src/routes/
├── index.tsx                    # /
├── discover.tsx                 # /discover
├── watchlist.tsx                # /watchlist
├── search.tsx                   # /search
├── [...404].tsx                 # catch-all 404
├── movie/[id].tsx               # /movie/:id (deep-link w/ OG meta)
├── tv/[id].tsx                  # /tv/:id (deep-link w/ OG meta)
├── auth/callback.tsx            # /auth/callback (PKCE exchange)
├── profile/{index,history,upcoming,achievements,trash,stats}.tsx
├── settings/{index,appearance,account,...}.tsx
├── admin/{index,users,content,collections,...}.tsx
└── api/                         # API routes (see openapi.yaml)
    ├── stats.ts, anilist.ts, ...
    ├── admin/{users,content,collections,...}.ts
    └── cron/weekly-recap.ts
```

Deep-link routes (`/movie/:id`, `/tv/:id`) emit per-route OG/Twitter
meta tags with `deferStream: true` so SSR waits for the TMDB fetch
before flushing HTML. This is what makes chat-app link previews
(WhatsApp, iMessage, Telegram, Slack) show the actual movie poster
instead of a generic app preview.

---

## 12. Where to Put New Code

Use this decision tree:

```
Is it a pure function with no I/O?
  → src/core/  (or src/shared/utils/ if it's UI-domain)

Does it touch Supabase / an external API?
  → src/lib/supabase/repositories/<domain>/  (data access)
  → src/lib/<provider>/                      (external API client)

Is it a reusable UI component or hook?
  → src/shared/ui/       (component)
  → src/shared/hooks/    (hook)

Is it specific to one feature?
  → src/features/<feature>/
      ├── components/    (UI)
      ├── hooks/         (feature-specific hooks)
      ├── <name>Adapter.ts  (DB ↔ UI translation)
      └── <feature>Page.tsx (route entry)

Is it a new page or API route?
  → src/routes/<path>.tsx  (page)
  → src/routes/api/<path>.ts (API — document in openapi.yaml)
```

When in doubt, mirror the structure of the closest existing feature.
The codebase is consistent — if your new code looks structurally
different from its neighbors, that's a smell.
