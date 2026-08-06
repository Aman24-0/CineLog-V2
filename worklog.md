# CineLog-V2 — Shared Worklog

---
Task ID: 9-c3
Agent: main (Super Z)
Task: Phase 9 Chunk 3 — User Management Overhaul (AdminUsersPage rewrite, UserDetailDrawer, API extension)

Work Log:
- Explored existing AdminUsersPage (1308 lines, pre-Glass UI), users API, and Glass UI component library.
- Audited user-side auth flows via subagent: confirmed Email + Google OAuth only (Apple disabled), Supabase native TOTP MFA exists for users, login_history table exists (IP always null client-side, user_agent captured), profiles.bio/country/avatar_url exist, no profiles.providers column (identities live in auth.users), no standalone ratings table (ratings are a vault column), AdminSettingsPage has zero user-management settings.
- Extended GET /api/admin/users with three filters (provider, twofa, admin) + list-row enrichment (provider + twofa_enabled flags via batched auth.admin.getUserById + auth.admin.mfa.listFactors). Single-user detail (?id=) now returns bio, identities, mfa_factors, collections_count, ratings_count, and last 10 login_history entries.
- Created src/features/admin/components/UserDetailDrawer.tsx — slide-in GlassSheet with 4 sections (profile, auth, activity summary, login history) + sticky action footer (disable/enable/reset/delete). Actions map exactly to user-side flows; no dummy actions.
- Rewrote src/features/admin/AdminUsersPage.tsx with Glass UI (GlassCard, GlassButton, GlassInput, GlassBadge, GlassAvatar, GlassEmptyState, GlassStatCard). Implemented: debounced search, provider/2FA/admin filter dropdowns, bulk multi-select with action bar, responsive desktop table (md:block) + mobile stacked cards (md:hidden), pagination, single + bulk confirm dialogs, toast feedback, and drawer integration.
- Fixed supabase-js admin MFA API: listFactors takes { userId } object (not bare string) and returns { data: { factors } } (not { all }).
- Removed unused StatusBadge helper + replaced empty interface with type alias to satisfy ESLint.
- Verified no OMDB references in any modified file.
- npx tsc --noEmit → 0 errors. npx vitest run → 1276 tests pass (54 files). npx eslint → 0 errors.

Stage Summary:
- Files modified: src/routes/api/admin/users.ts (extended, backwards-compatible), src/features/admin/AdminUsersPage.tsx (full rewrite), src/features/admin/components/UserDetailDrawer.tsx (new).
- All 4 Phase 9 rules honored: zero duplication (no user-mgmt settings exist on AdminSettingsPage), strict user-side mapping (only disable/enable/delete/reset_preferences actions, all map to real user flows), no OMDB, mobile-first responsive (table→card transformation at 768px).
- Committed locally; NOT pushed (per user instruction).

---
Task ID: phase-12-chunk-2
Agent: main (Super Z)
Task: Phase 12 Chunk 2 — Trakt Backend (OAuth & API Routes). Build server-side infrastructure for Trakt Direct API Integration: DB migration, OAuth handshake, email-mismatch security check, and Preview/Execute sync routes. NO frontend UI yet.

Work Log:
- Audited post-Chunk-1 state: read existing supabase migrations (20260810_add_admin_2fa.sql pattern), database.types.ts shape, server.ts cookie adapter, adminClient.ts, sessionCookie.ts (getSupabaseAccessToken), /api/account/delete.ts (auth verification pattern), /api/admin/services/status.ts (probe + jsonResponse pattern), /api/anilist.ts (proxy pattern), /api/push/status.ts (env var normalization). Confirmed no existing TRAKT_* env vars or user_integrations table.
- Cleaned working-tree noise: 130+ files showed mode-only changes (644→755) from prior phases. Ran `git config core.filemode false` to stop tracking executable bit. Working tree is now clean.
- Created supabase/migrations/20260813_add_user_integrations.sql:
  - Table public.user_integrations (id UUID PK, user_id FK→profiles, provider TEXT, access_token TEXT NOT NULL, refresh_token TEXT, provider_user_id TEXT, provider_email TEXT, expires_at TIMESTAMPTZ, created_at, updated_at)
  - UNIQUE (user_id, provider) — one Trakt account per CineLog user, re-connect upserts
  - Indexes on provider + expires_at (for future refresh cron)
  - RLS enabled, owner-only policies (user_id = auth.uid()) for SELECT/INSERT/UPDATE/DELETE
  - updated_at trigger
