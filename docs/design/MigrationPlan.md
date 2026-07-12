# CineLog V2 Migration Plan

> **Version:** 1.0
> **Date:** 2026-03-05
> **Status:** Permanent Reference — Complete Migration Documentation
> **Scope:** Every token, CSS class, JS component, hardcoded value, and Tailwind mapping

---

## How to Read This Document

Each migration item follows this structure:

| Field | Description |
|-------|-------------|
| **Current Version** | What exists now (file, class name, API, value) |
| **Future Version** | What it should become (new location, API, token name) |
| **Migration Difficulty** | Easy (find-replace) / Medium (multi-file refactor) / Hard (API change) / Breaking (requires consumer update) |
| **Dependencies** | What must migrate first |
| **Pages Affected** | Which pages/features use this |
| **Breaking Changes** | What will break and how |
| **Migration Order** | Phase + step (e.g. "Phase 1 Step 2") |

### Phase Overview

| Phase | Focus | Risk Level |
|-------|-------|-----------|
| **Phase 1** | Token consolidation — resolve all duplicates, add missing tokens | Low |
| **Phase 2** | CSS class migration — V1 → V2 class names | Medium |
| **Phase 3** | Component JS migration — deduplicate components | Medium-High |
| **Phase 4** | Hardcoded value eradication → token references | Medium |
| **Phase 5** | Tailwind config integration — map all tokens to Tailwind utilities | Low |

---

## 1. TOKEN MIGRATIONS

### 1.1 `--void` / `--deep` → `--void` (single token)

| Field | Detail |
|-------|--------|
| **Current Version** | Both `--void: #000000` and `--deep: #000000` defined in `src/styles/tokens/colors.css:7-8`. Identical value, two names. `--deep` is never used semantically differently. |
| **Future Version** | Single `--void: #000000` token. Remove `--deep`. Alias `--tier-0` also resolves to `#000000` — decide whether `--void` and `--tier-0` are aliases or `--void` is the canonical name. |
| **Migration Difficulty** | Easy |
| **Dependencies** | None — foundational token |
| **Pages Affected** | All pages (body background uses `var(--void)`) |
| **Breaking Changes** | Any reference to `var(--deep)` must be updated to `var(--void)`. Cinematic theme override uses `--deep: #000` in `.theme-cinematic`. |
| **Migration Order** | Phase 1 Step 1 |

**Action items:**
- Remove `--deep` from `:root` in `colors.css`
- Grep for `var(--deep)` — replace with `var(--void)`
- Update `.theme-cinematic` override: remove `--deep: #000`
- Consider: `--void` = semantic "page background", `--tier-0` = surface system "deepest tier". Keep both as intentional aliases.

---

### 1.2 `--surface` (#111111) / `--tier-2` (#111317) → Unified Surface Token

| Field | Detail |
|-------|--------|
| **Current Version** | `--surface: #111111` (V1, `colors.css:9`) vs `--tier-2: #111317` (V2, `colors.css:65`). Different hex values — `#111111` is pure grey, `#111317` has a blue tint. Used interchangeably in some contexts. |
| **Future Version** | `--tier-2: #111317` becomes the canonical raised surface. `--surface` becomes an alias pointing to `--tier-2`. Eventually remove `--surface`. |
| **Migration Difficulty** | Medium |
| **Dependencies** | None |
| **Pages Affected** | All pages — `.glass-surface`, `.upcoming-card`, many feature CSS files use `var(--surface)` |
| **Breaking Changes** | Slight color shift from `#111111` → `#111317` (barely perceptible blue tint). Any code referencing `var(--surface)` must be audited. |
| **Migration Order** | Phase 1 Step 2 |

**Action items:**
- In `colors.css`, set `--surface: var(--tier-2)` as temporary alias
- Grep all `var(--surface)` references → replace with `var(--tier-2)` where semantically appropriate
- Remove `--surface` from `:root` after all references migrated
- Verify visual: the `#111111` → `#111317` shift should be imperceptible

---

### 1.3 `--text` / `--text-body` (both #e8eaf0) → Single Token

| Field | Detail |
|-------|--------|
| **Current Version** | `--text: #e8eaf0` (V1, `colors.css:13`) and `--text-body: #e8eaf0` (V2, `colors.css:77`). Same value, two names. |
| **Future Version** | `--text-body` is the canonical name. `--text` becomes alias → then removed. |
| **Migration Difficulty** | Easy |
| **Dependencies** | None |
| **Pages Affected** | All pages — `body { color: var(--text) }` in `base.css`, plus many component references |
| **Breaking Changes** | Any `var(--text)` reference must become `var(--text-body)`. Body rule in `base.css:9` must update. |
| **Migration Order** | Phase 1 Step 3 |

**Action items:**
- In `base.css`, change `color: var(--text)` → `color: var(--text-body)`
- Grep all `var(--text)` (exclude `var(--text-body)`, `var(--text-strong)`, etc.) → replace with `var(--text-body)`
- Set `--text: var(--text-body)` as temporary alias
- Remove `--text` from `:root` after all references migrated

---

### 1.4 `--muted` (0.42) / `--text-muted` (0.48) → Canonical `--text-muted`

| Field | Detail |
|-------|--------|
| **Current Version** | `--muted: rgba(232,234,240,0.42)` (V1, `colors.css:14`) vs `--text-muted: rgba(232,234,240,0.48)` (V2, `colors.css:79`). Same base color, different alpha: 0.42 vs 0.48. |
| **Future Version** | `--text-muted` (0.48 alpha) is canonical — slightly more legible. `--muted` is retired. |
| **Migration Difficulty** | Medium |
| **Dependencies** | None |
| **Pages Affected** | All pages — `.type-label`, `.type-caption`, `.label-mono` in `typography.css`, plus dozens of CSS and TSX references |
| **Breaking Changes** | Subtle brightness increase (0.42 → 0.48 alpha) on all text using `var(--muted)`. Intentional improvement for legibility. |
| **Migration Order** | Phase 1 Step 4 |

**Action items:**
- Grep all `var(--muted)` → replace with `var(--text-muted)`
- Verify visual: muted text should be slightly more readable
- Remove `--muted` from `:root`

---

### 1.5 `--dim` (0.18) / `--text-dim` (0.24) → Canonical `--text-dim`

| Field | Detail |
|-------|--------|
| **Current Version** | `--dim: rgba(232,234,240,0.18)` (V1, `colors.css:15`) vs `--text-dim: rgba(232,234,240,0.24)` (V2, `colors.css:80`). 0.18 vs 0.24 alpha — significant readability difference. |
| **Future Version** | `--text-dim` (0.24 alpha) is canonical. `--dim` is retired. |
| **Migration Difficulty** | Easy |
| **Dependencies** | None |
| **Pages Affected** | Minimal usage — `search.css` uses `var(--text-dim)`, `filter-input-premium::placeholder` uses `var(--text-dim)`. `var(--dim)` may have limited references. |
| **Breaking Changes** | Text using dim alpha increases from 0.18 → 0.24, improving readability of placeholder/decorative text. |
| **Migration Order** | Phase 1 Step 5 |

**Action items:**
- Grep all `var(--dim)` (exclude `var(--text-dim)`, `var(--p-dim)`) → replace with `var(--text-dim)`
- Remove `--dim` from `:root`

---

### 1.6 `--border` / `--glass-border` (both rgba(255,255,255,0.08)) → Single Token

| Field | Detail |
|-------|--------|
| **Current Version** | `--border: rgba(255,255,255,0.08)` (V1, `colors.css:11`) and `--glass-border: rgba(255,255,255,0.08)` (V2, `colors.css:85`). Same value, two names. Also overlaps with `--hairline` (0.06). |
| **Future Version** | `--hairline` system is the canonical border language (0.06 / 0.10 / 0.16). `--border` and `--glass-border` are aliases for `--hairline` (0.06). Retire both in favor of `--hairline` / `--hairline-2` / `--hairline-3`. |
| **Migration Difficulty** | Medium |
| **Dependencies** | None |
| **Pages Affected** | All pages — `.glass-surface`, `.empty-state-icon`, `.stat-card`, many feature CSS files |
| **Breaking Changes** | `--border` (0.08) is between `--hairline` (0.06) and `--hairline-2` (0.10). Decide per-context: most `--border` → `--hairline`, glass contexts → `--hairline`. |
| **Migration Order** | Phase 1 Step 6 |

**Action items:**
- Audit every `var(--border)` usage → map to `--hairline` or `--hairline-2`
- Audit every `var(--glass-border)` → map to `--hairline`
- Add alias `--border: var(--hairline)` temporarily
- Remove both after migration complete

---

### 1.7 `--border-active` (0.15) / `--hairline-3` (0.16) → Decide Canonical

| Field | Detail |
|-------|--------|
| **Current Version** | `--border-active: rgba(255,255,255,0.15)` (V1, `colors.css:12`) vs `--hairline-3: rgba(255,255,255,0.16)` (V2, `colors.css:73`). Nearly identical alpha: 0.15 vs 0.16. |
| **Future Version** | `--hairline-3` is canonical (part of the hairline scale). `--border-active` is retired or aliased to `--hairline-3`. |
| **Migration Difficulty** | Easy |
| **Dependencies** | None |
| **Pages Affected** | `.empty-state-icon` uses `var(--border-active)`, `.filter-chip` uses `var(--active-border)` (different), various hover states |
| **Breaking Changes** | 0.01 alpha difference is invisible. No visual breaking change. |
| **Migration Order** | Phase 1 Step 7 |

