# CineLog V2 — Deep Re-Audit Report

**Date:** 2026-08-18
**Repo:** https://github.com/Aman24-0/CineLog-V2.git
**Branch:** main (HEAD: a081bb8)
**Commits audited:** bff24fb (OMDB removal + bug fixes) + a081bb8 (CSP fix)

---

## Changes Verified ✅

| Change | Files | Verified |
|--------|-------|----------|
| OMDB type removal | `src/shared/types/index.ts` | ✅ `OMDbRatings` interface deleted |
| OMDB TTL removal | `src/shared/utils/apiCache.ts` | ✅ `OMDb_TTL` constant removed |
| OMDB props removal | 6 component files | ✅ `omdb` accessor removed from all interfaces |
| OMDB env type | `src/vite-env.d.ts` | ✅ `VITE_OMDB_API_KEY` removed |
| OMDB CSP | `vercel.json` | ✅ `omdbapi.com` removed from connect-src |
| OMDB comments | 8 files | ✅ All references cleaned |
| SafeImage fix | `src/shared/ui/SafeImage.tsx` | ✅ `createEffect` resets error on src change |
| Canvas memory | `src/shared/utils/colorExtractor.ts` | ✅ Canvas released after extraction |
| PWA icon color | `scripts/generate_pwa_icons.py` | ✅ Gold `#e8b74a` replaces purple |

---

## Remaining Issues (from original audit)

### HIGH Priority

| # | Issue | Status |
|---|-------|--------|
| 1 | **PWA has no offline support** — `sw.js` handles push only, no `fetch` handler | Still open |
| 2 | **Rate limiting is DB-backed now** — `rateLimiter.ts` uses `rate_limit_buckets` table via RPC | ✅ Fixed (was in-memory) |
| 3 | **CSP allows `unsafe-inline` + `unsafe-eval`** in `script-src` — weakens XSS protection | Still open |

### MEDIUM Priority

| # | Issue | Status |
|---|-------|--------|
| 4 | **`database.types.ts` updated** — all 10 missing tables now present | ✅ Fixed |
| 5 | **`[...404].tsx` catch-all exists** | ✅ Fixed |
| 6 | **`accentHelpers.ts` duplicate deleted** | ✅ Fixed |
| 7 | **Dead `UpcomingPage.tsx` (1355 lines) removed** — only live version (734 lines) remains | ✅ Fixed |
| 8 | **AdminCollectionEditorPage** wrapped with `<AdminShell>` | ✅ Fixed |
| 9 | **`signOut()` uses `scope: "local"`** | ✅ Fixed |
| 10 | **Sessions stored in localStorage** — XSS could exfiltrate tokens | Still open (by design — mobile OAuth reliability) |
| 11 | **Duplicate `PageContainer.tsx`** — `shared/ui/` (64 lines, used by ~20 routes) vs `shared/ui/layout/` (used by ProfilePage) | Still open |
| 12 | **1203 inline `style={{}}` literals** in feature components | Still open (tech debt) |

### LOW Priority

| # | Issue | Status |
|---|-------|--------|
| 13 | **Dead primitives** — `Button.tsx` and `Skeleton.tsx` ARE used (4 consumers) — NOT dead | ✅ Corrected |
| 14 | **PWA identity mismatch** — icons now use gold accent, manifest theme_color is `#0a0a0a` | ✅ Fixed |
| 15 | **`weekly_recap` migration placeholders** — `<APP_URL>`, `<CRON_SECRET>` | Still open |

---

## New Issues Found

### 1. CSP Still References Removed Domains
**Severity:** LOW
The CSP was cleaned of `omdbapi.com` but still allows:
- `https://www.youtube.com` and `https://www.youtube-nocookie.com` in `frame-src` — these are fine (trailer embeds)
- `https://api.groq.com` in `connect-src` — verify this is still used (AI recommendations?)
- `https://fcm.googleapis.com` in `connect-src` — Firebase Cloud Messaging, verify still used

### 2. `fetchWithRetry` in `fetchHelpers.ts` vs `media/[...path].ts`
**Severity:** LOW
Two separate `fetchWithRetry` implementations exist:
- `src/core/tmdb/fetchHelpers.ts` — client-side, used by `tmdbFetch`
- `src/routes/api/media/[...path].ts` — server-side proxy, has its own retry logic

Both are correct for their context but share no code. This is fine — just noting the duplication.

### 3. Test File Count Increased
**Severity:** INFO
Original audit: 27 test files. Current: 56 test files. Significant improvement in test coverage.

---

## Security Assessment

### ✅ Strong
- Admin routes: cookie JWT (HS256, constant-time) + DB lookup + PIN + 2FA + audit log
- RLS on every table with owner-only/admin-only policies
- Service-role key never reaches browser
- Rate limiting is now DB-backed (survives cold starts)
- CSP headers present (HSTS, X-Frame-Options, nosniff, etc.)
- Admin JWT minimum 32 chars enforced

### ⚠️ Moderate
- CSP allows `unsafe-inline` + `unsafe-eval` in `script-src`
- Sessions in localStorage (XSS risk, mitigated by CSP)
- No nonce-based CSP for inline scripts

### ✅ Improvements Since Original Audit
- OMDB API key no longer exposed
- Rate limiters now DB-backed
- 404 catch-all route exists
- database.types.ts updated
- Dead code cleaned up

---

## Architecture Health

| Metric | Value |
|--------|-------|
| Source files | 725 |
| Test files | 56 |
| E2E test files | 4 |
| API routes | 68 |
| UI routes | 62 |
| SQL migrations | 52 |
| Inline styles | 1,203 (tech debt) |
| TODO/FIXME/HACK | 0 |

---

## Summary

**Overall quality: Strong for a solo project.** The codebase has matured significantly since the original audit. The major security issues (OMDB key exposure, in-memory rate limiting) have been resolved. The remaining issues are either architectural trade-offs (localStorage sessions for mobile reliability) or tech debt (inline styles, duplicate PageContainer) that don't affect functionality.

**Recommendation:** Focus next on:
1. Adding offline PWA support (high user impact)
2. Tightening CSP (remove `unsafe-eval`, add nonces)
3. Consolidating duplicate PageContainer
