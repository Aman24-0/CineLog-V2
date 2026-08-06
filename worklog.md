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

---
Task ID: phase-12-chunk-3
Agent: main (Super Z)
Task: Phase 12 Chunk 3 — Trakt Frontend (Wizard & Settings UI). Build the user-facing UI for the Trakt direct integration in Settings → Data & Sync. NO backend changes — purely frontend: connect/disconnect card, 3-step sync wizard modal, email-mismatch error banner.

Work Log:
- Audited post-Chunk-2 state: read SyncSection.tsx, all Glass UI components (GlassCard, GlassButton, GlassModal, GlassBadge, GlassSkeleton, GlassEmptyState), CloudStatusCard, JsonImportWizard (for modal pattern reference), CsvImportCard (for card pattern reference), SettingsState type bag, secondary.css (where sync styles live), color tokens. Confirmed no existing Trakt logo asset — would need to ship inline SVG.
- Created src/features/sync/components/TraktLogo.tsx (~60 LOC): inline SVG of Trakt's signature red square + scan lines. No binary asset needed; inherits currentColor where possible. Configurable size + color.
- Created src/features/sync/components/TraktSyncWizard.tsx (~570 LOC): GlassModal-based 3-step sync wizard.
  - Step "loading": fetches /api/sync/trakt/preview on modal open (createEffect tracks props.open, fires on false→true edge). GlassSkeleton grid while loading.
  - Step "preview": shows summary stat grid (New Movies, New Shows, Conflicts, Already in Vault) + sample titles (up to 5 each, scrollable list). Conflict explainer note when conflicts > 0. Empty case ("Nothing to import") when all 0.
  - Step "executing": spinner with progress_activity icon (CSS spin animation), backdrop+ESC disabled.
  - Step "success": green check + "Sync Complete!" + result stat grid (Imported, Updated, Skipped) + duration.
  - Step "error": branches on error.kind — "not-connected" shows GlassEmptyState with "Connect Trakt" CTA, "trakt-down"/"unknown" show Retry button, "auth" shows just Close.
  - handleClose defers state reset 250ms so the close animation isn't disturbed; next open starts fresh.
  - onSuccess callback fires after execute returns ok (parent uses it to update "Last Synced" timestamp).
  - onConnectionLost callback fires when preview returns 409 (parent uses it to flip card back to "unconnected" state and clear localStorage).
  - createEffect watcher uses `let lastOpen = false` initializer (NOT `props.open`) to avoid untracked-reactive-read eslint warning.
