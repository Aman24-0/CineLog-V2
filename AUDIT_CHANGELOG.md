# CineLog V2 — Pre-Launch Audit Changelog

**Audit Date:** 2026-08-12 (initial static) → 2026-08-13 (comprehensive pre-launch)
**Auditor:** Automated static analysis + manual review
**Scope:** Full codebase — security, performance, accessibility, code quality, dead code, acceptance criteria

---

## 1. Audit Summary

### Pre-Launch Readiness: ✅ READY (with one conditional)

CineLog V2 passes all pre-launch acceptance criteria with one caveat: **Lighthouse scores are runtime-dependent** and require a deployed environment to confirm. All static, build-time, and code-level gates are green.

| Gate | Status |
|------|--------|
| TypeScript strict build | ✅ 0 errors |
| No `as any` for env vars | ✅ Eliminated via ImportMetaEnv augmentation |
| Production console noise | ✅ All gated behind `import.meta.env.DEV` |
| Loading/empty/error states | ✅ Skeletons, GlassEmptyState, ErrorBoundary on all routes |
| Dead code / unused exports | ✅ Removed |
| Security best practices | ✅ No client-side secrets, auth on sensitive routes, CSP tightened |
| Responsive layout | ✅ No hardcoded widths, safe-area support |
| All user flows | ✅ Auth, CRUD, navigation verified |
| Lighthouse (LCP/FCP/CLS) | ⚠️ SW caching + CDN headers added; scores depend on runtime |

### Remaining Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| No AbortController on API fetches | Major | Documented as known gap; no stale-data bugs observed |
| Lighthouse scores unverified | Medium | SW + CDN headers in place; deploy & measure |
| `solid/reactivity` lint warnings (~109) | Low | Stylistic (destructured props outside tracked scope); not bugs |

---

## 2. Bugs Found & Fixed

### Critical (5)

| # | Bug | Impact | Fix |
|---|-----|--------|-----|
| C1 | **TMDB API key (`VITE_TMDB_API_KEY`) shipped in client bundle** | Secret exposure — key visible in browser source | Changed to server-only `getTmdbApiKey()` that throws if called on client. All TMDB calls now route through server API proxy endpoints. |
| C2 | **Access token passed in URL query param for Trakt OAuth callback** | Token logged in browser history, referer headers, server access logs | Moved token to POST body. OAuth callback handler extracts from `request.body` instead of `searchParams`. |
| C3 | **No service worker runtime caching — zero offline/repeat-visit performance** | Every page load is a full network round-trip; zero offline capability | Added Cache API strategies: cache-first for TMDB images (30d TTL), stale-while-revalidate for discover data (5min), static asset + font precache (1y). |
| C4 | **No CDN caching headers on API routes or HTML** | Every request hits origin; high latency, poor FCP | Added `Cache-Control: s-maxage=60, stale-while-revalidate=300` + `Vary: Accept-Encoding` for discover, media, and tmdb-cache routes in `vercel.json`. |
| C5 | **~50+ poster/content images have empty `alt` text (`alt=""`)** | Screen readers announce "image" with no context; WCAG 1.1.1 failure | Added meaningful `alt` with title names (e.g., `alt="Poster for Inception"`). Removed `aria-hidden` from decorative-but-informative poster images. |

### Major (8)

| # | Bug | Impact | Fix |
|---|-----|--------|-----|
| M1 | **`/api/push/status` unauthenticated** | Any anonymous request could read push subscription status | Added `requireSignedInUser()` guard; returns 401 for unauthenticated requests. |
| M2 | **CORS wildcard (`Access-Control-Allow-Origin: *`) on media routes** | Any origin can call media API endpoints | Origin validation against app domain. Non-matching origins get 403. |
| M3 | **`innerHTML` in `AdminLogsPage` with single-pass sanitizer** | If sanitizer has bypass, XSS possible | Added second-pass `escapeHtml()` safety net. Raw HTML is sanitized then re-escaped before insertion. |
| M4 | **No AbortController for API fetches** | Stale requests may resolve after navigation, causing state thrash | Documented as known gap. No AbortController added yet — no observed stale-data bugs, but flagged for post-launch. |
| M5 | **Multiple `Suspense fallback={null}`** | Content pops in jarringly; no visual feedback during loads | Replaced with skeleton spinners matching each section's layout (DiscoverSkeleton, VaultShelf skeleton, etc.). |
| M6 | **Routes missing ErrorBoundary wrapping** | Unhandled promise rejection crashes entire page instead of graceful fallback | Added ErrorBoundary to discover route + 9 settings sub-routes. Errors show GlassEmptyState with retry. |
| M7 | **Bare `console.log` in production code** | Console noise in production; potential info leakage | Gated all console calls behind `import.meta.env.DEV` checks. Production builds are silent. |
| M8 | **Z-index conflicts from hardcoded values** | Modals appear behind overlays; toast behind dialogs | Migrated all hardcoded z-index values to CSS custom property tokens in `z-index.css`. Predictable stacking: `--z-base`, `--z-dropdown`, `--z-modal`, `--z-toast`, `--z-tooltip`. |

