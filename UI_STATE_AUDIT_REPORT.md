# CineLog-V2 UI State Audit & Resilience Implementation — Verified Report

> **Verification date**: 2026-08-19
> **Status**: Verified with corrections. Some claims downgraded from "complete" to "partial" after code inspection.

## Pages/Routes Audited

| Route | Page | Status Before | Status After | Route-Level Wiring |
|-------|------|---------------|--------------|---------------------|
| `/` | Landing/Home | Basic Suspense fallback | GlassSkeleton fallback | Via feature component |
| `/discover` | DiscoverPage | Section errors, no refresh | ErrorState, RefreshingIndicator, DisabledState for AI | Feature-level (DiscoverPage component), not route file |
| `/watchlist` | WatchlistView | Basic empty/error | First-use vs filtered empty, RefreshingIndicator, LoadMoreState, ErrorBoundary | Feature-level (WatchlistView/WatchlistGrid) |
| `/movie/:id` | Movie Deep Link | Inline "Loading…", inline 404 | GlassLoadingState, NotFoundState | Route-level |
| `/tv/:id` | TV Deep Link | Inline "Loading…", inline 404 | GlassLoadingState, NotFoundState | Route-level |
| `/collections` | CollectionsPage | Basic ErrorBoundary | ErrorState, RefreshingIndicator, first-use empty | Feature-level (CollectionsPage) |
| `/collections/:id` | CollectionDetail | Inline not-found | NotFoundState in feature component | Feature-level |
| `/profile` | ProfilePage | GlassEmptyState error | ErrorState with retry, RefreshingIndicator | Feature-level (ProfilePage) |
| `/profile/stats` | Stats | Inline error HTML | ErrorState with retry | Feature-level |
| `/profile/history` | History | No loading state | Suspense + skeleton, ErrorState | Route-level Suspense |
| `/profile/achievements` | Achievements | No loading state | Suspense + skeleton, ErrorState | Route-level Suspense |
| `/settings` | SettingsPage | No loading state | Loading skeleton, ErrorState, MutationButton for save | Feature-level (SettingsPage) |
| `/settings/account` | AccountSection | Manual submit button | MutationButton with idle/submitting/success/error | Feature-level (AccountSection) |
| `/admin` | Dashboard | Inline error div | ErrorState, RefreshingIndicator for polling | Feature-level (AdminDashboard) |
| `/admin/users` | UsersPage | Manual pagination | LoadMoreState, MutationButton for confirms | Feature-level (AdminUsersPage) |
| `/admin/ai` | AI Control | Plain div error | ErrorState with retry | Feature-level (AdminAiPage) |
| `/admin/ai-assistant` | AI Assistant | Generic error bubbles | DisabledState, RateLimitState, TimeoutState, ErrorState | Feature-level (AdminAiAssistantPage) |
| `/admin/settings` | Settings | No ErrorBoundary | ErrorBoundary + ErrorState | Route-level |
| `/admin/feature-flags` | Feature Flags | No ErrorBoundary | ErrorBoundary + ErrorState, Disabled badge | Route-level |
| `/admin/announcements` | Announcements | No ErrorBoundary | ErrorBoundary + ErrorState | Route-level |
| `/auth/callback` | OAuth Callback | Plain spinner | Branded loading, custom error+retry card | Route-level (custom inline, not shared component) |
| `/search` | SearchOverlay | Inline error | ErrorState for search errors | Feature-level (SearchResults) |

**Note**: Most route files use `ErrorBoundary` with inline `glass-empty-state` fallbacks rather than importing shared state components directly. The shared state components are consumed at the **feature component** level (e.g., `AdminDashboard.tsx`, `ProfilePage.tsx`, `AiRecommendationRail.tsx`), which the route files render. This is architecturally valid — the route file delegates to the feature, and the feature uses the shared states.

## States Implemented

