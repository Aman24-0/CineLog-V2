# CineLog V2 — Design System Migration: Implementation Order

> **Version:** 1.0  
> **Date:** 2026-07-12  
> **Status:** Execution Plan — Regress-Minimizing Phased Rollout  
> **Depends On:** DesignTokens.md, ComponentInventory.md, DesignDebt.md, CDL.md  
> **Rule:** Every phase must be independently deployable with zero visual regressions.

---

## Guiding Principles

| # | Principle | Rationale |
|---|-----------|-----------|
| 1 | **Token-first** | Components reference tokens; changing tokens propagates automatically without touching component code. |
| 2 | **Additive before subtractive** | Add new tokens/classes BEFORE removing old ones. Dual definitions are acceptable during transition. |
| 3 | **Low-risk before high-risk** | Start with changes that affect the fewest pages or are purely additive. |
| 4 | **Backward-compatible** | Every phase must pass existing visual regression tests. Old names must keep working until all references are migrated. |
| 5 | **Test each phase** | Each phase must be verified before advancing. A failure in Phase N blocks Phase N+1. |

---

## Risk Matrix

| Risk Level | Definition | Approval |
|------------|-----------|----------|
| **ZERO** | Only adding new tokens/variables — no CSS output changes | Auto-approve |
| **LOW** | Token value identical, reference swapped; new classes coexist with old | Code review |
| **MEDIUM** | Changing feature files but visual output should be identical; removing dual names after audit | Code review + spot-check |
| **HIGH** | Removing old components/classes; merging variants; deleting CSS files | Code review + full regression suite |

---

## Phase 1: Token Foundation

> **Goal:** Add every missing token and alias so that all future phases have a stable target to reference.  
> **Risk:** ZERO — only adding new custom properties; no visual output changes.  
> **Pages Affected:** None (zero visual delta)  
> **Estimated Effort:** 4–6 hours

### 1.1 Typography Tokens — `src/styles/tokens/typography.css`

Currently this file is an empty stub (7 lines of comments only). Populate it:

| Task | Token | Value | Notes |
|------|-------|-------|-------|
| 1.1.1 | `--font-sans` | `'Outfit', sans-serif` | Body typeface |
| 1.1.2 | `--font-display` | `'Bebas Neue', cursive` | Hero/page titles |
| 1.1.3 | `--font-mono` | `'Azeret Mono', monospace` | Labels, eyebrows, meta |
| 1.1.4 | `--text-xs` | `0.5rem` (8px) | Caption, tiny labels, badge text |
| 1.1.5 | `--text-sm` | `0.5625rem` (9px) | Micro labels, chip text, pill text |
| 1.1.6 | `--text-base` | `0.6875rem` (11px) | Eyebrow, section title, card title |
| 1.1.7 | `--text-md` | `0.75rem` (12px) | Meta, username, input font |
| 1.1.8 | `--text-lg` | `0.875rem` (14px) | Card descriptions, notes |
| 1.1.9 | `--text-xl` | `0.9375rem` (15px) | Body (V2), metadata, labels |
| 1.1.10 | `--text-2xl` | `1.25rem` (20px) | Headline, section header |
| 1.1.11 | `--text-3xl` | `2rem` (32px) | Display-sm, genre title |
| 1.1.12 | `--text-4xl` | `3.25rem` (52px) | Display (hero page titles) |

### 1.2 Z-Index Tokens — `src/styles/tokens/z-index.css`

Currently only nav-height tokens. Add a named z-index scale:

| Task | Token | Value | Maps To |
|------|-------|-------|---------|
| 1.2.1 | `--z-base` | `0` | Ambient glow, profile content |
| 1.2.2 | `--z-overlay` | `1` | Gradient overlays, hero content |
| 1.2.3 | `--z-card` | `2` | Card gradient overlays |
| 1.2.4 | `--z-badge` | `3` | Spotlight badge, universe badge |
| 1.2.5 | `--z-media` | `5` | Cinematic trailer player |
| 1.2.6 | `--z-node` | `10` | Timeline node |
| 1.2.7 | `--z-sticky` | `30` | Sticky headers, search bar, month pills |
| 1.2.8 | `--z-nav` | `40` | Bottom navigation |
| 1.2.9 | `--z-toast` | `9999` | Toast stack |
| 1.2.10 | `--z-modal` | `999999` | Modal backdrops |
| 1.2.11 | `--z-max` | `9999999` | Maximum layer (reserved) |

### 1.3 Semantic Color Tokens — `src/styles/tokens/colors.css`

Add inside the existing `@layer base { :root { … } }` block (after glass tokens):

| Task | Token | Value | Semantic Meaning |
|------|-------|-------|-----------------|
| 1.3.1 | `--color-watching` | `#4ade80` | "Watching" status (success green) |
| 1.3.2 | `--color-completed` | `#60a5fa` | "Completed" status (info blue) |
| 1.3.3 | `--color-danger` | `#f87171` | Destructive, error, remove |
| 1.3.4 | `--color-imdb` | `#f5c518` | IMDb rating source |
| 1.3.5 | `--color-rt` | `#ff7878` | Rotten Tomatoes source |
| 1.3.6 | `--color-gold` | `#FFD700` | Cinematic theme accent / premium gold |
| 1.3.7 | `--color-warning` | `#f59e0b` | Warning states (reserved) |
| 1.3.8 | `--color-info` | `#60a5fa` | Informational states (alias for completed) |

### 1.4 Blur Tokens — `src/styles/tokens/motion.css`

Add blur scale alongside existing easing/duration tokens:

| Task | Token | Value | Current Hardcoded Usage |
|------|-------|-------|------------------------|
| 1.4.1 | `--blur-xs` | `4px` | Episode card number backdrop |
| 1.4.2 | `--blur-sm` | `8px` | Tag chip, rating chip, relationship pill |
| 1.4.3 | `--blur-md` | `12px` | Close button, badge-accent, search bar |
| 1.4.4 | `--blur-lg` | `20px` | Glass default (same as `--glass-blur`) |
| 1.4.5 | `--blur-xl` | `24px` | Toast, search bar sticky |
| 1.4.6 | `--blur-2xl` | `28px` | Filter drawer, action dock, glass-strong |
| 1.4.7 | `--blur-backdrop` | `60px` | Cinematic ambient backdrop |

### 1.5 Opacity & Scale Tokens — `src/styles/tokens/motion.css`

| Task | Token | Value | Usage |
|------|-------|-------|-------|
| 1.5.1 | `--opacity-disabled` | `0.5` | Disabled buttons, soft pulse mid-point |
| 1.5.2 | `--opacity-ambient` | `0.4` | Ambient glow, episode card watched |
| 1.5.3 | `--opacity-faint` | `0.65` | Discover empty icon |
| 1.5.4 | `--opacity-subtle` | `0.7` | Quick-filter count, timeline missing |
| 1.5.5 | `--opacity-muted` | `0.85` | Episode card watched |
| 1.5.6 | `--scale-active` | `0.96` | Button active scale, scaleFade start |

### 1.6 Composite & Gradient Tokens — `src/styles/tokens/motion.css` (or new file)

| Task | Token | Value | Usage |
|------|-------|-------|-------|
| 1.6.1 | `--focus-ring` | `0 0 0 2px var(--tier-1), 0 0 0 4px var(--p)` | Keyboard focus ring (matches `_phase22_sprint1.css` `.focus-ring`) |
| 1.6.2 | `--cinematic-gradient` | `linear-gradient(to top, rgba(8,9,11,1.00) 0%, rgba(8,9,11,0.88) 20%, rgba(8,9,11,0.50) 45%, rgba(8,9,11,0.12) 70%, transparent 100%), linear-gradient(to right, rgba(8,9,11,0.60) 0%, transparent 45%)` | Hero/backdrop gradient (matches `helpers.css` `.backdrop-gradient`) |
| 1.6.3 | `--backdrop-gradient` | (same as `--cinematic-gradient`) | Alias for clarity |
| 1.6.4 | `--shimmer-duration` | `1.6s` | Skeleton shimmer loop |
| 1.6.5 | `--shimmer-gradient` | `linear-gradient(105deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.07) 50%, rgba(255,255,255,0.03) 75%)` | Skeleton shimmer background |
| 1.6.6 | `--modal-backdrop` | `rgba(0,0,0,0.72)` | Modal overlay background |
| 1.6.7 | `--sticky-header-bg` | `var(--glass-bg)` | Sticky header glass background |

### 1.7 Accessibility Token — `src/styles/tokens/radius.css`

| Task | Action | Notes |
|------|--------|-------|
| 1.7.1 | Add `--radius-xs: 2px` | Currently missing; covers heatmap cells, scrollbar thumb, progress bars |
| 1.7.2 | Keep `--touch-min: 44px` in radius.css for now | Will move to accessibility section in Phase 2 |

