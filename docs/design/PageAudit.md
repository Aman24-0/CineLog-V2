# CineLog Page Audit

> **Version:** 1.0  
> **Date:** 2026-07-12  
> **Status:** Audit Document — Page-by-Page Scoring  
> **Rule:** Do NOT redesign any page. This is an audit only.

---

## Scoring Criteria

Each dimension is scored 1-10:

| Dimension | 10 | 5 | 1 |
|-----------|-----|---|---|
| **Visual Hierarchy** | Information ordered clearly, eyes naturally flow | Some structure but inconsistent | Random placement, no clear order |
| **Spacing** | Perfect rhythm, consistent throughout | Mostly consistent, some gaps | Irregular, cramped or loose |
| **Consistency** | Follows established patterns exactly | Mostly follows, some deviations | Different patterns on every screen |
| **Accessibility** | Full WCAG compliance, keyboard + screen reader | Partial compliance, some gaps | Major barriers for assistive tech |
| **Readability** | Excellent contrast, scannable, clear typography | Readable but could improve | Low contrast, dense, hard to scan |
| **Navigation** | Users always know where they are | Mostly oriented, some confusion | Easy to get lost |
| **Performance** | Fast rendering, lazy loading, optimized | Adequate but not optimized | Slow, no lazy loading, heavy |
| **Premium Feeling** | Feels polished, refined, confident | Functional but utilitarian | Feels unfinished or cheap |

---

## Scorecard Summary

| # | Page | Route | Overall | Viz | Space | Consist | A11y | Read | Nav | Perf | Premium |
|---|------|-------|---------|-----|-------|---------|------|------|-----|------|---------|
| 1 | Settings Index | `/settings` | **9.1** | 9 | 9 | 10 | 8 | 9 | 9 | 9 | 9 |
| 2 | Home Redirect | `/` | **9.6** | — | — | 10 | 8 | 10 | 10 | 10 | — |
| 3 | Appearance | `/settings/appearance` | **8.6** | 9 | 9 | 9 | 8 | 9 | 8 | 8 | 9 |
| 4 | Account | `/settings/account` | **8.3** | 8 | 9 | 9 | 7 | 8 | 8 | 8 | 7 |
| 5 | Privacy | `/settings/privacy` | **8.1** | 8 | 8 | 9 | 7 | 9 | 8 | 8 | 8 |
| 6 | Sync | `/settings/sync` | **8.0** | 9 | 8 | 9 | 7 | 9 | 8 | 6 | 8 |
| 7 | Discover | `/discover` | **7.9** | 9 | 8 | 6 | 7 | 8 | 7 | 9 | 9 |
| 8 | Profile | `/profile` | **7.9** | 9 | 8 | 6 | 7 | 9 | 8 | 7 | 9 |
| 9 | Notifications | `/settings/notifications` | **7.9** | 8 | 8 | 9 | 6 | 9 | 8 | 8 | 7 |
| 10 | Stats | `/profile/stats` | **7.8** | 9 | 8 | 9 | 5 | 9 | 8 | 6 | 8 |
| 11 | Achievements | `/profile/achievements` | **7.4** | 8 | 8 | 9 | 6 | 8 | 7 | 6 | 7 |
| 12 | Collections Index | `/collections` | **7.3** | 8 | 7 | 6 | 7 | 8 | 7 | 7 | 8 |
| 13 | Collection Detail | `/collections/[id]` | **7.3** | 8 | 7 | 7 | 5 | 8 | 8 | 7 | 8 |
| 14 | History | `/profile/history` | **7.3** | 8 | 7 | 9 | 6 | 9 | 7 | 5 | 7 |
| 15 | Search | `/search` | **7.3** | 8 | 7 | 7 | 6 | 8 | 8 | 7 | 7 |
| 16 | Watchlist | `/watchlist` | **7.1** | 8 | 8 | 8 | 5 | 8 | 7 | 6 | 7 |
| 17 | Developer | `/settings/developer` | **6.9** | 7 | 8 | 7 | 4 | 7 | 8 | 9 | 5 |
| 18 | Collection Edit | `/collections/[id]/edit` | **6.3** | 7 | 7 | 6 | 4 | 7 | 7 | 6 | 6 |