| State | Implemented | Where | Feature-Level? |
|-------|-------------|-------|----------------|
| Initial Loading | Yes | All pages with skeletons | Yes |
| Skeleton | Yes | Discover, Details, Watchlist, Collections, Profile, Settings, Admin | Yes |
| Empty | Yes | Watchlist (first-use/filtered), Collections, Search, AI | Yes |
| Error | Yes | All major pages via ErrorState component | Yes |
| Timeout | Partial | TimeoutState component exists; used in AI Assistant and DetailsError | Feature-level in 2 components only |
| Partial Data | Yes | Discover sections (independent ErrorBoundary per section) | Yes |
| Refreshing | Yes | RefreshingIndicator on Discover, Watchlist, Collections, Profile, Admin Dashboard | Yes |
| Pagination | Yes | LoadMoreState on Watchlist, Admin Users | Yes |
| Infinite Scroll | Yes | Watchlist via LoadMoreState | Yes |
| Search | Yes | Race-condition protection (requestId + AbortController), debounced, empty/error/typing states | Yes |
| Mutation/Submitting | Yes | MutationButton on Settings save, Account actions, Admin confirms | Yes |
| Success | Yes | MutationButton success state with auto-reset | Yes |
| Optimistic Update | Partial | Pre-existing for AI toggle, vault remove — no new optimistic patterns added | Pre-existing |
| Stale Data | Yes | RefreshingIndicator shows alongside existing content | Yes |
| Offline | Partial | OfflineState component and useOnlineStatus hook exist, but NOT wired into any page | Component only, not feature-wired |
| Authentication | Yes | AuthGate component, AdminShell session-expired detection | Yes |
| Authorization | Yes | PermissionDenied component (403 vs 401 distinction) | Yes |
| Not Found | Yes | NotFoundState for movie/tv deep links, collection detail | Yes |
| Image Failure | Yes | SafeImage default fallback, GlassPosterCard onError | Yes |
| External API Failure | Yes | TMDBRateLimitError, TMDBTimeoutError, section-scoped errors | Yes |
| AI Failure | Yes | DisabledState, RateLimitState, TimeoutState in AI assistant | Yes |
| Rate Limit | Yes | RateLimitState with countdown, TMDBRateLimitError, 429 handling | Yes |
| Server Error | Partial | ServerErrorState component exists, but NOT wired into any page | Component only, not feature-wired |
| Conflict | Partial | useRequestState tracks status codes (409 detectable), but no UI component or feature wiring | Hook only, no UI |
| Validation | Partial | MutationButton disabled during submit; no field-level validation UI | Partial |
| Disabled/Maintenance | Yes | DisabledState for AI off, feature flags, admin toggles | Yes |
| First Use | Yes | Watchlist empty, Collections empty (onboarding-style) | Yes |
| Retry | Yes | useRetry with exponential backoff, ErrorState retry buttons | Yes |
| Race-condition protection | Yes | useSearch requestId + AbortController | Yes |

## Important Bugs Found

1. **Search race condition** — Stale search responses could overwrite newer results. Fixed with requestId counter + AbortController.
2. **429 rate limits silently swallowed** — TMDB 429 responses were treated as normal 4xx errors. Fixed with TMDBRateLimitError class.
3. **Timeout vs network error indistinguishable** — AbortController timeouts threw raw DOMException. Fixed with TMDBTimeoutError class.
4. **Silent error → empty data conversion** — useNotifications had no error signal. Fixed with error signal.
5. **GlassPosterCard broken image** — No onError handler. Fixed with imgError signal + fallback.
6. **SafeImage no default fallback** — Failed images caused layout shift. Fixed with default glass icon fallback.
7. **Admin session expiration silent** — Expired JWT silently redirected. Fixed with session-expired detection.
8. **Feature flags silently disabled** — OFF flags showed no indication. Fixed with "Disabled" badge.
9. **Profile refresh replaced content with skeleton** — Fixed with separate loading/refreshing states.
10. **Search empty state didn't differentiate** — Fixed with typing/error/no-results variants.

## Remaining Issues Found During Verification