### 1.8 Spacing Gap Fill — `src/styles/tokens/spacing.css`

Add missing steps in the spacing scale:

| Task | Token | Value |
|------|-------|-------|
| 1.8.1 | `--sp-9` | `36px` |
| 1.8.2 | `--sp-11` | `44px` |
| 1.8.3 | `--sp-14` | `56px` |
| 1.8.4 | `--sp-16` | `64px` |

### 1.9 Alias Tokens — `src/styles/tokens/colors.css`

Add backward-compatible aliases so that new code can use canonical names while old code keeps working:

| Task | Alias | Points To | Notes |
|------|-------|-----------|-------|
| 1.9.1 | `--text` | `var(--text-body)` | Old name → new canonical |
| 1.9.2 | `--muted` | `var(--text-muted)` | Old name → new canonical (note: old value was 0.42 alpha, new is 0.48 — alias uses new) |
| 1.9.3 | `--dim` | `var(--text-dim)` | Old name → new canonical (note: old value was 0.18 alpha, new is 0.24 — alias uses new) |
| 1.9.4 | `--border` | `var(--hairline)` | Old name → new canonical |
| 1.9.5 | `--surface` | `var(--tier-2)` | Old name → new canonical |
| 1.9.6 | `--raised` | `var(--tier-3)` | Old name → new canonical |

> **⚠️ Alpha value divergence:** The old `--muted` was `rgba(232,234,240,0.42)` while `--text-muted` is `0.48`. The old `--dim` was `0.18` while `--text-dim` is `0.24`. Making these true aliases means components using `--muted` will see a slightly different opacity. This is acceptable because: (a) the difference is visually minimal, (b) the new values are the intended V2 values, (c) Phase 6 will remove the old names entirely. If pixel-perfect backward compat is required during Phase 1, keep the old hex values as-is and defer the alias swap to Phase 6.

**Recommended approach for Phase 1:** Keep `--text`, `--muted`, `--dim` at their original values. Do NOT alias them yet. Aliasing happens in Phase 6 when all references are audited.

### 1.10 Tailwind Configuration — `tailwind.config.js`

Currently empty `extend: {}`. Map all tokens:

```js
theme: {
  extend: {
    colors: {
      void: 'var(--void)',
      deep: 'var(--deep)',
      surface: 'var(--surface)',
      raised: 'var(--raised)',
      tier: {
        0: 'var(--tier-0)',
        1: 'var(--tier-1)',
        2: 'var(--tier-2)',
        3: 'var(--tier-3)',
        4: 'var(--tier-4)',
      },
      p: 'var(--p)',
      'p2': 'var(--p2)',
      'p-glow': 'var(--p-glow)',
      'p-dim': 'var(--p-dim)',
      watching: 'var(--color-watching)',
      completed: 'var(--color-completed)',
      danger: 'var(--color-danger)',
      imdb: 'var(--color-imdb)',
      rt: 'var(--color-rt)',
      gold: 'var(--color-gold)',
    },
    fontFamily: {
      sans: 'var(--font-sans)',
      display: 'var(--font-display)',
      mono: 'var(--font-mono)',
    },
    fontSize: {
      xs: 'var(--text-xs)',
      sm: 'var(--text-sm)',
      base: 'var(--text-base)',
      md: 'var(--text-md)',
      lg: 'var(--text-lg)',
      xl: 'var(--text-xl)',
      '2xl': 'var(--text-2xl)',
      '3xl': 'var(--text-3xl)',
      '4xl': 'var(--text-4xl)',
    },
    spacing: {
      9: 'var(--sp-9)',
      11: 'var(--sp-11)',
      14: 'var(--sp-14)',
      16: 'var(--sp-16)',
    },
    borderRadius: {
      xs: 'var(--radius-xs)',
    },
    zIndex: {
      base: 'var(--z-base)',
      overlay: 'var(--z-overlay)',
      card: 'var(--z-card)',
      badge: 'var(--z-badge)',
      media: 'var(--z-media)',
      node: 'var(--z-node)',
      sticky: 'var(--z-sticky)',
      nav: 'var(--z-nav)',
      toast: 'var(--z-toast)',
      modal: 'var(--z-modal)',
      max: 'var(--z-max)',
    },
    boxShadow: {
      'focus-ring': 'var(--focus-ring)',
    },
    blur: {
      xs: 'var(--blur-xs)',
      sm: 'var(--blur-sm)',
      md: 'var(--blur-md)',
      lg: 'var(--blur-lg)',
      xl: 'var(--blur-xl)',
      '2xl': 'var(--blur-2xl)',
      backdrop: 'var(--blur-backdrop)',
    },
  },
},
```

### Phase 1 Verification Checklist

- [ ] All existing pages render identically (screenshot comparison)
- [ ] No console warnings about unknown CSS custom properties
- [ ] `git diff` shows only additions in token files + tailwind.config.js
- [ ] Tailwind utility classes (`bg-tier-2`, `text-watching`, etc.) compile correctly
- [ ] Build succeeds with no CSS or JS errors
- [ ] All 8 themes still apply correctly (theme override rules untouched)

### Phase 1 Rollback Plan

Delete all added tokens and revert `tailwind.config.js` to `extend: {}`. No other files are modified, so rollback is a clean `git revert` of the Phase 1 commit.

---

## Phase 2: CSS Consolidation

> **Goal:** Resolve V1/V2 class collisions, replace hardcoded hex in shared CSS with token references, clean up stubs.  
> **Risk:** LOW — token values are identical to the hex they replace; visual output should be pixel-identical.  
> **Pages Affected:** All pages (but changes are value-identical swaps)  
> **Estimated Effort:** 3–4 hours

### 2.1 Resolve V1/V2 Typography Collisions

The file `src/styles/components/_phase21.css` defines `.type-display`, `.type-headline`, `.type-body`, `.type-body-soft`, `.type-eyebrow`, `.type-meta` — all of which are overridden by later-loaded `src/styles/components/_phase22_sprint1.css` with different values. The Phase 2.1 definitions are **dead CSS**.

| Task | Action | File | Rationale |
|------|--------|------|-----------|
| 2.1.1 | Delete `.type-display` (Phase 2.1 version) | `_phase21.css` line 6 | V2 overrides with 3.25rem; 2.5rem is dead code |
| 2.1.2 | Delete `.type-headline` (Phase 2.1 version) | `_phase21.css` line 8 | V2 overrides with 1.25rem; 1.125rem is dead code |
| 2.1.3 | Delete `.type-body` (Phase 2.1 version) | `_phase21.css` line 9 | V2 overrides with 0.9375rem; 0.875rem is dead code |
| 2.1.4 | Delete `.type-body-soft` (Phase 2.1 version) | `_phase21.css` line 10 | V2 overrides with 0.9375rem; 0.875rem is dead code |
| 2.1.5 | Delete `.type-eyebrow` (Phase 2.1 version) | `_phase21.css` line 11 | V2 overrides with 0.6875rem; 0.625rem is dead code |
| 2.1.6 | Delete `.type-meta` (Phase 2.1 version) | `_phase21.css` line 12 | V2 overrides with 0.75rem/0.08em; 0.6875rem/0.12em is dead code |
| 2.1.7 | **Keep** `.type-display-lg` | `_phase21.css` line 7 | Not overridden by V2 — still used by hero components |
| 2.1.8 | **Keep** `.type-stat-lg` | `_phase21.css` line 13 | Not overridden by V2 — still used by stat components |

**Risk note:** Deleting these lines produces zero visual change because the V2 definitions already override them in the cascade. However, if any component applies `_phase21.css` classes without also loading `_phase22_sprint1.css`, it would regress. Verify that both files always load together (they do — both are imported in `components/index.css`).

### 2.2 Replace Hardcoded Hex in `src/styles/components/cards.css`

| Task | Old Value | New Reference | Lines Affected |
|------|-----------|---------------|----------------|
| 2.2.1 | `#111111` | `var(--surface)` / `var(--tier-2)` | line 6 (`.glass-surface`) |
| 2.2.2 | `#141414` | `var(--tier-2)` (≈ `#111317`, close enough) | lines 7, 14, 25, 61 |
| 2.2.3 | `#1a1a1a` | `var(--raised)` / `var(--tier-3)` (≈ `#181b21`, close enough) | lines 8, 62 |
| 2.2.4 | `#0e0e0e` | `var(--tier-1)` (≈ `#0a0b0e`, close enough) | line 33 |
| 2.2.5 | `#161616` | `var(--tier-2)` | line 20 (poster-loading gradient) |
| 2.2.6 | `#0e0e0e` (in gradient) | `var(--tier-1)` | line 20 |

