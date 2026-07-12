# CineLog Design Debt

> **Version:** 1.0  
> **Date:** 2026-07-12  
> **Status:** Audit Document — Complete UI Inconsistency Inventory  
> **Rule:** Do NOT fix any of these issues yet. This document is an audit only.

---

## Severity Definitions

| Level | Definition | Action Timeline |
|-------|-----------|-----------------|
| **Critical** | Breaks functionality, violates WCAG, or causes data loss | Must fix before any redesign |
| **High** | Creates significant inconsistency or user confusion | Must fix during redesign |
| **Medium** | Noticeable inconsistency, degrades polish | Should fix during redesign |
| **Low** | Minor inconsistency, invisible to most users | Nice to fix eventually |

---

## Critical Issues

---

### C1. Collection Edit Drag-and-Drop Has Zero Keyboard Accessibility

| Field | Detail |
|-------|--------|
| **Category** | Accessibility |
| **Location** | `src/features/collections/components/UniverseEditPage.tsx` |
| **Issue** | Drag-and-drop uses HTML5 Drag API which is mouse-only. No `aria-grabbed`, no `aria-dropeffect`, no keyboard reorder mechanism. Keyboard users and screen reader users cannot reorder timeline entries at all. |
| **Impact** | Violates WCAG 2.1.1 (Keyboard). A core feature of the edit page is completely inaccessible to keyboard-only users. |
| **Fix Direction** | Add move-up/move-down buttons on each entry, or implement a keyboard-accessible reorder pattern with ARIA live regions. |

---

### C2. Notification Toggles Are `<div>` Elements, Not `<button>`

| Field | Detail |
|-------|--------|
| **Category** | Accessibility |
| **Location** | `src/routes/settings/notifications.tsx` |
| **Issue** | Toggle switches use `<div>` with `role="switch"` and `aria-checked`, but `<div>` elements are not keyboard-focusable. The `onClick` handler is on the parent row, not the toggle itself. Screen readers activating the switch directly won't trigger the toggle. |
| **Impact** | Violates WCAG 2.1.1 (Keyboard). Toggles cannot be operated via keyboard. |
| **Fix Direction** | Change toggle element to `<button>` with `role="switch"`. Ensure Space/Enter keys trigger the toggle. Move onClick to the switch element itself. |

---

### C3. Developer Page Has Deceptive Interactive Elements

| Field | Detail |
|-------|--------|
| **Category** | Accessibility / Trust |
| **Location** | `src/routes/settings/developer.tsx` |
| **Issue** | "View Console Logs", "Test Supabase Connection", "Clear TMDB Cache" rows have `cursor: pointer` and `focus-ring` styling but **no onClick handlers**. They look clickable but do nothing when tapped or activated. |
| **Impact** | Violates WCAG 2.1.1 (Name, Role, Value) and erodes user trust. Keyboard users can tab to these elements and press Enter with no result. |
| **Fix Direction** | Either implement the functionality or remove interactive styling (cursor: pointer, focus-ring) and add `aria-disabled="true"`. |

---

### C4. SafeImage Error State Never Resets

| Field | Detail |
|-------|--------|
| **Category** | Bug |
| **Location** | `src/shared/ui/SafeImage.tsx` |
| **Issue** | Once `errored` signal is set to `true`, there's no way to reset it. If `src` changes reactively after an error (e.g., a poster URL updates), the image never recovers and stays in the error/fallback state permanently. |
| **Impact** | Users see broken image fallbacks that never resolve, even when the image URL becomes valid. |
| **Fix Direction** | Add a `createEffect` that watches `props.src` and resets `setErrored(false)` when it changes. |

---

### C5. History Items Have Empty onClick Handlers

| Field | Detail |
|-------|--------|
| **Category** | Broken Interaction |
| **Location** | `src/routes/profile/history.tsx` |
| **Issue** | History items have `onClick={() => {}}` and `onKeyDown` that prevents default but does nothing. Users tap a history item and nothing happens. |
| **Impact** | Broken interaction — users expect tapping a history item to open the detail modal. |
| **Fix Direction** | Implement onClick to open DetailsModal with the item's TMDB ID. |