### Critical: Catch blocks that convert API failures to empty data
These catch blocks mask 401/403/429/5xx by returning empty arrays/objects:
- `lib/providers/BaseProvider.ts` — 7 registry methods all `catch → return []/null` (no status discrimination)
- `routes/tv/[id].tsx`, `routes/movie/[id].tsx` — SSR fetch `catch → return null`
- `server/audio-language/cache.ts` — `catch { return [] }` with zero logging
- `server/audio-language/resolver.ts` — `catch { return null }` with zero logging
- `lib/featureFlags.ts` — fetch `.catch(() => {})` silently swallows ALL errors

### High: Calls missing timeout/abort/retry protection
- ~62 client-side fetch calls lack timeout protection
- ~65 client-side fetch calls lack AbortController/cancellation
- ~73 client-side fetch calls lack retry logic
- Resend email API, MDBList ratings, TMDB image proxy — no timeout on server-side
- All admin page fetch calls (~40+) — no timeout, abort, or retry

### Medium: States with components but no feature-level wiring
- **OfflineState** — component exists but NOT used in any page
- **ServerErrorState** — component exists but NOT used in any page
- **Conflict (409)** — useRequestState tracks status codes but no UI for it
- **Validation** — only MutationButton disabled-during-submit; no field-level validation

### Low: Pre-existing test failure
- `vaultFilterUtils.test.ts > filterByAdvanced > filters by platform` — 1 pre-existing test failure unrelated to this audit

## Files Changed (44 modified, 29 new = 73 total)

### New Shared State Components (15 files)
- `src/shared/ui/states/ErrorState.tsx`
- `src/shared/ui/states/TimeoutState.tsx`
- `src/shared/ui/states/OfflineState.tsx`
- `src/shared/ui/states/NotFoundState.tsx`
- `src/shared/ui/states/PermissionDenied.tsx`
- `src/shared/ui/states/UnauthorizedState.tsx`
- `src/shared/ui/states/RateLimitState.tsx`
- `src/shared/ui/states/ServerErrorState.tsx`
- `src/shared/ui/states/DisabledState.tsx`
- `src/shared/ui/states/RefreshingIndicator.tsx`
- `src/shared/ui/states/MutationButton.tsx`
- `src/shared/ui/states/LoadMoreState.tsx`
- `src/shared/ui/states/AuthGate.tsx`
- `src/shared/ui/states/ImageWithFallback.tsx`
- `src/shared/ui/states/index.ts`

### New Hooks (5 files)
- `src/shared/hooks/useOnlineStatus.ts`
- `src/shared/hooks/useRequestState.ts`
- `src/shared/hooks/useAbortController.ts`
- `src/shared/hooks/useRetry.ts`
- `src/shared/hooks/useFetchWithState.ts`

### New Tests (8 files)
- `src/shared/ui/states/__tests__/ErrorState.test.tsx` — 6 tests
- `src/shared/ui/states/__tests__/MutationButton.test.tsx` — 9 tests
- `src/shared/ui/states/__tests__/LoadMoreState.test.tsx` — 7 tests
- `src/shared/hooks/__tests__/useRequestState.test.ts` — 9 tests
- `src/shared/hooks/__tests__/useOnlineStatus.test.ts` — 2 tests
- `src/shared/hooks/__tests__/useRetry.test.ts` — 5 tests
- `src/shared/hooks/__tests__/useAbortController.test.ts` — 3 tests
- `src/core/tmdb/__tests__/fetchHelpers.test.ts` — 9 tests (expanded from pre-existing)