> **⚠️ Color precision note:** The tier tokens are not exact matches for the old hex values. `--tier-2` is `#111317` vs `#141414` — a barely perceptible difference (slightly less red). `--tier-3` is `#181b21` vs `#1a1a1a` — also minimal. This is intentional: the tier tokens are the canonical V2 values and the old hex was never part of a systematic scale. If pixel-perfect matching is required, introduce `--tier-2-legacy: #141414` and `--tier-3-legacy: #1a1a1a` as intermediate tokens, then migrate in Phase 6.

**Recommended:** Use the tier tokens directly. The visual difference is imperceptible on dark backgrounds and aligns the codebase with the V2 elevation system.

### 2.3 Clean Up Empty CSS Stubs

| Task | File | Action |
|------|------|--------|
| 2.3.1 | `src/styles/components/skeleton.css` | Currently empty (5-line comment). Add `/* Skeleton styles live in _phase21.css (.skeleton-base, .skeleton-text). Future shared skeleton classes will go here. */` |
| 2.3.2 | `src/styles/tokens/typography.css` | Currently empty (7-line comment). Will be populated in Phase 1. Mark as active. |

### 2.4 Replace Hardcoded `font-family` Strings with Token References

This is a *find-and-tag* task only in Phase 2 (actual replacement happens in Phase 5 for feature CSS). In shared component CSS:

| Task | File | Current | Target |
|------|------|---------|--------|
| 2.4.1 | `_phase21.css` | `font-family: 'Outfit', sans-serif` | `font-family: var(--font-sans)` |
| 2.4.2 | `_phase21.css` | `font-family: 'Bebas Neue', cursive` | `font-family: var(--font-display)` |
| 2.4.3 | `_phase21.css` | `font-family: 'Azeret Mono', monospace` | `font-family: var(--font-mono)` |
| 2.4.4 | `_phase22_sprint1.css` | All three families | Same replacement |
| 2.4.5 | `cards.css` | `font-family: 'Bebas Neue', cursive` (empty-state-title) | `var(--font-display)` |
| 2.4.6 | `cards.css` | `font-family: 'Outfit', sans-serif` (empty-state-body) | `var(--font-sans)` |
| 2.4.7 | `cards.css` | `font-family: 'Azeret Mono', monospace` (section-title) | `var(--font-mono)` |

### Phase 2 Verification Checklist

- [ ] Visual regression: all pages look identical
- [ ] No `.type-display` / `.type-headline` definitions remain in `_phase21.css` (only in `_phase22_sprint1.css`)
- [ ] `.type-display-lg` and `.type-stat-lg` still exist in `_phase21.css`
- [ ] No hardcoded hex colors remain in `cards.css` (only token references)
- [ ] All `font-family` in shared component CSS uses `var(--font-*)` tokens
- [ ] Build succeeds, all themes apply correctly

### Phase 2 Rollback Plan

Revert `_phase21.css` deletions and `cards.css` substitutions. All changes are within 2–3 files so a targeted `git checkout` suffices.

---

## Phase 3: Shared CSS Patterns

> **Goal:** Create shared CSS utility classes for repeated inline patterns (shimmer, gradients, headers, rails, badges). New classes coexist with old inline instances.  
> **Risk:** LOW — purely additive; existing inline styles untouched.  
> **Pages Affected:** None (new classes are defined but not yet consumed)  
> **Estimated Effort:** 4–5 hours

### 3.1 Shared Shimmer Class — `src/styles/components/skeleton.css`

Replace the 14+ inline instances of shimmer background + animation with a single class.

```css
.shimmer {
  background: var(--shimmer-gradient);
  background-size: 300% 100%;
  animation: shimmer var(--shimmer-duration) ease-in-out infinite;
}

/* Subtle variant for text placeholders */
.shimmer-text {
  background: linear-gradient(105deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.07) 50%, rgba(255,255,255,0.03) 75%);
  background-size: 300% 100%;
  animation: shimmer var(--shimmer-duration) ease-in-out infinite;
  border-radius: var(--radius-sm);
}

/* Poster loading shimmer (different base gradient) */
.shimmer-poster {
  background: linear-gradient(105deg, rgba(255,255,255,0.00) 25%, rgba(255,255,255,0.055) 50%, rgba(255,255,255,0.00) 75%),
              linear-gradient(to bottom, var(--tier-2), var(--tier-1));
  background-size: 300% 100%, 100% 100%;
  animation: shimmer 1.4s ease-in-out infinite;
}
```

**Instances to migrate later (Phase 5):**

| File | Lines | Current Pattern |
|------|-------|-----------------|
| `features/profile.css` | 44–50, 916, 930, 944, 952 | `animation: shimmer 1.6s …` |
| `features/details.css` | 420 | `animation: shimmer 1.6s …` |
| `features/secondary.css` | 1083, 1090 | `animation: shimmer 1.6s …` |
| `features/search.css` | 458 | `animation: shimmer 1.6s …` |
| `features/discover.css` | 80, 860 | `animation: shimmer 1.6s …` |
| `features/collections.css` | 399, 1038 | `animation: shimmer 1.6s …` |
| `components/cards.css` | 20 | `animation: shimmer 1.4s …` (poster) |
| `components/_phase21.css` | 54–55 | `.skeleton-base`, `.skeleton-text` |

### 3.2 Shared Cinematic Gradient — `src/styles/utilities/helpers.css`

The `.backdrop-gradient` already exists here. Add a tokenized version:

```css
.cinematic-gradient {
  position: absolute;
  inset: 0;
  background: var(--cinematic-gradient);
  pointer-events: none;
}
```

This produces identical output to `.backdrop-gradient` but references the `--cinematic-gradient` token from Phase 1.

### 3.3 Shared Page Header Component — `src/styles/components/_phase22_sprint1.css` (or new file)

Create reusable header pattern found on 5+ pages (Discover, Search, Watchlist, Collections, Profile):

```css
.page-header {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-2) 0;
}

.page-header-title {
  font-family: var(--font-display);
  font-size: 2.5rem;
  line-height: 1;
  letter-spacing: 0.03em;
  color: var(--text-strong);
}

.page-header-back {
  font-family: var(--font-mono);
  font-size: 0.5625rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--p);
  background: transparent;
  border: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0;
}
```

### 3.4 Shared Back Button — `src/styles/components/buttons.css`

```css
.back-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  font-family: var(--font-mono);
  font-size: 0.5625rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--p);
  background: transparent;
  border: none;
  cursor: pointer;
  padding: var(--sp-2) 0;
  transition: color var(--dur-fast) var(--ease-out);
}
.back-btn:hover { color: var(--text-strong); }
.back-btn:active { transform: scale(0.96); }
```

### 3.5 Shared Rail Component — `src/styles/components/_phase21.css` or new `rails.css`

The `.rail-premium` class already exists in `_phase21.css`. Add standardized variants:

```css
.rail {
  display: flex;
  gap: var(--sp-3);
  overflow-x: auto;
  scroll-snap-type: x proximity;
  padding-bottom: var(--sp-3);
  -webkit-overflow-scrolling: touch;
}
.rail > * { scroll-snap-align: start; }
.rail-compact { gap: var(--sp-2); }
.rail-wide { gap: var(--sp-4); }
```

### 3.6 Shared Status Badge Classes

Currently each feature defines its own status badge variants. Create shared semantic classes:

```css
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.625rem;
  border-radius: var(--radius-pill);
  font-family: var(--font-mono);
  font-size: 0.5625rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  background: rgba(0,0,0,0.72);
  backdrop-filter: blur(var(--blur-sm));
}
.status-badge-watching {
  color: var(--color-watching);
  border: 1px solid rgba(74,222,128,0.35);
}
.status-badge-completed {
  color: var(--color-completed);
  border: 1px solid rgba(96,165,250,0.35);
}
.status-badge-planned {
  color: var(--text-soft);
  border: 1px solid var(--hairline-2);
}
.status-badge-dropped {
  color: var(--color-danger);
  border: 1px solid rgba(248,113,113,0.35);
}
```

### 3.7 Shared Focus Ring Token Class

Already exists in `_phase22_sprint1.css` as `.focus-ring` and `.focus-ring-subtle`. Document them as the canonical classes and ensure they reference `--focus-ring` token from Phase 1:

```css
.focus-ring:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}
```

### Phase 3 Verification Checklist

- [ ] New classes defined and documented
- [ ] Existing inline patterns still work (nothing removed yet)
- [ ] New `.shimmer` class produces identical animation to inline `animation: shimmer 1.6s …`
- [ ] New `.cinematic-gradient` produces identical output to `.backdrop-gradient`
- [ ] New `.status-badge-*` classes match existing feature-level badge styles
- [ ] Build succeeds with no CSS conflicts

### Phase 3 Rollback Plan

Delete the new class definitions. No existing code references them yet, so removal is safe.

---

## Phase 4: Shared JS Components