---

## High Issues

---

### H1. Three Different Section Class Naming Conventions

| Field | Detail |
|-------|--------|
| **Category** | Consistency |
| **Location** | Multiple features |
| **Issue** | Three different class naming patterns for the same structural concept (section header + section body): |
| | • Settings/Stats/Achievements/History use `sec-header` / `sec-section` |
| | • Discover uses `discover-eyebrow-block` / `discover-fold` |
| | • Collections uses `collections-eyebrow-block` / `collections-fold` |
| | • Profile uses `profile-section` / inline classes |
| **Impact** | Makes the design system fragmented. Developers must remember which convention each feature uses. New features won't know which pattern to follow. |
| **Fix Direction** | Unify to a single `sec-*` pattern. The Settings/Stats pattern is the most mature and should become the standard. |

---

### H2. Type Classes Defined Twice (Phase 2.1 vs V2 Override)

| Field | Detail |
|-------|--------|
| **Category** | Consistency / Dead Code |
| **Location** | `src/styles/components/_phase21.css` and `src/styles/components/_phase22_sprint1.css` |
| **Issue** | `.type-display`, `.type-headline`, `.type-body`, `.type-body-soft`, `.type-meta`, `.type-eyebrow` are defined in Phase 2.1 and then redefined with different values in V2. Since V2 is imported after Phase 2.1, V2 wins by cascade. The Phase 2.1 definitions become dead code. |
| **Classes affected** | `.type-display` (2.5rem → 3.25rem), `.type-headline` (1.125rem → 1.25rem), `.type-body` (0.875rem → 0.9375rem), `.type-body-soft` (0.875rem → 0.9375rem), `.type-meta` (0.6875rem → 0.75rem), `.type-eyebrow` (0.625rem → 0.6875rem) |
| **Impact** | Confusing for developers. Which value is "current"? Dead CSS increases bundle size. |
| **Fix Direction** | Remove Phase 2.1 type class definitions. Keep only V2 values. Update any components still using Phase 2.1-specific sizes. |

---

### H3. Settings Row Has Two Conflicting Definitions

| Field | Detail |
|-------|--------|
| **Category** | Consistency / Dead Code |
| **Location** | `src/styles/components/cards.css` and `src/styles/features/settings.css` |
| **Issue** | `.settings-row` is defined in `cards.css` with `border-radius: 14px` and background `#141414/#1a1a1a`, and again in `settings.css` with `border-radius: var(--radius-lg)` (20px) and background `var(--tier-2)/var(--tier-3)`. The settings.css version wins by cascade. The cards.css version is dead code. |
| **Impact** | The 14px radius in cards.css doesn't match any token. The hardcoded colors don't follow the tier system. Dead CSS. |
| **Fix Direction** | Remove the `.settings-row` definition from cards.css. The settings.css version using tokens is correct. |

---

### H4. Missing ErrorBoundary on Watchlist and Search Routes

| Field | Detail |
|-------|--------|
| **Category** | Resilience |
| **Location** | `src/routes/watchlist.tsx`, `src/routes/search.tsx` |
| **Issue** | Collections, Profile, and Settings routes all wrap their feature components in ErrorBoundary. Watchlist and Search routes do not. A render error in either shows a blank page. |
| **Impact** | Lower resilience — any unhandled error crashes the entire page instead of showing a friendly fallback. |
| **Fix Direction** | Add route-level ErrorBoundary with the same pattern used by collections/profile routes. |

---

### H5. Missing `<Title>` on Collection Detail and Collection Edit

| Field | Detail |
|-------|--------|
| **Category** | Consistency / UX |
| **Location** | `src/routes/collections/[id]/index.tsx`, `src/routes/collections/[id]/edit.tsx` |
| **Issue** | Every other route sets a document `<Title>`. These two routes don't, so the browser tab shows no page name. |
| **Impact** | Users with multiple tabs can't identify these pages. Screen readers don't announce the page. |
| **Fix Direction** | Add `<Title>` component with collection name + "CineLog" suffix. |