**Action items:**
- Grep `var(--border-active)` → replace with `var(--hairline-3)`
- Add temporary alias `--border-active: var(--hairline-3)`
- Remove after migration

---

### 1.8 Old Naming → New Naming (Comprehensive Token Rename)

| Old Token | New Token | Alpha/Value Change | Files Affected |
|-----------|-----------|-------------------|----------------|
| `--void` | `--void` (keep) | No change | — |
| `--deep` | `--void` (alias then remove) | No change | `.theme-cinematic`, any `var(--deep)` refs |
| `--surface` | `--tier-2` (alias then remove) | `#111111` → `#111317` | `cards.css`, feature CSS |
| `--raised` | `--tier-3` (alias then remove) | `#1a1a1a` → `#181b21` | `cards.css`, `base.css` |
| `--text` | `--text-body` (alias then remove) | No change | `base.css`, many |
| `--muted` | `--text-muted` (alias then remove) | 0.42 → 0.48 | `typography.css`, many |
| `--dim` | `--text-dim` (alias then remove) | 0.18 → 0.24 | Limited |
| `--border` | `--hairline` (context-dependent) | 0.08 → 0.06 | Many |
| `--border-active` | `--hairline-3` | 0.15 → 0.16 | Limited |

**Migration Order:** Phase 1 Steps 1-7 (one per token pair, sequential)

---

### 1.9 Typography Tokens: Add Font Family + Size Scale

| Field | Detail |
|-------|--------|
| **Current Version** | Font families are hardcoded strings in CSS (`'Outfit', sans-serif`, `'Bebas Neue', cursive`, `'Azeret Mono', monospace`). No CSS custom properties. 393 occurrences across 28 files. Font sizes are hardcoded per-class. |
| **Future Version** | Add to `tokens/typography.css`: |

```css
@layer base {
  :root {
    /* Font families */
    --font-sans: 'Outfit', sans-serif;
    --font-display: 'Bebas Neue', cursive;
    --font-mono: 'Azeret Mono', monospace;

    /* Type scale */
    --text-xs: 0.5rem;      /* 8px — micro labels, badges */
    --text-sm: 0.5625rem;   /* 9px — small metadata */
    --text-base: 0.6875rem; /* 11px — meta, eyebrow */
    --text-md: 0.75rem;     /* 12px — labels, buttons */
    --text-lg: 0.8125rem;   /* 13px — small body */
    --text-xl: 0.875rem;    /* 14px — body */
    --text-2xl: 0.9375rem;  /* 15px — large body */
    --text-3xl: 1.25rem;    /* 20px — headline */
    --text-4xl: 2rem;       /* 32px — stat */
    --text-5xl: 2.5rem;     /* 40px — display */
    --text-6xl: 3.25rem;    /* 52px — display-lg */
  }
}
```

| **Migration Difficulty** | Medium — large number of hardcoded font-family strings |
| **Dependencies** | None |
| **Pages Affected** | All pages — every `.type-*` class, every inline `font-family` in TSX |
| **Breaking Changes** | None if tokens resolve to same values. Visual risk is zero. |
| **Migration Order** | Phase 1 Step 8 |

**Action items:**
- Add font family + size tokens to `tokens/typography.css`
- Update `.type-*` classes in `base/typography.css` and `_phase21.css` / `_phase22_sprint1.css` to use `var(--font-*)` and `var(--text-*)`
- Update inline `font-family` strings in TSX files to use CSS classes instead
- 393 hardcoded font-family occurrences → CSS custom property references

---

### 1.10 Z-Index Tokens: Add `--z-base` through `--z-max`

| Field | Detail |
|-------|--------|
| **Current Version** | No z-index tokens. 19 files use Tailwind `z-[999997/999998/999999]` for modals. Scattered `z-index: 30`, `z-index: 10`, etc. in CSS. `z-index.css` only defines nav-height tokens. |
| **Future Version** | Add to `tokens/z-index.css`: |

```css
@layer base {
  :root {
    --z-base: 1;
    --z-above: 10;
    --z-nav: 40;
    --z-sticky: 50;
    --z-dropdown: 100;
    --z-overlay: 200;
    --z-modal-low: 999997;
    --z-modal-mid: 999998;
    --z-modal-high: 999999;
    --z-toast: 9999;
    --z-max: 9999999;
  }
}
```

| **Migration Difficulty** | Easy (token definition) → Medium (replacing all hardcoded z values) |
| **Dependencies** | None |
| **Pages Affected** | All pages with modals, toasts, sticky headers, overlays |
| **Breaking Changes** | None — tokens resolve to same numeric values |
| **Migration Order** | Phase 1 Step 9 |

**Action items:**
- Add z-index tokens to `z-index.css`
- Replace `z-[999999]` → `z-modal-high` in Tailwind classes
- Replace `z-[999998]` → `z-modal-mid`
- Replace `z-[999997]` → `z-modal-low`
- Replace hardcoded `z-index: 30` → `var(--z-sticky)`, `z-index: 10` → `var(--z-above)`

---

### 1.11 Status Color Tokens

| Field | Detail |
|-------|--------|
| **Current Version** | Colors are hardcoded: `#4ade80` (24 occurrences across 13 files), `#60a5fa` (6 occurrences), `#f87171` (33 occurrences), `#f5c518` (30 occurrences), `#ff7878` (3 occurrences). No tokens exist. |
| **Future Version** | Add to `tokens/colors.css`: |

```css
@layer base {
  :root {
    /* Status colors */
    --color-watching: #4ade80;
    --color-completed: #60a5fa;
    --color-danger: #f87171;
    --color-imdb: #f5c518;
    --color-rt: #ff7878;
    --color-gold: #fbbf24;
    --color-warning: #f59e0b;
    --color-info: #60a5fa;
  }
}
```

| **Migration Difficulty** | Medium — many occurrences across CSS + TSX files |
| **Dependencies** | None |
| **Pages Affected** | Watchlist (status badges), Details (ratings), Search (results), Collections, Profile (stats), Discover, Toast (error/success), Settings (danger zones) |
| **Breaking Changes** | None — same hex values |
| **Migration Order** | Phase 1 Step 10 |

**Action items:**
- Add status color tokens to `colors.css`
- Replace `#f5c518` → `var(--color-imdb)` in CSS and TSX (30 occurrences)
- Replace `#4ade80` → `var(--color-watching)` (24 occurrences)
- Replace `#f87171` → `var(--color-danger)` (33 occurrences)
- Replace `#60a5fa` → `var(--color-completed)` (6 occurrences)
- Replace `#ff7878` → `var(--color-rt)` (3 occurrences)
- Update `.btn-danger`, `.v2-pill-success`, toast accent stripes

---

### 1.12 Blur Tokens

| Field | Detail |
|-------|--------|
| **Current Version** | Blur values are hardcoded: `blur(8px)`, `blur(12px)`, `blur(20px)`, `blur(24px)`, `blur(28px)`, `blur(60px)`. 40 occurrences across 12 CSS files and 79 in TSX. Only `--glass-blur: 20px` exists as a token. |
| **Future Version** | Add to `tokens/colors.css` (or new `tokens/effects.css`): |

```css
@layer base {
  :root {
    --blur-xs: 4px;
    --blur-sm: 8px;
    --blur-md: 12px;
    --blur-lg: 20px;
    --blur-xl: 28px;
    --blur-xxl: 60px;
    --blur-backdrop: 60px;
  }
}
```

| **Migration Difficulty** | Medium |
| **Dependencies** | None |
| **Pages Affected** | All pages with glass effects, modals, sheets, toasts, search bars |
| **Breaking Changes** | None — same pixel values |
| **Migration Order** | Phase 1 Step 11 |

**Action items:**
- Add blur tokens
- Replace `--glass-blur` with `var(--blur-lg)`
- Replace `blur(8px)` → `blur(var(--blur-sm))` in CSS
- Replace `blur(12px)` → `blur(var(--blur-md))`
- Replace `blur(24px)` → `blur(var(--blur-xl))` (minus 4px? No — 24px is between md and xl; add `--blur-lg` = 20px, `--blur-xl` = 28px. Need `--blur-2xl` = 24px or adjust scale)
- Replace `blur(28px)` → `blur(var(--blur-xl))`
- Replace `backdrop-filter: blur(60px)` → `blur(var(--blur-backdrop))`

---

### 1.13 Opacity Tokens: Add Scale

| Field | Detail |
|-------|--------|
| **Current Version** | Opacity values are scattered: `0.42`, `0.48`, `0.18`, `0.24`, `0.72`, `0.88`, `0.06`, `0.08`, `0.10`, `0.15`, `0.16`. No dedicated opacity tokens. |
| **Future Version** | Add opacity scale tokens for reusable opacity values: |