> **Goal:** Create shared SolidJS components to replace duplicated feature-level implementations. New components coexist with old ones — no feature code is modified yet.  
> **Risk:** LOW — purely additive; no existing components removed.  
> **Pages Affected:** None (new components exist but are not consumed)  
> **Estimated Effort:** 10–14 hours

### 4.1 Fix Icon Bypass in Existing Components

Multiple components inline `<span class="material-symbols-outlined">` instead of using the `<Icon>` component from `src/shared/ui/Icon.tsx`.

| Task | Component | File | Current Pattern | Fix |
|------|-----------|------|-----------------|-----|
| 4.1.1 | Button | `primitives/Button.tsx` lines 57–68 | Inline `<span class="material-symbols-outlined">` | Use `<Icon name={local.icon} fill={local.iconFill} />` |
| 4.1.2 | Badge | `primitives/Badge.tsx` | Inline `<span class="material-symbols-outlined">` | Use `<Icon>` |
| 4.1.3 | SectionHeader | `primitives/SectionHeader.tsx` lines 34–39 | Inline `<span class="material-symbols-outlined">` | Use `<Icon>` |
| 4.1.4 | Section | `primitives/Section.tsx` lines 63–67 | Inline `<span class="material-symbols-outlined">` | Use `<Icon>` |
| 4.1.5 | ToastContainer | `ui/ToastContainer.tsx` | Inline `<span class="material-symbols-outlined">` | Use `<Icon>` |
| 4.1.6 | ScrollToTop | `ui/ScrollToTop.tsx` | Inline `<span class="material-symbols-outlined">` | Use `<Icon>` |

### 4.2 Add Icon Size Prop

The `<Icon>` component currently has no `size` prop. Add one:

```tsx
type IconProps = {
  name: string;
  fill?: boolean;
  size?: number | string;  // NEW — pixel size, default 24
  class?: string;
  style?: string | JSX.CSSProperties;
  "aria-hidden"?: boolean | "true" | "false";
  "aria-label"?: string;
};
```

Implementation: When `size` is provided, set `style={{ "font-size": typeof size === "number" ? `${size}px` : size }}`.

### 4.3 Create Shared BottomSheet Component

**File:** `src/shared/ui/primitives/BottomSheet.tsx`

Extract pattern from 3+ instances:
- `src/features/details/components/AddToFolderSheet.tsx`
- `src/features/details/components/ConfirmRemoveSheet.tsx`
- `src/features/sync/components/ResetConfirmSheet.tsx`

Shared interface:

```tsx
interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: JSX.Element;
  danger?: boolean;  // red header variant
}
```

CSS: Uses `.modal-sheet-enter` + `@keyframes sheetUp` from `motion.css`. Glass background from `--glass-bg-strong`.

### 4.4 Create Shared PosterRail Component

**File:** `src/shared/ui/primitives/PosterRail.tsx`

Extract pattern from:
- `src/features/discover/components/DiscoverRail.tsx` (primary implementation)
- 3+ copy-paste variants across features

```tsx
interface PosterRailProps {
  title: string;
  icon?: string;
  actionLabel?: string;
  onAction?: () => void;
  items: MovieItem[];
  onItemSelected: (id: string) => void;
  emptyMessage?: string;
}
```

CSS: Uses `.rail-premium` from `_phase21.css` + `<SectionHeader>` + `<MovieCard>`.

### 4.5 Create Shared PageHeader Component

**File:** `src/shared/ui/primitives/PageHeader.tsx`

```tsx
interface PageHeaderProps {
  title: string;
  backLabel?: string;
  onBack?: () => void;
  actions?: JSX.Element;
}
```

CSS: Uses `.page-header` / `.page-header-title` / `.page-header-back` from Phase 3.

### 4.6 Create Shared BackButton Component

**File:** `src/shared/ui/primitives/BackButton.tsx`

```tsx
interface BackButtonProps {
  label: string;
  onClick?: () => void;
}
```

CSS: Uses `.back-btn` from Phase 3.

### 4.7 Create Shared Utility Functions

**File:** `src/shared/utils/label.ts`

```ts
export function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    watching: "Watching",
    completed: "Completed",
    planned: "Planned",
    dropped: "Dropped",
    on_hold: "On Hold",
  };
  return labels[status] ?? status;
}

export function titleOf(item: { title?: string; name?: string }): string {
  return item.title ?? item.name ?? "Untitled";
}

export function yearOf(item: { release_date?: string; first_air_date?: string }): string | null {
  const date = item.release_date ?? item.first_air_date;
  return date ? new Date(date).getFullYear().toString() : null;
}

export function imdbOf(item: { vote_average?: number }): string | null {
  return item.vote_average ? item.vote_average.toFixed(1) : null;
}
```

### 4.8 Consolidate EmptyState

**Current state:** `src/shared/ui/primitives/EmptyState.tsx` exists but features have their own variants (Discover, Search, Profile, Collections, Sync).

**Action:** Add missing props to the shared primitive so it covers all use cases:

```tsx
interface EmptyStateProps {
  icon?: string;
  iconFill?: boolean;
  title: string;
  body?: string;
  action?: string;
  onAction?: () => void;
  premium?: boolean;  // uses .empty-premium instead of .empty-state
}
```

### 4.9 Fix Section/SectionHeader Duplication

`Section.tsx` renders its own inline `<SectionHeader>` logic (lines 56–92) instead of using the `<SectionHeader>` primitive. Refactor:

```tsx
// Section.tsx — simplified
<Show when={props.title || props.eyebrow}>
  <SectionHeader
    title={props.title ?? ""}
    icon={props.icon}
    actionLabel={props.actionLabel}
    onAction={props.onAction}
    eyebrow={props.eyebrow}
  />
</Show>
```

Requires adding `eyebrow` prop to `SectionHeader.tsx`.

### 4.10 Complete Barrel Exports — `src/shared/ui/primitives/index.ts`

Add new components as they are created:

```ts
export { default as Button } from "./Button";
export { default as Badge } from "./Badge";
export { default as SectionHeader } from "./SectionHeader";
export { default as Section } from "./Section";
export { default as Skeleton } from "./Skeleton";
export { default as EmptyState } from "./EmptyState";
export { default as GlassCard } from "./GlassCard";
export { default as BottomSheet } from "./BottomSheet";      // NEW
export { default as PosterRail } from "./PosterRail";         // NEW
export { default as PageHeader } from "./PageHeader";         // NEW
export { default as BackButton } from "./BackButton";         // NEW
```

Also export utilities from `src/shared/ui/index.ts`:

```ts
export { default as Icon } from "./Icon";
export { default as PageContainer } from "./PageContainer";
export { default as SafeImage } from "./SafeImage";
export * from "./primitives";
export * from "../utils/label";  // NEW — statusLabel, titleOf, yearOf, imdbOf
```

### Phase 4 Verification Checklist

- [ ] All existing components still render identically
- [ ] `<Icon>` component works with `size` prop
- [ ] `<BottomSheet>`, `<PosterRail>`, `<PageHeader>`, `<BackButton>` render in isolation
- [ ] `<Section>` uses `<SectionHeader>` internally (no duplication)
- [ ] `<EmptyState>` covers both standard and premium variants
- [ ] `statusLabel()`, `titleOf()`, `yearOf()`, `imdbOf()` produce correct output
- [ ] Barrel exports compile without circular dependencies
- [ ] All feature pages still use their old components (no forced migration yet)

### Phase 4 Rollback Plan

Delete new component files and revert barrel exports. No feature code references new components, so removal is safe.

---

## Phase 5: Feature CSS Refactoring

> **Goal:** Replace all hardcoded values in feature CSS files with token references and shared classes. This is the broadest phase but each change is individually safe.  
> **Risk:** MEDIUM — modifying feature files, but visual output should be identical.  
> **Pages Affected:** All feature pages (discover, search, watchlist, collections, details, profile, settings, secondary)  
> **Estimated Effort:** 12–16 hours

### 5.1 Replace Status Color Hex with Tokens

**Scope:** 30+ instances across all feature CSS files.

| Task | Old Hex | New Token | Files |
|------|---------|-----------|-------|
| 5.1.1 | `#4ade80` | `var(--color-watching)` | profile.css, watchlist.css, secondary.css, discover.css, collections.css |
| 5.1.2 | `#f87171` | `var(--color-danger)` | profile.css, details.css, secondary.css, settings.css, discover.css |
| 5.1.3 | `#60a5fa` | `var(--color-completed)` | watchlist.css, secondary.css |
| 5.1.4 | `#f5c518` | `var(--color-imdb)` | details.css, watchlist.css, secondary.css, collections.css |
| 5.1.5 | `#ff7878` | `var(--color-rt)` | watchlist.css |