---

### H6. Tailwind Config Is Empty — No Design Tokens Registered

| Field | Detail |
|-------|--------|
| **Category** | Architecture |
| **Location** | `tailwind.config.js` |
| **Issue** | `theme.extend: {}` means zero custom design tokens are registered in Tailwind. All custom values are CSS custom properties only. This creates a split-brain system where Tailwind utilities use defaults while custom values live in CSS variables. |
| **Impact** | Cannot use Tailwind utilities for custom values (e.g., `bg-surface`, `text-body`, `p-sp-4`). Forces inline styles or custom CSS classes for every custom value. |
| **Fix Direction** | Register all design tokens in `tailwind.config.js` theme.extend: colors, spacing, borderRadius, fontFamily, fontSize, boxShadow, animation, transitionDuration. |

---

### H7. SectionHeader Duplicates Section's Header Block

| Field | Detail |
|-------|--------|
| **Category** | DRY Violation |
| **Location** | `src/shared/ui/primitives/SectionHeader.tsx` and `src/shared/ui/primitives/Section.tsx` |
| **Issue** | SectionHeader renders nearly identical markup to Section's internal header block. Both use `section-header`, `section-header-title`, `section-header-action` classes. Changes to one must be mirrored to the other. |
| **Impact** | Maintenance burden. If the header pattern changes, it must be updated in two places. |
| **Fix Direction** | Section should import and render SectionHeader internally. SectionHeader becomes the single source of truth. |

---

### H8. Button Primitive Missing `loading` and `danger` Variants

| Field | Detail |
|-------|--------|
| **Category** | Component Design |
| **Location** | `src/shared/ui/primitives/Button.tsx` |
| **Issue** | Button only has `primary` and `ghost` variants. Every consumer (AuthModal, GlobalErrorBoundary, SyncPage, DangerZoneCard) implements its own loading spinner and danger styling. |
| **Impact** | Inconsistent loading states across the app. Danger buttons have different styling in every location. |
| **Fix Direction** | Add `loading: boolean` prop with spinner, `danger` variant with red styling. |

---

## Medium Issues

---

### M1. Shimmer Animation Duration Inconsistency

| Field | Detail |
|-------|--------|
| **Category** | Animation |
| **Location** | `src/styles/components/cards.css` (1.4s) vs `src/styles/components/_phase21.css` (1.6s) |
| **Issue** | Poster-loading shimmer uses 1.6s in some places and 1.4s in the original cards.css definition. Two different speeds for the same visual effect. |
| **Impact** | Subtle but noticeable — some skeletons shimmer faster than others. |
| **Fix Direction** | Standardize to 1.6s (the premium/V2 value). Remove the 1.4s definition. |

---

### M2. Focus Ring Inconsistency (3 Different Patterns)

| Field | Detail |
|-------|--------|
| **Category** | Accessibility / Consistency |
| **Location** | Multiple files |
| **Issue** | Three different focus ring implementations: |
| | • Global `:focus-visible`: `outline: 2px solid var(--p); outline-offset: 2px` |
| | • `.focus-ring` class: `box-shadow: 0 0 0 2px var(--tier-1), 0 0 0 4px var(--p)` |
| | • Settings inputs: `outline: 2px solid var(--p); outline-offset: -2px` |
| **Impact** | Focus indicators look different depending on which pattern is used. Inconsistent accessibility experience. |
| **Fix Direction** | Choose one pattern (recommend `.focus-ring` with box-shadow for visual consistency and outline for screen readers) and apply uniformly. |

---

### M3. Hardcoded Semantic Colors (#4ade80, #f87171, #60a5fa)