```css
@layer base {
  :root {
    --opacity-invisible: 0;
    --opacity-faint: 0.06;
    --opacity-dim: 0.18;
    --opacity-muted: 0.42;
    --opacity-soft: 0.72;
    --opacity-strong: 0.88;
    --opacity-full: 1;
  }
}
```

| **Migration Difficulty** | Easy (token definition) → Hard (full adoption) |
| **Dependencies** | None |
| **Pages Affected** | All — opacity is used in every text token, border token, and overlay |
| **Breaking Changes** | None if values match |
| **Migration Order** | Phase 1 Step 12 |

**Note:** This is aspirational. The text and border tokens already embed opacity. Standalone opacity tokens are only useful for overlay backgrounds and transitions. Low priority.

---

### 1.14 Active Scale Token: `--scale-active`

| Field | Detail |
|-------|--------|
| **Current Version** | Active press scales are inconsistent: `scale(0.94)` (movie-card), `scale(0.96)` (btn-primary, btn-ghost, badges), `scale(0.97)` (card-premium, continue-premium), `scale(0.98)` (stat-card, settings-row), `scale(0.99)` (timeline-card), `scale(0.95)` (filter-chip). Six different values. |
| **Future Version** | Standardize to `--scale-active: 0.96` and use consistently. |

```css
@layer base {
  :root {
    --scale-active: 0.96;
  }
}
```

| **Migration Difficulty** | Medium — requires updating all `:active` states |
| **Dependencies** | None |
| **Pages Affected** | All interactive elements across all pages |
| **Breaking Changes** | Visual — some elements will press slightly more/less than before. Subtle. |
| **Migration Order** | Phase 1 Step 13 |

**Action items:**
- Add `--scale-active` token
- Standardize all `:active { transform: scale(X) }` → `scale(var(--scale-active))`
- Exceptions: large cards (0.94) and small pills (0.95) may warrant `--scale-active-sm: 0.94` and `--scale-active-lg: 0.98`

---

### 1.15 Focus Ring Token: `--focus-ring`

| Field | Detail |
|-------|--------|
| **Current Version** | Two focus patterns: (1) Global `:focus-visible` in `base.css:73` uses `outline: 2px solid var(--p); outline-offset: 2px`. (2) V2 `.focus-ring` in `_phase22_sprint1.css:36` uses `box-shadow: 0 0 0 2px var(--tier-1), 0 0 0 4px var(--p)`. (3) `.focus-ring-subtle` uses `box-shadow: 0 0 0 2px var(--tier-1), 0 0 0 3px var(--p-dim)`. |
| **Future Version** | Add token: |

```css
@layer base {
  :root {
    --focus-ring: 0 0 0 3px var(--p-dim);
    --focus-ring-strong: 0 0 0 2px var(--tier-1), 0 0 0 4px var(--p);
  }
}
```

| **Migration Difficulty** | Easy |
| **Dependencies** | None |
| **Pages Affected** | All interactive elements |
| **Breaking Changes** | None — same visual result |
| **Migration Order** | Phase 1 Step 14 |

---

### 1.16 Hero Gradient Tokens

| Field | Detail |
|-------|--------|
| **Current Version** | Hero gradients are copy-pasted across 6+ CSS classes (`.featured-hero::after`, `.hero-premium::after`, `.cinematic-hero::after`, `.collection-hero::after`, `.profile-banner::after`). Each has slightly different gradient stops. |
| **Future Version** | Add gradient tokens: |

```css
@layer base {
  :root {
    --cinematic-gradient: linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.82) 22%, rgba(0,0,0,0.35) 55%, rgba(0,0,0,0.05) 100%);
    --backdrop-gradient: linear-gradient(to right, rgba(0,0,0,0.55) 0%, transparent 50%);
    --card-gradient: linear-gradient(to top, rgba(0,0,0,0.97) 0%, rgba(0,0,0,0.78) 28%, rgba(0,0,0,0.18) 55%, transparent 100%);
  }
}
```

| **Migration Difficulty** | Medium |
| **Dependencies** | None |
| **Pages Affected** | Dashboard hero, Details hero, Collection hero, Profile banner, Discover spotlight |
| **Breaking Changes** | None if values match existing gradients exactly |
| **Migration Order** | Phase 1 Step 15 |

---

### 1.17 Shimmer Tokens

| Field | Detail |
|-------|--------|
| **Current Version** | Shimmer animation defined in 3 places: `@keyframes shimmer` (1.4s), `@keyframes shimmerSlow` (slower), and inline `animation: shimmer 1.6s` in `.skeleton-base`/`.skeleton-text`. Shimmer gradient hardcoded in `.skeleton-base`, `.skeleton-text`, `.poster-loading`, `.profile-banner-shimmer`. |
| **Future Version** | Add shimmer tokens: |

```css
@layer base {
  :root {
    --shimmer-duration: 1.6s;
    --shimmer-gradient: linear-gradient(105deg, rgba(255,255,255,0.02) 25%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.02) 75%);
    --shimmer-bg-size: 300% 100%;
  }
}
```

| **Migration Difficulty** | Easy |
| **Dependencies** | None |
| **Pages Affected** | All skeleton/loading states |
| **Breaking Changes** | None |
| **Migration Order** | Phase 1 Step 16 |

---

### 1.18 Touch Target Token: `--touch-min`

| Field | Detail |
|-------|--------|
| **Current Version** | `--touch-min: 44px` is currently defined in `tokens/radius.css:14` alongside border-radius tokens. Misplaced — it's an accessibility constraint, not a radius value. |
| **Future Version** | Move to its own accessibility category. Add to a new `tokens/accessibility.css` or keep in a dedicated section of `spacing.css`. |

```css
@layer base {
  :root {
    /* Accessibility — minimum touch target per WCAG 2.5.8 */
    --touch-min: 44px;
  }
}
```

| **Migration Difficulty** | Easy — just move the token |
| **Dependencies** | None |
| **Pages Affected** | All interactive elements (currently only defined, not widely used in code) |
| **Breaking Changes** | None — same value |
| **Migration Order** | Phase 1 Step 17 |

---

## 2. CSS CLASS MIGRATIONS

### 2.1 Typography Class Conflicts (V1 vs V2)

All V1 classes live in `components/_phase21.css`, all V2 classes in `components/_phase22_sprint1.css`. The V2 file redefines the same class names with different values. Currently, CSS cascade order means the last-loaded file wins (V2), but this is fragile.

| V1 Class | V1 Value | V2 Class | V2 Value | Resolution | Difficulty |
|----------|----------|----------|----------|------------|-----------|
| `.type-display` | `2.5rem` | `.type-display` | `3.25rem` | Canonical = V2 (3.25rem). V1 value is a different size — rename V1 to `.type-display-sm` or remove | Medium |
| `.type-headline` | `1.125rem` | `.type-headline` | `1.25rem` | Canonical = V2 (1.25rem) | Easy |
| `.type-body` | `0.875rem` | `.type-body` | `0.9375rem` | Canonical = V2 (0.9375rem) | Easy |
| `.type-body-soft` | `0.875rem` | `.type-body-soft` | `0.9375rem` | Canonical = V2 (0.9375rem) | Easy |
| `.type-eyebrow` | `0.625rem` | `.type-eyebrow` | `0.6875rem` | Canonical = V2 (0.6875rem) | Easy |
| `.type-meta` | `0.6875rem` | `.type-meta` | `0.75rem` | Canonical = V2 (0.75rem) | Easy |

**Strategy:** Remove V1 definitions from `_phase21.css`. Keep only V2 definitions. Add any missing intermediate sizes as new classes (`.type-display-sm` already exists in V2).

**Migration Order:** Phase 2 Step 1

**Breaking Changes:** All pages using `.type-display` will see larger text (2.5rem → 3.25rem). Audit every usage to confirm this is acceptable. Some contexts may need `.type-display-sm` instead.

---

### 2.2 Component Class Duplications (V1 → V2 Renames)

| V1 Class | V2 Class | Location | Resolution | Difficulty |
|----------|----------|----------|------------|-----------|
| `.featured-hero` | `.hero-premium` | `cards.css:25` / `_phase21.css:64` | Merge into `.hero-premium`. Delete `.featured-hero`. | Medium |
| `.continue-card` | `.continue-premium` | `cards.css:33` / `_phase21.css:71` | Merge into `.continue-premium`. Delete `.continue-card`. | Medium |
| `.stat-card` | `.stat-premium` | `cards.css:7` / `_phase21.css:76` | Merge into `.stat-premium`. Delete `.stat-card`. | Medium |
| `.empty-state` | `.empty-premium` | `cards.css:54` / `_phase21.css:58` | Merge into `.empty-premium`. Delete `.empty-state`. | Medium |
| `.progress-bar` | `.progress-premium` | `cards.css:49` / `_phase21.css:83` | Merge into `.progress-premium`. Delete `.progress-bar`. | Medium |
| `.section-title` | `.section-header-title` / `.v2-section-title` | `cards.css:65` / `_phase21.css:47` / `_phase22_sprint1.css:60` | Three generations. Canonical = `.v2-section-title`. | Medium |
| `.tag-chip` | `.v2-pill` | `chips.css:6` / `_phase22_sprint1.css:153` | Merge into `.v2-pill` with variant classes. Delete `.tag-chip`. | Medium |
| `.badge-accent` | `.v2-pill-accent` | `_phase21.css:41` / `_phase22_sprint1.css:169` | Merge into `.v2-pill-accent`. Delete `.badge-accent`. | Easy |