Also replace related `rgba(74,222,128,…)`, `rgba(96,165,250,…)`, `rgba(248,113,113,…)`, `rgba(245,197,24,…)`, `rgba(255,120,120,…)` border/background values with `color-mix(in srgb, var(--color-*) XX%, transparent)` or dedicated alpha tokens.

### 5.2 Replace Shimmer Pattern with Shared Class

Replace all inline `animation: shimmer 1.6s ease-in-out infinite` + background gradient definitions with `.shimmer` or `.shimmer-text`:

| Task | File | Replacement |
|------|------|-------------|
| 5.2.1 | `features/profile.css` (5 instances) | Add `shimmer` class to elements, remove inline `animation` + `background` |
| 5.2.2 | `features/details.css` (1 instance) | Same |
| 5.2.3 | `features/secondary.css` (2 instances) | Same |
| 5.2.4 | `features/search.css` (1 instance) | Same |
| 5.2.5 | `features/discover.css` (2 instances) | Same |
| 5.2.6 | `features/collections.css` (2 instances) | Same |
| 5.2.7 | `components/cards.css` (poster-loading) | Replace with `.shimmer-poster` class |

### 5.3 Replace Cinematic Gradient with Shared Class

| Task | File | Replacement |
|------|------|-------------|
| 5.3.1 | `utilities/helpers.css` `.backdrop-gradient` | Use `var(--cinematic-gradient)` in background |
| 5.3.2 | Feature CSS files with inline hero gradients | Use `.cinematic-gradient` class |

### 5.4 Replace Page Headers with Shared Component

Migrate feature pages to use `<PageHeader>` component:

| Task | Page | File |
|------|------|------|
| 5.4.1 | Discover | `features/discover/DiscoverPage.tsx` |
| 5.4.2 | Search | `features/search/SearchHeader.tsx` |
| 5.4.3 | Watchlist (Vault) | `features/watchlist/` header component |
| 5.4.4 | Collections | `features/collections/CollectionsPage.tsx` |
| 5.4.5 | Profile | `features/profile/ProfilePage.tsx` |

### 5.5 Replace Back Buttons with Shared Component

| Task | Page | File |
|------|------|------|
| 5.5.1 | Collection Detail | `features/collections/CollectionDetailPage.tsx` |
| 5.5.2 | Collection Edit | `features/collections/components/UniverseEditPage.tsx` |
| 5.5.3 | Stats | `features/profile/StatsPage.tsx` |
| 5.5.4 | Achievements | `features/profile/AchievementsPage.tsx` |

### 5.6 Replace Inline Hover Handlers with CSS

Many components use inline `onMouseEnter`/`onMouseLeave` handlers for hover states that could be pure CSS `:hover` transitions. Identify and convert:

| Task | Component | File | Handler |
|------|-----------|------|---------|
| 5.6.1 | MovieCard | `ui/MovieCard.tsx` | Hover state toggle |
| 5.6.2 | DiscoverRail | `discover/components/DiscoverRail.tsx` | Hover card expansion |
| 5.6.3 | Search result row | `search/SearchResultRow.tsx` | Hover highlighting |

### 5.7 Replace Hardcoded `font-family` with Type Classes or Tokens

In feature CSS files, replace `font-family: 'Outfit', sans-serif` → `font-family: var(--font-sans)`, etc.

**Files affected:** All 8 feature CSS files in `src/styles/features/`.

### 5.8 Replace Hardcoded Blur Values with Tokens

| Task | Old Value | New Token | Files |
|------|-----------|-----------|-------|
| 5.8.1 | `blur(4px)` | `blur(var(--blur-xs))` | Feature CSS |
| 5.8.2 | `blur(8px)` | `blur(var(--blur-sm))` | Feature CSS |
| 5.8.3 | `blur(12px)` | `blur(var(--blur-md))` | Feature CSS |
| 5.8.4 | `blur(20px)` | `blur(var(--blur-lg))` | Feature CSS |
| 5.8.5 | `blur(24px)` | `blur(var(--blur-xl))` | Feature CSS |
| 5.8.6 | `blur(28px)` | `blur(var(--blur-2xl))` | Feature CSS |
| 5.8.7 | `blur(60px)` | `blur(var(--blur-backdrop))` | Feature CSS |

### 5.9 Replace Hardcoded Z-Index with Tokens

| Task | Old Value | New Token | Files |
|------|-----------|-----------|-------|
| 5.9.1 | `z-index: 0` | `z-index: var(--z-base)` | Feature CSS |
| 5.9.2 | `z-index: 1` | `z-index: var(--z-overlay)` | Feature CSS |
| 5.9.3 | `z-index: 2` | `z-index: var(--z-card)` | Feature CSS |
| 5.9.4 | `z-index: 3` | `z-index: var(--z-badge)` | Feature CSS |
| 5.9.5 | `z-index: 30` | `z-index: var(--z-sticky)` | Feature CSS |
| 5.9.6 | `z-index: 9999` | `z-index: var(--z-toast)` | Feature CSS |

### 5.10 Replace DiscoverRail Card Copies with Shared PosterRail

| Task | Action | File |
|------|--------|------|
| 5.10.1 | Replace inline rail rendering with `<PosterRail>` | `features/discover/components/DiscoverRail.tsx` |
| 5.10.2 | Replace copy-paste rails in other features | `features/collections/components/UniverseDashboard.tsx`, `features/details/components/SimilarTitles.tsx`, etc. |

### Phase 5 Verification Checklist

- [ ] Visual regression testing per page (Discover, Search, Watchlist, Collections, Details, Profile, Settings)
- [ ] No hardcoded status colors remain (`#4ade80`, `#f87171`, `#60a5fa`, `#f5c518`, `#ff7878`)
- [ ] No inline shimmer animations remain (all use `.shimmer` / `.shimmer-text` / `.shimmer-poster`)
- [ ] No inline cinematic gradient definitions remain
- [ ] All page headers use `<PageHeader>` component
- [ ] All back buttons use `<BackButton>` component
- [ ] No hardcoded `font-family` strings in feature CSS
- [ ] No hardcoded `blur()` values in feature CSS
- [ ] No hardcoded `z-index` integers in feature CSS
- [ ] All themes apply correctly
- [ ] Build succeeds

### Phase 5 Rollback Plan

Each subtask (5.1–5.10) should be its own commit. Rollback by reverting individual commits. Feature files are self-contained so reverting one does not affect others.

---

## Phase 6: Token Deprecation & Naming Migration

> **Goal:** Migrate all component references from old token names to new canonical names, then remove the old names.  
> **Risk:** MEDIUM — removing old names requires 100% reference coverage first. A single missed reference will cause a visual regression.  
> **Pages Affected:** All pages  
> **Estimated Effort:** 6–8 hours

### 6.1 Audit & Deprecate Old Token Names

Add deprecation comments to old tokens in `src/styles/tokens/colors.css`:

```css
/* @deprecated Use --text-body instead. Will be removed in Phase 7. */
--text: #e8eaf0;

/* @deprecated Use --text-muted instead. Will be removed in Phase 7. */
--muted: rgba(232,234,240,0.42);

/* @deprecated Use --text-dim instead. Will be removed in Phase 7. */
--dim: rgba(232,234,240,0.18);

/* @deprecated Use --hairline instead. Will be removed in Phase 7. */
--border: rgba(255,255,255,0.08);

/* @deprecated Use --tier-2 instead. Will be removed in Phase 7. */
--surface: #111111;

/* @deprecated Use --tier-3 instead. Will be removed in Phase 7. */
--raised: #1a1a1a;
```

### 6.2 Find All Old Token References

| Task | Search Pattern | Expected Locations |
|------|---------------|-------------------|
| 6.2.1 | `var(--text)` (not `--text-*`) | Feature CSS, component TSX inline styles |
| 6.2.2 | `var(--muted)` | Feature CSS, component TSX |
| 6.2.3 | `var(--dim)` | Feature CSS |
| 6.2.4 | `var(--border)` (not `--border-active`, `--hairline`) | Feature CSS, component CSS |
| 6.2.5 | `var(--surface)` | Feature CSS, component CSS |
| 6.2.6 | `var(--raised)` | Feature CSS, component CSS |

### 6.3 Migrate References — CSS Files

| Task | Old Reference | New Reference |
|------|--------------|---------------|
| 6.3.1 | `var(--text)` | `var(--text-body)` |
| 6.3.2 | `var(--muted)` | `var(--text-muted)` |
| 6.3.3 | `var(--dim)` | `var(--text-dim)` |
| 6.3.4 | `var(--border)` | `var(--hairline)` |
| 6.3.5 | `var(--surface)` | `var(--tier-2)` |
| 6.3.6 | `var(--raised)` | `var(--tier-3)` |

### 6.4 Migrate References — Inline Styles in TSX