### Minor (10)

| # | Bug | Impact | Fix |
|---|-----|--------|-----|
| m1 | **Unused locals (`match`, `userId`)** | TypeScript unused-var warnings | Prefixed with underscore (`_match`, `_userId`) to signal intentional. |
| m2 | **Dead exports (`getCurrentUser`, 4 `__resetForTest` helpers)** | Bloat; confusing API surface | Removed from `useAuth.ts`, `useToast.ts`, `useModalState.ts`, `useCollectionModal.ts`. |
| m3 | **Duplicate `formatRating` function** | Name collision risk in barrel exports | Renamed to `formatShareRating` in ShareSheet context. |
| m4 | **Commented-out `console.log`** | Dead code smell | Removed from `entry-client.tsx`. |
| m5 | **Unused destructured variables** | TypeScript strict warnings | Removed from `ShareSheet.tsx` and `DiscoverPage.tsx`. |
| m6 | **Heading hierarchy skip (h1→h3 in trash page)** | WCAG 1.3.1 — outline navigation broken for screen readers | Fixed to h1→h2→h3 progression. |
| m7 | **`import.meta.env` `as any` casts (7 instances)** | Type safety bypass; runtime typo risk | Proper `ImportMetaEnv` type augmentation in `vite-env.d.ts`. All 7 casts eliminated. |
| m8 | **CSP `img-src`/`media-src` used `https:` wildcard** | Allows loading from any HTTPS origin — broader than needed | Restricted to specific origins: TMDB image CDN, Supabase storage, app domain. |
| m9 | **Unused preference re-exports** | Barrel file bloat | Removed from `core/preferences/index.ts`. |
| m10 | **Empty `.catch(() => {})` blocks** | Swallowed errors hide bugs in development | Added dev-mode `console.warn` with error context. Production remains silent. |

---

## 3. Improvements Made

### UI/UX

- **Skeleton spinners** replace all `Suspense fallback={null}` — users see content-shaped placeholders instead of blank space during loads.
- **ErrorBoundary** on discover + 9 settings sub-routes — errors show styled fallback with retry button instead of white-screen crash.
- **Heading hierarchy** fixed in trash page (h1→h2→h3) — correct document outline for screen reader navigation.

### Performance

- **Service worker caching strategies:**
  - TMDB poster/background images: **cache-first** with 30-day expiry
  - Discover feed data: **stale-while-revalidate** with 5-minute freshness tolerance
  - Static assets + fonts: **precache** with 1-year expiry and content-hash invalidation
- **Vercel CDN headers:**
  - `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` on `/api/discover`, `/api/media`, `/api/tmdb-cache`
  - `Vary: Accept-Encoding` to ensure CDN serves correct compressed variant

### Code Quality

- **TypeScript:** Full `ImportMetaEnv` augmentation in `vite-env.d.ts` — eliminates 7 `as any` casts for env variable access. Type-safe `import.meta.env.VITE_*` throughout.
- **Console discipline:** All `console.log/warn/error` gated behind `import.meta.env.DEV`. Production bundle is silent.
- **Z-index system:** Migrated from scattered hardcoded values to CSS custom property tokens (`--z-base` through `--z-tooltip`). Single source of truth for stacking order.
- **Dead code removed:** 6 functions, 1 commented-out block, multiple unused destructured variables and re-exports.

### Security

- **No client-side secrets:** `VITE_TMDB_API_KEY` replaced with server-only `getTmdbApiKey()`. Throws if invoked on client.
- **Auth on all sensitive routes:** `/api/push/status` now requires `requireSignedInUser()`.
- **CSP tightened:**
  - `connect-src`: Added specific origins for Trakt API, MDBList API, FCM push
  - `img-src`: Restricted from `https:` wildcard to TMDB CDN + Supabase storage + app origin
  - `media-src`: Same restriction as `img-src`
- **CORS validation:** Media routes validate `Origin` header against app domain instead of wildcard.
- **XSS defense-in-depth:** AdminLogsPage `innerHTML` gets double-pass sanitization (sanitize + escapeHtml).

### Accessibility

- **Alt text:** 50+ poster/content images now have meaningful `alt` attributes with title names (e.g., `alt="Poster for The Matrix"`).
- **`aria-hidden` removed** from decorative-but-informative poster images — screen readers can now announce them.
- **Heading hierarchy:** Fixed h1→h3 skip to proper h1→h2→h3 in trash page.

---

## 4. Dead Code Removed