**Migration Order:** Phase 2 Steps 2-9 (one per class pair)

---

### 2.3 Empty CSS Files (Fill or Remove)

| File | Current Content | Resolution | Difficulty |
|------|----------------|------------|-----------|
| `components/navigation.css` | Empty — 4-line comment | Remove or fill with nav-specific tokens | Easy |
| `components/badges.css` | Empty — 3-line comment (badge styles are in `_phase21.css`) | Move `.badge-accent`/`.badge-glow` here, then rename to `.v2-pill-accent`/`.v2-pill-glow` | Medium |
| `components/inputs.css` | Empty — 5-line comment (input styles are in `features/watchlist.css`) | Move `.filter-select-premium` and `.filter-input-premium` here | Medium |
| `components/dropdown.css` | Empty — 4-line comment | Remove — app uses native `<select>` | Easy |
| `components/skeleton.css` | Empty — 5-line comment (skeleton styles are in `_phase21.css`) | Move `.skeleton-base`/`.skeleton-text` here | Easy |
| `utilities/visibility.css` | Unknown — check if empty | Fill or remove | Easy |

**Migration Order:** Phase 2 Step 10

---

## 3. COMPONENT JS MIGRATIONS

### 3.1 Icon Bypass → Use `<Icon>` Everywhere

| Field | Detail |
|-------|--------|
| **Current Version** | `src/shared/ui/Icon.tsx` exists but is not used. 86 files directly render `<span class="material-symbols-outlined" style={...}>`. Font size and variation-settings are set via inline styles in every instance. |
| **Future Version** | All icon rendering goes through `<Icon name="..." size={16} fill />` component. Inline `<span class="material-symbols-outlined">` is banned. |
| **Migration Difficulty** | Hard — 86 files, each with custom inline styles |
| **Dependencies** | Icon component must support `size`, `fill`, `color` props |
| **Pages Affected** | All 86 files |
| **Breaking Changes** | None if Icon component renders identical output |
| **Migration Order** | Phase 3 Step 1 |

**Action items:**
- Audit `Icon.tsx` API — ensure it supports all current inline style variations
- Add `size` (number → px), `fill` (boolean), `color` (string) props
- Create codemod: `<span class="material-symbols-outlined" style={{"font-size": "16px", color: "var(--p)", ...}}>{name}</span>` → `<Icon name={name} size={16} color="var(--p)" />`
- Run codemod across all 86 files
- Manual QA for each file

---

### 3.2 SectionHeader vs Section (Inline Duplication) → Section Composes SectionHeader

| Field | Detail |
|-------|--------|
| **Current Version** | `SectionHeader` (`primitives/SectionHeader.tsx`) renders a standalone header. `Section` (`primitives/Section.tsx`) has its own inline header rendering that duplicates SectionHeader's JSX (same `.section-header` / `.section-header-title` / `.section-header-action` classes). |
| **Future Version** | `Section` composes `SectionHeader` internally. `SectionHeader` remains available for standalone use. |
| **Migration Difficulty** | Medium |
| **Dependencies** | SectionHeader must be stable |
| **Pages Affected** | All pages using `<Section>` or `<SectionHeader>` |
| **Breaking Changes** | None — same DOM output |
| **Migration Order** | Phase 3 Step 2 |

**Action items:**
- Refactor `Section.tsx` to import and render `<SectionHeader>` instead of duplicating its JSX
- Add `eyebrow` prop to `SectionHeader` (currently only in `Section`)
- Verify visual parity

---

### 3.3 watchlist/EmptyState vs shared/EmptyState → Merge into shared

| Field | Detail |
|-------|--------|
| **Current Version** | `features/watchlist/components/EmptyState.tsx` is a local empty state component. `shared/ui/primitives/EmptyState.tsx` is the shared primitive. They render similar but different markup. |
| **Future Version** | Watchlist uses the shared `<EmptyState>` from primitives. Local version is deleted. |
| **Migration Difficulty** | Easy |
| **Dependencies** | Shared EmptyState must support all watchlist use cases |
| **Pages Affected** | Watchlist/Vault page |
| **Breaking Changes** | Slight markup difference — verify visual parity |
| **Migration Order** | Phase 3 Step 3 |

---

### 3.4 SearchEmptyState → Use Shared EmptyState

| Field | Detail |
|-------|--------|
| **Current Version** | `features/search/SearchEmptyState.tsx` is a search-specific empty state. |
| **Future Version** | Uses shared `<EmptyState>` with search-specific icon and message. |
| **Migration Difficulty** | Easy |
| **Dependencies** | Shared EmptyState |
| **Pages Affected** | Search page |
| **Breaking Changes** | Minor markup difference |
| **Migration Order** | Phase 3 Step 4 |

---

### 3.5 ProfileCompletion SVG Ring → Use ProgressRing

| Field | Detail |
|-------|--------|
| **Current Version** | `features/profile/components/ProfileCompletion.tsx` renders a custom SVG ring for profile completion percentage. `features/collections/components/ProgressRing.tsx` is a reusable ring component. |
| **Future Version** | ProfileCompletion uses `<ProgressRing>` from collections. |
| **Migration Difficulty** | Medium — need to move ProgressRing to shared, ensure API compatibility |
| **Dependencies** | Move ProgressRing to `shared/ui/primitives/` |
| **Pages Affected** | Profile, Collections |
| **Breaking Changes** | None if ProgressRing supports same visual output |
| **Migration Order** | Phase 3 Step 5 |

---

### 3.6 CollectionHero CSS Ring → Use ProgressRing

| Field | Detail |
|-------|--------|
| **Current Version** | `features/collection/components/CollectionHero.tsx` uses a CSS-based circular progress ring (conic-gradient). |
| **Future Version** | Uses shared `<ProgressRing>` component. |
| **Migration Difficulty** | Medium |
| **Dependencies** | ProgressRing moved to shared |
| **Pages Affected** | Collection detail modal |
| **Breaking Changes** | Visual: CSS conic-gradient → SVG ring may render slightly differently |
| **Migration Order** | Phase 3 Step 6 |

---

### 3.7 MovieCard Image Handling → Use SafeImage

| Field | Detail |
|-------|--------|
| **Current Version** | `shared/ui/MovieCard.tsx` has custom image loading logic (onLoad/onError handlers, opacity transitions). `shared/ui/SafeImage.tsx` is a reusable image component with error fallback and load animation. |
| **Future Version** | MovieCard uses `<SafeImage>` for poster rendering. |
| **Migration Difficulty** | Medium — MovieCard has complex poster effects (hover scale, brightness, overlay gradients) that SafeImage must support |
| **Dependencies** | SafeImage must expose className/style for overlay effects |
| **Pages Affected** | All pages showing movie cards |
| **Breaking Changes** | Potential: SafeImage's load animation must be compatible with MovieCard's hover effects |
| **Migration Order** | Phase 3 Step 7 |

---

### 3.8 DiscoverSection → Use DetailSection or Shared Section

| Field | Detail |
|-------|--------|
| **Current Version** | `features/details/components/DetailSection.tsx` and discover's inline section headers serve the same purpose: a section with eyebrow + title + content. |
| **Future Version** | All sections use shared `<Section>` primitive (already exists). |
| **Migration Difficulty** | Medium |
| **Dependencies** | Section primitive must be robust enough |
| **Pages Affected** | Discover, Details |
| **Breaking Changes** | None if Section supports all required props |
| **Migration Order** | Phase 3 Step 8 |

---

### 3.9 Back Buttons (4 Variants) → Shared BackButton Component

| Field | Detail |
|-------|--------|
| **Current Version** | Four different back button implementations: (1) `.cinematic-close-btn` in DetailsModal, (2) `.search-genre-back` in search genre browse, (3) inline back buttons in Settings subpages, (4) AuthModal close button. Each has slightly different styling. |
| **Future Version** | Single `<BackButton>` or `<CloseButton>` shared component. Variants: `variant="close" | "back" | "minimal"`. |
| **Migration Difficulty** | Medium |
| **Dependencies** | None |
| **Pages Affected** | Details, Search, Settings, Auth, Collections |
| **Breaking Changes** | Visual: standardizing may change subtle style differences |
| **Migration Order** | Phase 3 Step 9 |

---

### 3.10 Page Headers (5 Instances) → Shared PageHeader Component

| Field | Detail |
|-------|--------|
| **Current Version** | Five page headers with identical structure: eyebrow + title + subtitle. (1) Discover eyebrow block, (2) Search eyebrow block, (3) Vault header, (4) Collection header, (5) Profile header. Each has different CSS classes but same visual pattern. |
| **Future Version** | Shared `<PageHeader>` component with `eyebrow`, `title`, `subtitle`, `icon` props. |
| **Migration Difficulty** | Medium |
| **Dependencies** | None |
| **Pages Affected** | Discover, Search, Watchlist, Collections, Profile |
| **Breaking Changes** | Minor — markup consolidation may shift spacing slightly |
| **Migration Order** | Phase 3 Step 10 |