| Task | Component | File | Pattern |
|------|-----------|------|---------|
| 6.4.1 | AuthModal | `ui/AuthModal.tsx` line 391 | `color: "#1a1a1a"` → `color: "var(--tier-3)"` |
| 6.4.2 | EmptyState | `primitives/EmptyState.tsx` | Inline `color: var(--muted)` → `var(--text-muted)` |

### 6.5 Add Alias Tokens for Safe Transition

Before removing old names, add aliases so any missed references still work:

```css
/* Aliases — temporary bridge during Phase 6 */
--text: var(--text-body);
--muted: var(--text-muted);
--dim: var(--text-dim);
--border: var(--hairline);
--surface: var(--tier-2);
--raised: var(--tier-3);
```

> **⚠️ Alpha value divergence:** The old `--muted` was `0.42` alpha while `--text-muted` is `0.48`. The old `--dim` was `0.18` while `--text-dim` is `0.24`. Aliasing means any remaining `var(--muted)` references will see `0.48` instead of `0.42`. This is a deliberate improvement — the V2 values are more readable and consistent. Spot-check all components that use these tokens to verify the opacity change is acceptable.

### 6.6 Remove Old Token Definitions

After confirming all references are updated (or aliased), delete the original value definitions:

| Task | Token | Action |
|------|-------|--------|
| 6.6.1 | `--text: #e8eaf0` | Delete original value; keep alias `--text: var(--text-body)` |
| 6.6.2 | `--muted: rgba(232,234,240,0.42)` | Delete original value; keep alias |
| 6.6.3 | `--dim: rgba(232,234,240,0.18)` | Delete original value; keep alias |
| 6.6.4 | `--border: rgba(255,255,255,0.08)` | Delete original value; keep alias |
| 6.6.5 | `--surface: #111111` | Delete original value; keep alias |
| 6.6.6 | `--raised: #1a1a1a` | Delete original value; keep alias |

### 6.7 Add Deprecation Comments to V1 Component CSS Classes

Mark V1 classes in `src/styles/base/typography.css` and `src/styles/components/cards.css`:

```css
/* @deprecated V1 type class. Use .type-display / .type-display-sm instead. */
.type-page-title { … }

/* @deprecated V1 type class. Use .type-eyebrow instead. */
.type-section-title { … }
```

Classes to deprecate (V1, still defined in `base/typography.css`):

| Class | V2 Replacement |
|-------|---------------|
| `.type-page-title` | `.type-display-sm` |
| `.type-section-title` | `.type-eyebrow` |
| `.type-card-title` | `.type-body` (with text-shadow) |
| `.type-subtitle` | `.type-micro` |
| `.type-metadata` | `.type-body` |
| `.type-label` | `.type-micro` |
| `.type-button` | `.type-micro` |
| `.type-caption` | `.type-micro` |
| `.type-stat` | `.type-display-sm` |
| `.label-mono` | `.type-micro` |

V1 classes in `cards.css` to deprecate:

| Class | V2 Replacement |
|-------|---------------|
| `.glass-surface` | `.surface-glass` |
| `.stat-card` | `.card-premium` or `.stat-premium` |
| `.movie-card` | `.v2-card` |
| `.movie-card-inner` | `.v2-card` variant |
| `.featured-hero` | `.hero-premium` |
| `.continue-card` | `.continue-premium` |
| `.upcoming-card` | `.card-premium` |
| `.empty-state` | `.empty-premium` |
| `.settings-row` | `.card-premium` variant |
| `.section-title` | `.section-header-title` |

### Phase 6 Verification Checklist

- [ ] No component references `var(--text)` (all use `var(--text-body)`)
- [ ] No component references `var(--muted)` (all use `var(--text-muted)`)
- [ ] No component references `var(--dim)` (all use `var(--text-dim)`)
- [ ] No component references `var(--border)` (all use `var(--hairline)`)
- [ ] No component references `var(--surface)` (all use `var(--tier-2)`)
- [ ] No component references `var(--raised)` (all use `var(--tier-3)`)
- [ ] Aliases still work as fallback for any missed references
- [ ] All V1 classes have `@deprecated` comments
- [ ] Visual regression: all pages identical
- [ ] Build succeeds, no CSS custom property warnings

### Phase 6 Rollback Plan

Revert the alias changes and restore original token values. This is a single `colors.css` revert plus any TSX inline style changes.

---

## Phase 7: Component Consolidation & Final Cleanup

> **Goal:** Merge duplicate component variants, remove dead CSS, and finalize the design system.  
> **Risk:** HIGH — removing old components and CSS files. Any missed reference will break.  
> **Pages Affected:** All pages  
> **Estimated Effort:** 10–14 hours

### 7.1 Merge EmptyState Variants

| Task | Action |
|------|--------|
| 7.1.1 | Verify all feature pages use `<EmptyState premium={…}>` instead of feature-local variants |
| 7.1.2 | Delete feature-local EmptyState components (Discover, Search, Profile, Collections, Sync) |
| 7.1.3 | Remove `.empty-state` V1 CSS from `cards.css` (replaced by `.empty-premium` in `_phase21.css`) |

### 7.2 Merge Skeleton Variants

| Task | Action |
|------|--------|
| 7.2.1 | Verify all feature pages use `<Skeleton>` from primitives |
| 7.2.2 | Delete feature-local skeleton components |
| 7.2.3 | Move `.skeleton-base` and `.skeleton-text` from `_phase21.css` to `skeleton.css` |
| 7.2.4 | Verify `.shimmer` / `.shimmer-text` classes are used everywhere |

### 7.3 Merge ProgressRing Variants

| Task | Action |
|------|--------|
| 7.3.1 | Identify all ProgressRing implementations across features |
| 7.3.2 | Create shared `src/shared/ui/primitives/ProgressRing.tsx` |
| 7.3.3 | Migrate all features to shared component |
| 7.3.4 | Delete feature-local ProgressRing implementations |

### 7.4 Merge TimelineRow Variants

| Task | Action |
|------|--------|
| 7.4.1 | Identify timeline row implementations (Collections timeline, Sync history timeline) |
| 7.4.2 | Create shared `src/shared/ui/primitives/TimelineRow.tsx` |
| 7.4.3 | Migrate all features |
| 7.4.4 | Delete feature-local implementations |

### 7.5 Merge StatCard Variants

| Task | Action |
|------|--------|
| 7.5.1 | Identify stat card implementations (Profile, Collections, Sync) |
| 7.5.2 | Verify `.stat-premium` from `_phase21.css` covers all variants |
| 7.5.3 | Migrate all stat cards to `.stat-premium` CSS + shared component |
| 7.5.4 | Delete `.stat-card` from `cards.css` |

### 7.6 Remove `_phase21.css` Entirely

This is the highest-risk single action. Before removing, verify:

| Task | Class in `_phase21.css` | Migrated To | Verified |
|------|------------------------|-------------|----------|
| 7.6.1 | `.type-display-lg` | Keep in `_phase22_sprint1.css` or new `typography.css` | [ ] |
| 7.6.2 | `.type-stat-lg` | Keep in `_phase22_sprint1.css` or new `typography.css` | [ ] |
| 7.6.3 | `.surface-base` | Feature CSS or `surfaces.css` | [ ] |
| 7.6.4 | `.surface-raised` | Feature CSS or `surfaces.css` | [ ] |
| 7.6.5 | `.surface-glass` | Feature CSS or `surfaces.css` | [ ] |
| 7.6.6 | `.surface-glass-strong` | Feature CSS or `surfaces.css` | [ ] |
| 7.6.7 | `.card-premium` | `cards.css` | [ ] |
| 7.6.8 | `.btn-primary` | `buttons.css` | [ ] |
| 7.6.9 | `.btn-ghost` | `buttons.css` | [ ] |
| 7.6.10 | `.btn-danger` | `buttons.css` | [ ] |
| 7.6.11 | `.badge-accent` | `badges.css` | [ ] |
| 7.6.12 | `.badge-glow` | `badges.css` | [ ] |
| 7.6.13 | `.section-header` | `layout.css` or `_phase22_sprint1.css` | [ ] |
| 7.6.14 | `.section-header-title` | Same | [ ] |
| 7.6.15 | `.section-header-action` | Same | [ ] |
| 7.6.16 | `.skeleton-base` | `skeleton.css` | [ ] |
| 7.6.17 | `.skeleton-text` | `skeleton.css` | [ ] |
| 7.6.18 | `.empty-premium` | Feature CSS or `empty-state.css` | [ ] |
| 7.6.19 | `.hero-premium` | `cards.css` | [ ] |
| 7.6.20 | `.continue-premium` | `cards.css` | [ ] |
| 7.6.21 | `.stat-premium` | `cards.css` | [ ] |
| 7.6.22 | `.progress-premium` | Feature CSS or `progress.css` | [ ] |
| 7.6.23 | `.guest-premium` | `discover.css` | [ ] |
| 7.6.24 | `.ambient-glow` | `utilities.css` | [ ] |
| 7.6.25 | `.touch-ripple` | `utilities.css` | [ ] |
| 7.6.26 | `.rail-premium` | New `rails.css` | [ ] |