---

## Detailed Page Audits

---

### 1. Home Redirect — `/`

**Route:** `src/routes/index.tsx`  
**Structure:** Single `<Navigate href="/discover" />`

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Visual Hierarchy | — | Redirect only, no visual content |
| Spacing | — | N/A |
| Consistency | 10 | Clean, idiomatic SolidJS redirect |
| Accessibility | 8 | Navigate is immediate; screen readers get no flash |
| Readability | 10 | 16 lines, well-commented |
| Navigation | 10 | Redirect is instant, correct target |
| Performance | 10 | Zero overhead |
| Premium Feeling | — | N/A |

**Overall: 9.6/10**

**Why this score:** The redirect is architectural perfection — zero-cost, well-documented, purposeful. The only deductions are for missing `<Title>` during redirect and no loading state.

---

### 2. Discover — `/discover`

**Route:** `src/routes/discover.tsx` → `src/features/discover/DiscoverPage.tsx`  
**Structure:** 17 sections — Spotlight → Continue → Insight → Trending → Theatres → Personalized → Surprise → Weekend → Different → Hidden Gems → Top Rated Movies → Top Rated Series → New on OTT → Genre Explorer → New Seasons → Coming Soon → Guest CTA

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Visual Hierarchy | 9 | Clear section ordering: hero → personal → general → genre → future. Editorial cards break monotony |
| Spacing | 8 | Consistent `discover-fold` sections, but 17 sections is a lot of vertical space |
| Consistency | 6 | Uses `discover-eyebrow-block` instead of `sec-header` pattern used everywhere else |
| Accessibility | 7 | `aria-label` on sections, but no landmark roles, no skip-links, insight strip cards lack ARIA |
| Readability | 8 | Good copy, contextual subtitles. Some section labels are generic |
| Navigation | 7 | No section anchor nav for 17 sections, no table of contents |
| Performance | 9 | LazyMount on sections 8+, per-section ErrorBoundary, skeleton loading |
| Premium Feeling | 9 | Spotlight hero, Surprise Me, editorial cards, ambient glow |

**Overall: 7.9/10**

**Why this score:** Discover is the most feature-rich page with the best performance architecture (LazyMount, per-section ErrorBoundary). However, it diverges from the established `sec-*` pattern with its own `discover-*` class naming, and the sheer number of sections (17) creates navigation fatigue with no way to jump between sections.

---

### 3. Watchlist (Vault) — `/watchlist`

**Route:** `src/routes/watchlist.tsx` → `src/features/watchlist/WatchlistView.tsx`  
**Structure:** Sticky header (search + filters) → Stats bar → Grid/Timeline view → Filter drawer

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Visual Hierarchy | 8 | Clear header → stats → content flow. Status tabs above content |
| Spacing | 8 | Consistent PageContainer rhythm |
| Consistency | 8 | Follows PageContainer pattern |
| Accessibility | 5 | No aria-label on page container, infinite scroll has no ARIA live region, no role on grid items |
| Readability | 8 | Status tabs clear, search prominent, result count visible |
| Navigation | 7 | ScrollToTop, status tabs as navigation |
| Performance | 6 | Raw scroll listener for infinite scroll (not IntersectionObserver), no lazy loading for offscreen items |
| Premium Feeling | 7 | Grid/timeline toggle, skeleton loading, filter drawer, but no editorial touches |

**Overall: 7.1/10**

**Why this score:** The watchlist is functionally complete with comprehensive filtering and view modes. However, the accessibility gaps are significant (no ARIA on grid, no live region for filter changes), and the infinite scroll implementation uses a raw scroll event listener instead of the IntersectionObserver pattern used elsewhere in the app. The missing ErrorBoundary is a resilience gap compared to other routes.

---

### 4. Collections Index — `/collections`

