# CineLog V2 — Bugs & Improvements Analysis

**Date:** 2026-08-18
**Repo:** https://github.com/Aman24-0/CineLog-V2.git
**Branch:** main (HEAD: 3b21d5c)

---

## 🐛 BUGS

### 1. OMDB API Key Exposed in Client Bundle
**Severity:** HIGH | **File:** `src/core/omdb/omdb.ts`

The OMDB API key is loaded via `import.meta.env.VITE_OMDB_API_KEY`, which means it's bundled into the client-side JavaScript. Unlike TMDB (which goes through `/api/media/*` server proxy) and MDBList (routed through server), OMDB is called directly from the browser. Anyone can inspect the network requests or JS bundle and extract the key.

**Fix:** Route OMDB calls through a server proxy (same pattern as `/api/media/*`), or remove the OMDB module entirely since MDBList has superseded it.

---

### 2. `signOut()` Default Scope is Global
**Severity:** MEDIUM | **File:** `src/shared/hooks/useAuthActions.ts`

The default `signOut()` call uses `scope: "global"`, which signs the user out of ALL devices. The codebase has a separate `signOutGlobal()` for "sign out everywhere" intent, suggesting the default should be `scope: "local"`. A user clicking "Sign Out" on their phone would unexpectedly lose their laptop session too.

**Fix:** Change the default signOut to use `scope: "local"`.

---

### 3. Rate Limiting is In-Memory (Effectively No-Op on Vercel)
**Severity:** MEDIUM | **Files:** Multiple API routes

All 5 rate limiters (admin auth, account delete, push send, push status, email send) use module-level `Map`s that reset on every Vercel cold-start. Since Vercel serverless functions are ephemeral, each invocation may run in a fresh instance, making rate limiting ineffective.

**Fix:** Use Supabase or Redis-backed rate limiting. A simple approach: store rate-limit counters in a Supabase table with TTL, or use Vercel's Edge Config.

---

### 4. `SafeImage` Doesn't Reset Error State on `src` Change
**Severity:** MEDIUM | **File:** `src/shared/ui/SafeImage.tsx`

If `SafeImage` receives a new `src` prop after an error, it stays in the errored state forever. The `errored` signal is set to `true` on error but never reset when `props.src` changes. This means if an image URL is updated (e.g., user changes their profile photo), the old broken-image fallback persists.

**Fix:** Add a `createEffect` that resets `errored` when `props.src` changes:
```tsx
createEffect(() => {
  props.src; // track dependency
  setErrored(false);
});
```

---

### 5. `extractDominantColor` / `extractPalette` — Canvas Memory Leak
**Severity:** LOW | **File:** `src/shared/utils/colorExtractor.ts`

The canvas element created via `document.createElement("canvas")` is never explicitly cleaned up. While the GC will eventually collect it, in a long session with many color extractions (e.g., browsing many movie details), the canvas elements accumulate. More importantly, the `Image` elements created in `loadImageWithCORS` have their `src` set to `""` on timeout but aren't otherwise cleaned up.

**Fix:** Set `canvas.width = 0; canvas.height = 0` after extraction to release the pixel buffer, and null out the `img.src` after use.

---

### 6. `AdminCollectionEditorPage` Missing Admin Auth Guard
**Severity:** MEDIUM | **File:** `src/routes/admin/collections/[id]/index.tsx`

This route does NOT wrap with `<AdminShell>` and does NOT call `useAdminAuth()` / `requireAdmin()`. Non-admin visitors can render the editor chrome. API calls are still protected server-side, so no data leak — but it's inconsistent with every other `/admin/*` route and could expose internal UI to unauthorized users.

**Fix:** Wrap with `AdminShell` and add `useAdminAuth()` check.

---

### 7. `database.types.ts` is Severely Outdated
**Severity:** MEDIUM | **File:** `src/lib/supabase/database.types.ts`

Missing 9+ tables added after initial generation: `admin_actions`, `app_config`, `announcements`, `featured_content`, `maintenance_runs`, `notifications`, `user_reminders`, `push_subscriptions`, `login_history`, `universe_phases`. Still includes dropped columns (`follows` table, `profiles.social_links`/`is_public`). TypeScript can't catch schema mismatches at compile time.

**Fix:** Regenerate types with `supabase gen types typescript`.

---

### 8. PWA Theme Color Mismatch
**Severity:** LOW | **Files:** `public/manifest.json`, `src/entry-server.tsx`

Manifest `theme_color: #7c3aed` (purple), entry-server `<meta name="theme-color" content="#7c3aed">`, and PWA icons use purple accent — but the app's default theme `cinematic` uses `--p: #e8b74a` (cinema gold). Status bar / splash / home-screen icon will be purple while app content is gold.

**Fix:** Sync the manifest theme_color with the default theme's primary color.

---

### 9. `imageCompress.ts` — Object URL Revocation Race
**Severity:** LOW | **File:** `src/shared/utils/imageCompress.ts`

In `loadImage()`, `URL.revokeObjectURL(url)` is called in `onload` before the image data is fully decoded. The revocation is fine for the `<img>` element (it already has the pixels), but if the canvas `drawImage()` hasn't been called yet (which happens in `compressBannerImage`), the source URL is already revoked. This works in practice because `drawImage` reads synchronously from the already-decoded image, but it's fragile.

**Fix:** Move revocation to after `drawImage()` completes, or use `createImageBitmap()` which is more explicit about when decoding happens.

---