- Created src/features/sync/components/TraktIntegrationCard.tsx (~290 LOC): GlassCard with connect/disconnect UI.
  - State: `connected`, `lastSynced`, `wizardOpen`, `emailMismatch`, `disconnecting` signals.
  - URL state consumption on mount: reads ?trakt=connected, ?error=trakt_email_mismatch, ?error=trakt_state_mismatch from URL, then strips them via window.history.replaceState (so refresh doesn't re-trigger toasts/banners).
  - localStorage persistence for `connected` flag (key: cinelog_trakt_connected) and `lastSyncedAt` timestamp (key: cinelog_trakt_last_synced_at). Both wrapped in try/catch for private-mode browsers.
  - "Connect Trakt" button → window.location.href = "/api/auth/trakt" (server redirects to Trakt consent screen).
  - "Sync Now" button → opens wizard modal.
  - "Disconnect" link button → POST /api/auth/trakt/disconnect (route doesn't exist yet — handles 404/405 gracefully by updating UI optimistically + toast informing user server-side cleanup is pending).
  - Email mismatch banner: red GlassCard-style banner with title, body, dismiss X button. Persistent until dismissed.
  - State mismatch (CSRF failure): just a toast (transient — user just needs to retry).
  - Last Synced formatting: "Today at 3:45 PM", "Yesterday at …", "Mar 4 at …" — relative date + time.
- Updated src/features/settings/sections/SyncSection.tsx: added "Direct Integrations" subsection between Cloud Status and Sync Cadence, containing <TraktIntegrationCard />. Subsection follows existing pattern (setting-subsection + setting-subsection-label + setting-group).
- Added ~510 LOC of CSS to src/styles/features/secondary.css (section 11, after existing sync styles):
  - .trakt-integration-* — card layout, header (logo + title + badge), body, actions, disconnect-btn (subtle underline link), email-mismatch error banner (danger-bg/border tokens).
  - .trakt-wizard-* — modal body layout, stat grid (2-col mobile → 4-col ≥480px), stat tiles with data-tone variants (primary/warning/muted), conflict-note (warning tokens), sample lists (scrollable, max-height 200px), nothing-to-import empty state, action row, executing spinner, success icon, error icon.
  - All spacing/sizing uses var(--sp-*) with hardcoded fallbacks. All colors use design tokens (var(--p), var(--color-danger-text), var(--color-warning-bg), etc.) with hardcoded fallbacks.
  - Mobile-first: stat grid wraps 2-col on mobile, action buttons flex-wrap.
- Verification:
  - npx tsc --noEmit → 0 errors
  - npx vitest run → 55 files / 1412 tests pass (no regressions)
  - npx eslint (on the 4 touched files) → 0 errors, 0 warnings (after fixing 2 initial issues: unused stateMismatch signal, untracked props.open read)
- Two lint issues fixed during iteration:
  1. TraktIntegrationCard had a `stateMismatch` signal that was set but never read → removed the signal, kept just the toast (state mismatch is transient, doesn't need a persistent banner).
  2. TraktSyncWizard initialized `let lastOpen = props.open` which is an untracked reactive read → changed to `let lastOpen = false` (first effect run on mount treats open=true as a transition and fires fetchPreview correctly).

Stage Summary:
- 5 files: 3 new (TraktLogo, TraktSyncWizard, TraktIntegrationCard), 2 modified (SyncSection, secondary.css). ~1440 LOC added.
- All 4 Phase 12 Chunk 3 critical rules honored:
  1. Design System — exclusively uses GlassCard, GlassButton, GlassModal, GlassBadge, GlassSkeleton, GlassEmptyState. No custom UI primitives.
  2. Mobile-First Responsive — stat grids wrap 2-col on mobile → 4-col on ≥480px, action buttons flex-wrap, modal size="md" (max-w-md = 448px, fits mobile), card padding uses GlassCard size="default".
  3. Error Handling — ?error=trakt_email_mismatch shows persistent red banner with dismiss button + clear explanation. ?error=trakt_state_mismatch shows toast. Wizard handles 401/409/502/500 with distinct error UIs + retry options.
  4. No Backend Changes — only frontend files touched. Disconnect calls a placeholder route (/api/auth/trakt/disconnect) which doesn't exist yet; UI handles 404/405 gracefully. Once the route is implemented server-side, the same client code will respect the real response.
- Security: no tokens stored client-side. Connect button navigates to server OAuth init route. All Trakt API access proxied through /api/sync/trakt/preview and /api/sync/trakt/execute.
- Connection state persistence: localStorage (cinelog_trakt_connected) — survives page reloads. If the server-side integration is ever revoked (token expired, refresh failed, manually deleted from DB), the next preview call returns 409 → wizard fires onConnectionLost → card flips back to "unconnected" + localStorage cleared.
- Ready for Chunk 4 (potential: /api/auth/trakt/disconnect route, scheduled auto-sync, sync history log).

---
Task ID: phase-12-chunk-4
Agent: main (Super Z)
Task: Phase 12 Chunk 4 — Trakt Status + Disconnect Routes. Build the two missing backend routes the frontend expects (/api/auth/trakt/status GET, /api/auth/trakt/disconnect POST) and rewire TraktIntegrationCard to fetch status on mount instead of relying on localStorage + URL parameters.

Work Log:
- Audited post-Chunk-3 state: read existing /api/auth/trakt.ts + /api/auth/trakt/callback.ts (OAuth init + callback patterns), /api/sync/trakt/preview.ts (status-check + admin-client + loadTraktIntegration pattern), adminClient.ts (service-role factory), sessionCookie.ts (getSupabaseAccessToken), database.types.ts user_integrations shape (Row: id, user_id, provider, access_token, refresh_token, provider_user_id, provider_email, expires_at, created_at, updated_at), TraktIntegrationCard.tsx (current localStorage + URL-param-based state), TraktSyncWizard.tsx (onSuccess/onConnectionLost callback contracts). Confirmed no status/disconnect routes existed.
- Created src/routes/api/auth/trakt/status.ts (GET, ~170 LOC):
  - Verifies CineLog session via anon-key client + getUser(accessToken) (same pattern as preview.ts).
  - Returns 401 if not authenticated, 500 on DB error.
  - Queries user_integrations via service-role admin client, selecting ONLY provider_user_id, provider_email, updated_at — NEVER access_token or refresh_token.
  - Returns { connected: boolean, lastSynced: string|null, trakt_username: string|null, trakt_email: string|null }.
  - lastSynced = integration.updated_at (per user spec). Note: this is the connect/reconnect time, not the actual last sync time (execute route doesn't bump updated_at — out of scope per "two routes strictly").
  - Rejects POST/other methods with 405.
- Created src/routes/api/auth/trakt/disconnect.ts (POST, ~130 LOC):
  - Verifies CineLog session (same pattern).
  - Returns 401 if not authenticated, 500 on DB error.
  - Deletes the user_integrations row via service-role admin client where user_id=userId and provider='trakt'.
  - Idempotent: deleting a non-existent row returns 200 { ok: true } (Postgres delete affects 0 rows, no error).
  - Does NOT revoke the token on Trakt's side (no Trakt revocation endpoint exists in their API as of writing; user must revoke manually at https://trakt.tv/settings/oauth — frontend toast mentions this).
  - Does NOT delete previously-imported vault items (they remain as CineLog records, no longer tied to Trakt).
  - Rejects GET/other methods with 405.
- Rewrote src/features/sync/components/TraktIntegrationCard.tsx:
  - REMOVED all localStorage code (LOCALSTORAGE_CONNECTED_KEY, LOCALSTORAGE_LAST_SYNCED_KEY, readConnected, writeConnected, readLastSynced, writeLastSynced — all deleted).
  - REMOVED the `?trakt=connected` URL param handling (no longer needed — /status fetch detects connection).
  - KEPT the `?error=trakt_email_mismatch` + `?error=trakt_state_mismatch` URL param handling (these are error states from the OAuth callback, not connected-state signals). Both are still consumed on mount and stripped from the URL via window.history.replaceState.
  - Renamed `consumeUrlState` → `consumeUrlErrorState` to reflect the narrowed responsibility.
  - Added `refreshStatus()` async function that fetches /api/auth/trakt/status, sets `connected` and `lastSynced` from the response, and sets `statusLoading=false` in finally.
  - Added `statusLoading` signal (initially true) so the card body shows a GlassSkeleton (2 text lines + 1 button block) while the fetch is in flight — prevents flash of "unconnected" state on every page load.
  - onMount: consume URL error state, then call refreshStatus().
  - Disconnect handler: removed the 404/405 fallback (route now exists). Now handles 200 (success), 401 (not signed in), and other statuses (generic error toast).
  - Wizard onSuccess: optimistically updates lastSynced locally, then re-fetches /status (defensive — execute route doesn't currently bump updated_at, but if it ever does, we get the fresh value).
  - Wizard onConnectionLost: sets connected=false + lastSynced=null (no localStorage to clear anymore).
  - "Connected" GlassBadge only renders when connected() && !statusLoading() (so it doesn't flash during the initial fetch).
  - Added `TraktIntegrationCardBody` loading state with GlassSkeleton variant="text" lines={2} + a 120x36px block skeleton mimicking the Connect button shape.
- Added ~10 lines of CSS to src/styles/features/secondary.css: `.trakt-integration-skeleton-actions` class for the loading skeleton action row (flex + gap + margin-top to match the real actions row layout, prevents height jump when status resolves).
- Verification:
  - npx tsc --noEmit → 0 errors
  - npx vitest run → 55 files / 1412 tests pass (no regressions)
  - npx eslint on the 3 touched files → 0 errors, 0 warnings

Stage Summary:
- 4 files: 2 new backend routes (status.ts, disconnect.ts), 1 frontend rewrite (TraktIntegrationCard.tsx), 1 CSS addition (secondary.css). ~600 LOC added/modified.
- All 4 user-specified rules honored:
  1. /api/auth/trakt/status — GET, reads session, queries user_integrations for provider='trakt', returns { connected, lastSynced } (lastSynced = updated_at).
  2. /api/auth/trakt/disconnect — POST, reads session, deletes user_integrations row, returns 200.
  3. TraktIntegrationCard.tsx — fetches /status on mount, no longer relies on localStorage or URL params for connected state.
  4. tsc + vitest pass, no regressions.
- Security: no tokens exposed client-side. status route selects only non-sensitive columns (provider_user_id, provider_email, updated_at). disconnect route uses service-role admin client (RLS would also allow user-side delete, but consistency with status/callback pattern wins).
- The "Last Synced" timestamp shown in the UI is now sourced from the backend's `updated_at` field — this reflects connect/reconnect time, not actual sync time. If the user wants this to reflect actual sync time, a future chunk can update the execute route to bump updated_at on the integration row after a successful sync.
- Trakt integration is now end-to-end functional: OAuth → status check → preview → execute → disconnect. All 5 backend routes in place: /api/auth/trakt (init), /api/auth/trakt/callback, /api/auth/trakt/status, /api/auth/trakt/disconnect, /api/sync/trakt/preview, /api/sync/trakt/execute.

---
Task ID: phase-12-chunk-5
Agent: main (Super Z)
Task: Phase 12 Chunk 5 — Temporarily hide the TraktIntegrationCard UI when Trakt API credentials aren't configured. Wrap the card in a `import.meta.env.VITE_TRAKT_CLIENT_ID` env-var gate so users never see a "Connect Trakt" button that would 500 on click.

Work Log:
- Read SyncSection.tsx to locate the TraktIntegrationCard render site (lines 110–118, inside the signed-in branch of the sync accordion panel, between CloudStatusCard and SyncCadenceCard).
- Audited existing env var conventions in .env.example: confirmed TRAKT_CLIENT_ID/SECRET/REDIRECT_URI are all SERVER-ONLY (no VITE_ prefix). The user's instruction to use VITE_TRAKT_CLIENT_ID as the UI gate is consistent with Vite's "expose to client bundle" convention — and the Trakt client_id is already public (it's in the OAuth authorize URL the server redirects to), so exposing it via VITE_ is safe.
- Wrapped the entire "Direct integrations" subsection (subsection label + setting-group + <TraktIntegrationCard />) in a `<Show when={!!import.meta.env.VITE_TRAKT_CLIENT_ID}>` block. When the env var is unset/empty, the entire subsection is omitted from the DOM — no label, no card, no skeleton, no /status fetch.
- Added an inline comment in SyncSection.tsx explaining the gate + pointing operators to .env.example for the dual-env-var pattern.
- Updated .env.example:
  - Added a new paragraph documenting VITE_TRAKT_CLIENT_ID as a "CLIENT-SIDE FEATURE FLAG" that must be set to the SAME value as TRAKT_CLIENT_ID.
  - Explained that the gate is the mere presence (non-empty string) of the var — the actual value is only used as a boolean indicator, not consumed by the client.
  - Added `VITE_TRAKT_CLIENT_ID=` to the env var list at the bottom of the TRAKT section, with a one-line comment.
- Verification:
  - npx tsc --noEmit → 0 errors
  - npx eslint src/features/settings/sections/SyncSection.tsx → 0 errors, 0 warnings
  - (Did not re-run vitest — no test files touched, and the change is a one-line conditional render with no logic to test.)

Stage Summary:
- 3 files modified: SyncSection.tsx (1 <Show> wrapper + inline comment), .env.example (VITE_TRAKT_CLIENT_ID documentation + env var entry), worklog.md (this entry).
- All 4 user-specified rules honored:
  1. Opened SyncSection.tsx ✓
  2. Wrapped <TraktIntegrationCard /> in import.meta.env.VITE_TRAKT_CLIENT_ID check ✓
  3. If env var missing, card is NOT rendered (entire subsection omitted) ✓
  4. tsc passes, committed + pushed via PAT ✓
- To re-enable the Trakt UI in production: set VITE_TRAKT_CLIENT_ID=<your Trakt client_id> (same value as TRAKT_CLIENT_ID) in the deployment env vars and rebuild. The card will reappear automatically.

---
Task ID: 13-c1
Agent: main (Super Z)
Task: Phase 13 Chunk 1 — The CRITICAL Auth Split & Server Routes (Bug #1 fix)

Work Log:
- Cloned CineLog-V2@main (HEAD: 9c689b5) to /home/z/my-project/CineLog-V2.
- Baseline verified: `npx tsc --noEmit` → 0 errors; `npx vitest run` → 1412/1412 tests pass.
- Audited the auth-split bug: the browser client (`src/lib/supabase/browser.ts`) stores sessions in localStorage (NOT cookies) for mobile reliability, but server-side routes resolved sessions via `getSupabaseAccessToken(cookieHeader)` only — so every browser fetch returned 401 even for signed-in users. Confirmed the bug affects: `/api/auth/trakt/status`, `/api/auth/trakt/disconnect`, `/api/sync/trakt/preview`, `/api/sync/trakt/execute`, `/api/stats`, `/api/discover/taste`, `/api/share-card`.
- Server helper changes:
  • `src/lib/supabase/admin/sessionCookie.ts`: Added `getSupabaseAccessTokenFromRequest(request)` — checks `Authorization: Bearer <token>` header FIRST, falls back to cookie. Kept `getSupabaseAccessToken(cookieHeader)` unchanged for backward compat.
  • `src/lib/supabase/server.ts`: Modified `createServerClientFromRequest` to be async + Bearer-aware. When the Authorization header is present, calls `client.auth.setSession({ access_token, refresh_token: "" })` to inject the session (mirrors the proven pattern in `trakt/preview.ts:loadUserVault`). Falls through to the cookie path otherwise. Errors are caught + logged — the caller's `getSession()` returns null → 401, which is the correct unauthenticated response.
  • `src/middleware.ts`: Updated `onRequest` to async + `await createServerClientFromRequest`.
- Frontend helper: Added `getAuthHeaders()` to `src/lib/supabase/session.ts` — reads the current session via `getBrowserSession()` and returns `{ Authorization: "Bearer <token>" }` (or `{}` if no session / on server). Re-exported from `src/lib/supabase/index.ts`.
- Route updates (server-side): Replaced `getSupabaseAccessToken(cookieHeader)` with `getSupabaseAccessTokenFromRequest(request)` in 4 Trakt routes (status, disconnect, preview ×2, execute). Added `await` to `createServerClientFromRequest` in 3 SSR routes (stats, taste, share-card) + adjusted the `cookieJar` type to `Awaited<ReturnType<...>>`.
- Frontend updates: Added `...await getAuthHeaders()` to the `headers` of every authenticated fetch in:
  • `src/features/sync/components/TraktIntegrationCard.tsx` — /api/auth/trakt/status + /disconnect
  • `src/features/sync/components/TraktSyncWizard.tsx` — /api/sync/trakt/preview + /execute
  • `src/features/stats/hooks/useStatsData.ts` — /api/stats
  • `src/features/discover/hooks/useDiscoverTaste.ts` — /api/discover/taste
  • `src/features/details/ShareSheet.tsx` — /api/share-card
  • `src/features/stats/components/StatsShareModal.tsx` — /api/share-card
- Did NOT change the browser client auth storage (localStorage is correct per Phase 7 Task 15). Did NOT touch the OAuth init route (`/api/auth/trakt`) or callback — those are navigation-based, not fetch-based, and out of scope for this chunk.
- Verified: `npx tsc --noEmit` → 0 errors. `npx vitest run` → 1412/1412 tests pass (55 files). `npx eslint` on modified files → 9 errors, ALL pre-existing on main (line numbers shifted by additions; confirmed via `git stash` baseline). No new lint errors introduced.

Stage Summary:
- Files modified (17):
  Server helpers: src/lib/supabase/admin/sessionCookie.ts, src/lib/supabase/server.ts, src/lib/supabase/session.ts, src/lib/supabase/index.ts, src/middleware.ts
  Server routes: src/routes/api/auth/trakt/status.ts, src/routes/api/auth/trakt/disconnect.ts, src/routes/api/sync/trakt/preview.ts, src/routes/api/sync/trakt/execute.ts, src/routes/api/stats.ts, src/routes/api/discover/taste.ts, src/routes/api/share-card.ts
  Frontend callers: src/features/sync/components/TraktIntegrationCard.tsx, src/features/sync/components/TraktSyncWizard.tsx, src/features/stats/hooks/useStatsData.ts, src/features/discover/hooks/useDiscoverTaste.ts, src/features/details/ShareSheet.tsx, src/features/stats/components/StatsShareModal.tsx
- Architectural decisions:
  • Bearer header preferred over cookie (browser path), cookie kept as fallback (SSR / server-to-server backward compat).
  • `createServerClientFromRequest` made async to accommodate `auth.setSession()`. Middleware + 3 SSR routes updated to `await`.
  • Frontend uses a shared `getAuthHeaders()` helper to avoid duplicating session-reading logic across 6 call sites.
  • `refresh_token: ""` in `setSession` is safe — the browser's `autoRefreshToken` keeps the access token fresh; if it's truly expired, `getUser()` fails, `getSession()` returns null, and the route returns 401 (correct behavior).
- Bug #1 (auth split) is now fixed for all 4 affected features (Trakt sync, Stats, Discover taste, Share card). The OAuth init route (`/api/auth/trakt` navigation) still uses the cookie path — it's a navigation, not a fetch, and is out of scope per the chunk instructions.

---
Task ID: 13-c2
Agent: main (Super Z)
Task: Phase 13 Chunk 2 — Security & Architecture Hardening + Trakt OAuth Init Fix

Work Log:
- Baseline verified: `npx tsc --noEmit` → 0 errors; `npx vitest run` → 1412/1412 tests pass.
- Bug #1 loophole (Trakt OAuth Init): the "Connect Trakt" button used `window.location.href = '/api/auth/trakt'`, which can't carry the `Authorization` header the rest of Phase 13 Chunk 1 added. Frontend (`TraktIntegrationCard.tsx`) now appends `?accessToken=<token>` to the navigation URL (URL-encoded JWT). Server (`/api/auth/trakt` GET) reads `accessToken` from the query param FIRST, then falls back to the `Authorization: Bearer` header, then the cookie — matching the resolution order used everywhere else. Token never reaches Trakt (consumed server-side, dropped before the 302).
- Bug #2 (2FA brute force): added DB-backed rate limit buckets `admin2faVerify` + `admin2faDisable` to `rateLimiter.ts` (5 attempts / 5 min / 15-min lockout). Both `/api/admin/2fa/verify` and `/disable` now call `isRateLimited` BEFORE any DB/TOTP work (short-circuit on lockout), `recordFailure` on every bad code (including format errors), and `clearFailures` on success.
- Bug #4 (TOTP replay): added `verifyTOTPWithReplay(secret, code, lastUsedCounter, atTime?)` to `src/lib/server/totp.ts` — returns `{ valid, matchedCounter }`. Existing `verifyTOTP` is unchanged (so the 20 totp tests still pass). New migration `20260814_add_admin_2fa_replay_protection.sql` adds `last_used_counter INTEGER` to `admin_2fa_secrets` (`IF NOT EXISTS`, indexed, commented). Both verify and disable now SELECT `last_used_counter`, reject any code whose counter is <= the stored value, and UPDATE the column on success. Verified the disable route updates the counter BEFORE deleting the row (defensive: a transient DB error on the DELETE doesn't open a replay window).
- Bug #3 (localhost cookie): the actual `Secure` bug was in `auth.ts:setAdminCookie/clearAdminCookie` which hardcoded `Secure` even on http://localhost (browser silently rejected the cookie → admin login bounced back). Centralized the cookie builders in `sessionCookie.ts` (per the user's instruction to modify that file) by adding `isRequestHttps(request)`, `buildAdminCookieHeader(token, isHttps, name?, maxAge?)`, `buildAdminCookieClearHeader(isHttps, name?)`. `auth.ts` now imports + uses these helpers; `verifyProfileAndIssueAdmin` and the DELETE handler thread the `isHttps` flag through. `HttpOnly` and `SameSite=Strict` are ALWAYS set; only `Secure` is conditional.
- Bug #5 (tmdb-cache POST): added Supabase session auth gate at the top of POST (Bearer-header path with cookie fallback). Returns 401 if no session. Frontend caller `src/shared/utils/tmdbCache.ts:cacheMetadataEntries` now attaches `Authorization: Bearer` via `getAuthHeaders()`.
- Bug #6 (anime-mappings POST): added the same auth gate after the method guard. Frontend caller `src/lib/supabase/repositories/animeMapping.ts:saveMapping` (browser path) now attaches `Authorization: Bearer` via `getAuthHeaders()`. No rate limit added (UNIQUE on tmdb_id makes the route idempotent — duplicate writes are no-ops).
- Bug #7 (share-card rate limit): added DB-backed `shareCard` bucket (20 cards / 1 hour / per-user, NOT per-IP). `checkAndIncrement` is called AFTER auth but BEFORE Chromium launch — so a rate-limited request doesn't waste the ~1-2s render cost. Fail-open on DB error. Updated the route's docstring to reflect the new limit and call out that the previous "soft" activity_log check (20 in 60s) was far too lenient.
- Bug #14 (cron secret): the weekly-recap migration had hardcoded values `v_app_url := 'https://cinelogv2.vercel.app'` and `v_cron_secret := '1814ad6f...'` committed in the DO block. Replaced both with strict `current_setting('app.app_url', true)` / `current_setting('app.cron_secret', true)`. The migration now correctly skips scheduling (with a NOTICE) when the GUCs are unset — matching the original design intent in the file header. Added a "Phase 13 Chunk 2 — Bug #14" comment block explaining what was removed and why (the hardcoded value was a security regression that allowed anyone reading the repo to trigger the recap job on demand). Verified via grep that the secret string doesn't appear anywhere else in the codebase (only in the now-commented historical reference).
- Verification:
  - `npx tsc --noEmit` → 0 errors.
  - `npx vitest run` → 1412/1412 tests pass across 55 files. No regressions.
  - `npx eslint` on all 13 modified TS/TSX files → 2 errors, BOTH pre-existing on main (`@typescript-eslint/no-empty-object-type` on the `interface APIEvent extends AdminAPIEvent {}` pattern in 2fa/verify.ts and 2fa/disable.ts — confirmed via `git stash` baseline). No new lint errors introduced.

Stage Summary:
- Files modified (14):
  - Frontend: src/features/sync/components/TraktIntegrationCard.tsx, src/shared/utils/tmdbCache.ts, src/lib/supabase/repositories/animeMapping.ts
  - Server routes: src/routes/api/auth/trakt.ts, src/routes/api/admin/auth.ts, src/routes/api/admin/2fa/verify.ts, src/routes/api/admin/2fa/disable.ts, src/routes/api/tmdb-cache.ts, src/routes/api/anime-mappings.ts, src/routes/api/share-card.ts
  - Server libs: src/lib/server/totp.ts (added verifyTOTPWithReplay), src/lib/server/rateLimiter.ts (added admin2faVerify, admin2faDisable, shareCard buckets), src/lib/supabase/admin/sessionCookie.ts (added isRequestHttps, buildAdminCookieHeader, buildAdminCookieClearHeader)
  - Migrations: supabase/migrations/20260803_add_weekly_recap_preferences.sql (removed hardcoded secret), supabase/migrations/20260814_add_admin_2fa_replay_protection.sql (NEW — adds last_used_counter)
- Architectural decisions:
  • Trakt OAuth init uses query param (not header) because it's a navigation, not a fetch. Token is consumed server-side and never forwarded to Trakt.
  • TOTP replay protection is ADDITIVE: the existing `verifyTOTP` function is unchanged so all 20 totp tests still pass. The new `verifyTOTPWithReplay` returns the matched counter, which the routes persist as `last_used_counter`. The "<=" comparison means the SAME code can never be accepted twice, even within the ±1 step drift window.
  • 2FA rate limits are per-admin (NOT per-IP) so a NAT'd office of admins each get their own bucket, and a single compromised account can't lock out everyone.
  • Cookie `Secure` attribute is HTTPS-conditional via a single shared `isRequestHttps(request)` helper — eliminates the localhost login bug without weakening production security.
  • Cron secret now strictly read from `current_setting(...)` — operators MUST set the GUC out-of-band. The migration is safe to run in any environment (skips scheduling with a NOTICE if GUCs are unset).
- All 3 critical rules honored: (1) no new dependencies — used existing `bump_rate_limit` RPC, existing `crypto` module, existing `getAuthHeaders` helper; (2) no existing tests broken — 1412/1412 still pass; (3) SQL migrations are idempotent (`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, no destructive ops).