| Field | Detail |
|-------|--------|
| **Category** | Tokenization |
| **Location** | Account, Developer, Privacy, Notifications, Watchlist, Collections, Toast |
| **Issue** | Success green (#4ade80), danger red (#f87171), and info blue (#60a5fa) are hardcoded across multiple files instead of being defined as CSS custom properties. These colors don't adapt to theme changes. |
| **Impact** | If a theme needs different success/danger colors (e.g., Cinematic theme with gold), these hardcoded values won't adapt. |
| **Fix Direction** | Define `--color-success`, `--color-danger`, `--color-info` CSS custom properties and replace all hardcoded values. |

---

### M4. Backdrop Gradient Stop Inconsistency

| Field | Detail |
|-------|--------|
| **Category** | Consistency |
| **Location** | Multiple feature CSS files |
| **Issue** | Hero gradient overlays use different base colors for stops: |
| | • Some use `rgba(10,11,14,...)` (matching `--tier-1` = `#0a0b0e`) |
| | • Some use `rgba(0,0,0,...)` (pure black) |
| | • Some use `rgba(8,9,11,...)` (from helpers.css gradient utility) |
| **Impact** | Subtle color difference in hero overlays. Some heroes look slightly bluer/blacker than others. |
| **Fix Direction** | Standardize gradient stops to use `var(--tier-1)` or `var(--void)` as the base color. |

---

### M5. Hero Heights All Hardcoded — No Token or Scale

| Field | Detail |
|-------|--------|
| **Category** | Tokenization |
| **Location** | Multiple feature CSS files |
| **Issue** | Hero heights are all unique hardcoded values: 220px (featured-hero), 240px (hero-premium), 280px (collection-hero), 35vh/360px (cinematic-hero), 380px (universe-hero), 460px (spotlight). No CSS custom property or systematic scale. |
| **Impact** | Cannot adjust hero heights globally. Adding a new hero type requires choosing an arbitrary height. |
| **Fix Direction** | Define `--hero-sm`, `--hero-md`, `--hero-lg`, `--hero-xl` tokens and map existing heroes to them. |

---

### M6. Poster Card Widths All Hardcoded — No Token Scale

| Field | Detail |
|-------|--------|
| **Category** | Tokenization |
| **Location** | Multiple feature CSS files |
| **Issue** | Card widths are hardcoded: 100px, 110px, 120px, 130px, 140px, 200px — no token or systematic scale. |
| **Impact** | Cannot adjust card sizes globally. Inconsistent sizing across different rails. |
| **Fix Direction** | Define `--card-width-sm`, `--card-width-md`, `--card-width-lg` tokens. |

---

### M7. Unused Design Tokens (Dead Code)

| Field | Detail |
|-------|--------|
| **Category** | Dead Code |
| **Location** | `src/styles/tokens/` |
| **Issue** | Several tokens are defined but never referenced in any CSS: |
| | • `--tier-4: #20242c` (never used) |
| | • `--dur-micro: 80ms` (never referenced) |
| | • `--shadow-glow` (never used — components use inline glow shadows) |
| | • `--ease-standard` (rarely used) |
| | • `--ease-in-out` (rarely used) |
| | • `--touch-min: 44px` (never referenced) |
| | • `--border` and `--border-active` (almost never used — hairline tokens preferred) |
| **Impact** | Dead tokens create confusion about what's actually in use. Bundle size overhead (minimal). |
| **Fix Direction** | Either start using these tokens (e.g., use `--touch-min` for all interactive elements, use `--tier-4` for highest-elevation surfaces) or remove them. |

---

### M8. Watchlist Uses Raw Scroll Listener Instead of IntersectionObserver

| Field | Detail |
|-------|--------|
| **Category** | Performance / Modern API |
| **Location** | `src/features/watchlist/WatchlistView.tsx` |
| **Issue** | Infinite scroll uses `window.innerHeight + window.scrollY >= document.body.offsetHeight - 200` with a raw scroll event listener. The rest of the app uses IntersectionObserver (LazyMount, ScrollToTop). |
| **Impact** | Less performant (runs on every scroll event despite `passive: true`). Inconsistent with the established pattern. |
| **Fix Direction** | Replace with IntersectionObserver-based infinite scroll pattern, similar to LazyMount. |

---

### M9. AppHeader Inline Hover Handlers Mutate Style Directly

| Field | Detail |
|-------|--------|
| **Category** | CSP / Best Practice |
| **Location** | `src/shared/ui/AppHeader.tsx` |
| **Issue** | `onMouseEnter`/`onMouseLeave` handlers directly mutate `element.style.transform` and `element.style.transition`. This breaks CSP `style-attr` restrictions if ever enforced and is less maintainable than CSS `:hover` pseudo-classes. |
| **Impact** | Currently works but prevents future CSP hardening. Not idiomatic for a CSS-rich codebase. |
| **Fix Direction** | Move hover effects to CSS with `:hover` pseudo-classes and CSS custom properties. |

---

### M10. AuthModal at 470 Lines Should Be Decomposed

| Field | Detail |
|-------|--------|
| **Category** | Code Quality |
| **Location** | `src/shared/ui/AuthModal.tsx` |
| **Issue** | AuthModal is 470 lines with sign-in form, sign-up form, Google OAuth button, mode toggle, error handling, and validation all in one component. |
| **Impact** | Hard to maintain. Hard to test individual parts. Changes to one mode risk breaking the other. |
| **Fix Direction** | Extract AuthForm, GoogleButton, SocialDivider, ModeToggle sub-components. |

---

### M11. MovieCard at 300 Lines Should Extract Sub-Components

| Field | Detail |
|-------|--------|
| **Category** | Code Quality |
| **Location** | `src/shared/ui/MovieCard.tsx` |
| **Issue** | MovieCard is the largest component in the shared UI. CardPoster and CardBadges sub-components are mentioned in comments but never extracted. |
| **Impact** | Hard to maintain. Hard to test poster rendering separately from badge rendering. |
| **Fix Direction** | Extract CardPoster (poster + skeleton + error + status badge) and CardBadges (rating chips + genre tag) as separate components. |

---

### M12. Notification Toggle State Not Persisted

| Field | Detail |
|-------|--------|
| **Category** | Functionality |
| **Location** | `src/routes/settings/notifications.tsx` |
| **Issue** | Toggle states use `createSignal` with hardcoded defaults. Changes are lost on navigation. No localStorage persistence, no Supabase save. |
| **Impact** | Users set notification preferences and lose them when they leave the page. |
| **Fix Direction** | Persist toggle states to localStorage or Supabase. Or add a Save button. |

---

### M13. Developer Page buildTime Is Wrong

| Field | Detail |
|-------|--------|
| **Category** | Bug |
| **Location** | `src/routes/settings/developer.tsx` |
| **Issue** | `buildTime` uses `new Date().toISOString()` which gives the runtime time (current time on every page visit), not the actual build time. |
| **Impact** | The "Build Time" field shows a different value on every page load. Misleading for debugging. |
| **Fix Direction** | Use a Vite build-time variable: `import.meta.env.BUILD_TIME` or define at build time. |

---

### M14. Hardcoded Version "2.0.0"

| Field | Detail |
|-------|--------|
| **Category** | Maintenance |
| **Location** | `src/routes/settings/developer.tsx` |
| **Issue** | Version is hardcoded as "2.0.0" instead of reading from `package.json` or a build-time variable. |
| **Impact** | Version string must be manually updated on every release. Will become stale. |
| **Fix Direction** | Use `import.meta.env.PACKAGE_VERSION` or read from package.json at build time. |

---

### M15. Stats Page Has No Lazy Loading for 10 Sections

| Field | Detail |
|-------|--------|
| **Category** | Performance |
| **Location** | `src/routes/profile/stats.tsx` |
| **Issue** | Stats page has 10 sections that all mount at once. Discover uses LazyMount for sections 8+. Stats has no equivalent. |
| **Impact** | Unnecessary rendering of below-fold content. All stats computed synchronously. |
| **Fix Direction** | Apply LazyMount pattern to sections below the first viewport. |

---

### M16. Filter Chip Height (36px) Below Touch Target Minimum (44px)

| Field | Detail |
|-------|--------|
| **Category** | Accessibility |
| **Location** | Watchlist, Search, Collections filter chips |
| **Issue** | Filter chips and quick-filter tabs have a visual height of ~36px, below the WCAG 2.5.5 minimum of 44px touch target. |
| **Impact** | Difficult to tap accurately on mobile. Violates WCAG 2.5.5. |
| **Fix Direction** | Either increase chip height to 44px or add invisible padding to expand the tap area to 44px. |

---

### M17. Data Visualizations Lack ARIA

| Field | Detail |
|-------|--------|
| **Category** | Accessibility |
| **Location** | `src/routes/profile/stats.tsx` |
| **Issue** | Heatmap cells have only `title` attributes (not accessible to screen readers). Bar charts (genre bars, monthly trends) have no ARIA. Ratio bars have no text alternatives. Screen readers get nothing from the visual data. |
| **Impact** | Visual data is completely invisible to screen reader users. |
| **Fix Direction** | Add `aria-label` to each visualization with a text summary. Add `role="img"` to decorative visualizations. Provide text alternatives for key data points. |

---

## Low Issues

---

### L1. Settings Section Labels Use `<p>` Instead of Headings

| Field | Detail |
|-------|--------|
| **Category** | Accessibility |
| **Location** | `src/features/settings/SettingsPage.tsx` |
| **Issue** | Section labels (Account, Preferences, Data, Advanced, Session) are `<p>` elements with Azeret Mono styling. Screen readers navigate by heading level; `<p>` elements are not headings. |
| **Impact** | Screen reader users cannot jump between sections by heading level. |
| **Fix Direction** | Change to `<h2>` or `<h3>` with the same visual styling. |

---

### L2. Appearance Preview Buttons Are `<span>` Not `<button>`

| Field | Detail |
|-------|--------|
| **Category** | Accessibility |
| **Location** | `src/routes/settings/appearance.tsx` |
| **Issue** | Preview card buttons are `<span>` elements with `pointer-events: none`. They're not keyboard-focusable and have no semantic role. |
| **Impact** | Preview buttons can't be activated by keyboard. They're decorative but look interactive. |
| **Fix Direction** | Make them `<button disabled>` for proper semantics, or remove them if they serve no purpose. |

---

### L3. Apple Icon Doesn't Exist in Material Symbols

| Field | Detail |
|-------|--------|
| **Category** | Visual Bug |
| **Location** | `src/routes/settings/account.tsx` |
| **Issue** | Connected provider list includes `{ id: "apple", icon: "apple" }` but "apple" is not a valid Material Symbols icon name. The icon renders as an empty square or nothing. |
| **Impact** | Apple provider shows a broken/missing icon. |
| **Fix Direction** | Use an SVG Apple logo or a generic "phone" icon as fallback. |

---

### L4. LoadingScreen Caption Says "Initializing Vault" (Deprecated Name)

| Field | Detail |
|-------|--------|
| **Category** | Copy |
| **Location** | `src/shared/ui/LoadingScreen.tsx` |
| **Issue** | Caption says "Initializing Vault" but "Vault" was renamed to "Watchlist". The term is outdated. |
| **Impact** | Minor copy inconsistency. Users might be confused by the term "Vault". |
| **Fix Direction** | Update caption to "Initializing CineLog" or "Loading your library". |

---

### L5. Multiple Pages Use `.map()` Instead of `<For>`

| Field | Detail |
|-------|--------|
| **Category** | Idiomatic Code |
| **Location** | Settings Index, Developer, Stats, Achievements |
| **Issue** | Some pages use `items.map()` instead of SolidJS's `<For>` component for rendering lists. While fine for static data, it's not idiomatic and won't be reactive if data becomes dynamic. |
| **Impact** | No functional impact for static lists. Non-idiomatic SolidJS. |
| **Fix Direction** | Convert to `<For>` for consistency and future reactivity. |

---

### L6. IMDb Rating Chip Uses Emoji 🍅 Instead of Icon

| Field | Detail |
|-------|--------|
| **Category** | Consistency |
| **Location** | `src/shared/ui/MovieCardRatings.tsx` |
| **Issue** | Rotten Tomatoes chip uses the 🍅 emoji instead of an SVG icon or Material Symbol. Emojis render differently across platforms and don't match the icon system. |
| **Impact** | Visual inconsistency. Emoji rendering varies by OS. |
| **Fix Direction** | Replace with an SVG icon or a styled text label ("RT"). |

---

### L7. EmptyState Primitive Doesn't Use Icon or Button Primitives

| Field | Detail |
|-------|--------|
| **Category** | DRY Violation |
| **Location** | `src/shared/ui/primitives/EmptyState.tsx` |
| **Issue** | EmptyState renders its own icon (with `material-symbols-outlined` class and inline font-variation-settings) and button (with `btn-primary` class) instead of using the Icon and Button primitives. |
| **Impact** | If Icon or Button primitives change, EmptyState won't inherit the updates. |
| **Fix Direction** | Use `<Icon>` and `<Button>` components inside EmptyState. |

---

### L8. Badge Primitive Duplicates Icon Component Logic

| Field | Detail |
|-------|--------|
| **Category** | DRY Violation |
| **Location** | `src/shared/ui/primitives/Badge.tsx` |
| **Issue** | Badge renders its own icon with hardcoded `material-symbols-outlined` class and inline `font-variation-settings` instead of using the Icon component. |
| **Impact** | Same as L7. Changes to Icon don't propagate to Badge. |
| **Fix Direction** | Use `<Icon>` component inside Badge. |

---

### L9. Icon Component Has No `size` or `weight` Props

| Field | Detail |
|-------|--------|
| **Category** | Component Design |
| **Location** | `src/shared/ui/Icon.tsx` |
| **Issue** | Icon component doesn't accept `size` or `weight` props. Every consumer must pass inline `style={{ 'font-size': '20px', 'font-variation-settings': '...' }}`. This pattern is repeated 50+ times across the codebase. |
| **Impact** | Verbose, error-prone, inconsistent icon sizing. |
| **Fix Direction** | Add `size?: number | string` and `weight?: number` props that set font-size and font-variation-settings automatically. |

---

### L10. Tailwind Defaults Used Instead of Custom Tokens

| Field | Detail |
|-------|--------|
| **Category** | Tokenization |
| **Location** | Multiple TSX files |
| **Issue** | Many components use Tailwind default utility classes (`px-5`, `max-w-2xl`, `lg:max-w-4xl`, `gap-1.5`, `mb-4`) instead of custom token-based classes or CSS custom properties. |
| **Impact** | Spacing and sizing values from Tailwind defaults may not match the CineLog spacing scale. |
| **Fix Direction** | After registering tokens in Tailwind config (H6), migrate to custom utility classes (`px-sp-5`, `max-w-page-narrow`, etc.). |

---

### L11. No Confirmation on Sign Out

| Field | Detail |
|-------|--------|
| **Category** | UX |
| **Location** | `src/features/settings/SettingsPage.tsx`, `src/routes/settings/account.tsx` |
| **Issue** | Sign Out is a destructive action (clears session, may lose unsynced data) but has no confirmation dialog. |
| **Impact** | Accidental sign-out possible. |
| **Fix Direction** | Add a confirmation bottom sheet before signing out. |

---

### L12. Double ErrorBoundary in Collections

| Field | Detail |
|-------|--------|
| **Category** | Architecture |
| **Location** | `src/routes/collections/index.tsx` and `src/features/collections/CollectionsPage.tsx` |
| **Issue** | Route file wraps in ErrorBoundary, and CollectionsPage has another internal ErrorBoundary. The fallbacks have different styles. |
| **Impact** | Redundant error handling. Confusing which fallback the user sees. |
| **Fix Direction** | Keep only one ErrorBoundary (route-level is standard). Remove the internal one. |

---

### L13. No `role="progressbar"` on Achievement Progress Bars

| Field | Detail |
|-------|--------|
| **Category** | Accessibility |
| **Location** | `src/routes/profile/achievements.tsx` |
| **Issue** | Progress bars are styled `<div>` elements without `role="progressbar"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax`. |
| **Impact** | Screen readers can't interpret the visual progress. |
| **Fix Direction** | Add `role="progressbar"` with appropriate ARIA attributes. |

---

### L14. No Tablet-Specific Layout

| Field | Detail |
|-------|--------|
| **Category** | Responsive |
| **Location** | All pages |
| **Issue** | No breakpoint between mobile (640px) and desktop. Tablets get the same layout as desktop, which can be too wide or too sparse. |
| **Impact** | Suboptimal experience on iPad/Android tablets. |
| **Fix Direction** | Consider a 768-1024px tablet breakpoint with medium-density grids. |

---

### L15. Wide PageContainer Has No Max-Width Cap

| Field | Detail |
|-------|--------|
| **Category** | Layout |
| **Location** | `src/shared/ui/PageContainer.tsx` |
| **Issue** | `width="wide"` sets `lg:max-w-none`, removing the max-width entirely. On ultrawide monitors, content stretches to fill the viewport. |
| **Impact** | Content can become uncomfortably wide. Line lengths exceed readability guidelines (60-80 characters). |
| **Fix Direction** | Set a reasonable max-width cap (e.g., 1280px or 1440px) even for "wide" pages. |

---

## Issue Summary by Category

| Category | Critical | High | Medium | Low | Total |
|----------|----------|------|--------|-----|-------|
| Accessibility | 3 | 0 | 3 | 3 | 9 |
| Consistency | 0 | 3 | 2 | 0 | 5 |
| Bug | 2 | 0 | 1 | 1 | 4 |
| Tokenization | 0 | 0 | 4 | 1 | 5 |
| Performance | 0 | 0 | 2 | 0 | 2 |
| Code Quality | 0 | 2 | 2 | 2 | 6 |
| DRY Violation | 0 | 1 | 0 | 2 | 3 |
| Architecture | 0 | 2 | 0 | 1 | 3 |
| UX | 0 | 0 | 1 | 1 | 2 |
| Visual | 0 | 0 | 0 | 2 | 2 |
| Responsive | 0 | 0 | 0 | 1 | 1 |
| Copy | 0 | 0 | 0 | 1 | 1 |
| **Total** | **5** | **8** | **17** | **15** | **45** |

---

## Priority Action Matrix

### Must Fix Before Redesign (Critical)

| ID | Issue | Effort |
|----|-------|--------|
| C1 | Collection Edit keyboard accessibility | Medium |
| C2 | Notification toggle keyboard accessibility | Low |
| C3 | Developer page deceptive interactive elements | Low |
| C4 | SafeImage error state reset | Low |
| C5 | History item onClick handlers | Low |

### Must Fix During Redesign (High)

| ID | Issue | Effort |
|----|-------|--------|
| H1 | Unify section class naming | Medium |
| H2 | Remove duplicate Phase 2.1 type classes | Low |
| H3 | Remove duplicate settings-row definition | Low |
| H4 | Add ErrorBoundary to Watchlist + Search | Low |
| H5 | Add `<Title>` to Collection routes | Low |
| H6 | Register tokens in Tailwind config | Medium |
| H7 | Merge SectionHeader into Section | Low |
| H8 | Add loading + danger to Button | Medium |

### Should Fix During Redesign (Medium)

| ID | Issue | Effort |
|----|-------|--------|
| M1 | Standardize shimmer duration | Low |
| M2 | Unify focus ring pattern | Medium |
| M3 | Tokenize semantic colors | Medium |
| M4 | Standardize gradient stops | Low |
| M5 | Tokenize hero heights | Low |
| M6 | Tokenize card widths | Low |
| M7 | Use or remove unused tokens | Low |
| M8 | Replace scroll listener with IO | Low |
| M9 | Move hover handlers to CSS | Low |
| M10 | Decompose AuthModal | Medium |
| M11 | Extract MovieCard sub-components | Medium |
| M12 | Persist notification toggles | Medium |
| M13 | Fix buildTime | Low |
| M14 | Fix version string | Low |
| M15 | Add LazyMount to Stats | Low |
| M16 | Fix filter chip touch targets | Low |
| M17 | Add ARIA to data visualizations | Medium |