---

### 3.11 Shimmer Skeleton (14+ Instances) → Shared Skeleton Class/Component

| Field | Detail |
|-------|--------|
| **Current Version** | `shared/ui/primitives/Skeleton.tsx` exists but feature-specific skeleton components are everywhere: `DiscoverSkeleton.tsx`, `DetailsSkeleton.tsx`, `CollectionSkeleton.tsx`, `ProfileSkeleton.tsx`, `WatchlistLoading/LoadingSkeleton.tsx`, `SearchLoading.tsx`. Each has custom shimmer markup. |
| **Future Version** | All skeleton states compose from `<Skeleton variant="block" | "text" | "card" | "poster">`. Feature-specific skeletons are deleted or reduced to layout wrappers around `<Skeleton>` primitives. |
| **Migration Difficulty** | Medium-High — each skeleton has unique layout |
| **Dependencies** | Skeleton primitive must support all shape variants |
| **Pages Affected** | All pages (loading states) |
| **Breaking Changes** | Visual: consolidated skeletons may look slightly different |
| **Migration Order** | Phase 3 Step 11 |

---

### 3.12 Bottom Sheets (3 Instances) → Shared BottomSheet Component

| Field | Detail |
|-------|--------|
| **Current Version** | Three bottom sheet implementations: (1) `AddToFolderSheet.tsx` in details, (2) `ConfirmRemoveSheet.tsx` in details, (3) `ResetConfirmSheet.tsx` in sync. All use similar portal + backdrop + sheet-up animation pattern. |
| **Future Version** | Shared `<BottomSheet>` component with slots for content. |
| **Migration Difficulty** | Medium |
| **Dependencies** | None |
| **Pages Affected** | Details, Sync |
| **Breaking Changes** | None if BottomSheet renders same structure |
| **Migration Order** | Phase 3 Step 12 |

---

### 3.13 Status Label Mapping (7 Instances) → Shared statusLabel Utility

| Field | Detail |
|-------|--------|
| **Current Version** | Status-to-label/color mapping is duplicated in 5+ files: `MovieCard.tsx`, `HeroContentCluster.tsx`, `ActionDock.tsx`, `YourActivityCard.tsx`, `VaultCard.tsx`. Each maps status strings ("watching", "completed", "planned", etc.) to colors and display labels. |
| **Future Version** | Shared `statusLabel(status)` and `statusColor(status)` utility in `shared/utils/vaultStatus.ts` (partially exists). |
| **Migration Difficulty** | Medium |
| **Dependencies** | Status color tokens (1.11) must exist first |
| **Pages Affected** | Watchlist, Details, MovieCard |
| **Breaking Changes** | None — same output |
| **Migration Order** | Phase 3 Step 13 |

---

### 3.14 DiscoverRail Card Markup (4 Copies) → Shared PosterRail Component

| Field | Detail |
|-------|--------|
| **Current Version** | `DiscoverRail.tsx` renders a horizontal poster rail. Similar markup exists in: `VaultShelf.tsx` (watchlist), `SearchGrid.tsx` (search rail), `SimilarTitles.tsx` (details). Each has slightly different card markup but same pattern: horizontal scroll + poster cards. |
| **Future Version** | Shared `<PosterRail>` component that accepts a render function or card component prop. |
| **Migration Difficulty** | Medium-High |
| **Dependencies** | MovieCard / VaultCard must be unified first |
| **Pages Affected** | Discover, Watchlist, Search, Details |
| **Breaking Changes** | Major — requires refactoring how each page renders its rail |
| **Migration Order** | Phase 3 Step 14 |

---

### 3.15 titleOf / yearOf / imdbOf Helpers (4 Copies) → Shared Utility

| Field | Detail |
|-------|--------|
| **Current Version** | Helper functions for extracting movie metadata are duplicated across 12 files: `SearchResultRow.tsx`, `SearchGrid.tsx`, `searchConstants.ts`, `CosmosView.tsx`, `TasteSurface.tsx`, `SimilarTitles.tsx`, `TimelineEntry.tsx`, `CollectionsStats.tsx`, `UniverseDashboard.tsx`, `TimelineEngine.tsx`, `UniverseEditEntry.tsx`, `CollectionTimeline.tsx`. |
| **Future Version** | Single shared utility module: `shared/utils/movieHelpers.ts` exporting `titleOf()`, `yearOf()`, `imdbOf()`, `ratingOf()`. |
| **Migration Difficulty** | Medium — 12 files to update |
| **Dependencies** | None |
| **Pages Affected** | Search, Discover, Collections, Details |
| **Breaking Changes** | None if function signatures match |
| **Migration Order** | Phase 3 Step 15 |

---

## 4. HARDCODED VALUE MIGRATIONS

### 4.1 Complete Hardcoded Value → Token Replacement Map

| Hardcoded Value | Token Replacement | Occurrences | Files (CSS + TSX) | Difficulty |
|----------------|-------------------|-------------|-------------------|-----------|
| `#f5c518` | `var(--color-imdb)` | 30 | 23 files (CSS, TSX across details, watchlist, discover, search, collections, profile, sync) | Easy |
| `#f87171` | `var(--color-danger)` | 33 | 19 files (toast, details, collections, sync, settings, profile, auth) | Easy |
| `#4ade80` | `var(--color-watching)` | 24 | 13 files (watchlist, discover, collections, toast, profile, secondary, settings) | Easy |
| `#60a5fa` | `var(--color-completed)` | 6 | 6 files (watchlist, secondary, collections, details) | Easy |
| `#ff7878` | `var(--color-rt)` | 3 | 3 files (watchlist, details, MovieCardRatings) | Easy |
| `#141414` | `var(--tier-2)` | 4 | `cards.css` (stat-card, movie-card-inner, featured-hero, settings-row backgrounds) | Easy |
| `#0e0e0e` | `var(--tier-0)` | 2 | `cards.css` (continue-card, poster-loading backgrounds) | Easy |
| `#1a1a1a` | `var(--tier-3)` | 4 | `colors.css` (raised), `cards.css`, `AuthModal.tsx` | Easy |
| `rgba(0,0,0,0.75)` / `rgba(0,0,0,0.85)` | `var(--modal-backdrop)` | 20 | 19 files (all modal/sheet components) | Medium |
| `rgba(5,6,10,0.88)` / `rgba(5,6,10,0.92)` | `var(--sticky-header-bg)` | 3 | `search.css`, `WatchlistHeader.tsx`, `AppHeader.tsx` | Easy |
| `blur(8px)` | `blur(var(--blur-sm))` | ~12 | CSS files (chips, watchlist, search, buttons) | Easy |
| `blur(12px)` | `blur(var(--blur-md))` | ~6 | CSS files (btn-ghost, badge-accent, buttons, profile) | Easy |
| `blur(20px)` | `blur(var(--blur-lg))` | ~8 | CSS files (glass-blur, scroll-to-top, profile) | Easy |
| `blur(24px)` | `blur(var(--blur-xl))` | ~6 | toast, search, profile, details, auth | Easy |
| `blur(28px)` | `blur(var(--blur-xl))` | ~3 | watchlist filter-drawer, discover | Easy |
| `blur(60px)` | `blur(var(--blur-backdrop))` | ~1 | Potential future use | Easy |
| `z-[999997]` | `var(--z-modal-low)` | ~5 | Modal/sheet components | Easy |
| `z-[999998]` | `var(--z-modal-mid)` | ~8 | Backdrop overlays | Easy |
| `z-[999999]` | `var(--z-modal-high)` | ~6 | Top-level modals | Easy |
| `font-size: 7px` / `8px` / `9px` / `12px` etc. | `var(--text-xs)` / `var(--text-sm)` / etc. | 39 | 15 CSS files | Medium |
| `font-family: 'Outfit'` / `'Bebas Neue'` / `'Azeret Mono'` | `var(--font-sans)` / `var(--font-display)` / `var(--font-mono)` | 393 | 28 files | Medium |

**Migration Order:** Phase 4 — work through the table top to bottom (highest occurrence count first for maximum impact)

---

### 4.2 Hardcoded Backdrop/Overlay Values Needing New Tokens