Only after every class is accounted for and migrated, delete `_phase21.css` and remove its import from `components/index.css`.

### 7.7 Clean Up Empty CSS Files

| Task | File | Action |
|------|------|--------|
| 7.7.1 | `src/styles/components/skeleton.css` | Now populated with skeleton classes — verify |
| 7.7.2 | `src/styles/tokens/typography.css` | Now populated with font tokens — verify |
| 7.7.3 | Remove old alias tokens from `colors.css` | `--text`, `--muted`, `--dim`, `--border`, `--surface`, `--raised` |
| 7.7.4 | Remove V1 type classes from `base/typography.css` | `.type-page-title`, `.type-section-title`, etc. |
| 7.7.5 | Remove V1 card classes from `cards.css` | `.glass-surface`, `.stat-card`, `.movie-card`, etc. |

### 7.8 Final Tailwind Audit

Verify that `tailwind.config.js` covers all tokens and that no hardcoded values remain:

| Task | Verification |
|------|-------------|
| 7.8.1 | `rg "#[0-9a-fA-F]{6}" src/` — should return zero results in CSS/TSX files |
| 7.8.2 | `rg "font-family:" src/` — should only reference `var(--font-*)` tokens |
| 7.8.3 | `rg "z-index: [0-9]" src/` — should only reference `var(--z-*)` tokens |
| 7.8.4 | `rg "blur\([0-9]" src/` — should only reference `var(--blur-*)` tokens |

### Phase 7 Verification Checklist

- [ ] **Full regression testing** — every page, every theme, every breakpoint
- [ ] No feature-local component duplicates remain (EmptyState, Skeleton, ProgressRing, TimelineRow, StatCard)
- [ ] `_phase21.css` is deleted and no longer imported
- [ ] Old token aliases (`--text`, `--muted`, `--dim`, `--border`, `--surface`, `--raised`) are removed
- [ ] V1 type classes removed from `base/typography.css`
- [ ] V1 card classes removed from `cards.css`
- [ ] No hardcoded hex colors in CSS/TSX
- [ ] No hardcoded `font-family` strings
- [ ] No hardcoded `z-index` integers
- [ ] No hardcoded `blur()` values
- [ ] All 8 themes render correctly
- [ ] `prefers-reduced-motion` kills all non-essential animation
- [ ] Keyboard navigation works on all interactive elements
- [ ] Build succeeds with zero warnings

### Phase 7 Rollback Plan

This phase is the hardest to roll back. Strategy:
1. Each subtask (7.1–7.7) is its own commit
2. Keep `_phase21.css` import commented out (not deleted) for one release cycle
3. If regressions are found, uncomment the import and revert the specific subtask
4. Only delete the file from the repo after a full release with zero regression reports

---

## Phase Dependency Graph

```
Phase 1 (Tokens) ─────────────────────────────────────┐
    │                                                   │
    ▼                                                   │
Phase 2 (CSS Consolidation) ──────────────────────────┤
    │                                                   │
    ▼                                                   │
Phase 3 (Shared CSS Patterns) ────────────────────────┤
    │                                                   │
    ▼                                                   │
Phase 4 (Shared JS Components) ───────────────────────┤
    │                                                   │
    ▼                                                   │
Phase 5 (Feature CSS Refactoring) ────────────────────┤
    │                                                   │
    ▼                                                   │
Phase 6 (Token Deprecation) ──────────────────────────┤
    │                                                   │
    ▼                                                   │
Phase 7 (Component Consolidation) ◄────────────────────┘
```

Each phase depends on the previous phase being complete and verified. No phase may begin until the previous phase's verification checklist passes.

---

## Effort Summary

| Phase | Risk | Effort (hours) | Files Modified | Rollback Difficulty |
|-------|------|----------------|----------------|-------------------|
| 1. Token Foundation | ZERO | 4–6 | 5 token files + tailwind.config.js | Trivial (git revert) |
| 2. CSS Consolidation | LOW | 3–4 | 3–4 CSS files | Easy (git checkout) |
| 3. Shared CSS Patterns | LOW | 4–5 | 3–5 CSS files (additions only) | Easy (delete additions) |
| 4. Shared JS Components | LOW | 10–14 | 8–12 TSX files (additions only) | Easy (delete additions) |
| 5. Feature CSS Refactoring | MEDIUM | 12–16 | 8+ feature CSS files + 10+ TSX | Medium (per-commit revert) |
| 6. Token Deprecation | MEDIUM | 6–8 | 20+ files (search-and-replace) | Medium (revert alias changes) |
| 7. Component Consolidation | HIGH | 10–14 | 30+ files (deletions + moves) | Hard (phased commits required) |
| **Total** | | **49–67 hours** | | |

---

## Critical Path & Non-Negotiable Rules

1. **Never skip Phase 1.** All subsequent phases depend on tokens existing.
2. **Never modify a feature file before Phase 3 is complete.** Shared patterns must exist before features can reference them.
3. **Never delete old names until Phase 6 confirms zero references.** Use `rg "var\(--text\)" src/` (with exact word boundary) to audit.
4. **Phase 7 requires a full regression suite pass.** This is the only phase where visual regressions are likely if a reference is missed.
5. **Each phase gets its own PR.** No combined PRs. This ensures clean rollback boundaries.
6. **Screenshot comparison before and after each phase.** Use Percy, Chromatic, or manual side-by-side comparison on all 8 themes.
7. **If any phase introduces a regression, stop and fix before proceeding.** Never carry known regressions forward.

---

## Appendix A: File Inventory by Phase

### Phase 1 Files (Additions Only)

| File | Action |
|------|--------|
| `src/styles/tokens/typography.css` | Add font + size tokens |
| `src/styles/tokens/colors.css` | Add semantic color tokens |
| `src/styles/tokens/motion.css` | Add blur, opacity, scale, gradient, composite tokens |
| `src/styles/tokens/z-index.css` | Add named z-index scale |
| `src/styles/tokens/radius.css` | Add `--radius-xs` |
| `src/styles/tokens/spacing.css` | Add gap-fill tokens |
| `tailwind.config.js` | Map all tokens to Tailwind utilities |

### Phase 2 Files (Substitutions Only — Identical Visual Output)

| File | Action |
|------|--------|
| `src/styles/components/_phase21.css` | Delete dead V1 typography overrides (6 class defs) |
| `src/styles/components/cards.css` | Replace hex with token references |
| `src/styles/components/_phase22_sprint1.css` | Replace hardcoded font-family with tokens |
| `src/styles/components/skeleton.css` | Update comment (mark as active) |
| `src/styles/tokens/typography.css` | Update comment (mark as active) |

### Phase 3 Files (Additions Only)

| File | Action |
|------|--------|
| `src/styles/components/skeleton.css` | Add `.shimmer`, `.shimmer-text`, `.shimmer-poster` |
| `src/styles/utilities/helpers.css` | Add `.cinematic-gradient` |
| `src/styles/components/_phase22_sprint1.css` | Add `.page-header`, `.page-header-title`, `.page-header-back` |
| `src/styles/components/buttons.css` | Add `.back-btn` |
| New or existing CSS file | Add `.rail`, `.rail-compact`, `.rail-wide` |
| `src/styles/components/_phase22_sprint1.css` | Add `.status-badge`, `.status-badge-*` |

### Phase 4 Files (Additions Only + Internal Refactors)

| File | Action |
|------|--------|
| `src/shared/ui/Icon.tsx` | Add `size` prop |
| `src/shared/ui/primitives/Button.tsx` | Use `<Icon>` internally |
| `src/shared/ui/primitives/Badge.tsx` | Use `<Icon>` internally |
| `src/shared/ui/primitives/SectionHeader.tsx` | Use `<Icon>` internally, add `eyebrow` prop |
| `src/shared/ui/primitives/Section.tsx` | Use `<SectionHeader>` internally |
| `src/shared/ui/ToastContainer.tsx` | Use `<Icon>` internally |
| `src/shared/ui/ScrollToTop.tsx` | Use `<Icon>` internally |
| `src/shared/ui/primitives/BottomSheet.tsx` | NEW — shared bottom sheet |
| `src/shared/ui/primitives/PosterRail.tsx` | NEW — shared poster rail |
| `src/shared/ui/primitives/PageHeader.tsx` | NEW — shared page header |
| `src/shared/ui/primitives/BackButton.tsx` | NEW — shared back button |
| `src/shared/ui/primitives/EmptyState.tsx` | Add `premium`, `icon`, `iconFill`, `action`, `onAction` props |
| `src/shared/utils/label.ts` | NEW — `statusLabel`, `titleOf`, `yearOf`, `imdbOf` |
| `src/shared/ui/primitives/index.ts` | Add new exports |
| `src/shared/ui/index.ts` | Add utility exports |