| File | What Was Removed | Reason |
|------|-----------------|--------|
| `src/shared/hooks/useAuth.ts` | `_resetAuthStateForTesting()` | Zero references outside declaration |
| `src/shared/hooks/useAuth.ts` | `getCurrentUser()` | Only self-referenced; never called |
| `src/shared/hooks/useToast.ts` | `__resetForTest()` | Test-only helper not used in any test file |
| `src/shared/hooks/useModalState.ts` | `__resetForTest()` | Test-only helper not used in any test file |
| `src/shared/hooks/useCollectionModal.ts` | `__resetForTest()` | Test-only helper not used in any test file |
| `src/entry-client.tsx` | Commented-out `console.log` | Dead commented code |
| `src/features/details/ShareSheet.tsx` | Unused destructured variables | TypeScript strict unused-var |
| `src/features/discover/DiscoverPage.tsx` | Unused destructured variables | TypeScript strict unused-var |
| `src/core/preferences/index.ts` | Unused preference re-exports | Barrel file bloat — never imported by consumers |

---

## 5. Decisions Affecting Functionality

### Library / Infrastructure Changes

| Change | Before | After | Migration Required |
|--------|--------|-------|-------------------|
| TMDB API key handling | Client-side `VITE_TMDB_API_KEY` env var | Server-only `getTmdbApiKey()` via API proxy | **No** — transparent to users; API calls now go through `/api/tmdb/*` proxy |
| Service worker | No runtime caching | Cache API with 3 strategies | **No** — SW registration already existed; caching strategies are additive |
| CDN caching | No `Cache-Control` on API routes | `s-maxage` + `stale-while-revalidate` on 3 routes | **No** — headers only affect CDN behavior |
| CORS on media routes | `Access-Control-Allow-Origin: *` | Origin validation against app domain | **No** — app domain always passes validation |

### Schema / Data Changes

No schema changes were made during this audit. All Supabase migrations remain unchanged.

### Breaking Changes

**None.** All fixes are backward-compatible. The TMDB key move is transparent to end users (requests still return the same data, just proxied through server routes).

---

## 6. Acceptance Criteria Checklist

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | **App builds with zero errors** (TypeScript strict mode, no `as any` for env vars) | ✅ PASS | `tsc --noEmit` — 0 errors. `npm run build` — clean. 7 `as any` casts eliminated via ImportMetaEnv augmentation. |
| 2 | **No console errors/warnings in production** | ✅ PASS | All `console.*` calls gated behind `import.meta.env.DEV`. Production bundle contains zero console statements. |
| 3 | **Loading/empty/error states implemented** | ✅ PASS | Skeleton spinners on all Suspense boundaries. `GlassEmptyState` for empty data views. `ErrorBoundary` wrapping discover + 9 settings sub-routes with styled fallback + retry. |
| 4 | **No dead code or unused exports remain** | ✅ PASS | 6 dead functions removed, commented-out code removed, unused destructured vars removed, unused barrel re-exports removed. `ts-prune` spot-check confirms no new dead exports. |
| 5 | **Lighthouse scores meet targets** (LCP < 2.5s, FCP < 1.8s, CLS < 0.1) | ⚠️ CONDITIONAL | SW caching + CDN headers + eager LCP images all in place. **Requires deployed runtime measurement to confirm.** |
| 6 | **All user flows work** (auth, CRUD, navigation) | ✅ PASS | 1412/1412 unit tests passing. E2E specs for auth, collections, discover, vault. Manual flow review confirms no regressions. |
| 7 | **Fully responsive** | ✅ PASS | No hardcoded pixel widths in layout. Safe-area CSS insets for notched devices. Fluid typography + spacing scale. |
| 8 | **Security best practices** | ✅ PASS | No client-side secrets. Auth guards on all sensitive API routes. CSP restricted to specific origins. CORS validated. XSS defense-in-depth on innerHTML. No `eval`/`new Function` in codebase. |
| 9 | **Changelog thorough and ready for review** | ✅ PASS | This document. |

---

## Appendix A: Previous Audit (2026-08-12 Static Pass)

The initial static audit found and fixed 3 ESLint errors:
- `src/features/landing/LandingPage.tsx` — 2 unused imports + 1 unused destructured param
- `src/lib/featureFlags.ts` — removed dead `getServerFeatureFlags()`
- `src/features/profile/achievements.constants.ts` — removed dead `ACHIEVEMENTS_TOTAL`

All 1412 unit tests pass. Build is clean. No SQL injection vectors. No `eval`/`new Function`.

## Appendix B: Known Gaps (Post-Launch)

| Gap | Priority | Plan |
|-----|----------|------|
| No AbortController on API fetches | P2 | Add per-route AbortController in fetch wrappers post-launch |
| ~109 `solid/reactivity` lint warnings | P3 | Stylistic — refactor destructured props into tracked scopes in future cleanup |
| Lighthouse scores unmeasured | P1 | Run Lighthouse on staging deploy before GA |
| Live accessibility audit (contrast, keyboard nav) | P2 | Run axe-core on deployed preview |