**Route:** `src/routes/collections/index.tsx` → `src/features/collections/CollectionsPage.tsx`  
**Structure:** Eyebrow + title → User Collections (create/smart) → Subscribed Universes (add/unsubscribe)

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Visual Hierarchy | 8 | Two clear sections with fold labels. Actions are discoverable |
| Spacing | 7 | Consistent within folds, but create bar and empty states break rhythm slightly |
| Consistency | 6 | Uses `collections-eyebrow-block` instead of `sec-header` |
| Accessibility | 7 | Keyboard-accessible cards, aria-label on buttons. Unsubscribe dialog lacks focus management |
| Readability | 8 | Clear labels, fold icons, descriptive empty states |
| Navigation | 7 | Three-dot menu for unsubscribe. No breadcrumb |
| Performance | 7 | Lazy-loaded AddUniverseModal. Collage rendering loops through entries |
| Premium Feeling | 8 | Collage grid, universe badges, ambient glow |

**Overall: 7.3/10**

**Why this score:** The collections page has good visual design with collage thumbnails and universe badges. The pattern inconsistency (using `collections-*` instead of `sec-*` classes) is the primary deduction, along with the double ErrorBoundary (route-level AND internal) which creates redundant fallbacks with different styles.

---

### 5. Collection Detail — `/collections/[id]`

**Route:** `src/routes/collections/[id]/index.tsx` → `src/features/collections/CollectionDetailPage.tsx`  
**Structure:** Loading → Not Found → Loaded (UniverseDashboard + TimelineEngine)

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Visual Hierarchy | 8 | Dashboard hero → Timeline content. Clear visual weight shift |
| Spacing | 7 | Consistent within sections |
| Consistency | 7 | Uses `page-enter` class. Back button matches edit page |
| Accessibility | 5 | Back button has aria-label. But no heading hierarchy, timeline items may lack ARIA, no aria-live on loading→loaded |
| Readability | 8 | Collection name prominent, timeline entries clear |
| Navigation | 8 | Back to Collections button in all states |
| Performance | 7 | Race condition prevention (epoch tracking) is excellent. No lazy loading for timeline entries |
| Premium Feeling | 8 | Universe Dashboard hero, timeline visualization |

**Overall: 7.3/10**