- Updated src/lib/supabase/database.types.ts with the new user_integrations table shape (Row/Insert/Update/Relationships).
- Created src/lib/server/trakt.ts (server-only Trakt API client, ~620 LOC):
  - Types: TraktHistoryEntry, TraktMovie, TraktShow, TraktEpisode, TraktRatingEntry, TraktUserProfile, TraktTokenResponse, NormalizedTraktItem
  - readTraktConfig() throws if TRAKT_CLIENT_ID/SECRET/REDIRECT_URI missing; isServer guard throws if imported on browser
  - buildTraktAuthorizeUrl(state) — constructs the OAuth authorize URL
  - exchangeTraktCodeForToken(code) — POST /oauth/token with grant_type=authorization_code
  - refreshTraktToken(refreshToken) — POST /oauth/token with grant_type=refresh_token
  - getTraktUserProfile(token) — GET /users/me (for email mismatch check)
  - getTraktWatchedHistory(token, username) — paginated GET /users/{username}/history (100/page, 50-page safety cap = 5000 items max)
  - getTraktRatings(token, username) — paginated GET /users/{username}/ratings (same caps)
  - normalizeTraktHistoryEntry(entry) — pure helper, returns NormalizedTraktItem | null (null when TMDB ID missing or unknown type)
  - dedupeTraktItems(items) — pure helper, keeps most-recent-watched per (media_type, tmdb_id) — for TV, dedupes per show not per episode (CineLog vault is per-show)
  - applyTraktRatings(items, ratings) — pure helper, applies per-show + per-movie ratings, ignores per-episode ratings, never mutates input
  - getNormalizedTraktHistory(token, username) — convenience wrapper used by both Preview + Execute routes; ratings fetch is fail-soft (warns + continues with empty ratings list)
  - 30s hard timeout on every Trakt API call (AbortController)
- Created src/lib/server/__tests__/trakt.test.ts — 18 unit tests for the pure helpers:
  - buildTraktAuthorizeUrl (state param, redirect_uri URL-encoding)
  - normalizeTraktHistoryEntry (movie with TMDB ID, movie without TMDB ID → null, episode with TMDB ID, episode with show missing TMDB ID → null, unknown type → null, empty title → 'Untitled' fallback)
  - dedupeTraktItems (same movie twice → keeps most recent, TV episodes per-show dedup, different tmdb_ids preserved, same tmdb_id different media_type preserved, empty list)
  - applyTraktRatings (movie rating applied, show rating applied, episode ratings ignored, unrated items stay null, empty ratings list, no mutation invariant)
  - Mocks solid-js/web's isServer=true so the server-only guard doesn't fire in jsdom
- Created src/routes/api/auth/trakt.ts (OAuth init, GET):
  - Verifies CineLog session (anon-key client + getUser(accessToken) — proves the token belongs to a real signed-in user)
  - Generates CSRF state token (crypto.randomUUID or node:crypto randomBytes fallback)
  - Stores state in httpOnly SameSite=Lax cookie (10-min Max-Age; Secure flag set when HTTPS)
  - 302 redirect to Trakt authorize URL
  - Redirects to /?auth=required if not signed in