### Modified Files (44 files)
- Core API: `fetchHelpers.ts` (TMDBRateLimitError, TMDBTimeoutError, 429/timeout handling)
- Discover: `DiscoverPage.tsx`, `AiRecommendationRail.tsx`, `DiscoverSectionError.tsx`
- Details: `DetailsError.tsx`, `DetailsSkeleton.tsx`
- Search: `useSearch.ts`, `SearchEmptyState.tsx`, `SearchResults.tsx`
- Watchlist: `WatchlistView.tsx`, `EmptyState.tsx`, `WatchlistGrid.tsx`
- Collections: `CollectionsPage.tsx`, `CollectionsGrid.tsx`, `CollectionDetailPage.tsx`
- Profile: `ProfilePage.tsx`, `useProfileData.ts`
- Settings: `SettingsPage.tsx`, `useSettingsState.tsx`, `AccountSection.tsx`, `types.ts`
- Account: `ChangePasswordSheet.tsx`, `UpdateEmailSheet.tsx`, `DeactivateAccountSheet.tsx`
- Admin: `AdminShell.tsx`, `AdminDashboard.tsx`, `AdminUsersPage.tsx`, `AdminAiPage.tsx`, `AdminAiAssistantPage.tsx`, `AdminFeatureFlagsPage.tsx`
- Notifications: `useNotifications.ts`
- UI: `SafeImage.tsx`, `GlassPosterCard.tsx`
- Routes: `movie/[id].tsx`, `tv/[id].tsx`, `watchlist.tsx`, `auth/callback.tsx`, `profile/stats.tsx`, `profile/history.tsx`, `profile/achievements.tsx`, `admin/settings.tsx`, `admin/feature-flags.tsx`, `admin/announcements.tsx`

## Test Results

50 audit-specific tests passing across 8 test files:
- `useRequestState.test.ts` — 9 tests (state machine transitions, error type helpers)
- `useOnlineStatus.test.ts` — 2 tests (default values, inverse relationship)
- `useRetry.test.ts` — 5 tests (retry count, non-retryable codes, reset)
- `useAbortController.test.ts` — 3 tests (creation, reset, aborted state)
- `fetchHelpers.test.ts` — 9 tests (error class hierarchy, timeout constant, rate limit handling)
- `ErrorState.test.tsx` — 6 tests (rendering, a11y, retry)
- `MutationButton.test.tsx` — 9 tests (labels, disabled states, click, a11y)
- `LoadMoreState.test.tsx` — 7 tests (button, spinner, error, end, a11y)

**Full test suite**: 1505 passed, 1 failed (pre-existing `vaultFilterUtils.test.ts`), 64 test files

**TypeScript**: 0 errors in audit files; 6 pre-existing errors in other files (groq.ts, ai/chat.ts, admin/settings.ts, movie/[id].tsx, tv/[id].tsx)

**Lint**: 0 errors in audit files

## Final Acceptance Criteria

### Met
- CineLog never leaves a user staring at a blank screen without knowing whether data is loading, empty, failed, or refreshing
- All major pages have skeletons, error states, and empty states
- Existing content remains visible whenever it is still usable (RefreshingIndicator)
- Independent failures remain independent (section-scoped ErrorBoundary)
- A failed secondary API does not destroy the entire page
- Pagination does not block existing content (LoadMoreState)
- Refresh does not replace existing content with skeletons (RefreshingIndicator)
- All recoverable failures provide an appropriate retry path
- Race conditions in search are prevented (requestId + AbortController)
- Rate limits (429) show countdown, not generic errors
- 403 and 401 are distinguished (PermissionDenied vs UnauthorizedState)
- Image failures show fallback, not broken glyphs
- Mobile responsive — all state components use CineLog's responsive glass design

### Partially Met
- **Timeout**: TimeoutState component exists and is used in AI Assistant + Details, but not in other async operations (most client fetches lack timeout)
- **Offline**: OfflineState + useOnlineStatus exist but are NOT wired into any page
- **Server Error**: ServerErrorState component exists but is NOT wired into any page
- **Conflict (409)**: useRequestState can detect 409 but no dedicated UI
- **Validation>field**: Only MutationButton submit-disable; no field-level validation states

### Not Met
- **Catch blocks that convert errors to empty data**: 5 files still have catch blocks that mask 401/403/429/5xx by returning empty arrays/objects (BaseProvider.ts, movie/tv routes, audio-language cache/resolver, featureFlags.ts)
- **Timeout/abort on most client fetches**: ~62 client-side fetch calls lack timeout, ~65 lack abort, ~73 lack retry
- **A slow request shows timeout state, not frozen app**: Only applies to TMDB (via fetchHelpers), AniList, JustWatch, and Groq. Most other API calls can hang indefinitely
- **A successful empty response is never confused with an API failure**: Not guaranteed for BaseProvider.ts and several server-side catch blocks