These require NEW token definitions (don't exist yet):

| Hardcoded Pattern | New Token | Value | Usage |
|-------------------|-----------|-------|-------|
| `rgba(0,0,0,0.75)` | `--modal-backdrop` | `rgba(0,0,0,0.75)` | Modal/sheet backdrop overlay |
| `rgba(0,0,0,0.85)` | `--modal-backdrop-strong` | `rgba(0,0,0,0.85)` | Focused modal backdrop |
| `rgba(5,6,10,0.88)` | `--sticky-header-bg` | `rgba(5,6,10,0.88)` | Sticky search/vault header |
| `rgba(5,6,10,0.92)` | `--sticky-header-bg-strong` | `rgba(5,6,10,0.92)` | Sticky header focused state |

**Migration Order:** Phase 4 Step 1 (define tokens), then Phase 4 Steps 2-4 (replace values)

---

## 5. TAILWIND CONFIG MIGRATION

### 5.1 Current State

`tailwind.config.js` is essentially empty — `theme: { extend: {} }`. All styling is done via:
1. CSS custom properties (`:root` tokens)
2. Custom CSS classes (`.type-*`, `.v2-*`, etc.)
3. Inline Tailwind utilities (`flex`, `gap-3`, `text-sm`, etc.)
4. Inline styles in TSX components

### 5.2 Target Tailwind Config

Map all CSS custom properties into Tailwind's `theme.extend` so developers can use `bg-void`, `text-body`, `border-hairline`, `font-display`, `blur-sm`, etc. instead of `var(--token)`.

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      /* ── Colors ────────────────────────────────────────── */
      colors: {
        // Surface tiers
        void:     "var(--void)",
        tier: {
          0: "var(--tier-0)",
          1: "var(--tier-1)",
          2: "var(--tier-2)",
          3: "var(--tier-3)",
          4: "var(--tier-4)",
        },
        surface:  "var(--surface)",
        raised:   "var(--raised)",

        // Text
        "text-strong": "var(--text-strong)",
        "text-body":   "var(--text-body)",
        "text-soft":   "var(--text-soft)",
        "text-muted":  "var(--text-muted)",
        "text-dim":    "var(--text-dim)",

        // Borders
        hairline: {
          DEFAULT: "var(--hairline)",
          2: "var(--hairline-2)",
          3: "var(--hairline-3)",
        },
        border: {
          DEFAULT: "var(--border)",
          active: "var(--border-active)",
        },

        // Accent (theme-dependent)
        p:     "var(--p)",
        p2:    "var(--p2)",
        "p-glow": "var(--p-glow)",
        "p-dim":  "var(--p-dim)",

        // Status
        watching:  "var(--color-watching)",
        completed: "var(--color-completed)",
        danger:    "var(--color-danger)",
        imdb:      "var(--color-imdb)",
        rt:        "var(--color-rt)",
        gold:      "var(--color-gold)",
        warning:   "var(--color-warning)",
        info:      "var(--color-info)",
      },

      /* ── Spacing ───────────────────────────────────────── */
      spacing: {
        sp: {
          1:  "var(--sp-1)",
          2:  "var(--sp-2)",
          3:  "var(--sp-3)",
          4:  "var(--sp-4)",
          5:  "var(--sp-5)",
          6:  "var(--sp-6)",
          7:  "var(--sp-7)",
          8:  "var(--sp-8)",
          10: "var(--sp-10)",
          12: "var(--sp-12)",
        },
      },

      /* ── Border Radius ─────────────────────────────────── */
      borderRadius: {
        sm:    "var(--radius-sm)",
        md:    "var(--radius-md)",
        card:  "var(--radius-card)",
        lg:    "var(--radius-lg)",
        xl:    "var(--radius-xl)",
        "2xl": "var(--radius-2xl)",
        modal: "var(--radius-modal)",
        pill:  "var(--radius-pill)",
      },

      /* ── Box Shadows ────────────────────────────────────── */
      boxShadow: {
        card:     "var(--shadow-card)",
        raised:   "var(--shadow-raised)",
        float:    "var(--shadow-float)",
        glow:     "var(--shadow-glow)",
        premium:  "var(--shadow-premium)",
        elevated: "var(--shadow-elevated)",
        hero:     "var(--shadow-hero)",
      },

      /* ── Font Families ─────────────────────────────────── */
      fontFamily: {
        sans:    "var(--font-sans)",
        display: "var(--font-display)",
        mono:    "var(--font-mono)",
      },

      /* ── Font Sizes (type scale) ───────────────────────── */
      fontSize: {
        xs:   "var(--text-xs)",
        sm:   "var(--text-sm)",
        base: "var(--text-base)",
        md:   "var(--text-md)",
        lg:   "var(--text-lg)",
        xl:   "var(--text-xl)",
        "2xl": "var(--text-2xl)",
        "3xl": "var(--text-3xl)",
        "4xl": "var(--text-4xl)",
        "5xl": "var(--text-5xl)",
        "6xl": "var(--text-6xl)",
      },

      /* ── Blur ──────────────────────────────────────────── */
      blur: {
        xs:       "var(--blur-xs)",
        sm:       "var(--blur-sm)",
        md:       "var(--blur-md)",
        lg:       "var(--blur-lg)",
        xl:       "var(--blur-xl)",
        xxl:      "var(--blur-xxl)",
        backdrop: "var(--blur-backdrop)",
      },

      /* ── Z-Index ───────────────────────────────────────── */
      zIndex: {
        base:     "var(--z-base)",
        above:    "var(--z-above)",
        nav:      "var(--z-nav)",
        sticky:   "var(--z-sticky)",
        dropdown: "var(--z-dropdown)",
        overlay:  "var(--z-overlay)",
        "modal-low":  "var(--z-modal-low)",
        "modal-mid":  "var(--z-modal-mid)",
        "modal-high": "var(--z-modal-high)",
        toast:    "var(--z-toast)",
        max:      "var(--z-max)",
      },

      /* ── Animation ─────────────────────────────────────── */
      transitionDuration: {
        micro: "var(--dur-micro)",
        fast:  "var(--dur-fast)",
        base:  "var(--dur-base)",
        modal: "var(--dur-modal)",
        page:  "var(--dur-page)",
        slow:  "var(--dur-slow)",
      },

      transitionTimingFunction: {
        spring:   "var(--ease-spring)",
        smooth:   "var(--ease-smooth)",
        out:      "var(--ease-out)",
        standard: "var(--ease-standard)",
      },
    },
  },
  plugins: [],
};
```

### 5.3 Tailwind Utility Examples (Post-Migration)

| Before (CSS var / hardcoded) | After (Tailwind utility) |
|------------------------------|-------------------------|
| `bg-[var(--tier-2)]` | `bg-tier-2` |
| `text-[var(--text-muted)]` | `text-text-muted` |
| `border-[var(--hairline)]` | `border-hairline` |
| `font-[Bebas_Neue]` | `font-display` |
| `blur-[var(--glass-blur)]` | `blur-lg` |
| `shadow-[var(--shadow-premium)]` | `shadow-premium` |
| `z-[999999]` | `z-modal-high` |
| `duration-[220ms]` | `duration-base` |
| `ease-[cubic-bezier(0.22,1,0.36,1)]` | `ease-smooth` |
| `rounded-[var(--radius-card)]` | `rounded-card` |
| `gap-[var(--sp-3)]` | `gap-sp-3` |

### 5.4 Migration Strategy for Tailwind Config

| Step | Action | Risk |
|------|--------|------|
| 1 | Add all theme.extend mappings (purely additive, no removals) | None |
| 2 | Optionally add `@apply` directives in CSS for complex compositions | Low |
| 3 | Gradually replace `var(--token)` in TSX with Tailwind utilities | Low |
| 4 | Do NOT remove CSS custom properties — they remain the source of truth | — |
| 5 | CSS classes (`.type-*`, `.v2-*`) remain — Tailwind is complementary | — |

**Migration Order:** Phase 5 (after all tokens are consolidated in Phase 1)

---

## 6. MIGRATION ORDER SUMMARY

### Phase 1: Token Consolidation (Low Risk)

| Step | Item | Difficulty | Impact |
|------|------|-----------|--------|
| 1 | `--deep` → `--void` merge | Easy | 1 file + theme override |
| 2 | `--surface` → `--tier-2` unification | Medium | Many CSS files |
| 3 | `--text` → `--text-body` rename | Easy | All pages |
| 4 | `--muted` → `--text-muted` (0.42→0.48) | Medium | Typography, many components |
| 5 | `--dim` → `--text-dim` (0.18→0.24) | Easy | Limited |
| 6 | `--border` / `--glass-border` → `--hairline` | Medium | Many CSS files |
| 7 | `--border-active` → `--hairline-3` | Easy | Limited |
| 8 | Typography tokens (font-sans/display/mono + size scale) | Medium | 28+ files, 393 occurrences |
| 9 | Z-index tokens (`--z-base` → `--z-max`) | Medium | 19+ files |
| 10 | Status color tokens | Medium | 96+ occurrences across 30+ files |
| 11 | Blur tokens (`--blur-xs` → `--blur-backdrop`) | Medium | 12 CSS + 26 TSX files |
| 12 | Opacity token scale | Easy | Aspirational |
| 13 | `--scale-active` (0.96 standardization) | Medium | All interactive elements |
| 14 | `--focus-ring` / `--focus-ring-strong` tokens | Easy | All interactive elements |
| 15 | Hero gradient tokens | Medium | 6+ hero components |
| 16 | Shimmer tokens | Easy | All skeletons |
| 17 | `--touch-min` move to accessibility category | Easy | 1 token |

### Phase 2: CSS Class Migration (Medium Risk)

| Step | Item | Difficulty | Impact |
|------|------|-----------|--------|
| 1 | Typography V1→V2 class consolidation (6 conflicts) | Medium | All pages |
| 2 | `.featured-hero` → `.hero-premium` | Medium | Dashboard |
| 3 | `.continue-card` → `.continue-premium` | Medium | Dashboard |
| 4 | `.stat-card` → `.stat-premium` | Medium | Dashboard, Stats |
| 5 | `.empty-state` → `.empty-premium` | Medium | Multiple pages |
| 6 | `.progress-bar` → `.progress-premium` | Medium | Multiple pages |
| 7 | `.section-title` → `.v2-section-title` | Medium | All pages |
| 8 | `.tag-chip` → `.v2-pill` | Medium | Cards, Search |
| 9 | `.badge-accent` → `.v2-pill-accent` | Easy | Badges |
| 10 | Empty CSS files: fill or remove (6 files) | Easy | Architecture |

### Phase 3: Component JS Migration (Medium-High Risk)

| Step | Item | Difficulty | Impact |
|------|------|-----------|--------|
| 1 | Icon component adoption (86 files) | Hard | All pages |
| 2 | Section composes SectionHeader | Medium | All pages |
| 3 | watchlist/EmptyState → shared EmptyState | Easy | Watchlist |
| 4 | SearchEmptyState → shared EmptyState | Easy | Search |
| 5 | ProfileCompletion ring → ProgressRing | Medium | Profile |
| 6 | CollectionHero ring → ProgressRing | Medium | Collections |
| 7 | MovieCard → SafeImage | Medium | All cards |
| 8 | DiscoverSection → shared Section | Medium | Discover, Details |
| 9 | Back buttons → shared BackButton | Medium | 4+ pages |
| 10 | Page headers → shared PageHeader | Medium | 5 pages |
| 11 | Shimmer skeletons → shared Skeleton | Medium-High | All loading states |
| 12 | Bottom sheets → shared BottomSheet | Medium | Details, Sync |
| 13 | Status labels → shared utility | Medium | 5+ components |
| 14 | PosterRail shared component | Medium-High | 4 pages |
| 15 | titleOf/yearOf/imdbOf helpers → shared utility | Medium | 12 files |

### Phase 4: Hardcoded Value Eradication (Medium Risk)

| Step | Item | Occurrences | Difficulty |
|------|------|------------|-----------|
| 1 | Define new tokens (modal-backdrop, sticky-header-bg) | — | Easy |
| 2 | Replace `#f5c518` → `var(--color-imdb)` | 30 | Easy |
| 3 | Replace `#f87171` → `var(--color-danger)` | 33 | Easy |
| 4 | Replace `#4ade80` → `var(--color-watching)` | 24 | Easy |
| 5 | Replace `#60a5fa` → `var(--color-completed)` | 6 | Easy |
| 6 | Replace `#ff7878` → `var(--color-rt)` | 3 | Easy |
| 7 | Replace `#141414` → `var(--tier-2)` | 4 | Easy |
| 8 | Replace `#0e0e0e` → `var(--tier-0)` | 2 | Easy |
| 9 | Replace `#1a1a1a` → `var(--tier-3)` | 4 | Easy |
| 10 | Replace `rgba(0,0,0,0.75/0.85)` → `var(--modal-backdrop)` | 20 | Medium |
| 11 | Replace `rgba(5,6,10,0.88/0.92)` → `var(--sticky-header-bg)` | 3 | Easy |
| 12 | Replace `blur(Xpx)` → `blur(var(--blur-X))` | 40 CSS + 79 TSX | Medium |
| 13 | Replace `z-[999997/8/9]` → `var(--z-modal-*)` | 19 | Easy |
| 14 | Replace `font-size: Xpx` → type scale tokens | 39 | Medium |
| 15 | Replace `font-family: 'X'` → `var(--font-X)` | 393 | Medium |