- Created src/routes/api/auth/trakt/callback.ts (OAuth callback, GET):
  - Parses ?code=...&state=... from URL, reads state cookie from Cookie header
  - CSRF check: rejects if state mismatch (clears cookie, redirects with ?error=trakt_state_mismatch)
  - Re-verifies CineLog session still active
  - Exchanges code for tokens via exchangeTraktCodeForToken
  - Fetches Trakt profile via getTraktUserProfile to get the user's Trakt email
  - EMAIL MISMATCH CHECK: if traktEmail !== cinelogEmail (case-insensitive, trimmed), REJECTS the connection and redirects to /settings/sync?error=trakt_email_mismatch. Also rejects if Trakt profile has no email.
  - On match: upserts tokens into user_integrations via service-role admin client (onConflict: user_id,provider). Computes expires_at from expires_in.
  - State cookie cleared on EVERY path (success or error) so it can't be replayed
  - Trakt tokens NEVER appear in any URL or response body
- Created src/routes/api/sync/trakt/preview.ts (GET):
  - Verifies CineLog session, loads user_integrations row via service-role admin client
  - Returns 409 if no Trakt connection exists
  - Fetches normalized Trakt history (with ratings)
  - Loads user's vault (anon-key client + user's access token so RLS enforces row isolation)
  - computeSummary() compares by (media_type, tmdb_id):
    - "new" = in Trakt not in vault
    - "alreadyInVault" = in both, no rating/status diff
    - "conflict" = in both, rating differs OR vault status is 'planned' (Trakt would upgrade to 'completed')
  - Returns JSON: { connected, trakt_username, trakt_email, summary { newMovies, newShows, conflicts, alreadyInVault, totalTraktItems, totalVaultItems }, sample { newMovies[≤10], newShows[≤10] }, fetched_at }
- Created src/routes/api/sync/trakt/execute.ts (POST):
  - Optional body: { skipConflicts?: bool, overwriteRating?: bool } (both default false)
  - Verifies session, loads integration, fetches normalized Trakt history
  - Loads existing vault rows matching the Trakt tmdb_id list (single in() query, no full-vault scan)
  - performBulkUpsert():
    - INSERTs new items in batches of 100 (Supabase default max)
    - UPDATEs existing items per-row with 30ms delay (matches BackupService.restore pattern, stays under Supabase rate limit)
    - buildUpdatePayload() only updates fields Trakt knows about (status, watched_on, rating); preserves notes, is_favorite, is_pinned, rewatch_count
    - Never overwrites a user-set rating without explicit opt-in (overwriteRating=true)
    - Failures are collected per-batch, loop continues, final count reported (partial-success friendly)
  - Returns JSON: { ok, imported, updated, skipped, totalProcessed, duration_ms, trakt_username }
- Updated .env.example with TRAKT_CLIENT_ID, TRAKT_CLIENT_SECRET, TRAKT_REDIRECT_URI documentation (server-only, no VITE_ prefix).
- Two test failures fixed during iteration:
  1. isServer is false in jsdom → added `vi.mock("solid-js/web", () => ({ isServer: true }))` to trakt.test.ts
  2. Empty-title fallback used `??` (doesn't catch empty string) → changed to `||`
- Verification:
  - npx tsc --noEmit → 0 errors
  - npx vitest run src/lib/server/__tests__/trakt.test.ts → 18 tests pass
  - npx vitest run (full suite) → 55 files / 1412 tests pass (no regressions)
- Committed as 6583d86. Pushed to origin/main via one-shot PAT-embedded URL (PAT never written to .git/config). Verified origin/main now at 6583d86.

Stage Summary:
- 9 files: 1 migration, 1 type update, 1 server lib, 1 test file, 4 API routes, 1 env example update. 2760 insertions.
- All 4 Phase 12 Chunk 2 critical rules honored:
  1. Backend only — no frontend UI files touched
  2. Security — access_token + refresh_token stored in DB (RLS-protected, owner-only); read via service-role admin client; NEVER sent to browser; all Trakt API calls proxied through server routes
  3. Email matching — callback route rejects the connection if Trakt email ≠ CineLog email (case-insensitive)
  4. Data mapping — Trakt history's movie.ids.tmdb / show.ids.tmdb mapped directly to vault.tmdb_id; movie→media_type='movie', episode→media_type='tv'
- Ready for Chunk 3 (frontend UI: Connect Trakt button, preview modal, execute progress, sync history row).