### 10. `weekly_recap` pg_cron Migration Has Unresolved Placeholders
**Severity:** LOW | **File:** `supabase/migrations/*weekly_recap*`

The migration has `<APP_URL>` and `<CRON_SECRET>` placeholders that operators must manually replace. If applied as-is, the cron job will POST to `https://<APP_URL>/api/cron/weekly-recap` (literal string) and fail silently.

**Fix:** Add a `DO $$ ... $$` block that validates the placeholders are replaced, or use `current_setting('app.settings.app_url')` from PostgreSQL settings.

---

## 🔧 IMPROVEMENTS

### 1. Add Offline Support to PWA
**Priority:** HIGH

The service worker (`public/sw.js`) only handles `push` and `notificationclick`. There is NO `fetch` handler, no Cache API usage, no offline support. The app is completely non-functional offline.

**Recommendation:** Implement a stale-while-revalidate caching strategy for:
- Static assets (JS, CSS, fonts, icons)
- TMDB images (cache-first with long TTL)
- API responses (network-first with fallback to cached data)

---

### 2. Implement Proper Rate Limiting
**Priority:** HIGH

See Bug #3. Replace in-memory rate limiters with Supabase-backed or Redis-backed counters.

---

### 3. Add Comprehensive Error Boundaries
**Priority:** MEDIUM

The app has a `GlobalErrorBoundary` but individual feature routes lack granular error boundaries. A crash in one feature (e.g., Discover) takes down the entire app.

**Recommendation:** Add route-level `<ErrorBoundary>` wrappers with fallback UI and retry buttons.

---

### 4. Deduplicate PageContainer Components
**Priority:** LOW

Two `PageContainer.tsx` files exist:
- `src/shared/ui/PageContainer.tsx` (legacy, used by ~22 routes)
- `src/shared/ui/layout/PageContainer.tsx` (newer, only used by ProfilePage)

**Recommendation:** Consolidate into one and update all imports.

---

### 5. Remove Dead Components
**Priority:** LOW

Dead Glass UI components with zero real consumers:
- `GlassChip`, `GlassDivider`, `GlassListItem`, `GlassSearchBar`, `GlassSectionHeader`
- `SectionContainer`, `primitives/Button`, `primitives/Skeleton`
- `src/features/profile/UpcomingPage.tsx` (1355 lines, dead — live version is in `features/upcoming/`)

**Recommendation:** Delete dead code to reduce bundle size and confusion.

---

### 6. Add Real-Time Sync via Supabase Realtime
**Priority:** MEDIUM

The app has `useRealtimeSync` but it's only used for vault refresh triggers, not for real-time collaboration or multi-device sync. A user editing on phone doesn't see changes on laptop until refresh.

**Recommendation:** Subscribe to Supabase Realtime changes on the `vault` table for live updates across devices.

---

### 7. Implement Smart Collection Rule Persistence
**Priority:** MEDIUM

Smart collections exist in the DB (`collection_type='smart'`) but rules cannot be persisted — there's no `rules` JSONB column. Rules are lost on refresh.

**Recommendation:** Add a `rules JSONB` column to the `collections` table and persist/evaluate rules server-side.

---

### 8. Add Comprehensive Test Coverage
**Priority:** MEDIUM

Current test coverage: ~618 tests across 27 files, but many critical features are untested:
- Details modal
- Settings pages
- Sync/backup
- Account management
- Trash/restore
- Admin panel
- Notifications
- Anime features

**Recommendation:** Prioritize integration tests for critical user flows (add to vault → filter → detail → share).

---

### 9. Improve Bundle Size
**Priority:** MEDIUM

The app ships Puppeteer-core + @sparticuz/chromium as dependencies for share card image generation. These are heavy and should be server-only.

**Recommendation:** Ensure Puppeteer is tree-shaken out of the client bundle (it likely is via `isServer` guards, but verify with a bundle analyzer).

---

### 10. Add CSP Nonce for Inline Scripts
**Priority:** MEDIUM

The CSP allows `'unsafe-inline'` in `script-src`, which weakens XSS protection. If any inline scripts exist, they should use nonces.

**Recommendation:** Generate a per-request nonce and use it in both the CSP header and inline script tags.

---

### 11. Implement Proper Session Management
**Priority:** MEDIUM

User sessions are stored in localStorage (Supabase SDK default). An XSS attack could exfiltrate access + refresh tokens.

**Recommendation:** Consider using httpOnly cookies for session storage (Supabase SSR package supports this), or at minimum ensure CSP is strict enough to prevent XSS.

---

### 12. Add Monitoring & Alerting
**Priority:** LOW

The app has Sentry integration but no visible alerting for:
- API error rate spikes
- Authentication failures
- Database connection issues

**Recommendation:** Set up Sentry alerts for error rate thresholds.

---

## 📊 Summary

| Category | Count |
|----------|-------|
| 🐛 Bugs | 10 |
| 🔧 Improvements | 12 |
| **Total** | **22** |

### Priority Breakdown
- **HIGH:** 4 items (OMDB key exposure, offline PWA, rate limiting, error boundaries)
- **MEDIUM:** 10 items (various security, UX, and architecture issues)
- **LOW:** 8 items (cleanup, dead code, minor issues)

### Quick Wins (< 1 hour each)
1. Fix `SafeImage` error state reset (Bug #4)
2. Remove dead components (Improvement #5)
3. Deduplicate PageContainer (Improvement #4)
4. Fix PWA theme color mismatch (Bug #8)
5. Change default signOut scope to "local" (Bug #2)