**Why this score:** The race condition prevention is sophisticated engineering. However, the missing `<Title>` (no document title for this route), the basic skeleton (doesn't match actual content layout), and the lack of `aria-live` on state transitions are notable gaps.

---

### 6. Collection Edit — `/collections/[id]/edit`

**Route:** `src/routes/collections/[id]/edit.tsx` → `src/features/collections/components/UniverseEditPage.tsx`  
**Structure:** Header (back + title + Save/Reset) → Add Custom Entry → Timeline entry list (drag-and-drop)

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Visual Hierarchy | 7 | Header → action bar → entry list. Save/Reset at top (should be sticky?) |
| Spacing | 7 | Consistent timeline rows |
| Consistency | 6 | Uses `collections-edit-*` classes instead of sec-header |
| Accessibility | 4 | **Critical:** Drag-and-drop uses HTML5 API with zero ARIA. Keyboard users cannot reorder |
| Readability | 7 | Entry titles visible, edit actions clear |
| Navigation | 7 | Back button, Save navigates back, Reset clears |
| Performance | 6 | No virtualization for long timelines, every entry re-renders on localEntries change |
| Premium Feeling | 6 | Functional but bare. No animation on reorder |

**Overall: 6.3/10**

**Why this score:** This is the lowest-scoring page primarily due to the critical accessibility failure — the drag-and-drop is mouse-only with zero keyboard support, which violates WCAG 2.1.1. The missing `<Title>` and lack of virtualization for long timelines compound the issues. The feature set (reorder, pin, hide, notes, custom entries) is comprehensive, but the execution needs accessibility and performance improvements.

---

### 7. Profile — `/profile`

**Route:** `src/routes/profile/index.tsx` → `src/features/profile/ProfilePage.tsx`  
**Structure:** Loading → Guest → Error → Loaded (Banner → Identity → Taste Card → Completion → Watchlist Summary → Quick Links)

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Visual Hierarchy | 9 | Portrait-style: banner → avatar → identity → taste → completion → summary → links. Each section has decreasing visual weight |
| Spacing | 8 | `profile-section` consistent rhythm |
| Consistency | 6 | Uses `profile-*` classes instead of `sec-*` pattern |
| Accessibility | 7 | aria-label on sections, aria-live on username validation, ESC to cancel editing. No focus management on edit mode toggle |
| Readability | 9 | Clear identity block, taste card tiles are scannable |
| Navigation | 8 | Quick Links to Stats/History/Achievements/Settings |
| Performance | 7 | No lazy loading for sub-components. Avatar load state handled |
| Premium Feeling | 9 | Cinematic banner, avatar with initials fallback, inline editing (Notion-like) |

**Overall: 7.9/10**

**Why this score:** Profile has the strongest premium feeling among non-settings pages — the inline editing, avatar fallback chain, and live username validation create a polished experience. The pattern inconsistency (using `profile-*` classes) and missing focus management during edit mode toggle are the main deductions.

---

### 8. Stats — `/profile/stats`

**Route:** `src/routes/profile/stats.tsx` → `src/features/profile/StatsPage.tsx`  
**Structure:** Header → Hero Stat → Quick Stats Grid → Movie vs TV → Top Genres → Release Decades → Favorite Directors → Heatmap → Monthly Trends → Weekend vs Weekday → Top Rated

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Visual Hierarchy | 9 | Hero stat → quick stats → deep insights. Progressive disclosure |
| Spacing | 8 | Consistent `sec-section` rhythm |
| Consistency | 9 | Perfect `sec-header`/`sec-section`/`sec-fade-in` pattern |
| Accessibility | 5 | Heatmap cells have only `title` attributes, bar charts have no ARIA, data visualizations are purely visual |
| Readability | 9 | Narrative framing ("How you watch"), contextualized numbers |
| Navigation | 8 | Back to profile link |
| Performance | 6 | No lazy loading for 10 sections, all stats computed synchronously |
| Premium Feeling | 8 | Insight cards, genre bars, heatmap, ratio bar — visual variety |

**Overall: 7.8/10**

**Why this score:** Stats has the best pattern consistency of any page (exemplary `sec-*` usage) and strong narrative framing. The primary deduction is accessibility — data visualizations (heatmap, bar charts, ratio bars) provide no text alternatives for screen readers. The lack of lazy loading for 10 sections is a performance concern.

---

### 9. Achievements — `/profile/achievements`

**Route:** `src/routes/profile/achievements.tsx` → `src/features/profile/AchievementsPage.tsx`  
**Structure:** Header → Progress summary → Achievement grid (16 cards)

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Visual Hierarchy | 8 | Summary card at top gives orientation, grid of cards below |
| Spacing | 8 | Grid layout with consistent card sizing |
| Consistency | 9 | Perfect `sec-header`/`sec-section` pattern |
| Accessibility | 6 | `role="status"` on cards, but progress bars lack `role="progressbar"`, grid is not a list |
| Readability | 8 | "Your cinephile journey" is evocative. Progress percentages readable |
| Navigation | 7 | Back to profile. No unlocked/locked filter |
| Performance | 6 | All 16 achievement definitions computed via createMemo on every watchlist change |
| Premium Feeling | 7 | Unlocked glow, locked dimmed. Museum card metaphor right, execution utilitarian |

**Overall: 7.4/10**

**Why this score:** The museum card philosophy ("No childish badges. No XP. No levels.") is coherent and well-executed. Pattern consistency is excellent. The deductions come from progress bars lacking ARIA roles, no filtering capability as achievements grow, and the 160-line inline ACHIEVEMENTS array that should be a separate data file.

---

### 10. History — `/profile/history`

**Route:** `src/routes/profile/history.tsx` → `src/features/profile/HistoryPage.tsx`  
**Structure:** Header → Search bar → Status filter tabs → Grouped timeline (Today/Yesterday/This Week/…)

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Visual Hierarchy | 8 | Timeline grouping excellent. Group headers + counts provide orientation |
| Spacing | 7 | Items consistent, but group headers could use more visual separation |
| Consistency | 9 | Uses `sec-header` pattern. Filter bar matches other pages |
| Accessibility | 6 | `role="tablist"` + `aria-selected` on filters. But items have empty onClick handlers |
| Readability | 9 | "Your journey" framing. Group labels immediately clear |
| Navigation | 7 | Search and filters for navigation within content |
| Performance | 5 | **No pagination** — entire watchlist loads and sorts on every render |
| Premium Feeling | 7 | Timeline feel, poster thumbnails, status badges |

**Overall: 7.3/10**

**Why this score:** History has excellent readability through natural time grouping and the best filter bar accessibility in the app. However, the empty onClick handlers on history items are a broken interaction (users tap and nothing happens), and the lack of pagination means performance will degrade with large watchlists. The 5/10 performance score is the most impactful deduction.

---

### 11. Search — `/search`

**Route:** `src/routes/search.tsx` → `src/features/search/SearchPage.tsx`  
**Structure:** Search header (autofocus) → Cold-start (recent + trending + genres) OR Active query results OR Genre browse

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Visual Hierarchy | 8 | Three clear modes, only one visible at a time |
| Spacing | 7 | Consistent within each mode. Mode transitions are instant |
| Consistency | 7 | Uses PageContainer + ScrollToTop, but no sec-header pattern |
| Accessibility | 6 | Search input has autofocus (can jarring for screen readers). No aria-live on results loading |
| Readability | 8 | "Find me this specific thing" philosophy is clear. Genre pills are scannable |
| Navigation | 8 | Recent searches provide quick access. Genre browse has load more |
| Performance | 7 | Lazy route loading. Debounced search (250ms). Genre browse has infinite scroll |
| Premium Feeling | 7 | Clean and functional. Lacks editorial flair of Discover |

**Overall: 7.3/10**

**Why this score:** Search excels in its three-mode design (cold-start/active/genre) and autofocus behavior. The missing ErrorBoundary (unlike collections and profile routes), lack of aria-live on result changes, and complex inline async logic in handleAddToVault are the primary concerns.

---

### 12. Settings Index — `/settings`

**Route:** `src/routes/settings/index.tsx` → `src/features/settings/SettingsPage.tsx`  
**Structure:** Header → Account → Preferences → Data → Advanced → Session (Sign Out)

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Visual Hierarchy | 9 | Clear grouping, Sign Out at bottom (danger zone separation) |
| Spacing | 9 | `sec-section` / `setting-group` / `setting-row` — perfectly consistent |
| Consistency | 10 | **Gold standard** for `sec-*` pattern |
| Accessibility | 8 | `aria-label` on all rows, `focus-ring`, `<a>` for nav, `<button>` for actions |
| Readability | 9 | Clear section labels, row descriptions, "Sign out is at the bottom" subtitle |
| Navigation | 9 | Back to profile, each row navigates to sub-page |
| Performance | 9 | Lightweight — static rows, no data fetching |
| Premium Feeling | 9 | Clean, calm, organized. Linear/Notion/Arc Browser philosophy achieved |

**Overall: 9.1/10**

**Why this score:** Settings is the highest-scoring page because it perfectly implements the design system patterns (`sec-header`, `sec-section`, `setting-group`, `setting-row`), uses proper HTML semantics (`<a>` for navigation, `<button>` for actions), and achieves the "Think Linear, Notion, Arc Browser" design goal. The only deductions are for section labels being `<p>` elements instead of headings (reduces screen reader navigability) and the lack of confirmation on Sign Out.

---

### 13. Settings Account — `/settings/account`

**Route:** `src/routes/settings/account.tsx`  
**Structure:** Header → Not signed in OR Account Info → Connected Providers → Security → Session

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Visual Hierarchy | 8 | Logical flow: identity → providers → security → session |
| Spacing | 9 | `sec-section` + `setting-group` pattern consistent with settings index |
| Consistency | 9 | Uses `sec-header` with back link, `setting-row` pattern matches |
| Accessibility | 7 | `aria-label` on buttons and back link. Provider status conveyed only by color |
| Readability | 8 | Account info rows clear. Provider connection status readable |
| Navigation | 8 | Back to settings. Sign Out navigates to /discover |
| Performance | 8 | Reads from auth state (already loaded) |
| Premium Feeling | 7 | Clean but utilitarian. No visual flourish |

**Overall: 8.3/10**

**Why this score:** Account follows the settings pattern perfectly. The hardcoded green color (#4ade80) for "Connected" instead of a CSS variable, and the non-existent Apple icon in Material Symbols are the main issues. No Sign Out confirmation is a UX concern.

---

### 14. Settings Appearance — `/settings/appearance`

**Route:** `src/routes/settings/appearance.tsx`  
**Structure:** Header → Live Preview → Accent Color grid → Density → Accessibility

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Visual Hierarchy | 9 | Preview at top shows immediate impact. Theme grid is main interaction |
| Spacing | 9 | Consistent sec-section rhythm. Theme grid has good spacing |
| Consistency | 9 | sec-header pattern, setting-row for non-interactive rows |
| Accessibility | 8 | `aria-pressed` on theme buttons, `aria-label` with theme names |
| Readability | 9 | "Choose your accent. The black theme stays." is memorable |
| Navigation | 8 | Back to settings. Clear page purpose |
| Performance | 8 | No data fetching. Theme change is instant |
| Premium Feeling | 9 | Live preview, swatch grid, opinionated design |

**Overall: 8.6/10**

**Why this score:** Appearance is the best-feeling settings page. The live preview, `aria-pressed` on theme buttons, and the confident "the black theme stays" attitude create a polished experience. The fake Density and Accessibility sections (non-interactive placeholders) and the `<span>` preview buttons (not keyboard-focusable) are the main deductions.

---

### 15. Settings Developer — `/settings/developer`

**Route:** `src/routes/settings/developer.tsx`  
**Structure:** Header → Environment → Feature Flags → Database → Diagnostics

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Visual Hierarchy | 7 | Logical but dense information layout |
| Spacing | 8 | Consistent sec-section/setting-row pattern |
| Consistency | 7 | Uses sec-header + setting-row, but `diag-block`/`diag-line`/`diag-key`/`diag-value` are unique |
| Accessibility | 4 | Diagnostic rows have cursor: pointer and focus-ring but **no onClick handlers** — deceptive |
| Readability | 7 | Environment info clear, but version is hardcoded and buildTime is wrong |
| Navigation | 8 | Back to settings |
| Performance | 9 | No data fetching, static content |
| Premium Feeling | 5 | Raw diagnostic information, "View Console Logs" tells you to open dev tools |

**Overall: 6.9/10**

**Why this score:** Developer is the second-lowest scoring page. The deceptive interactive elements (cursor: pointer, focus-ring, but no handlers) violate WCAG and erode trust. The `buildTime` using `new Date().toISOString()` shows runtime time instead of build time. The hardcoded version "2.0.0" should come from package.json. The page feels unfinished despite being accessible to users.

---

### 16. Settings Notifications — `/settings/notifications`

**Route:** `src/routes/settings/notifications.tsx`  
**Structure:** Header → Notification toggles → "How notifications work" insight card

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Visual Hierarchy | 8 | Toggle list is main content, insight card provides context |
| Spacing | 8 | Consistent setting-row pattern |
| Consistency | 9 | sec-header + setting-row pattern |
| Accessibility | 6 | `role="switch"` + `aria-checked` on toggles. But toggle is `<div>` not `<button>` — not keyboard-focusable |
| Readability | 9 | Each notification has label + description. Insight card explains philosophy |
| Navigation | 8 | Back to settings |
| Performance | 8 | Local state only, lightweight |
| Premium Feeling | 7 | Toggle design is clean, insight card adds personality. Toggles don't persist |

**Overall: 7.9/10**

**Why this score:** The content design is strong (explanatory descriptions, insight card). However, the toggle implementation uses `<div>` elements with `role="switch"` but no keyboard focusability, which violates WCAG 2.1.1. The state not persisting (changes lost on navigation) is a functional gap.

---

### 17. Settings Privacy — `/settings/privacy`

**Route:** `src/routes/settings/privacy.tsx`  
**Structure:** Header → Privacy promise → Data Storage → Visibility → Your Rights (Export/Delete)

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Visual Hierarchy | 8 | Promise at top builds trust. Storage → Visibility → Actions |
| Spacing | 8 | Consistent sec-section/setting-row |
| Consistency | 9 | sec-header pattern, setting-row for data rows |
| Accessibility | 7 | `aria-label` on links, `aria-hidden` on icons. Delete link needs warning |
| Readability | 9 | "Your data is yours" is powerful. "No followers, no public feed" builds trust |
| Navigation | 8 | Back to settings. Export/Delete are one tap away |
| Performance | 8 | No data fetching |
| Premium Feeling | 8 | Trust-building design, insight card, accent highlights |

**Overall: 8.1/10**

**Why this score:** Privacy excels in trust-building copy and data transparency. The "single-player tracking app" positioning is clear and reassuring. The Delete Account link navigating to /settings/account (not a dedicated flow) and the lack of a visual danger indicator on the delete link are the main deductions.

---

### 18. Settings Sync — `/settings/sync`

**Route:** `src/routes/settings/sync.tsx`  
**Structure:** Header → Guest state OR Cloud Status → Import → Backup & Restore → Devices → Recent Activity → Storage → Privacy → Danger Zone

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Visual Hierarchy | 9 | 8 sections ordered by priority: safe → dangerous |
| Spacing | 8 | Consistent sec-section rhythm |
| Consistency | 9 | sec-header pattern with "Data Center" eyebrow |
| Accessibility | 7 | Guest fallback has role="status" + aria-live. Sub-component ARIA varies |
| Readability | 9 | "Your library is safe, portable, and yours." — excellent subtitle |
| Navigation | 8 | Back to settings. 8 sections logically ordered |
| Performance | 6 | All 8 sub-components eagerly imported. Some may fetch data on mount |
| Premium Feeling | 8 | "Data Center" framing, multiple functional sections, danger zone |

**Overall: 8.0/10**

**Why this score:** Sync has excellent section ordering and the pluggable import/backup architecture is well-designed. The eager loading of all 8 sub-components and the lack of coordinated loading states are the primary concerns.

---

## Cross-Cutting Analysis

### Top-Scoring Pages (8.0+)

Settings Index, Appearance, Account, Privacy, and Sync all score above 8.0. These pages share:
- Consistent `sec-*` pattern usage
- Proper HTML semantics (`<a>` for nav, `<button>` for actions)
- Clear section labeling and grouping
- Lightweight rendering (no heavy data fetching)

### Bottom-Scoring Pages (<7.0)

Developer (6.9) and Collection Edit (6.3) share:
- Non-functional interactive elements (deceptive UX)
- Critical accessibility gaps (keyboard-only users excluded)
- Missing `<Title>` elements

### Most Common Deductions

| Issue | Pages Affected | Avg Score Impact |
|-------|---------------|-----------------|
| Pattern inconsistency (non-sec-* classes) | Discover, Collections, Profile | -2 to -3 points on Consistency |
| Missing ARIA on data visualizations | Stats, Achievements | -3 to -4 points on Accessibility |
| No ErrorBoundary at route level | Watchlist, Search | N/A (resilience risk) |
| Missing `<Title>` | Collection Detail, Collection Edit | Minor |
| Hardcoded semantic colors (#4ade80, #f87171) | Account, Developer, Privacy, Notifications | -1 point on Consistency |
| No lazy loading for long pages | Stats, Achievements, History | -2 to -3 points on Performance |
| Non-keyboard-accessible interactive elements | Collection Edit, Notifications, Developer | -3 to -4 points on Accessibility |

### Best Practices to Replicate

1. **Settings pattern** — `sec-header` + `sec-section` + `setting-group` + `setting-row` is the gold standard
2. **Discover LazyMount** — IntersectionObserver-based lazy rendering for long pages
3. **Discover per-section ErrorBoundary** — isolating failures per section
4. **Profile inline editing** — in-place editing with ESC key support
5. **Appearance live preview** — showing impact before committing