### Phase 5 Files (Feature CSS + TSX Refactoring)

| File | Action |
|------|--------|
| `src/styles/features/profile.css` | Tokenize colors, shimmer, blur, z-index, font-family |
| `src/styles/features/details.css` | Same |
| `src/styles/features/secondary.css` | Same |
| `src/styles/features/search.css` | Same |
| `src/styles/features/discover.css` | Same |
| `src/styles/features/collections.css` | Same |
| `src/styles/features/watchlist.css` | Same |
| `src/styles/features/settings.css` | Same |
| Feature TSX files (10+) | Use `<PageHeader>`, `<BackButton>`, `<PosterRail>`, CSS hover |

### Phase 6 Files (Token Migration)

| File | Action |
|------|--------|
| `src/styles/tokens/colors.css` | Deprecate old names, add aliases, then remove originals |
| All CSS/TSX files referencing old tokens | Replace `var(--text)` → `var(--text-body)`, etc. |
| `src/styles/base/typography.css` | Deprecate V1 type classes |
| `src/styles/components/cards.css` | Deprecate V1 card classes |

### Phase 7 Files (Deletions + Consolidation)

| File | Action |
|------|--------|
| `src/styles/components/_phase21.css` | DELETE (all classes migrated out) |
| `src/styles/components/index.css` | Remove `_phase21.css` import |
| `src/styles/tokens/colors.css` | Remove old token aliases |
| `src/styles/base/typography.css` | Remove V1 type classes |
| `src/styles/components/cards.css` | Remove V1 card classes |
| Feature-local EmptyState components | DELETE |
| Feature-local Skeleton components | DELETE |
| Feature-local ProgressRing components | Consolidate or DELETE |
| Feature-local TimelineRow components | Consolidate or DELETE |

---

## Sprint 2A: Premium Shared UI Foundation — COMPLETE

> **Phase:** Infrastructure only — new component creation, no existing page modifications.
> **Risk:** ZERO — no existing pages modified, purely additive.
> **Status:** **COMPLETE**
> **Components:** 43 new premium components across 10 groups, all marked READY.

### Sprint 2A Scope

Sprint 2A is an **additive-only sprint** that creates the premium shared UI component library at `src/shared/ui/premium/`. No existing components were modified, no existing pages were changed, and no visual regressions are possible.

### Components Delivered

| # | Group | Components | Count |
|---|-------|------------|-------|
| 1 | `layout/` | PremiumPageContainer, PremiumSectionContainer, PremiumContentContainer, PremiumHeroContainer, PremiumRailContainer | 5 |
| 2 | `cards/` | PremiumCard, PremiumHeroCard, PremiumStatCard, PremiumMiniCard, PremiumHorizontalCard, PremiumPosterStack, PremiumCollectionPreview | 7 |
| 3 | `surfaces/` | PremiumSurface, PremiumGlassSurface, PremiumGradientSurface, PremiumOverlay, PremiumBackdrop | 5 |
| 4 | `buttons/` | PremiumButton, PremiumIconButton, PremiumFloatingButton, PremiumActionRow, PremiumBottomActionBar, PremiumToolbar | 6 |
| 5 | `chips/` | PremiumChip, PremiumTag, PremiumPill | 3 |
| 6 | `feedback/` | PremiumBadge, PremiumDivider, PremiumEmptyState, PremiumSkeleton, PremiumCarouselHeader | 5 |
| 7 | `navigation/` | PremiumPageHeader, PremiumSectionHeader | 2 |
| 8 | `display/` | PremiumAvatar, PremiumProfileStat, PremiumRatingDisplay, PremiumStatusBadge, PremiumMediaInfo, PremiumProviderChip, PremiumMetric, PremiumLabel, PremiumMetaRow, PremiumInfoRow, PremiumListItem, PremiumTimelineRow | 12 |
| 9 | `loading/` | Re-exports PremiumSkeleton from feedback | — |
| 10 | `empty/` | Re-exports PremiumEmptyState from feedback | — |
| | **Total** | | **43** |

### Quality Gates (All Passed)

| Gate | Result |
|------|--------|
| Token-only styling (zero hardcoded values) | ✅ Pass |
| Variant/size/state support on all components | ✅ Pass |
| Full TypeScript typing with SolidJS | ✅ Pass |
| ARIA attributes per component semantics | ✅ Pass |
| Keyboard navigation on interactive components | ✅ Pass |
| Focus indicators via `--focus-ring` token | ✅ Pass |
| Reduced motion via `prefers-reduced-motion` | ✅ Pass |
| No existing files modified | ✅ Pass |
| Zero visual regressions | ✅ Pass (nothing changed) |

### Sprint 2A Risk Assessment

| Risk Category | Level | Reason |
|---------------|-------|--------|
| Visual regression | **ZERO** | No existing pages modified |
| Build breakage | **ZERO** | Additive only — new files |
| Performance impact | **ZERO** | Components are tree-shaken; not imported yet |
| Token dependency | **ZERO** | All tokens pre-exist from Sprint 1B |

### Next Sprint Roadmap

| Sprint | Scope | Risk | Description |
|--------|-------|------|-------------|
| **Sprint 2B** | Profile page migration | Medium | Migrate Profile page onto premium components — first real consumption |
| **Sprint 2C** | Dashboard/Discover migration | Medium-High | Migrate largest pages onto premium components |
| **Sprint 2D** | Watchlist migration | Medium | Migrate Watchlist page onto premium components |
| **Sprint 2E+** | Remaining pages | Medium | Migrate Details, Search, Collections, Settings onto premium components |

### Sprint 2A Files (All Additions)

| File/Directory | Action |
|----------------|--------|
| `src/shared/ui/premium/layout/` | NEW — 5 layout components + barrel export |
| `src/shared/ui/premium/cards/` | NEW — 7 card components + barrel export |
| `src/shared/ui/premium/surfaces/` | NEW — 5 surface components + barrel export |
| `src/shared/ui/premium/buttons/` | NEW — 6 button components + barrel export |
| `src/shared/ui/premium/chips/` | NEW — 3 chip components + barrel export |
| `src/shared/ui/premium/feedback/` | NEW — 5 feedback components + barrel export |
| `src/shared/ui/premium/navigation/` | NEW — 2 navigation components + barrel export |
| `src/shared/ui/premium/display/` | NEW — 12 display components + barrel export |
| `src/shared/ui/premium/loading/` | NEW — barrel export re-exporting PremiumSkeleton |
| `src/shared/ui/premium/empty/` | NEW — barrel export re-exporting PremiumEmptyState |
| `src/shared/ui/premium/index.ts` | NEW — root barrel export for all 43 components |

---

## Appendix B: Quick Reference — Token Naming Convention

| Category | Prefix | Examples |
|----------|--------|---------|
| Color (surface) | `--tier-*` | `--tier-0`, `--tier-2` |
| Color (text) | `--text-*` | `--text-strong`, `--text-body`, `--text-soft`, `--text-muted`, `--text-dim` |
| Color (semantic) | `--color-*` | `--color-watching`, `--color-danger`, `--color-imdb` |
| Color (border) | `--hairline*` | `--hairline`, `--hairline-2`, `--hairline-3` |
| Color (glass) | `--glass-*` | `--glass-bg`, `--glass-blur` |
| Color (theme) | `--p`, `--p2`, `--p-glow`, `--p-dim` | Per-theme accent |
| Typography (font) | `--font-*` | `--font-sans`, `--font-display`, `--font-mono` |
| Typography (size) | `--text-{xs|sm|base|md|lg|xl|2xl|3xl|4xl}` | Size scale |
| Spacing | `--sp-*` | `--sp-1` (4px) through `--sp-16` (64px) |
| Radius | `--radius-*` | `--radius-xs` through `--radius-pill` |
| Elevation | `--z-*` | `--z-base` through `--z-max` |
| Shadow | `--shadow-*` | `--shadow-card` through `--shadow-hero` |
| Duration | `--dur-*` | `--dur-micro` through `--dur-slow` |
| Easing | `--ease-*` | `--ease-spring`, `--ease-smooth`, `--ease-out` |
| Blur | `--blur-*` | `--blur-xs` through `--blur-backdrop` |
| Opacity | `--opacity-*` | `--opacity-disabled`, `--opacity-ambient` |
| Scale | `--scale-*` | `--scale-active` |
| Composite | `--focus-ring`, `--cinematic-gradient`, `--shimmer-*` | Multi-value tokens |
| Accessibility | `--touch-min` | Minimum touch target (44px) |

---

*This document is the execution plan for the CineLog V2 design system migration. It must be updated after each phase completion to reflect actual progress and any deviations from the original plan.*