### Phase 5: Tailwind Config Integration (Low Risk)

| Step | Item | Difficulty |
|------|------|-----------|
| 1 | Add all theme.extend mappings to tailwind.config.js | Easy |
| 2 | Document Tailwind utility examples in codebase | Easy |
| 3 | Gradual TSX migration from `var(--token)` → Tailwind utilities | Medium |
| 4 | Verify no regressions | Medium |

---

## 7. RISK MITIGATION

### 7.1 Safe Migration Pattern

1. **Add, don't remove.** Every Phase 1 step should ADD the new token/alias before removing the old one.
2. **Alias period.** Keep old tokens as `--old: var(--new)` aliases for at least one release cycle.
3. **Visual regression testing.** After each step, screenshot key pages (Dashboard, Watchlist, Details, Search, Profile) and diff.
4. **Incremental commits.** One commit per migration item. Never batch.
5. **CSS import order.** The `@layer base` system ensures token definitions don't conflict, but class redefinitions (like `.type-display`) depend on import order. Audit `components/index.css` import order.

### 7.2 Rollback Strategy

- Every Phase 1 token change is reversible — just restore the alias.
- Every Phase 2 class change can be reverted by restoring the old class in CSS.
- Phase 3 component changes require reverting TSX imports — more complex but safe with git.
- Phase 4 hardcoded value replacements are simple find-replace operations — trivially revertible.
- Phase 5 Tailwind config is purely additive — no rollback needed.

### 7.3 Testing Checkpoints

After each phase, verify:

- [ ] All themes still render correctly (Pearl, Sage, Matrix, Netflix, Interstellar, Neon Horizon, Vibranium, Cinematic)
- [ ] Dark mode only — no light mode regressions (app is dark-only)
- [ ] Mobile layout (360px) is not broken
- [ ] Desktop layout (1024px+) is not broken
- [ ] All modals/sheets open and close correctly
- [ ] Toast notifications render with correct accent colors
- [ ] Skeleton shimmer animations still work
- [ ] Focus rings are visible on all interactive elements
- [ ] No console errors from missing CSS variables

---

## Phase 2A: Premium UI Library (Sprint 2A — COMPLETE)

> **Goal:** Create a token-first premium component library as the target architecture for future page migrations.
> **Risk:** ZERO — no existing pages modified, no existing components changed, purely additive.
> **Status:** **COMPLETE** — all 43 components created and marked READY.
> **Sprint:** 2A

### 2A.1 Overview

Phase 2A is a **purely additive** phase that introduces 43 new premium components in `src/shared/ui/premium/` without modifying any existing code. These components represent the **target architecture** that future sprints will migrate existing pages onto.

**Key principle:** Zero visual changes — nothing is consumed yet.

### 2A.2 Components Created

| Group | Directory | Components | Count |
|-------|-----------|------------|-------|
| Layout | `premium/layout/` | PremiumPageContainer, PremiumSectionContainer, PremiumContentContainer, PremiumHeroContainer, PremiumRailContainer | 5 |
| Cards | `premium/cards/` | PremiumCard, PremiumHeroCard, PremiumStatCard, PremiumMiniCard, PremiumHorizontalCard, PremiumPosterStack, PremiumCollectionPreview | 7 |
| Surfaces | `premium/surfaces/` | PremiumSurface, PremiumGlassSurface, PremiumGradientSurface, PremiumOverlay, PremiumBackdrop | 5 |
| Buttons | `premium/buttons/` | PremiumButton, PremiumIconButton, PremiumFloatingButton, PremiumActionRow, PremiumBottomActionBar, PremiumToolbar | 6 |
| Chips | `premium/chips/` | PremiumChip, PremiumTag, PremiumPill | 3 |
| Feedback | `premium/feedback/` | PremiumBadge, PremiumDivider, PremiumEmptyState, PremiumSkeleton, PremiumCarouselHeader | 5 |
| Navigation | `premium/navigation/` | PremiumPageHeader, PremiumSectionHeader | 2 |
| Display | `premium/display/` | PremiumAvatar, PremiumProfileStat, PremiumRatingDisplay, PremiumStatusBadge, PremiumMediaInfo, PremiumProviderChip, PremiumMetric, PremiumLabel, PremiumMetaRow, PremiumInfoRow, PremiumListItem, PremiumTimelineRow | 12 |
| Loading | `premium/loading/` | Re-exports PremiumSkeleton from feedback | — |
| Empty | `premium/empty/` | Re-exports PremiumEmptyState from feedback | — |
| **Total** | | | **43** |

### 2A.3 Architectural Guarantees

| Guarantee | Status |
|-----------|--------|
| All components use ONLY design tokens (zero hardcoded values) | ✅ Verified |
| All components support variants via `variant` prop | ✅ Complete |
| All components support sizes via `size` prop (`sm`/`md`/`lg`) | ✅ Complete |
| All components support states (`disabled`/`loading`/`active`) | ✅ Complete |
| All components are fully TypeScript typed with SolidJS | ✅ Complete |
| All components include ARIA attributes per semantics | ✅ Complete |
| All interactive components support keyboard navigation | ✅ Complete |
| All components use `--focus-ring` token for focus indicators | ✅ Complete |
| All animations respect `prefers-reduced-motion` | ✅ Complete |
| No existing components were modified | ✅ Verified |
| No existing pages were modified | ✅ Verified |
| No visual regressions possible | ✅ By design |

### 2A.4 Migration Impact

| Item | Impact |
|------|--------|
| **Existing components modified** | NONE — all 43 are NEW additions |
| **Existing pages modified** | NONE — no page imports premium components yet |
| **CSS files modified** | NONE — premium components use inline token references |
| **Token files modified** | NONE — premium components consume existing tokens only |
| **Visual regressions** | ZERO — no existing rendering changed |

