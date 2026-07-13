# CineLog V2 — Design System Architecture

> **Master architectural blueprint** for the CineLog V2 design system.
> This document describes the current state, catalogs every architectural problem,
> defines the target architecture, and outlines the migration strategy.

**Last audited:** 2026-07-13 (Sprint 1B)
**Codebase:** `src/styles/` (10,296 lines CSS) + `src/shared/ui/` (SolidJS components)

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [CSS Architecture](#2-css-architecture)
3. [Problems with Current Architecture](#3-problems-with-current-architecture)
4. [Proposed Architecture](#4-proposed-architecture)
5. [Migration Strategy](#5-migration-strategy)

---

## 1. Architecture Overview

### 1.1 Styling System Stack

CineLog V2 uses a **hybrid styling approach** — CSS custom properties for tokens, Tailwind CSS for utilities, and hand-written CSS classes for components and features:

| Layer | Technology | Scope |
|---|---|---|
| **Design Tokens** | CSS Custom Properties (`--sp-4`, `--tier-2`, `--p`, `--space-*`, `--color-*`, `--font-size-*`, `--blur-*`, `--opacity-*`, `--z-*`) | Global via `:root` in `@layer base` |
| **Utility Classes** | Tailwind CSS v3 (`flex`, `items-center`, `text-sm`, `font-display`, `bg-primary`, `shadow-card`, `rounded-pill`) | Full token integration — `theme.extend: { fontFamily, fontSize, colors, spacing, borderRadius, boxShadow, zIndex, blur, opacity, transitionDuration, transitionTimingFunction }` |
| **Component Classes** | Hand-written CSS (`.card-premium`, `.btn-primary`) | `styles/components/` |
| **Feature Classes** | Page-specific CSS (`.discover-spotlight`, `.vault-grid`) | `styles/features/` |
| **Inline Styles** | SolidJS `style={{}}` prop | Component-level overrides |
| **Animation Classes** | `.animate-*` utility classes + `@keyframes` | `tokens/motion.css` |

### 1.2 Component System

```
src/shared/ui/                    ← Shared UI primitives
├── primitives/
│   ├── Button.tsx                ← Primary button (uses .btn-primary)
│   ├── Badge.tsx                 ← Badge (uses .badge-accent)
│   ├── SectionHeader.tsx         ← Section header (uses .section-header)
│   ├── Section.tsx               ← Section wrapper (uses .section-header)
│   ├── Skeleton.tsx              ← Loading skeleton
│   ├── EmptyState.tsx            ← Empty state display
│   └── GlassCard.tsx             ← Glass morphism card
├── Icon.tsx                      ← Material Symbols icon wrapper
├── MovieCard.tsx                 ← Poster card
├── MovieCardRatings.tsx          ← Rating overlays
├── SafeImage.tsx                 ← Lazy-loading image
├── AppHeader.tsx                 ← Page header bar
├── BottomNavigation.tsx          ← Tab bar
├── PageContainer.tsx             ← Page wrapper
├── NavButton.tsx                 ← Navigation button
├── ToastContainer.tsx            ← Toast notification system
├── AuthModal.tsx                 ← Authentication modal
├── LoadingScreen.tsx             ← Full-screen loader
├── ScrollToTop.tsx               ← Scroll-to-top FAB
├── GlobalErrorBoundary.tsx       ← Error boundary
└── HighlightText.tsx             ← Search highlight

src/features/*/components/        ← Feature-scoped components
├── discover/                     ← Spotlight, DiscoverRail, CosmosView, etc.
├── details/                      ← CinematicHero, ActionDock, RatingCluster, etc.
├── watchlist/                    ← VaultCard, VaultFilters, EmptyState, etc.
├── collections/                  ← TimelineEntry, ProgressRing, FranchiseGrid, etc.
├── profile/                      ← ProfileBanner, TasteCard, ProfileSkeleton, etc.
├── search/                       ← SearchGrid, SearchFilters, SearchEmptyState, etc.
├── collection/                   ← CollectionHero, CollectionTimeline, etc.
└── sync/                         ← BackupCards, ImportHub, CloudStatusCard, etc.
```

### 1.3 Theme System

8 themes, each applied by adding a CSS class (e.g., `.theme-sage`) to the `<html>` or `<body>` element:

| Theme | Primary `--p` | Secondary `--p2` | Text on Accent `--active-text` |
|---|---|---|---|
| **pearl** | `#ffffff` | `#a0a0a0` | `#05060a` (dark) |
| **sage** *(default)* | `#a8ff78` | `#ff78c4` | `#05060a` (dark) |
| **matrix** | `#39ff14` | `#00f5a0` | `#05060a` (dark) |
| **netflix** | `#ff2d55` | `#ff9500` | `#ffffff` (white) |
| **cinematic** | `#FFD700` | `#FF6B00` | `#05060a` (dark) |
| **interstellar** | `#00c2ff` | `#f9a620` | `#05060a` (dark) |
| **neonhorizon** | `#ff2af0` | `#00ffe7` | `#ffffff` (white) |
| **vibranium** | `#9d4edd` | `#06ffd4` | `#ffffff` (white) |

Theme configuration: `src/core/theme/themes.ts`
Theme application: `src/core/theme/theme.ts` + `src/core/theme/index.ts`

### 1.4 Font System

Three font families, **all hardcoded** — not tokenized as CSS custom properties:

| Font | Usage | Loaded Via |
|---|---|---|
| **Outfit** | Body text, UI labels, buttons | Google Fonts (imported in `index.html`) |
| **Bebas Neue** | Headlines, display type, stats | Google Fonts |
| **Azeret Mono** | Metadata, labels, eyebrows, badges | Google Fonts |

**Impact:** 358 hardcoded `font-family` references across 15 CSS files + 35 inline references in 13 TSX files = **393 total hardcoded font references**.

### 1.5 CSS Layer System

All token declarations live inside `@layer base`, ensuring they load before component and utility styles. Import order in `globals.css`:

```
1. base/tailwind.css     → @tailwind directives (preflight + utilities)
2. tokens/               → CSS custom properties (:root)
3. base/                 → body styles, typography classes, scrollbar
4. layout/               → layout primitives (currently all empty)
5. utilities/            → backdrop helpers, stagger transitions
6. components/           → shared component classes
7. features/             → page-specific styles
```

> **Note:** Theme overrides (`.theme-sage { --p: ... }`) are declared **outside** `@layer base` to prevent Tailwind/Vite from tree-shaking them — this was a bug fix for "active state visibility broken in production."

---

## 2. CSS Architecture

### 2.1 File Structure (Complete)

```
src/app/globals.css                              ← Root import file (23 lines)
│
├── styles/base/tailwind.css                     ← @tailwind base/components/utilities (7 lines)
│
├── styles/tokens/
│   ├── index.css                                ← Aggregator (11 lines, imports 9 token files)
│   ├── colors.css                               ← 97+ color tokens: surface tiers, semantic, status, rating, collection (Sprint 1B expanded)
│   ├── spacing.css                              ← 22 spacing tokens: --sp-* + --space-* scale (Sprint 1B expanded)
│   ├── typography.css                           ← 47 typography tokens: font-family, font-size, font-weight, line-height, letter-spacing (Sprint 1B NEW)
│   ├── radius.css                               ← 15 radius tokens: --radius-2xs through --radius-full (Sprint 1B expanded)
│   ├── shadows.css                              ← 12 shadow tokens: named + semantic --shadow-xs through --shadow-xl (Sprint 1B expanded)
│   ├── motion.css                               ← 16 easing + 9 duration + 2 stagger + 18 keyframes + .animate-* (Sprint 1B expanded)
│   ├── z-index.css                              ← 13 z-index tokens: --z-base through --z-max + nav-height (Sprint 1B expanded)
│   ├── blur.css                                 ← 7 blur tokens: --blur-xs through --blur-3xl (Sprint 1B NEW)
│   └── opacity.css                              ← 11 opacity tokens: --opacity-disabled through --opacity-full (Sprint 1B NEW)
│
├── styles/base/
│   ├── index.css                                ← Aggregator (18 lines)
│   ├── reset.css                                ← Empty — Tailwind preflight handles it (4 lines)
│   ├── base.css                                 ← body styles, scrollbar, focus, safe-area, reduced-motion (145 lines)
│   ├── typography.css                           ← .type-* and .font-* classes (18 lines)
│   └── forms.css                                ← Empty — comment only (4 lines)
│
├── styles/layout/
│   ├── index.css                                ← Aggregator (12 lines)
│   ├── spacing.css                              ← Empty (4 lines)
│   ├── flex.css                                 ← Empty (4 lines)
│   ├── container.css                            ← Empty (5 lines)
│   └── grid.css                                 ← Empty (5 lines)
│
├── styles/utilities/
│   ├── index.css                                ← Aggregator (6 lines)
│   ├── helpers.css                              ← .backdrop-img, .backdrop-gradient (9 lines)
│   ├── visibility.css                           ← Empty (4 lines)
│   └── transitions.css                          ← .stagger, .timeline-stagger classes (18 lines)
│
├── styles/components/
│   ├── index.css                                ← Aggregator (20 lines)
│   ├── buttons.css                              ← .cinematic-close-btn only (42 lines)
│   ├── cards.css                                ← 6 card variants + progress + empty-state + settings (67 lines)
│   ├── chips.css                                ← .tag-chip, .rating-pill (8 lines)
│   ├── badges.css                               ← EMPTY — actual badges in _phase21.css (5 lines)
│   ├── inputs.css                               ← EMPTY — actual inputs in features/ (6 lines)
│   ├── navigation.css                           ← EMPTY (4 lines)
│   ├── dialogs.css                              ← Modal/sheet enter, backdrop, handle (36 lines)
│   ├── dropdown.css                             ← EMPTY (4 lines)
│   ├── skeleton.css                             ← EMPTY — actual in _phase21.css (5 lines)
│   ├── toast.css                                ← Complete toast system (157 lines)
│   ├── _phase21.css                             ← Phase 2.1 "Premium" — 25+ classes (102 lines)
│   └── _phase22_sprint1.css                     ← Phase 2.2 "V2" — 24+ classes, OVERRIDES _phase21 (215 lines)
│
└── styles/features/
    ├── index.css                                ← Aggregator (15 lines)
    ├── discover.css                             ← Discover page styles (1,896 lines)
    ├── collections.css                          ← Collections page styles (1,584 lines)
    ├── secondary.css                            ← Secondary pages — LARGEST FILE (2,217 lines)
    ├── details.css                              ← Details modal styles (1,060 lines)
    ├── profile.css                              ← Profile page styles (978 lines)
    ├── watchlist.css                            ← Watchlist/vault styles (605 lines)
    ├── search.css                               ← Search page styles (567 lines)
    └── settings.css                             ← Settings page styles (193 lines)
```

**Total: 10,296 lines** across 45 CSS files.

### 2.2 Line Count Distribution

```
Feature CSS (8 files)     9,100 lines  (88.4%)  ← Page-specific styles
Component CSS (13 files)    636 lines  ( 6.2%)  ← Shared component classes
Base CSS (5 files)          178 lines  ( 1.7%)  ← Body, typography, reset
Token CSS (7 files)         235 lines  ( 2.3%)  ← CSS custom properties
Utility CSS (3 files)        31 lines  ( 0.3%)  ← Helpers, transitions
Layout CSS (5 files)         30 lines  ( 0.3%)  ← All empty stubs
Aggregators (4 files)        86 lines  ( 0.8%)  ← Index files
```

> **Key insight:** 88% of all CSS lives in feature files. This is the main source of duplication and inconsistency.

### 2.3 Token Inventory (Current State)

#### Colors (`tokens/colors.css` — 88 lines)

**V1 (Original) tokens — 7 primitives + 4 active-state:**
```css
--void: #000000;              /* Deepest background */
--deep: #000000;              /* (alias for void — unused distinction) */
--surface: #111111;           /* Card/section background */
--raised: #1a1a1a;            /* Elevated surface */
--border: rgba(255,255,255,0.08);
--border-active: rgba(255,255,255,0.15);
--text: #e8eaf0;              /* Primary text */
--muted: rgba(232,234,240,0.42);
--dim: rgba(232,234,240,0.18);
--active-bg: var(--p);
--active-text: #05060a;
--active-border: var(--p);
--active-glow: 0 0 12px var(--p-glow);
```

**V2 (Phase 2.1) tokens — 5 tier surfaces + 5 text + 4 glass:**
```css
/* Tier-based elevation */
--tier-0: #000000;
--tier-1: #0a0b0e;
--tier-2: #111317;
--tier-3: #181b21;
--tier-4: #20242c;

/* Hairline borders */
--hairline: rgba(255,255,255,0.06);
--hairline-2: rgba(255,255,255,0.10);
--hairline-3: rgba(255,255,255,0.16);

/* Text hierarchy */
--text-strong: #ffffff;
--text-body: #e8eaf0;
--text-soft: rgba(232,234,240,0.72);
--text-muted: rgba(232,234,240,0.48);
--text-dim: rgba(232,234,240,0.24);

/* Glass morphism */
--glass-bg: rgba(17,19,23,0.72);
--glass-bg-strong: rgba(17,19,23,0.88);
--glass-border: rgba(255,255,255,0.08);
--glass-blur: 20px;
```

**Theme tokens — 8 themes, each with 5 overrides:**
```css
.theme-sage {
  --p: #a8ff78;               /* Primary accent */
  --p2: #ff78c4;              /* Secondary accent */
  --p-glow: rgba(168,255,120,0.22);  /* Glow color */
  --p-dim: rgba(168,255,120,0.08);   /* Dimmed accent */
  --active-text: #05060a;     /* Text on accent bg */
}
/* ... 7 more themes */
```

**Cinematic theme also overrides surfaces:**
```css
.theme-cinematic {
  --void: #000; --deep: #000; --surface: #111111;
  --raised: #171722; --border: rgba(255,215,0,0.1);
}
```

#### Spacing (`tokens/spacing.css` — 17 lines)

```css
--sp-1: 4px;    --sp-2: 8px;    --sp-3: 12px;
--sp-4: 16px;   --sp-5: 20px;   --sp-6: 24px;
--sp-7: 28px;   --sp-8: 32px;   --sp-10: 40px;
--sp-12: 48px;
```

**Gaps in scale:** Missing `--sp-9` (36px), `--sp-11` (44px), `--sp-14` (56px), `--sp-16` (64px). These values appear hardcoded throughout feature CSS.

#### Typography (`tokens/typography.css` — 6 lines, EMPTY)

The file exists but contains only a comment. All typography is hardcoded in:
- `base/typography.css` — 12 classes with inline `font-family`, `font-size`, `letter-spacing`
- `components/_phase21.css` — 8 more typography classes (V1)
- `components/_phase22_sprint1.css` — 9 typography classes (V2, overrides V1)

#### Radius (`tokens/radius.css` — 16 lines)

```css
--radius-sm: 8px;      --radius-md: 12px;    --radius-card: 16px;
--radius-lg: 20px;     --radius-xl: 24px;    --radius-2xl: 28px;
--radius-modal: 32px;  --radius-pill: 999px;
--touch-min: 44px;     /* ← MISPLACED: this is a sizing token, not radius */
```

#### Shadows (`tokens/shadows.css` — 16 lines)

```css
--shadow-card: ...      /* Standard card shadow */
--shadow-raised: ...    /* Elevated card shadow */
--shadow-float: ...     /* Floating/modal shadow */
--shadow-glow: ...      /* Accent glow shadow */
--shadow-premium: ...   /* Phase 2.1: layered card */
--shadow-elevated: ...  /* Phase 2.1: hover/elevated */
--shadow-hero: ...      /* Phase 2.1: hero sections */
```

#### Motion (`tokens/motion.css` — 80 lines)

**Easing tokens (5):**
```css
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
--ease-smooth: cubic-bezier(0.22, 1, 0.36, 1);
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
--ease-standard: cubic-bezier(0.2, 0, 0, 1);
```

**Duration tokens (6):**
```css
--dur-micro: 80ms;   --dur-fast: 150ms;  --dur-base: 220ms;
--dur-modal: 280ms;  --dur-page: 320ms;  --dur-slow: 450ms;
```

**Keyframes (18):** `shimmer`, `fadeUp`, `fadeIn`, `slideUp`, `slideDown`, `slideInRight`, `popIn`, `popInSpring`, `glowPulse`, `scaleIn`, `scaleFade`, `timelineItemIn`, `barGrow`, `toastIn`, `toastOut`, `sheetUp`, `softPulse`, `shimmerSlow`

**Animation utilities (12):** `.animate-fade-up`, `.animate-fade-in`, `.animate-slide-up`, `.animate-slide-down`, `.animate-slide-in-right`, `.animate-pop-in`, `.animate-pop-spring`, `.animate-scale-in`, `.animate-scale-fade`, `.animate-glow-pulse`, `.animate-timeline-in`, `.animate-bar-grow`, `.animate-soft-pulse`

#### Z-Index (`tokens/z-index.css` — 12 lines)

```css
--nav-height: 4rem;
--nav-safe-area: env(safe-area-inset-bottom, 0px);
--nav-total-height: calc(var(--nav-height) + var(--nav-safe-area));
```

**Problem:** No z-index tokens exist. This file contains only navigation height/safe-area tokens — it's misnamed.

### 2.4 V1 → V2 Typography Collision

Six class names are defined in **both** `_phase21.css` (V1) and `_phase22_sprint1.css` (V2) with **conflicting values**. Since `_phase22_sprint1.css` is imported after `_phase21.css`, V2 wins by cascade order — but this is fragile and undocumented:

| Class | V1 (`_phase21.css`) | V2 (`_phase22_sprint1.css`) | Delta |
|---|---|---|---|
| `.type-display` | `2.5rem`, `line-height: 0.95`, `letter-spacing: 0.03em` | `3.25rem`, `line-height: 0.92`, `letter-spacing: 0.02em` | **+30% size**, tighter leading |
| `.type-headline` | `1.125rem`, `font-weight: 700`, `line-height: 1.3` | `1.25rem`, `font-weight: 700`, `line-height: 1.25` | **+11% size**, tighter leading |
| `.type-body` | `0.875rem`, `line-height: 1.5` | `0.9375rem`, `line-height: 1.55` | **+7% size**, looser leading |
| `.type-body-soft` | `0.875rem`, `line-height: 1.5` | `0.9375rem`, `line-height: 1.55` | **+7% size**, looser leading |
| `.type-eyebrow` | `0.625rem`, `letter-spacing: 0.18em` | `0.6875rem`, `letter-spacing: 0.18em` | **+10% size** |
| `.type-meta` | `0.6875rem`, `letter-spacing: 0.12em` | `0.75rem`, `letter-spacing: 0.08em` | **+9% size**, tighter tracking |

V2 also adds two new classes not in V1: `.type-display-sm` and `.type-micro`.

### 2.5 Section Header Duplication

There are **three competing section header systems**:

| System | CSS Class | Font | Defined In |
|---|---|---|---|
| V1 (cards.css) | `.section-title` | Azeret Mono, 11px | `components/cards.css` |
| V1 Premium | `.section-header` + `.section-header-title` | Azeret Mono, 0.6875rem | `components/_phase21.css` |
| V2 | `.v2-section-header` + `.v2-section-title` | Bebas Neue, 1.5rem | `components/_phase22_sprint1.css` |

The SolidJS `SectionHeader` and `Section` primitives use the V1 Premium classes, while V2 pages use `.v2-section-*`.

---

## 3. Problems with Current Architecture

### 3.1 Critical Issues

#### P1: Tailwind Config Is Empty

```js
// tailwind.config.js
export default {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {}   // ← 70+ CSS custom properties are NOT mapped
  },
  plugins: []
};
```

**Impact:** Developers cannot use semantic Tailwind utilities like `bg-surface`, `text-muted`, `p-sp-4`, or `rounded-radius-card`. Instead, they must write raw CSS or use inline styles with `var(--token)`, defeating the purpose of having Tailwind in the stack.

**Evidence:** Feature CSS files are filled with `var(--sp-4)`, `var(--radius-lg)`, etc. in raw CSS because Tailwind can't reference them.

---

#### P2: Dual Color Naming Systems

Two overlapping sets of tokens create confusion and inconsistency:

| Concept | V1 Name | V2 Name | Relationship |
|---|---|---|---|
| Deepest bg | `--void` | `--tier-0` | Same value `#000` |
| Surface bg | `--surface` | `--tier-1` / `--tier-2` | V2 splits into tiers |
| Elevated bg | `--raised` | `--tier-3` / `--tier-4` | V2 provides more steps |
| Primary text | `--text` | `--text-body` | Same value `#e8eaf0` |
| White text | (hardcoded `#fff`) | `--text-strong` | V2 tokenizes it |
| Muted text | `--muted` | `--text-muted` | Different opacity (0.42 vs 0.48) |
| Dim text | `--dim` | `--text-dim` | Different opacity (0.18 vs 0.24) |
| Border | `--border` | `--hairline` | Different opacity (0.08 vs 0.06) |

**Impact:** Components mix both systems. A single feature CSS file might use `var(--surface)` for one element and `var(--tier-2)` for another with no functional difference.

---

#### P3: V1/V2 Class Collisions

Six typography classes (`.type-display`, `.type-headline`, `.type-body`, `.type-body-soft`, `.type-eyebrow`, `.type-meta`) have **conflicting values** in `_phase21.css` vs `_phase22_sprint1.css`.

The V2 values win by cascade order (imported later), but:
- Developers may not realize which version they're using
- The V1 definitions are dead code that still ships in the CSS bundle
- New contributors may reference the wrong source file for the "canonical" values
- There's no documentation indicating V2 is the source of truth

---

#### P4: Typography Has Zero Tokenization

No font-family, font-size, line-height, or letter-spacing tokens exist. The `tokens/typography.css` file is empty. Instead:

- **358 hardcoded `font-family` references** across 15 CSS files
- **35 inline `font-family` references** in 13 TSX component files
- Font sizes like `0.6875rem`, `0.8125rem`, `0.9375rem` appear dozens of times
- `letter-spacing` values (`0.02em`, `0.03em`, `0.04em`, `0.06em`, `0.08em`, `0.1em`, `0.12em`, `0.14em`, `0.16em`, `0.18em`) are repeated ad hoc

**Impact:** Changing the body font or adjusting the type scale requires editing 393+ locations across 28+ files.

---

### 3.2 High-Impact Issues

#### P5: Z-Index Tokens Don't Exist

`z-index.css` contains navigation height tokens (`--nav-height`, `--nav-safe-area`, `--nav-total-height`) — not z-index values. Throughout the codebase:

- Toast stack: `z-index: 9999` (hardcoded in `toast.css`)
- Modal backdrop: `z-[999998]` (Tailwind arbitrary value in component)
- Bottom nav: `z-40` (Tailwind utility)
- Cinematic close button: `z-index: 30` (hardcoded)
- Various overlays: `z-50`, `z-[100]`, etc.

**Impact:** No documented z-index layering. Risk of stacking context bugs when new overlays are added.

---

#### P6: 14+ Hardcoded Values in `base.css`

Values that should be tokens but are hardcoded:

```css
font-family: 'Outfit', sans-serif;        /* Should be var(--font-body) */
letter-spacing: 0.01em;                   /* Should be var(--ls-body) */
::-webkit-scrollbar { width: 4px; }       /* Should be var(--scrollbar-width) */
background: rgba(255,255,255,0.10);       /* Should be var(--hairline) */
border-radius: 4px;                        /* Should be var(--radius-xs) — doesn't exist */
max-width: 100vw;                          /* Layout token? */
padding: 1rem;                             /* Should be var(--sp-4) */
```

---

#### P7: 6 Empty Component CSS Files

Files that are stubs with comments only, while the actual styles live elsewhere:

| File | Actual Location of Styles |
|---|---|
| `badges.css` | `_phase21.css` (`.badge-accent`, `.badge-glow`) |
| `inputs.css` | `features/watchlist.css` (`.filter-select-premium`, `.filter-input-premium`) |
| `skeleton.css` | `_phase21.css` (`.skeleton-base`, `.skeleton-text`) |
| `navigation.css` | AppShell component + Tailwind utilities |
| `dropdown.css` | Native `<select>` elements |
| `forms.css` (base/) | Component-level classes in features/ |

**Impact:** New developers look for badge styles in `badges.css` and find nothing. The real styles are hidden in `_phase21.css` — a file named after a phase number, not a component.

---

#### P8: Feature CSS Contains Shared Component Definitions

Feature files (9,100 lines total) contain page-specific component classes that **should be shared** across features:

| Pattern | Feature File | Also Appears In | Count |
|---|---|---|---|
| Shimmer skeleton | discover.css, collections.css, secondary.css, etc. | 7 files, 14+ instances | 14+ |
| Page header | discover.css, watchlist.css, profile.css, etc. | 5+ files | 5+ |
| Back button | details.css, settings.css, etc. | 4+ files | 4+ |
| Poster rail | discover.css, watchlist.css, collections.css | 3+ files | 3+ |
| Empty state | discover.css, watchlist.css, search.css | 3+ files | 3+ |
| Cinematic hero gradient | discover.css, details.css, collections.css, secondary.css | 4 files | 6+ copies |

---

#### P9: 170+ Hardcoded Font-Family References

Breakdown of `font-family` references across the codebase:

| Font | CSS References | TSX References | Total |
|---|---|---|---|
| `'Outfit', sans-serif` | 190+ | 25+ | 215+ |
| `'Bebas Neue', cursive` | 85+ | 5+ | 90+ |
| `'Azeret Mono', monospace` | 83+ | 5+ | 88+ |
| **Total** | **358** | **35** | **393** |

**Impact:** If the team ever wants to swap a font (e.g., replacing Azeret Mono with JetBrains Mono), they'd need to edit 88+ locations.

---

#### P10: No Semantic Color Tokens

There are no tokens for status/semantic colors:

```css
/* These hex values are hardcoded 36+ times across 10 CSS files: */
#4ade80   /* Success green — 12+ occurrences */
#60a5fa   /* Info blue — 8+ occurrences */
#f87171   /* Error red — 12+ occurrences */
#f5c518   /* IMDb gold — 4+ occurrences */
```

Used in: toast accents, pill variants, status badges, rating indicators, progress bars, form validation.

**Impact:** Changing the success color requires finding and replacing every `#4ade80` reference. Some uses are in `rgba()` form (e.g., `rgba(74,222,128,0.08)`) making simple find-replace unreliable.

---

#### P11: 5 Different `active:scale` Values

Press/haptic feedback is inconsistent across interactive elements:

| Scale | Used By | Occurrences |
|---|---|---|
| `0.94` | `.movie-card:active` | 1 |
| `0.95` | `.cinematic-close-btn:active` | 1 |
| `0.96` | `.btn-primary`, `.btn-ghost`, `.btn-danger`, `.card-premium`, `.section-header-action` | 5+ |
| `0.97` | `.stat-card`, `.continue-card`, `.v2-card`, `.stat-premium`, `.upcoming-card` | 5+ |
| `0.98` | `.settings-row`, `.upcoming-card` | 2 |

**Impact:** Users perceive inconsistent "press feel" across the app. Some elements compress a lot (6%), some barely (2%).

---

#### P12: Backdrop Blur Hardcoded Despite Token Existing

The `--glass-blur: 20px` token exists, but hardcoded blur values appear throughout:

| Value | Token? | Occurrences |
|---|---|---|
| `blur(8px)` | No token | 3+ (`.tag-chip`, feature CSS) |
| `blur(12px)` | No token | 10+ (`.cinematic-close-btn`, `.btn-ghost`, `.badge-accent`, feature CSS) |
| `blur(24px)` | No token | 4+ (toast, feature CSS) |
| `blur(var(--glass-blur))` | Yes | 5+ (`.surface-glass`, `.v2-info-group`) |
| `blur(calc(var(--glass-blur) + 8px))` | Partial | 1 (`.surface-glass-strong`) |

**Impact:** No blur scale exists. The `--glass-blur` token only covers one value (20px), leaving 8px, 12px, and 24px untokenized.

---

#### P13: No Blur Scale Tokens

Related to P12, there is no systematic blur scale:

```css
/* Missing tokens: */
--blur-xs: 4px;    /* Subtle overlay blur */
--blur-sm: 8px;    /* Tag/chip blur */
--blur-md: 12px;   /* Button/overlay blur */
--blur-lg: 20px;   /* (exists as --glass-blur) */
--blur-xl: 24px;   /* Toast/modal blur */
--blur-backdrop: 20px; /* Semantic alias for backdrop-filter */
```

---

#### P14: No Opacity Scale Tokens

Opacity values appear as raw numbers throughout the CSS:

```css
opacity: 0;        /* Initial state for fade-in images */
opacity: 0.5;      /* :disabled state */
opacity: 0.4;      /* :disabled state (inconsistent with 0.5) */
opacity: 0.08;     /* Surface overlays */
opacity: 0.12;     /* Tinted backgrounds */
opacity: 0.24;     /* Dim text backgrounds */
```

No `--opacity-disabled`, `--opacity-overlay`, etc. tokens exist.

---

#### P15: Cinematic Hero Gradient Copy-Pasted 6+ Times

The hero gradient overlay is duplicated across at least 4 feature CSS files:

```css
/* Appears in: discover.css, details.css, collections.css, secondary.css */
background: linear-gradient(
  to top,
  rgba(0,0,0,1.00) 0%,
  rgba(0,0,0,0.80) 25%,
  rgba(0,0,0,0.30) 55%,
  rgba(0,0,0,0.05) 100%
),
linear-gradient(to right, rgba(0,0,0,0.50) 0%, transparent 50%);
```

Each copy has **slight variations** in opacity values and stop positions, creating visual inconsistency between hero sections on different pages.

---

#### P16: Status Colors Hardcoded 36+ Times

Breakdown of hardcoded status color usage:

| Color | Usage | Files | Count |
|---|---|---|---|
| `#4ade80` / `rgba(74,222,128,...)` | Success states, watching status | 10 files | 12+ |
| `#f87171` / `rgba(248,113,113,...)` | Error states, danger buttons | 6+ files | 12+ |
| `#60a5fa` / `rgba(96,165,250,...)` | Info states, secondary accent | 6+ files | 8+ |
| `#f5c518` | IMDb rating color | 4+ files | 4+ |

These appear in: toast stripes, pill variants, status badges, danger buttons, rating overlays, and progress indicators.

---

#### P17: Shimmer Skeleton Pattern Duplicated 14+ Times

The shimmer loading animation appears in multiple forms:

```css
/* Variant 1 — poster loading (cards.css, feature files) */
background: linear-gradient(105deg, rgba(255,255,255,0.00) 25%,
  rgba(255,255,255,0.055) 50%, rgba(255,255,255,0.00) 75%),
  linear-gradient(to bottom, #161616, #0e0e0e);
background-size: 300% 100%, 100% 100%;
animation: shimmer 1.4s ease-in-out infinite;

/* Variant 2 — premium skeleton (_phase21.css) */
background: linear-gradient(105deg, rgba(255,255,255,0.02) 25%,
  rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.02) 75%);
background-size: 300% 100%;
animation: shimmer 1.6s ease-in-out infinite;

/* Variant 3 — text skeleton (_phase21.css) */
background: linear-gradient(105deg, rgba(255,255,255,0.03) 25%,
  rgba(255,255,255,0.07) 50%, rgba(255,255,255,0.03) 75%);
animation: shimmer 1.6s ease-in-out infinite;
```

Variations exist in: `cards.css`, `_phase21.css`, and 7+ feature CSS files. The highlight opacity ranges from `0.02` to `0.07` and animation speed from `1.4s` to `1.6s`.

---

#### P18: Icon Component Bypassed by 5+ Components

The `Icon` component exists at `src/shared/ui/Icon.tsx` but is bypassed by components that use raw `<span class="material-symbols-outlined">` directly:

**In `SectionHeader.tsx`:**
```tsx
<span
  class="material-symbols-outlined"
  style={{ "font-size": "14px", color: "var(--p)" }}
  aria-hidden="true"
>
  {props.icon}
</span>
```

**In `Section.tsx`:**
```tsx
<span
  class="material-symbols-outlined"
  style={{ "font-size": "12px" }}
  aria-hidden="true"
>
  arrow_forward
</span>
```

**297 total occurrences** of `material-symbols-outlined` across 96 TSX/TS files, most of which bypass the `Icon` component.

**Impact:** Icon styling (font-variation-settings, accessibility attributes) is duplicated. The `Icon` component's `fill` prop, `aria-label` support, and `role` attribute are lost.

---

### 3.3 Problem Severity Matrix

| # | Problem | Severity | Blast Radius | Fix Effort |
|---|---|---|---|---|
| P1 | Empty Tailwind config | **Critical** | All developers | Medium |
| P2 | Dual color naming | **Critical** | All CSS files | High |
| P3 | V1/V2 class collisions | **Critical** | Typography system | Medium |
| P4 | No typography tokens | **Critical** | 393 references | High |
| P5 | No z-index tokens | **High** | Overlay system | Low |
| P6 | Hardcoded base.css values | **High** | Foundation layer | Low |
| P7 | 6 empty component stubs | **Medium** | Developer confusion | Low |
| P8 | Shared patterns in features | **High** | 9,100 lines of feature CSS | High |
| P9 | 393 hardcoded fonts | **High** | All CSS + components | Medium |
| P10 | No semantic colors | **High** | 36+ references | Medium |
| P11 | 5 different active:scale | **Medium** | Interaction consistency | Low |
| P12 | Hardcoded blur values | **Medium** | 40+ references | Low |
| P13 | No blur scale | **Medium** | Glass system | Low |
| P14 | No opacity scale | **Medium** | Transparency system | Low |
| P15 | Hero gradient copy-paste | **Medium** | 4+ feature files | Low |
| P16 | Hardcoded status colors | **High** | 36+ references | Medium |
| P17 | Shimmer duplication | **Medium** | 14+ instances | Low |
| P18 | Icon component bypass | **Medium** | 297 references | Medium |

---

## 4. Proposed Architecture

### 4.1 Target Token Layer (CSS Custom Properties)

The proposed token layer resolves the dual naming system, fills all gaps, and adds missing semantic tokens:

#### `tokens/colors.css` — Unified Color System

```css
@layer base {
  :root {
    /* ═══ SURFACE ELEVATION (replaces --void/--deep/--surface/--raised) ═══ */
    --tier-0: #000000;         /* The void — deepest background */
    --tier-1: #0a0b0e;         /* Page background */
    --tier-2: #111317;         /* Card / section background */
    --tier-3: #181b21;         /* Elevated surface */
    --tier-4: #20242c;         /* Highest elevation */

    /* ═══ TEXT HIERARCHY (replaces --text/--muted/--dim) ═══ */
    --text-strong: #ffffff;    /* Headlines, key data */
    --text-body: #e8eaf0;      /* Primary reading */
    --text-soft: rgba(232,234,240,0.72);  /* Secondary text */
    --text-muted: rgba(232,234,240,0.48); /* Metadata, labels */
    --text-dim: rgba(232,234,240,0.24);   /* Disabled, placeholders */

    /* ═══ BORDERS (replaces --border/--border-active) ═══ */
    --hairline: rgba(255,255,255,0.06);   /* Subtle divider */
    --hairline-2: rgba(255,255,255,0.10); /* Default border */
    --hairline-3: rgba(255,255,255,0.16); /* Active / hover border */

    /* ═══ GLASS MORPHISM ═══ */
    --glass-bg: rgba(17,19,23,0.72);
    --glass-bg-strong: rgba(17,19,23,0.88);
    --glass-border: rgba(255,255,255,0.08);
    --glass-blur: var(--blur-lg);   /* Reference to blur scale */

    /* ═══ ACTIVE / INTERACTION ═══ */
    --active-bg: var(--p);
    --active-text: #05060a;
    --active-border: var(--p);
    --active-glow: 0 0 12px var(--p-glow);
    --scale-active: 0.96;           /* NEW: standardized press scale */

    /* ═══ SEMANTIC STATUS COLORS (NEW) ═══ */
    --color-success: #4ade80;
    --color-success-dim: rgba(74,222,128,0.08);
    --color-success-border: rgba(74,222,128,0.25);
    --color-error: #f87171;
    --color-error-dim: rgba(248,113,113,0.12);
    --color-error-border: rgba(248,113,113,0.30);
    --color-warning: #f5c518;
    --color-warning-dim: rgba(245,197,24,0.08);
    --color-warning-border: rgba(245,197,24,0.25);
    --color-info: #60a5fa;
    --color-info-dim: rgba(96,165,250,0.08);
    --color-info-border: rgba(96,165,250,0.25);

    /* ═══ DOMAIN-SPECIFIC COLORS (NEW) ═══ */
    --color-imdb: #f5c518;
    --color-rt: #fa320a;
    --color-gold: #FFD700;
    --color-watching: #4ade80;
    --color-completed: #60a5fa;
    --color-danger: #f87171;     /* Alias: --color-error */

    /* ═══ DEPRECATED (kept for backward compat, point to new tokens) ═══ */
    --void: var(--tier-0);
    --deep: var(--tier-0);
    --surface: var(--tier-1);
    --raised: var(--tier-3);
    --border: var(--hairline);
    --border-active: var(--hairline-2);
    --text: var(--text-body);
    --muted: var(--text-muted);
    --dim: var(--text-dim);
  }
}
```

#### `tokens/typography.css` — Font Token System (NEW)

```css
@layer base {
  :root {
    /* ═══ FONT FAMILIES ═══ */
    --font-body: 'Outfit', sans-serif;
    --font-headline: 'Bebas Neue', cursive;
    --font-mono: 'Azeret Mono', monospace;

    /* ═══ FONT SIZE SCALE ═══ */
    --fs-micro: 0.5rem;        /* 8px — badges, chips */
    --fs-xs: 0.5625rem;        /* 9px — micro-labels */
    --fs-sm: 0.625rem;         /* 10px — eyebrows */
    --fs-base-sm: 0.6875rem;   /* 11px — metadata, section titles */
    --fs-base: 0.75rem;        /* 12px — small body, buttons */
    --fs-md: 0.8125rem;        /* 13px — default body */
    --fs-lg: 0.875rem;         /* 14px — large body */
    --fs-xl: 0.9375rem;        /* 15px — emphasized body */
    --fs-2xl: 1rem;            /* 16px — small headline */
    --fs-3xl: 1.125rem;        /* 18px — headline */
    --fs-4xl: 1.25rem;         /* 20px — large headline */
    --fs-5xl: 1.5rem;          /* 24px — section title */
    --fs-6xl: 2rem;            /* 32px — stat */
    --fs-7xl: 2.5rem;          /* 40px — display */
    --fs-8xl: 3.25rem;         /* 52px — display large */

    /* ═══ LINE HEIGHT SCALE ═══ */
    --lh-tight: 0.92;
    --lh-headline: 1;
    --lh-snug: 1.25;
    --lh-default: 1.3;
    --lh-relaxed: 1.5;
    --lh-loose: 1.55;

    /* ═══ LETTER SPACING SCALE ═══ */
    --ls-tight: -0.01em;
    --ls-normal: 0.01em;       /* body default */
    --ls-wide: 0.02em;         /* display */
    --ls-wider: 0.03em;        /* headline */
    --ls-tracking: 0.08em;     /* meta */
    --ls-label: 0.12em;        /* labels */
    --ls-caps: 0.14em;         /* uppercase labels */
    --ls-wide-caps: 0.16em;    /* wide caps */
    --ls-ultra-caps: 0.18em;   /* eyebrow */
  }
}
```

#### `tokens/spacing.css` — Complete Spacing Scale

```css
@layer base {
  :root {
    --sp-0: 0px;
    --sp-0.5: 2px;
    --sp-1: 4px;
    --sp-1.5: 6px;
    --sp-2: 8px;
    --sp-3: 12px;
    --sp-4: 16px;
    --sp-5: 20px;
    --sp-6: 24px;
    --sp-7: 28px;
    --sp-8: 32px;
    --sp-9: 36px;      /* NEW */
    --sp-10: 40px;
    --sp-11: 44px;     /* NEW */
    --sp-12: 48px;
    --sp-14: 56px;     /* NEW */
    --sp-16: 64px;     /* NEW */
    --sp-20: 80px;     /* NEW */
    --sp-24: 96px;     /* NEW */
  }
}
```

#### `tokens/radius.css` — Cleaned Up

```css
@layer base {
  :root {
    --radius-xs: 4px;     /* NEW — scrollbar, focus ring, micro elements */
    --radius-sm: 6px;     /* Changed from 8px — was too close to md */
    --radius-md: 8px;     /* Changed from 12px — rebalanced */
    --radius-lg: 12px;    /* Changed from 20px — rebalanced */
    --radius-card: 16px;
    --radius-xl: 20px;    /* Changed from 24px */
    --radius-2xl: 24px;   /* Changed from 28px */
    --radius-modal: 28px; /* Changed from 32px */
    --radius-pill: 999px;
    /* --touch-min MOVED to tokens/sizing.css */
  }
}
```

> **Note:** The radius changes above represent the *target* values. Migration would require updating all references. An alternative is to keep current values and only add `--radius-xs` + move `--touch-min`.

#### `tokens/sizing.css` — NEW File

```css
@layer base {
  :root {
    --touch-min: 44px;           /* Minimum touch target size */
    --nav-height: 4rem;
    --nav-safe-area: env(safe-area-inset-bottom, 0px);
    --nav-total-height: calc(var(--nav-height) + var(--nav-safe-area));
  }
}
```

#### `tokens/shadows.css` — Extended

```css
/* Existing tokens remain, plus: */
@layer base {
  :root {
    /* ... existing 7 shadow tokens ... */

    /* NEW — specialized shadows */
    --shadow-text-hero: 0 2px 12px rgba(0,0,0,1);     /* Hero text overlay */
    --shadow-chip: 0 1px 4px rgba(0,0,0,0.4);          /* Tag chips */
    --shadow-inset-top: inset 0 1px 0 rgba(255,255,255,0.04); /* Top edge highlight */
  }
}
```

#### `tokens/motion.css` — Extended

```css
/* Existing tokens remain, plus: */
@layer base {
  :root {
    /* NEW duration */
    --dur-shimmer: 1.6s;       /* Standardized shimmer speed */

    /* NEW interaction */
    --scale-active: 0.96;      /* Standardized press scale */
    --scale-hover-lift: -3px;  /* Standardized hover lift */
  }
}
```

#### `tokens/z-index.css` — Actual Z-Index Scale

```css
@layer base {
  :root {
    /* Z-index scale — clear layering from bottom to top */
    --z-base: 0;
    --z-raised: 10;
    --z-sticky: 20;
    --z-nav: 40;
    --z-overlay: 50;
    --z-dropdown: 100;
    --z-sheet: 500;
    --z-modal: 1000;
    --z-toast: 9000;
    --z-tooltip: 9500;
    --z-max: 99999;
  }
}
```

Nav-height tokens move to `tokens/sizing.css`.

#### `tokens/opacity.css` — NEW File

```css
@layer base {
  :root {
    --opacity-disabled: 0.4;
    --opacity-placeholder: 0.24;
    --opacity-overlay: 0.5;
    --opacity-hover: 0.08;
    --opacity-active: 0.12;
    --opacity-backdrop: 0.72;
    --opacity-backdrop-strong: 0.88;
  }
}
```

#### `tokens/blur.css` — NEW File

```css
@layer base {
  :root {
    --blur-xs: 4px;
    --blur-sm: 8px;
    --blur-md: 12px;
    --blur-lg: 20px;      /* Same as current --glass-blur */
    --blur-xl: 24px;
    --blur-backdrop: var(--blur-lg);  /* Semantic alias */
  }
}
```

#### `tokens/gradients.css` — NEW File

```css
@layer base {
  :root {
    /* Cinematic hero gradient — single source of truth */
    --gradient-hero:
      linear-gradient(to top,
        rgba(0,0,0,1.00) 0%,
        rgba(0,0,0,0.80) 25%,
        rgba(0,0,0,0.30) 55%,
        rgba(0,0,0,0.05) 100%
      ),
      linear-gradient(to right,
        rgba(0,0,0,0.50) 0%,
        transparent 50%
      );

    /* Backdrop gradient — page-level backgrounds */
    --gradient-backdrop:
      linear-gradient(to top,
        rgba(8,9,11,1.00) 0%,
        rgba(8,9,11,0.88) 20%,
        rgba(8,9,11,0.50) 45%,
        rgba(8,9,11,0.12) 70%,
        transparent 100%
      ),
      linear-gradient(to right,
        rgba(8,9,11,0.60) 0%,
        transparent 45%
      );

    /* Card gradient — poster overlay */
    --gradient-card:
      linear-gradient(to top,
        rgba(0,0,0,0.97) 0%,
        rgba(0,0,0,0.75) 28%,
        rgba(0,0,0,0.18) 55%,
        rgba(0,0,0,0.08) 75%,
        transparent 100%
      ),
      linear-gradient(to bottom,
        rgba(0,0,0,0.45) 0%,
        transparent 30%
      );
  }
}
```

> **Note:** CSS custom properties cannot store `linear-gradient` values directly for use in `background`. These would be used via utility classes (`.gradient-hero`, `.gradient-card`) that reference the same visual definition. Alternatively, use CSS `@property` with `<image>` syntax (limited browser support). The practical approach is shared CSS classes.

### 4.2 Target Component Layer (CSS Classes)

#### Consolidation: Remove V1 Duplicates

**Delete from `_phase21.css`** (move to `_phase22_sprint1.css` as canonical):

| Class | Action |
|---|---|
| `.type-display` | Remove from `_phase21`, V2 value is canonical |
| `.type-headline` | Remove from `_phase21`, V2 value is canonical |
| `.type-body` | Remove from `_phase21`, V2 value is canonical |
| `.type-body-soft` | Remove from `_phase21`, V2 value is canonical |
| `.type-eyebrow` | Remove from `_phase21`, V2 value is canonical |
| `.type-meta` | Remove from `_phase21`, V2 value is canonical |

**Keep in `_phase21.css`** (unique, not in V2):

| Class | Action |
|---|---|
| `.type-display-lg` | Keep (renamed from V1; V2 has `.type-display-sm` instead) |
| `.type-stat-lg` | Keep (unique to V1) |
| `.surface-*` classes | Keep (no V2 equivalent) |
| `.card-premium` | Merge with `.v2-card` → single system |
| `.btn-primary`, `.btn-ghost`, `.btn-danger` | Keep (foundational, no V2 replacement) |
| `.badge-accent`, `.badge-glow` | Move to `badges.css` (fill empty stub) |
| `.skeleton-base`, `.skeleton-text` | Move to `skeleton.css` (fill empty stub) |
| `.empty-premium` | Consolidate with `.empty-state` |
| `.section-header*` | Map to `.v2-section-header*` or vice versa |
| `.hero-premium` | Consolidate with `.featured-hero` |
| `.rail-premium` | Move to `components/rails.css` |

#### Extract Shared Patterns from Features → Components

| New Component File | Extracted From | Classes |
|---|---|---|
| `components/skeleton.css` | `_phase21.css` + features/* | `.skeleton-base`, `.skeleton-text`, `.skeleton-poster`, `.skeleton-card` |
| `components/badges.css` | `_phase21.css` | `.badge-accent`, `.badge-glow` |
| `components/inputs.css` | `features/watchlist.css` | `.filter-select-premium`, `.filter-input-premium` |
| `components/rails.css` (NEW) | `features/*` | `.rail-premium`, horizontal scroll rail base |
| `components/page-headers.css` (NEW) | `features/*` | Shared page header/back button pattern |
| `components/gradients.css` (NEW) | `features/*` | `.gradient-hero`, `.gradient-card`, `.gradient-backdrop` |

#### Fill Empty Stubs

| File | Current | Target |
|---|---|---|
| `badges.css` | Empty comment | `.badge-accent`, `.badge-glow` (from `_phase21.css`) |
| `inputs.css` | Empty comment | `.filter-select-premium`, `.filter-input-premium` (from `features/watchlist.css`) |
| `skeleton.css` | Empty comment | `.skeleton-base`, `.skeleton-text` (from `_phase21.css`) |
| `navigation.css` | Empty comment | Bottom nav custom styles (if any beyond Tailwind) |
| `dropdown.css` | Empty comment | Custom dropdown styles (if needed) |
| `forms.css` | Empty comment | Base form element styles |

#### Remove `--touch-min` from `radius.css`

Move to `tokens/sizing.css` where it logically belongs.

### 4.3 Target Tailwind Integration

Map all CSS custom properties to Tailwind's `theme.extend`:

```js
// tailwind.config.js
export default {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      // ─── Colors ───
      colors: {
        tier: {
          0: 'var(--tier-0)',
          1: 'var(--tier-1)',
          2: 'var(--tier-2)',
          3: 'var(--tier-3)',
          4: 'var(--tier-4)',
        },
        accent: {
          DEFAULT: 'var(--p)',
          secondary: 'var(--p2)',
          glow: 'var(--p-glow)',
          dim: 'var(--p-dim)',
        },
        surface: {
          DEFAULT: 'var(--tier-2)',
          raised: 'var(--tier-3)',
        },
        text: {
          strong: 'var(--text-strong)',
          body: 'var(--text-body)',
          soft: 'var(--text-soft)',
          muted: 'var(--text-muted)',
          dim: 'var(--text-dim)',
        },
        hairline: {
          DEFAULT: 'var(--hairline)',
          2: 'var(--hairline-2)',
          3: 'var(--hairline-3)',
        },
        success: 'var(--color-success)',
        error: 'var(--color-error)',
        warning: 'var(--color-warning)',
        info: 'var(--color-info)',
        imdb: 'var(--color-imdb)',
      },

      // ─── Spacing ───
      spacing: {
        'sp-0': 'var(--sp-0)',
        'sp-0.5': 'var(--sp-0.5)',
        'sp-1': 'var(--sp-1)',
        'sp-1.5': 'var(--sp-1.5)',
        'sp-2': 'var(--sp-2)',
        'sp-3': 'var(--sp-3)',
        'sp-4': 'var(--sp-4)',
        'sp-5': 'var(--sp-5)',
        'sp-6': 'var(--sp-6)',
        'sp-7': 'var(--sp-7)',
        'sp-8': 'var(--sp-8)',
        'sp-9': 'var(--sp-9)',
        'sp-10': 'var(--sp-10)',
        'sp-11': 'var(--sp-11)',
        'sp-12': 'var(--sp-12)',
        'sp-14': 'var(--sp-14)',
        'sp-16': 'var(--sp-16)',
        'sp-20': 'var(--sp-20)',
        'sp-24': 'var(--sp-24)',
      },

      // ─── Border Radius ───
      borderRadius: {
        xs: 'var(--radius-xs)',
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        card: 'var(--radius-card)',
        xl: 'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
        modal: 'var(--radius-modal)',
        pill: 'var(--radius-pill)',
      },

      // ─── Font Families ───
      fontFamily: {
        body: ['var(--font-body)'],
        headline: ['var(--font-headline)'],
        mono: ['var(--font-mono)'],
      },

      // ─── Font Sizes ───
      fontSize: {
        micro: ['var(--fs-micro)', { lineHeight: '1' }],
        xs: ['var(--fs-xs)', { lineHeight: '1' }],
        sm: ['var(--fs-sm)', { lineHeight: '1.2' }],
        'base-sm': ['var(--fs-base-sm)', { lineHeight: '1.2' }],
        base: ['var(--fs-base)', { lineHeight: '1.4' }],
        md: ['var(--fs-md)', { lineHeight: '1.4' }],
        lg: ['var(--fs-lg)', { lineHeight: '1.5' }],
        xl: ['var(--fs-xl)', { lineHeight: '1.55' }],
        '2xl': ['var(--fs-2xl)', { lineHeight: '1.3' }],
        '3xl': ['var(--fs-3xl)', { lineHeight: '1.25' }],
        '4xl': ['var(--fs-4xl)', { lineHeight: '1.25' }],
        '5xl': ['var(--fs-5xl)', { lineHeight: '1' }],
        '6xl': ['var(--fs-6xl)', { lineHeight: '1' }],
        '7xl': ['var(--fs-7xl)', { lineHeight: '0.95' }],
        '8xl': ['var(--fs-8xl)', { lineHeight: '0.92' }],
      },

      // ─── Box Shadows ───
      boxShadow: {
        card: 'var(--shadow-card)',
        raised: 'var(--shadow-raised)',
        float: 'var(--shadow-float)',
        glow: 'var(--shadow-glow)',
        premium: 'var(--shadow-premium)',
        elevated: 'var(--shadow-elevated)',
        hero: 'var(--shadow-hero)',
      },

      // ─── Z-Index ───
      zIndex: {
        base: 'var(--z-base)',
        raised: 'var(--z-raised)',
        sticky: 'var(--z-sticky)',
        nav: 'var(--z-nav)',
        overlay: 'var(--z-overlay)',
        dropdown: 'var(--z-dropdown)',
        sheet: 'var(--z-sheet)',
        modal: 'var(--z-modal)',
        toast: 'var(--z-toast)',
        tooltip: 'var(--z-tooltip)',
        max: 'var(--z-max)',
      },

      // ─── Animations ───
      animation: {
        'fade-up': 'fadeUp var(--dur-page) var(--ease-smooth) both',
        'fade-in': 'fadeIn var(--dur-base) ease-out both',
        'slide-up': 'slideUp var(--dur-page) var(--ease-smooth) both',
        'pop-in': 'popIn var(--dur-modal) var(--ease-smooth) both',
        'shimmer': 'shimmer var(--dur-shimmer) ease-in-out infinite',
      },

      // ─── Transition Timing ───
      transitionTimingFunction: {
        spring: 'var(--ease-spring)',
        smooth: 'var(--ease-smooth)',
        standard: 'var(--ease-standard)',
      },
      transitionDuration: {
        micro: 'var(--dur-micro)',
        fast: 'var(--dur-fast)',
        base: 'var(--dur-base)',
        modal: 'var(--dur-modal)',
        page: 'var(--dur-page)',
        slow: 'var(--dur-slow)',
      },

      // ─── Backdrop Blur ───
      backdropBlur: {
        xs: 'var(--blur-xs)',
        sm: 'var(--blur-sm)',
        md: 'var(--blur-md)',
        lg: 'var(--blur-lg)',
        xl: 'var(--blur-xl)',
      },
    },
  },
  plugins: [],
};
```

**Usage examples after integration:**

```html
<!-- Before (raw CSS): -->
<div class="surface-raised" style="padding: var(--sp-4); border-radius: var(--radius-lg)">

<!-- After (Tailwind): -->
<div class="bg-tier-3 p-sp-4 rounded-lg shadow-premium">
```

```html
<!-- Before (hardcoded font): -->
<span style="font-family: 'Azeret Mono', monospace; font-size: 0.6875rem; letter-spacing: 0.18em">

<!-- After (Tailwind): -->
<span class="font-mono text-base-sm tracking-ultra-caps">
```

### 4.4 Target Component Architecture (SolidJS)

#### Promote Shared Primitives

Components that are currently duplicated across features should be promoted to `src/shared/ui/`:

| Component | Current Location | Target Location | Notes |
|---|---|---|---|
| BottomSheet | features/details, features/collection | `shared/ui/BottomSheet.tsx` | Modal + sheet combined |
| PosterRail | features/discover, features/watchlist | `shared/ui/PosterRail.tsx` | Horizontal scroll rail |
| LazyMount | features/discover | `shared/ui/LazyMount.tsx` | Intersection observer wrapper |
| StatusLabel | features/watchlist, features/details | `shared/ui/StatusLabel.tsx` | Watching/completed/dropped |
| EmptyState | features/watchlist, features/search, features/discover | `shared/ui/primitives/EmptyState.tsx` | Already exists, needs consolidation |
| Skeleton | features/discover, features/details, features/profile | `shared/ui/primitives/Skeleton.tsx` | Already exists, needs consolidation |

#### Fix Icon Component Bypass

**Current (bypassed):**
```tsx
<span class="material-symbols-outlined" style={{ "font-size": "14px", color: "var(--p)" }}>
  {props.icon}
</span>
```

**Target (using Icon component):**
```tsx
<Icon name={props.icon} class="text-sm text-accent" />
```

This requires:
1. Adding Tailwind size/color support to `Icon.tsx`
2. Migrating all 297 `material-symbols-outlined` usages to `<Icon>`
3. Ensuring `aria-hidden` and `role` are handled consistently

#### Consolidate SectionHeader / Section Duplication

The `SectionHeader` and `Section` components both render `.section-header` internals, with inline icon rendering. Target:

```tsx
// Section.tsx — uses SectionHeader internally
<Section title="Continue Watching" icon="play_circle" actionLabel="View All">
  <Rail>{cards}</Rail>
</Section>

// SectionHeader.tsx — standalone header (when no content wrapper needed)
<SectionHeader title="Stats" icon="bar_chart" />
```

Both should use `Icon` component instead of raw `<span>`.

#### Consolidate V1/V2 CSS Section Headers

| Current | Target |
|---|---|
| `.section-title` (cards.css) | **Remove** — superseded by V2 |
| `.section-header` + `.section-header-title` (_phase21) | **Rename** → `.v2-section-header` family, or keep and deprecate `.v2-*` prefix |
| `.v2-section-header` + `.v2-section-title` (_phase22) | **Promote** → drop `v2-` prefix, make canonical |

---

### 4.5 Premium Shared UI Layer (Sprint 2A)

> **Status:** READY — Infrastructure complete, not yet consumed by any existing page.

Sprint 2A introduced a new premium component layer at `src/shared/ui/premium/` that represents the **target architecture** for the entire design system. This layer was built additive-only — zero existing files were modified.

#### Location & Structure

```
src/shared/ui/premium/
├── layout/        → 5 components (page, section, content, hero, rail containers)
├── cards/         → 7 components (card, hero-card, stat, mini, horizontal, poster-stack, collection-preview)
├── surfaces/      → 5 components (surface, glass, gradient, overlay, backdrop)
├── buttons/       → 6 components (button, icon-button, floating, action-row, bottom-bar, toolbar)
├── chips/         → 3 components (chip, tag, pill)
├── feedback/      → 5 components (badge, divider, empty-state, skeleton, carousel-header)
├── navigation/    → 2 components (page-header, section-header)
├── display/       → 12 components (avatar, profile-stat, rating, status-badge, media-info, provider-chip, metric, label, meta-row, info-row, list-item, timeline-row)
├── loading/       → Re-exports PremiumSkeleton from feedback/
└── empty/         → Re-exports PremiumEmptyState from feedback/
```

**Total: 43 components across 10 groups.**

#### Token-Only Architecture

All 43 components follow a strict token-only contract:

| Rule | Enforcement |
|------|-------------|
| **Zero hardcoded colors** | All colors reference `--tier-*`, `--text-*`, `--p-*`, `--hairline-*`, `--color-*` tokens |
| **Zero hardcoded spacing** | All spacing references `--sp-*` or `--space-*` tokens |
| **Zero hardcoded radii** | All border-radius references `--radius-*` tokens |
| **Zero hardcoded shadows** | All box-shadow references `--shadow-*` tokens |
| **Zero hardcoded durations** | All transition-duration references `--dur-*` tokens |
| **Zero hardcoded typography** | All font references `--font-*`, `--fs-*`, `--lh-*` tokens |

#### State Machine Pattern

Every component implements a consistent state machine:

```
┌─────────┐  hover   ┌────────┐  press   ┌─────────┐
│  default │ ──────► │ hover  │ ──────► │ active  │
│         │ ◄────── │        │ ◄────── │         │
└─────────┘  leave  └────────┘  release └─────────┘
     │                                           │
     │ disabled                                  │ loading
     ▼                                           ▼
┌──────────┐                               ┌─────────┐
│ disabled │                               │ loading │
└──────────┘                               └─────────┘
```

- **Variants**: `variant` prop with string union (e.g., `"default" | "primary" | "ghost"`)
- **Sizes**: `size` prop with `"sm" | "md" | "lg"` (default: `"md"`)
- **States**: `disabled`, `loading`, `active` props with visual feedback

#### Accessibility Requirements (Met)

| Requirement | Implementation |
|-------------|---------------|
| ARIA attributes | `role`, `aria-label`, `aria-describedby`, `aria-disabled` applied per component semantics |
| Keyboard navigation | Focusable elements support `Enter`/`Space` activation, proper `Tab` order |
| Focus indicators | Visible focus rings via `--focus-ring` token, `focus-visible` only (no mouse focus ring) |
| Reduced motion | All animations wrapped in `@media (prefers-reduced-motion: no-preference)` |
| Touch targets | Minimum 44×44px via `--touch-min` token for all interactive elements |

#### Consumption Status — Migration In Progress

The premium layer is now consumed by the Profile page (Sprint 2B complete). Remaining pages migrate in future sprints:

| Phase | Action | Risk | Status |
|-------|--------|------|--------|
| Sprint 2B | Migrate Profile page onto premium components | Medium — page refactor | **COMPLETE** |
| Sprint 2C | Migrate Dashboard/Discover onto premium components | Medium-High — largest pages | Pending |
| Sprint 2D | Migrate Watchlist onto premium components | Medium | Pending |
| Sprint 2E+ | Migrate remaining pages (Details, Search, Collections, Settings) | Medium | Pending |

---

## 5. Migration Strategy

### Phase 1: Token Consolidation (1–2 weeks)

**Goal:** Resolve dual naming, add missing tokens, establish single source of truth.

| Step | Action | Risk |
|---|---|---|
| 1.1 | Add font tokens to `tokens/typography.css` | Low — additive only |
| 1.2 | Add `--font-body`, `--font-headline`, `--font-mono` to `:root` | Low — additive only |
| 1.3 | Add semantic color tokens (`--color-success`, etc.) to `colors.css` | Low — additive only |
| 1.4 | Add missing spacing tokens (`--sp-9`, `--sp-11`, `--sp-14`, `--sp-16`) | Low — additive only |
| 1.5 | Add `--radius-xs` to `radius.css`, move `--touch-min` to new `sizing.css` | Low — move, not remove |
| 1.6 | Add z-index scale to `z-index.css`, move nav-height to `sizing.css` | Medium — existing `z-40`, `z-50` Tailwind values need audit |
| 1.7 | Add `--blur-*` tokens to new `blur.css` | Low — additive only |
| 1.8 | Add `--opacity-*` tokens to new `opacity.css` | Low — additive only |
| 1.9 | Add `--scale-active: 0.96` to `motion.css` | Low — additive only |
| 1.10 | Add gradient utility classes to new `gradients.css` | Low — additive only |
| 1.11 | Make V1 tokens point to V2: `--void: var(--tier-0)`, `--text: var(--text-body)`, etc. | **Medium** — changes computed values slightly (e.g., `--muted` opacity 0.42 → 0.48) |
| 1.12 | Add new shadow tokens (`--shadow-text-hero`, `--shadow-chip`, `--shadow-inset-top`) | Low — additive only |

**Validation:** Visual regression test on all 8 themes. Check that deprecated V1 tokens still resolve correctly.

### Phase 2: Tailwind Integration (1 week)

**Goal:** Map all CSS custom properties to `tailwind.config.js` `theme.extend`.

| Step | Action | Risk |
|---|---|---|
| 2.1 | Populate `theme.extend` with color, spacing, radius mappings | Low — Tailwind generates utilities that coexist with CSS |
| 2.2 | Add font-family, font-size, line-height mappings | Low — new `font-body`, `text-3xl` etc. utilities |
| 2.3 | Add shadow, z-index, animation mappings | Low |
| 2.4 | Add backdrop-blur, transition-timing, transition-duration mappings | Low |
| 2.5 | Verify no Tailwind utility name conflicts | Medium — check for `bg-tier-1` vs existing Tailwind defaults |
| 2.6 | Document new utility patterns in developer guide | Low |

**Validation:** Build succeeds. New Tailwind utilities work in a test component. No visual regressions.

### Phase 3: Component CSS Consolidation (2–3 weeks)

**Goal:** Merge V1/V2 duplicates, extract shared patterns from features, fill empty stubs.

| Step | Action | Risk |
|---|---|---|
| 3.1 | Remove 6 duplicate V1 type classes from `_phase21.css` (V2 is canonical) | **High** — must verify no V1-only consumers |
| 3.2 | Move `.badge-accent`/`.badge-glow` from `_phase21.css` → `badges.css` | Low |
| 3.3 | Move `.skeleton-base`/`.skeleton-text` from `_phase21.css` → `skeleton.css` | Low |
| 3.4 | Move `.filter-select-premium`/`.filter-input-premium` from `features/watchlist.css` → `inputs.css` | Medium |
| 3.5 | Extract shimmer pattern into shared `.shimmer-base` class in `skeleton.css` | Medium — replace 14+ feature-specific instances |
| 3.6 | Extract hero gradient into `.gradient-hero` utility in `gradients.css` | Medium — replace 6+ feature-specific instances |
| 3.7 | Consolidate `.section-title`/`.section-header`/`.v2-section-header` → single system | **High** — affects SectionHeader + Section primitives |
| 3.8 | Consolidate `.card-premium`/`.v2-card` → single card system | Medium |
| 3.9 | Consolidate `.empty-state`/`.empty-premium` → single empty state | Medium |
| 3.10 | Consolidate `.featured-hero`/`.hero-premium` → single hero system | Medium |
| 3.11 | Replace hardcoded `#4ade80`, `#f87171`, `#60a5fa`, `#f5c518` with token references | Medium — 36+ replacements |
| 3.12 | Replace hardcoded `backdrop-filter: blur(Xpx)` with `blur(var(--blur-*))` | Medium — 40+ replacements |
| 3.13 | Standardize `active:scale` to `transform: scale(var(--scale-active))` | Medium — 14+ replacements |
| 3.14 | Replace hardcoded `font-family` with `var(--font-body)` etc. | **High** — 358 CSS references |

**Validation:** Visual regression test. CSS bundle size should decrease. No broken styles on any page.

### Phase 4: Component JS Consolidation (2–3 weeks)

**Goal:** Fix Icon bypass, merge duplicate components, promote shared primitives.

| Step | Action | Risk |
|---|---|---|
| 4.1 | Enhance `Icon.tsx` with Tailwind class support | Low |
| 4.2 | Migrate `SectionHeader.tsx` + `Section.tsx` to use `<Icon>` | Low |
| 4.3 | Migrate all `material-symbols-outlined` raw usages to `<Icon>` | **High** — 297 occurrences across 96 files |
| 4.4 | Promote `BottomSheet` to `shared/ui/BottomSheet.tsx` | Medium — refactor 3+ feature components |
| 4.5 | Promote `PosterRail` to `shared/ui/PosterRail.tsx` | Medium |
| 4.6 | Promote `LazyMount` to `shared/ui/LazyMount.tsx` | Low — already in discover |
| 4.7 | Consolidate `EmptyState` variants (watchlist, search, discover → shared) | Medium |
| 4.8 | Consolidate `Skeleton` variants (discover, details, profile → shared) | Medium |
| 4.9 | Unify `SectionHeader` CSS class usage (V1 vs V2 vs `.section-title`) | Medium — paired with step 3.7 |

**Validation:** TypeScript compiles. All components render correctly. No `material-symbols-outlined` raw usage outside `Icon.tsx`.

### Phase 5: Feature CSS Refactoring (3–4 weeks)

**Goal:** Replace inline patterns with shared components, reduce feature CSS by ~40%.

| Step | Action | Risk |
|---|---|---|
| 5.1 | Refactor `discover.css` (1,896 lines) — extract shared patterns, use tokens | **High** — largest feature |
| 5.2 | Refactor `secondary.css` (2,217 lines) — extract shared patterns, use tokens | **High** — largest file |
| 5.3 | Refactor `collections.css` (1,584 lines) | High |
| 5.4 | Refactor `details.css` (1,060 lines) | High |
| 5.5 | Refactor `profile.css` (978 lines) | High |
| 5.6 | Refactor `watchlist.css` (605 lines) | Medium |
| 5.7 | Refactor `search.css` (567 lines) | Medium |
| 5.8 | Refactor `settings.css` (193 lines) | Low |
| 5.9 | Replace hardcoded values with token references in all feature files | Medium |
| 5.10 | Replace raw Tailwind arbitrary values (`z-[999998]`) with token utilities | Medium |

**Validation:** Visual regression on every page. Feature CSS line count reduced. No inline hardcoded values remain.

### Migration Timeline

```
Week 1-2:   Phase 1 — Token Consolidation
Week 3:     Phase 2 — Tailwind Integration
Week 4-6:   Phase 3 — Component CSS Consolidation
Week 7-9:   Phase 4 — Component JS Consolidation
Week 10-13: Phase 5 — Feature CSS Refactoring
```

> **Important:** Each phase should be independently deployable. Phases 1–2 are purely additive (no breaking changes). Phase 3 begins removing dead code. Phases 4–5 refactor component code.

### Risk Mitigation

1. **Visual regression testing** — Run full screenshot comparison on all 8 themes after every phase
2. **Incremental migration** — Each step within a phase should be a separate PR
3. **Backward compatibility** — V1 tokens point to V2 via `var()` aliases (step 1.11)
4. **CSS bundle monitoring** — Track bundle size before/after each phase
5. **Feature flags** — Consider feature-flagging the V2 section header system during transition

---

## Appendix A: File-by-File Audit Summary

| File | Lines | Status | Key Issues |
|---|---|---|---|
| `tokens/colors.css` | ~170 | **Sprint 1B Complete** | 97+ tokens: surface tiers, semantic colors, status, rating, collection colors added |
| `tokens/spacing.css` | ~35 | **Sprint 1B Complete** | 22 tokens: --sp-* + --space-* scale with space-14/16/20 added |
| `tokens/typography.css` | ~60 | **Sprint 1B Complete** | 47 tokens: font-family (5), font-size (18), font-weight (6), line-height (5), letter-spacing (13) |
| `tokens/radius.css` | ~22 | **Sprint 1B Complete** | 15 tokens: --radius-2xs through --radius-full added |
| `tokens/shadows.css` | ~22 | **Sprint 1B Complete** | 12 tokens: semantic --shadow-xs through --shadow-xl added |
| `tokens/motion.css` | ~90 | **Sprint 1B Complete** | 16 easing + 9 duration + 2 stagger tokens; --duration-*, --ease-emphasized/decelerate/accelerate added |
| `tokens/z-index.css` | ~22 | **Sprint 1B Complete** | 13 z-index tokens: --z-base through --z-max |
| `tokens/blur.css` | ~20 | **Sprint 1B NEW** | 7 tokens: --blur-xs through --blur-3xl |
| `tokens/opacity.css` | ~20 | **Sprint 1B NEW** | 11 tokens: --opacity-disabled through --opacity-full |
| `base/base.css` | 145 | Partial | 14+ hardcoded values that should be tokens |
| `base/typography.css` | 18 | Fragile | All font-family hardcodes, no token references |
| `base/reset.css` | 4 | OK | Empty by design (Tailwind preflight) |
| `base/forms.css` | 4 | Empty | No form base styles |
| `components/_phase21.css` | 102 | **Deprecated** | 6 classes collide with V2, shared components in wrong file |
| `components/_phase22_sprint1.css` | 215 | Current | 6 classes override V1, but `v2-` prefix is temporary |
| `components/cards.css` | 67 | V1 | Duplicates _phase21 card patterns, hardcoded values |
| `components/buttons.css` | 42 | Partial | Only close button, not the full button system |
| `components/toast.css` | 157 | Good | Complete, well-structured |
| `components/chips.css` | 8 | Fragile | Hardcoded blur, font-family |
| `components/badges.css` | 5 | **Empty** | Stub only, real badges in _phase21 |
| `components/inputs.css` | 6 | **Empty** | Stub only, real inputs in features/ |
| `components/skeleton.css` | 5 | **Empty** | Stub only, real skeleton in _phase21 |
| `components/navigation.css` | 4 | **Empty** | Stub only |
| `components/dropdown.css` | 4 | **Empty** | Stub only |
| `components/dialogs.css` | 36 | Good | Clean modal/sheet system |
| `utilities/helpers.css` | 9 | Fragile | Gradient hardcoded, should use tokens |
| `utilities/transitions.css` | 18 | OK | Stagger classes work |
| `utilities/visibility.css` | 4 | **Empty** | Stub only |
| `layout/*` | 30 | **All Empty** | 5 files, all stubs |
| `features/secondary.css` | 2,217 | **Largest** | Most duplication |
| `features/discover.css` | 1,896 | Large | Shimmer, gradient, hero duplication |
| `features/collections.css` | 1,584 | Large | Timeline, grid, hero duplication |
| `features/details.css` | 1,060 | Large | Hero gradient, skeleton duplication |
| `features/profile.css` | 978 | Medium | Stats, skeleton duplication |
| `features/watchlist.css` | 605 | Medium | Input styles should be in components/ |
| `features/search.css` | 567 | Medium | Empty state duplication |
| `features/settings.css` | 193 | Small | Relatively clean |

## Appendix B: Token Quick Reference (Current → Proposed)

| Current Token | Proposed Token | Status |
|---|---|---|
| `--void` | `--tier-0` (via alias) | Deprecated → alias |
| `--deep` | `--tier-0` (via alias) | Deprecated → alias |
| `--surface` | `--tier-1` (via alias) | Deprecated → alias |
| `--raised` | `--tier-3` (via alias) | Deprecated → alias |
| `--border` | `--hairline` (via alias) | Deprecated → alias |
| `--border-active` | `--hairline-2` (via alias) | Deprecated → alias |
| `--text` | `--text-body` (via alias) | Deprecated → alias |
| `--muted` | `--text-muted` (via alias) | Deprecated → alias |
| `--dim` | `--text-dim` (via alias) | Deprecated → alias |
| — | `--color-success` | **NEW** |
| — | `--color-error` | **NEW** |
| — | `--color-warning` | **NEW** |
| — | `--color-info` | **NEW** |
| — | `--color-imdb` | **NEW** |
| — | `--color-rt` | **NEW** |
| — | `--color-gold` | **NEW** |
| — | `--font-body` | **NEW** |
| — | `--font-headline` | **NEW** |
| — | `--font-mono` | **NEW** |
| — | `--fs-*` (16 sizes) | **NEW** |
| — | `--lh-*` (6 heights) | **NEW** |
| — | `--ls-*` (9 spacings) | **NEW** |
| — | `--sp-9`, `--sp-11`, `--sp-14`, `--sp-16`, `--sp-20`, `--sp-24` | **NEW** |
| — | `--radius-xs` | **NEW** |
| `--touch-min` | `--touch-min` (moved to sizing.css) | **MOVED** |
| — | `--shadow-text-hero`, `--shadow-chip`, `--shadow-inset-top` | **NEW** |
| — | `--dur-shimmer` | **NEW** |
| — | `--scale-active` | **NEW** |
| — | `--z-*` (11 levels) | **NEW** |
| — | `--blur-xs` through `--blur-xl` | **NEW** |
| — | `--opacity-*` (7 values) | **NEW** |

## Appendix C: New Files to Create

| File | Purpose | Priority |
|---|---|---|
| `tokens/opacity.css` | **Sprint 1B DONE** — 11 opacity scale tokens | Complete |
| `tokens/blur.css` | **Sprint 1B DONE** — 7 blur scale tokens | Complete |
| `tokens/sizing.css` | Touch-min, nav-height | Phase 1 |
| `tokens/gradients.css` | Gradient utility classes | Phase 1 |
| `components/rails.css` | Horizontal scroll rail styles | Phase 3 |
| `components/page-headers.css` | Shared page header/back button | Phase 3 |
| `components/gradients.css` | Gradient utility classes | Phase 3 |
| `shared/ui/BottomSheet.tsx` | Bottom sheet primitive | Phase 4 |
| `shared/ui/PosterRail.tsx` | Poster rail primitive | Phase 4 |
| `shared/ui/LazyMount.tsx` | Lazy mount primitive | Phase 4 |
| `shared/ui/StatusLabel.tsx` | Status label primitive | Phase 4 |