### 2A.5 Future Migration Phases

These premium components are the **target** for future page migrations:

| Future Sprint | Scope | Risk | Status |
|---------------|-------|------|--------|
| Sprint 2B | Migrate Profile page onto premium components | Medium | **COMPLETE** |
| Sprint 2C | Premium Profile Redesign (product design sprint) | Medium | **COMPLETE** |
| Sprint 2D | Migrate Dashboard/Discover onto premium components | Medium-High | Pending |
| Sprint 2E+ | Migrate Watchlist, Details, Search, Collections, Settings | Medium | Pending |

### Phase 2B: Profile Page Premium Migration (Sprint 2B — COMPLETE)

**Goal:** Rebuild the Profile page using Premium UI components while preserving 100% of existing functionality.

**Components migrated to Premium UI:**

| Original | Premium Replacement | Change Type |
|----------|-------------------|-------------|
| `PageContainer` | `PremiumPageContainer` | Import swap |
| `.empty-premium` (guest/error) | `PremiumEmptyState` | Component replacement |
| `Button` (edit/save/cancel) | `PremiumButton` | Import swap |
| `.profile-member-since` | `PremiumLabel` (variant="overline") | Component replacement |
| `.profile-section-eyebrow` | `PremiumSectionHeader` (accent="bar"/"dot") | Component replacement |
| Custom stat display | `PremiumStatCard` | New section (Statistics Row) |
| `.completion-card` surface | `PremiumGlassSurface` | Component replacement |
| Watchlist summary surface | `PremiumCard` | Component wrapper |
| `.profile-skeleton-*` | `PremiumSkeleton` / `PremiumStatCard` loading | Component replacement |
| `.quick-link-row` inner | `PremiumListItem` | Component replacement |

**Layout improvements:**
- Added Statistics Row section with PremiumStatCard grid (Total, Watching, Completed, Planned)
- Visual rhythm: Hero → Stats → Taste → Completion → Watchlist → Quick Links
- PremiumSectionHeader with accent bar/dot decorations for consistent section spacing
- Alternating density creates breathing room between sections

**CSS changes:**
- Removed `.profile-avatar`/`.profile-avatar-fallback` (replaced by `.profile-avatar-img`/`.profile-avatar-initials`)
- Removed `.profile-member-since` (replaced by PremiumLabel)
- Removed `.profile-section-eyebrow` (replaced by PremiumSectionHeader)
- Replaced hardcoded `#4ade80`/`#f87171` in username validation with `--color-success`/`--color-danger`
- Added `.profile-stats-row` responsive grid (2-col mobile, 4-col desktop)
- Profile CSS reduced by ~30 lines (styles now in premium components)

**Files modified:**
- `src/features/profile/ProfilePage.tsx` — Migrated to Premium UI imports
- `src/features/profile/components/ProfileSkeleton.tsx` — Uses PremiumSkeleton/PremiumStatCard
- `src/features/profile/components/QuickLinks.tsx` — Uses PremiumListItem
- `src/features/profile/components/WatchlistSummary.tsx` — Uses PremiumCard
- `src/features/profile/components/ProfileCompletion.tsx` — Uses PremiumGlassSurface
- `src/routes/profile/index.tsx` — Uses PremiumEmptyState for error boundary
- `src/styles/features/profile.css` — Cleaned up, new stats grid

**Zero regressions:**
- All business logic, hooks, state management, Supabase, authentication unchanged
- No other pages modified
- TypeScript passes with zero errors
- ESLint passes with zero errors (2 pre-existing reactivity warnings)

### Phase 2B Verification Checklist

- [x] TypeScript compilation succeeds with zero errors
- [x] ESLint passes with zero errors (2 pre-existing warnings excluded)
- [x] Profile page uses Premium UI components for all presentation
- [x] Premium components consumed: PremiumPageContainer, PremiumSectionHeader, PremiumStatCard, PremiumButton, PremiumEmptyState, PremiumLabel, PremiumGlassSurface, PremiumCard, PremiumSkeleton, PremiumListItem
- [x] Zero hardcoded values introduced — all tokens
- [x] Zero changes to business logic, hooks, Supabase, auth, routing
- [x] Zero changes to pages outside Profile
- [x] ARIA attributes maintained (role, aria-label, aria-live, keyboard nav)
- [x] Reduced motion support maintained
- [x] Responsive design maintained (320px-1024px)

### Phase 2A Verification Checklist

- [x] 43 components created across 10 groups
- [x] All components use design tokens exclusively
- [x] All components support variant/size/state props
- [x] All components are TypeScript typed
- [x] ARIA attributes present on all relevant components
- [x] Keyboard navigation works on all interactive components
- [x] Focus rings visible via `--focus-ring` token
- [x] `prefers-reduced-motion` respected on all animations
- [x] No existing files modified
- [x] No existing pages import premium components
- [x] Build succeeds with zero warnings
- [x] Zero visual regressions (nothing changed)

### Phase 2A Rollback Plan

Trivial — delete `src/shared/ui/premium/` directory. No other code references it.

## Sprint 2C — Premium Profile Redesign (COMPLETE)

**Date:** 2026-07-13
**Scope:** Profile page only — complete UX/UI redesign
**Type:** Product design sprint (NOT migration, NOT refactor)

### Changes
- **ProfilePage.tsx** — Complete UI rewrite with 8-section architecture
- **TasteCard.tsx** — Asymmetric layout replacing 2×2 equal grid
- **CinemaDna.tsx** — NEW: Viewer archetype insight card
- **ProfileAchievements.tsx** — NEW: Horizontal chip rail
- **SettingsLinks.tsx** — NEW: Separated settings navigation
- **DangerZone.tsx** — NEW: Isolated danger zone section
- **QuickLinks.tsx** — Redesigned: removed Settings, added Watchlist row
- **profile.css** — Major rewrite (976 lines) for new visual system

### Section Architecture (top→bottom)
1. Premium Hero (35vh cinematic backdrop + floating avatar + identity)
2. Statistics (1 featured stat + 3 supporting cards)
3. Taste Identity (asymmetric: hero movie + series + director + genre)
4. Cinema DNA (viewer archetype insight card)
5. Achievements (horizontal PremiumChip rail)
6. Quick Actions (Statistics, History, Watchlist)
7. Settings (Appearance, Notifications, Privacy, Account)
8. Danger Zone (isolated, red-tinted)

### Components Removed from Profile
- ProfileCompletion (separate card) → absorbed into hero as avatar completion ring
- WatchlistSummary (separate card) → absorbed into Quick Actions as Watchlist row

### Premium Components Consumed
PremiumPageContainer, PremiumSectionHeader, PremiumStatCard, PremiumButton, PremiumIconButton, PremiumEmptyState, PremiumLabel, PremiumBadge, PremiumAvatar, PremiumHeroCard, PremiumCard, PremiumGradientSurface, PremiumChip, PremiumListItem, PremiumSurface, PremiumDivider

### Verification
- TypeScript: ✅ 0 errors
- ESLint: ✅ 0 errors (3 pre-existing warnings)
- Production build: ✅ Success
- Business logic: Zero changes
- Other pages: Zero changes

---

## 8. TOKEN DECISIONS SUMMARY

These decisions resolve the ambiguities found in the audit:

| Decision | Choice | Rationale |
|----------|--------|-----------|
| `--void` vs `--deep` | Keep `--void`, remove `--deep` | `--void` is the semantic name; `--deep` has no distinct use |
| `--surface` vs `--tier-2` | Keep `--tier-2` (#111317), remove `--surface` (#111111) | Tier system is the canonical elevation model; blue tint is intentional for cinematic feel |
| `--raised` vs `--tier-3` | Keep `--tier-3` (#181b21), alias `--raised` | Same rationale — tier system is canonical |
| `--text` vs `--text-body` | Keep `--text-body`, remove `--text` | V2 naming is more descriptive |
| `--muted` (0.42) vs `--text-muted` (0.48) | Keep `--text-muted` (0.48) | Higher alpha = better legibility; 0.42 fails WCAG contrast on dark backgrounds |
| `--dim` (0.18) vs `--text-dim` (0.24) | Keep `--text-dim` (0.24) | Same rationale — 0.18 is nearly invisible |
| `--border` (0.08) → `--hairline` (0.06) or `--hairline-2` (0.10)? | Per-context: most → `--hairline-2` (0.10) | 0.08 is closer to 0.10 than 0.06; `--hairline-2` is the safer mapping |
| `--border-active` (0.15) vs `--hairline-3` (0.16) | Keep `--hairline-3` (0.16) | Part of the coherent hairline scale |
| `.type-display` V1 (2.5rem) vs V2 (3.25rem) | Keep V2 (3.25rem) | V2 display is the signature editorial size |
| Active scale standardization | `0.96` default, `0.94` for large cards | Most components already use 0.96; 0.94 for visual weight on cards |
| `--glass-blur` (20px) mapping | `--blur-lg` (20px) | Exact match |

---

*This document is a permanent reference. Update as migrations are completed.*
