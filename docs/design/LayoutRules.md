# CineLog Layout Rules

> **Version:** 1.0  
> **Date:** 2026-07-12  
> **Status:** Audit Document — Extracted from Existing Codebase  
> **Rule:** Do NOT modify existing layout code. This document is an audit, not a redesign.

---

## 1. Page Spacing

### 1.1 Page Container

Every page is wrapped in `<PageContainer>`, which provides:

| Property | Narrow (default) | Wide |
|----------|-----------------|------|
| Horizontal padding | `px-5` (20px) | `px-5` (20px) |
| Max width | `max-w-2xl` (672px) | `lg:max-w-4xl` (896px) → `lg:max-w-none` (no cap) |
| Centering | `mx-auto` | `mx-auto` |
| Top padding | Customizable via `paddingTop` prop | Same |
| Bottom padding | Customizable via `paddingBottom` prop | Same |
| Z-index | `z-10` (above hero gradients) | Same |
| Animation | `animate-fade-in` on mount | Same |

**Bottom padding must account for bottom navigation:** Content should have at least `var(--nav-total-height)` of bottom padding so the last items aren't hidden behind the fixed bottom nav.

### 1.2 Page-Level Rhythm

Pages follow a vertical rhythm pattern:

```
[Hero Section — optional, full-bleed]
  ↕ 0px (hero bleeds to edge)
[Page Container starts]
  [Page Title — display type]
    ↕ 8-12px
  [Page Subtitle — if present]
    ↕ 24-32px
  [Section 1]
    ↕ 32px (default) / 24px (tight) / 48px (loose)
  [Section 2]
    ↕ 32px
  [Section N]
    ↕ var(--nav-total-height) bottom padding
```

---

## 2. Section Spacing

### 2.1 Section Component

The `<Section>` component provides three spacing variants:

| Variant | Bottom Margin | Token |
|---------|--------------|-------|
| tight | `mb-4` (16px) | `--sp-4` |
| default | `mb-6` (24px) | `--sp-6` |
| loose | `mb-8` (32px) | `--sp-8` |

### 2.2 Section Header Pattern

The `sec-header` pattern is the consistent section header across settings, stats, achievements, history:

```
[Back link — if sub-page]
  ↕ 4px
[Eyebrow label — Azeret Mono, accent color, uppercase]
  ↕ 4-8px
[Section title — Outfit bold or Bebas Neue]
  ↕ 16-20px
[Content...]
```

### 2.3 Feature-Specific Section Patterns (Inconsistent)

| Feature | Section Wrapper | Header Pattern |
|---------|----------------|----------------|
| Settings / Stats / Achievements / History | `sec-section` | `sec-header` with `sec-header-title` |
| Discover | `discover-fold` | `discover-eyebrow-block` with `discover-fold-label` |
| Collections | `collections-fold` | `collections-eyebrow-block` with `collections-fold-label` |
| Profile | `profile-section` | Inline header with `profile-*` classes |
| Watchlist | N/A | `WatchlistHeader` component |
| Search | N/A | `SearchHeader` component |
| Details | N/A | `DetailSection` component |

**This is an inconsistency.** Three different class naming conventions for the same structural pattern.

---

## 3. Card Spacing

### 3.1 Movie Card (Vault Card)

```
[Card Container — vault-card-premium]
  padding: 0
  ┌─────────────────────────────┐
  │ [Poster — 2:3 aspect ratio] │
  │   ┌─ Status Badge ────────┐ │
  │   │ top: 8px, left: 8px   │ │
  │   └───────────────────────┘ │
  │   ┌─ Gradient Overlay ────┐ │
  │   │ bottom gradient       │ │
  │   │  ┌─ Title ──────────┐ │ │
  │   │  │ 0.6875rem bold   │ │ │
  │   │  └──────────────────┘ │ │
  │   │  ┌─ Subtitle ───────┐ │ │
  │   │  │ 0.5625rem mono   │ │ │
  │   │  └──────────────────┘ │ │
  │   └───────────────────────┘ │
  └─────────────────────────────┘
  ┌─ Rating Chips ──────────────┐
  │ gap: 4px, grid 3-col       │
  └─────────────────────────────┘
```

### 3.2 Card Internal Spacing

| Element | Padding/Gap |
|---------|-------------|
| Card container | 0 (poster is edge-to-edge) |
| Title from bottom | 8px |
| Title to subtitle | 4px |
| Rating chips container | 4px gap, 8px from poster bottom |
| Status badge position | `top: 8px, left: 8px` |
| Genre tag position | `top: 8px, right: 8px` |

### 3.3 Card Grid Spacing

| Layout | Gap |
|--------|-----|
| Vault grid (mobile) | 12px |
| Vault grid (@640px) | 16px |
| Vault grid (@1024px) | 16px |
| Collections grid | 16px |
| Search genre grid | 8px |
| Search result rows | 2px |

---

## 4. Grid Rules

### 4.1 Movie Card Grid (Vault)

| Breakpoint | Columns | Card Width |
|------------|---------|------------|
| < 640px | 3 columns | ~33% - gap |
| ≥ 640px | 4 columns | ~25% - gap |
| ≥ 1024px | 5-6 columns | varies |

### 4.2 Collections Grid

| Breakpoint | Columns |
|------------|---------|
| < 640px | 2 columns |
| ≥ 640px | 3-4 columns |

### 4.3 Search Genre Grid

| Breakpoint | Columns |
|------------|---------|
| < 480px | 3 columns |
| ≥ 480px | 4 columns |

### 4.4 Stats Insight Grid

| Breakpoint | Columns |
|------------|---------|
| Mobile | 2 columns |
| Desktop | 2-3 columns |

### 4.5 Achievements Grid

Fixed 2-column grid with `achievement-grid` class.

### 4.6 Grid Gaps

| Context | Gap Value |
|---------|-----------|
| Movie cards | 12-16px |
| Collection cards | 16px |
| Genre pills | 8px |
| Stat insights | 12px |
| Achievements | 12px |
| Settings groups | 1px (tight separator) |
| Profile collage | 2px |

---

## 5. Carousel Rules

### 5.1 Discover Rail

The primary carousel pattern is `DiscoverRail`:

| Property | Value |
|----------|-------|
| Layout | Horizontal scroll (`overflow-x: auto`) |
| Scroll behavior | `scroll-snap-type: x mandatory` |
| Card snap | `scroll-snap-align: start` |
| Card width | Fixed (~130-140px) + gap |
| Gap between cards | 12px |
| Padding | Left: 0 (aligned with page container), Right: 20px (overflow buffer) |
| Navigation | Scroll only (no arrows, no dots) |
| Scrollbar | Hidden (`scrollbar-width: none`) |

### 5.2 Continue Watching Rail

| Property | Value |
|----------|-------|
| Card format | 16:9 + overlay text |
| Card width | ~200px |
| Gap | 12px |
| Progress bar | Bottom of card, 3px height |

### 5.3 Similar Titles Rail

| Property | Value |
|----------|-------|
| Card format | 2:3 poster cards |
| Card width | ~100px |
| Gap | 12px |

---

## 6. Sticky Header Rules

### 6.1 App Header

| Property | Value |
|----------|-------|
| Position | `sticky, top-0, z-30` |
| Height | ~56px |
| Background | `backdrop-filter: blur(20px)` + `--glass-bg` |
| Border bottom | `--hairline` (0.06 opacity) |
| Safe area | `padding-top: env(safe-area-inset-top)` |

### 6.2 Watchlist Search Bar (Sticky)

| Property | Value |
|----------|-------|
| Position | `sticky, z-30` |
| Background | `rgba(5,6,10,0.92)` with `backdrop-filter: blur(24px)` |
| Transition | Background on scroll |

### 6.3 Timeline Month Pills (Sticky)

| Property | Value |
|----------|-------|
| Position | `sticky, z-30` |
| Background | `--tier-1` |

### 6.4 Filter Bar (Watchlist)

| Property | Value |
|----------|-------|
| Position | Below search bar, sticky |
| Contains | Quick filter tabs, filter button |
| Background | Same as search bar |

---

## 7. Bottom Sheet Rules

### 7.1 Sheet Layout

Bottom sheets are used for: Add to Folder, Confirm Remove, Collection Modal (mobile), Auth Modal (mobile).

| Property | Mobile | Desktop (@640px) |
|----------|--------|-------------------|
| Position | Bottom-aligned | Centered dialog |
| Top corners | Rounded (`--radius-2xl` 28px) | Rounded (`--radius-modal` 32px) |
| Bottom corners | Sharp (0) | Rounded |
| Handle | Visible (`sheet-handle`) | Hidden |
| Max width | 100% | `max-w-sm` (384px) |
| Backdrop | `modal-backdrop` with blur | Same |
| Animation | `sheetUp` (slide from bottom) | `popInSpring` (scale + fade) |

### 7.2 Sheet Handle

```
┌─────────────────────────────┐
│     ┌─── handle ───┐        │
│     │  width: 32px │        │
│     │  height: 4px │        │
│     │  radius: 2px │        │
│     └──────────────┘        │
│                             │
│ [Sheet Content]             │
│                             │
└─────────────────────────────┘
```

### 7.3 Sheet Dismissal

- **Backdrop tap** → close
- **Escape key** → close (when focus is inside)
- **Swipe down** → not implemented (potential improvement)

---

## 8. Dialog Rules

### 8.1 Modal Dialog Pattern

| Property | Value |
|----------|-------|
| Z-index | 999999+ (above everything) |
| Backdrop | `modal-backdrop`: black with 50% opacity + blur |
| Surface | `modal-surface`: `--tier-3` background |
| Animation entrance | Mobile: `sheetUp`; Desktop: `popInSpring` |
| Focus trap | Implemented (Tab cycles within modal) |
| Auto-focus | First input element on open |
| Escape key | Closes modal |

### 8.2 Dialog Types

| Type | Component | Usage |
|------|-----------|-------|
| Auth | `AuthModal` | Sign in / Sign up |
| Collection | `CollectionModal` | Create/edit collection |
| Add Universe | `AddUniverseModal` | Subscribe to curated universe |
| Detail | `DetailsModal` | Movie/show detail view |
| Confirm Remove | `ConfirmRemoveSheet` | Remove from vault |
| Add to Folder | `AddToFolderSheet` | Add to collection |
| Reset Confirm | `ResetConfirmSheet` | Reset library confirmation |

---

## 9. FAB Positioning

CineLog does not currently use a Floating Action Button (FAB). The primary action on each page is:

| Page | Primary Action | Placement |
|------|---------------|-----------|
| Discover | Spotlight CTA | Inside hero section |
| Watchlist | Search bar | Sticky header |
| Collections | "New Collection" / "Smart" / "Add Universe" | Inline buttons at section top |
| Profile | "Edit" button | Inline at identity block |
| Search | Search input | Page header (autofocus) |

**If a FAB is ever added:** It must be positioned `bottom: calc(var(--nav-total-height) + 16px)` and `right: 16px`, with `z-index: 30` (above content, below modal).

---

## 10. Search Positioning

### 10.1 Search Page

| Property | Value |
|----------|-------|
| Position | Top of page, inside PageContainer |
| Input | Full-width, autofocus on mount |
| Debounce | 250ms |
| Clear button | Right side of input |
| Recent searches | Below input when empty (cold-start) |

### 10.2 Watchlist Search (Vault Search)

| Property | Value |
|----------|-------|
| Position | Sticky, below app header |
| Z-index | 30 |
| Background | Semi-transparent with blur |
| Scope | Filters watchlist items in-place |

### 10.3 Search Bar Styling

```
┌─────────────────────────────────┐
│ 🔍 [placeholder text...]    ✕  │
│     Outfit 0.9375rem           │
│     padding: 12px 16px         │
│     radius: --radius-lg (20px) │
│     bg: --tier-2               │
│     border: --hairline         │
└─────────────────────────────────┘
```

---

## 11. Scroll Behavior

### 11.1 Scroll Containers

| Container | Scroll Direction | Snap | Lazy Load |
|-----------|-----------------|------|-----------|
| Page body | Vertical | None | LazyMount for below-fold |
| Discover rails | Horizontal | `x mandatory` | No (all render) |
| Vault grid | Vertical | None | Infinite scroll (displayLimit) |
| Timeline | Vertical | None | No |
| Genre explorer | Vertical (expand) | None | No |

### 11.2 Infinite Scroll (Watchlist)

Current implementation:
- Uses `window.innerHeight + window.scrollY >= document.body.offsetHeight - 200` threshold
- Increments `displayLimit` by 20
- `passive: true` on scroll listener

**Issue:** Raw scroll event listener instead of IntersectionObserver. Less performant and not the modern pattern used elsewhere (Discover uses LazyMount).

### 11.3 ScrollToTop

- Appears when user scrolls past the page's first viewport
- Uses IntersectionObserver (performant)
- Position: above bottom nav, right-aligned
- Respects `prefers-reduced-motion` for scroll behavior

### 11.4 Scrollbar Styling

| Browser | Styling |
|---------|---------|
| Webkit (Chrome/Safari) | Custom: 4px width, `--hairline` thumb, rounded |
| Firefox | `scrollbar-width: thin`, `--hairline-2` thumb |

---

## 12. Safe Area Handling

### 12.1 iOS Safe Areas

| Area | CSS | Usage |
|------|-----|-------|
| Top | `env(safe-area-inset-top)` | App header padding-top |
| Bottom | `env(safe-area-inset-bottom)` | Bottom nav padding, toast position, content bottom padding |
| Left/Right | Not currently handled | Potential issue on landscape iOS |

### 12.2 Bottom Navigation Safe Area

```css
padding-bottom: env(safe-area-inset-bottom, 0px);
/* Total height = 4rem + safe-area-inset-bottom */
```

### 12.3 Toast Safe Area

```css
bottom: calc(env(safe-area-inset-bottom, 0px) + 5.5rem);
```

---

## 13. Mobile-First Rules

### 13.1 Layout Principles

1. **Single column by default** — all pages are single-column on mobile
2. **Bottom navigation** — 4 tabs, 64px height, opaque background
3. **Bottom sheets** — modals slide up from bottom on mobile
4. **Sticky headers** — search bars and filter controls stick during scroll
5. **Edge-to-edge posters** — cards have no external padding; grid gap provides spacing
6. **Full-width inputs** — search bars and filters span the container width

### 13.2 Touch Targets

| Element | Minimum Size |
|---------|-------------|
| Navigation tabs | 64px height (exceeds 44px minimum) |
| Card tap areas | Full card face |
| Buttons | 44px height (`sm`: 36px, `md`: 44px, `lg`: 52px) |
| Filter chips | 36px height (below 44px — accessibility gap) |
| Icon buttons | 44px hit area (visual may be smaller) |

### 13.3 Mobile-Specific Patterns

- **App header**: Compressed, no subtitle
- **Profile banner**: 16:6 ratio (shorter than desktop)
- **Collection modal**: Bottom sheet (not centered dialog)
- **Auth modal**: Bottom sheet on mobile, centered on desktop
- **Toast**: Full-width below 480px

---

## 14. Tablet Rules

### 14.1 Breakpoint: 640px — 1024px

Currently, there is no dedicated tablet layout. The 640px breakpoint applies the same layout as desktop, which creates wide single-column layouts on tablets.

**Current behavior at 640px+:**
- Grid columns increase (3→4 for vault, 2→3 for collections)
- Page padding increases to `lg:max-w-4xl`
- Hero sections get taller
- Font sizes increase
- Modals switch from bottom sheet to centered dialog

**Missing tablet optimizations:**
- No side-by-side layout for detail + list views
- No split-pane navigation
- No medium-density grid (currently jumps from mobile to desktop grid)

---

## 15. Desktop Rules

### 15.1 Breakpoint: 1024px+

| Property | Value |
|----------|-------|
| Vault grid | 5-6 columns |
| Hero heights | Full desktop heights (460px spotlight, 360px cinematic) |
| Max width | `lg:max-w-none` (no cap) — potentially too wide |
| Page padding | 20px horizontal (same as mobile) |

### 15.2 Desktop-Specific Patterns

- **Centered dialogs** instead of bottom sheets
- **Modal border-radius** increases to `--radius-modal` (32px)
- **Hero sections** expand to full desktop heights
- **Grid density** increases with more columns

### 15.3 Missing Desktop Optimizations

- **No sidebar navigation** — all navigation is via bottom bar even on desktop
- **No max-width cap on "wide" pages** — content can stretch to full viewport width
- **No keyboard shortcuts** — no Cmd+K for search, no Escape for back
- **No mouse hover states** — hover effects exist in CSS but inline handlers are used in JS
- **No responsive typography beyond 640px** — font sizes don't scale up further for large screens

---

## 16. Hero Section Layouts

### 16.1 Hero Heights

| Hero Type | Mobile | Desktop (@640px) |
|-----------|--------|-------------------|
| Spotlight | 460px | 460px |
| Cinematic (Details) | 35vh min | 360px |
| Collection hero | 220px | 280px |
| Universe hero | 320px | 380px |
| Featured hero | 220px | 220px |
| Premium hero | 240px | 240px |
| Profile banner | 16:6 ratio | 16:5 ratio |

### 16.2 Hero Content Layout

```
┌─────────────────────────────────┐
│ [Backdrop Image — full bleed]   │
│   gradient overlay bottom       │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ [Content Cluster]           │ │
│ │   padding: 24-32px          │ │
│ │   ┌─ Eyebrow ─────────────┐ │ │
│ │   │ Azeret Mono, accent   │ │ │
│ │   └───────────────────────┘ │ │
│ │   ┌─ Title ───────────────┐ │ │
│ │   │ Bebas Neue, display   │ │ │
│ │   └───────────────────────┘ │ │
│ │   ┌─ Subtitle ────────────┐ │ │
│ │   │ Outfit, body-soft     │ │ │
│ │   └───────────────────────┘ │ │
│ │   ┌─ Quick Meta ──────────┐ │ │
│ │   │ Year · Type · Runtime │ │ │
│ │   └───────────────────────┘ │ │
│ │   ┌─ Actions ─────────────┐ │ │
│ │   │ CTA button            │ │ │
│ │   └───────────────────────┘ │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

### 16.3 Gradient Overlays

Hero sections use multi-stop gradient overlays for text readability:

```
linear-gradient(
  to top,
  var(--void) 0%,           /* solid black at bottom */
  rgba(10,11,14,0.95) 15%,  /* near-opaque */
  rgba(10,11,14,0.70) 40%,  /* semi-transparent */
  rgba(10,11,14,0.30) 65%,  /* light */
  transparent 100%           /* clear at top */
)
```

**Inconsistency:** Some heroes use `rgba(0,0,0,...)` stops instead of `rgba(10,11,14,...)`. The latter matches `--tier-1` more precisely.

---

## 17. Filter & Sort Layouts

### 17.1 Quick Filter Tabs (Watchlist)

```
┌──────────────────────────────────┐
│ [All] [Watching] [Completed] ... │
│  pill-style tabs, scrollable     │
│  gap: 8px                        │
│  height: 36px                    │
│  active: accent bg + dark text   │
│  inactive: transparent + muted   │
└──────────────────────────────────┘
```

### 17.2 Filter Drawer (Watchlist)

| Property | Value |
|----------|-------|
| Position | Bottom sheet |
| Blur | 28px (`calc(var(--glass-blur) + 8px)`) |
| Sections | Genre, Platform, Tags |
| Chips | Pill-shaped, toggle behavior |
| Apply | Immediate (no Apply button) |
| Clear | "Clear all" link at top |

### 17.3 Search Filters

| Property | Value |
|----------|-------|
| Type | Dropdown selects (Genre, Year, Type) |
| Position | Below search input |
| Layout | Horizontal row, wrapping |

---

## 18. Profile Layout

### 18.1 Profile Page Structure

```
[Profile Banner — full bleed, 16:6/16:5]
  ┌─ Avatar — overlapping banner bottom by ~50% ─┐
  │  80px mobile, 96px @640px                     │
  └───────────────────────────────────────────────┘
[Identity Block — offset for avatar]
  Display Name (Bebas Neue)
  Username (@handle, Azeret Mono)
  Tagline (Outfit body)
[Edit Mode — inline transformation]
  Fields become inputs in-place
[Profile Sections]
  Taste Card → Completion → Watchlist Summary → Quick Links
```

### 18.2 Profile Section Spacing

| Section | Bottom Margin |
|---------|--------------|
| Identity block | 24px |
| Taste card | 24px |
| Completion | 24px |
| Watchlist summary | 24px |
| Quick links | 32px |

---

## 19. Settings Layout

### 19.1 Settings Page Structure

```
[Back Link — "← Back to Profile"]
[Page Title — "Settings"]
[Page Subtitle — descriptive text]
  ↕ 24-32px
[Setting Group — "Account"]
  ┌─ Setting Row ─────────────────┐
  │ [Icon] [Label]     [Value →]  │
  │ padding: 12-16px              │
  │ radius: --radius-lg (20px)    │
  │ bg: --tier-2                  │
  │ hover: --tier-3               │
  └───────────────────────────────┘
  ↕ 2px between rows
[Setting Group — "Preferences"]
  ...
```

### 19.2 Setting Row Pattern

| Property | Value |
|----------|-------|
| Display | `flex, items-center` |
| Padding | 12-16px |
| Background | `--tier-2` |
| Hover background | `--tier-3` |
| Border radius | `--radius-lg` (20px) |
| Icon | 18px, left-aligned |
| Label | Outfit, body size |
| Value/Chevron | Right-aligned, muted |
| Gap (icon to text) | 12px |
| Gap (text to chevron) | auto (pushed right) |

---

## 20. Empty State Layout

### 20.1 Empty State Pattern

```
         ┌─ Icon Tile ─┐
         │   72px       │
         │  accent glow │
         └──────────────┘
              ↕ 16px
         ┌─ Title ─────┐
         │  bold        │
         │  centered    │
         └──────────────┘
              ↕ 8px
         ┌─ Message ────┐
         │  muted        │
         │  max-w: 280px │
         │  centered     │
         └───────────────┘
              ↕ 24px
         ┌─ Action ─────┐
         │  btn-primary  │
         │  centered     │
         └───────────────┘
```

### 20.2 Empty State Variants

| Variant | Component | Icon | Title Example |
|---------|-----------|------|---------------|
| Generic | `EmptyState` (primitive) | Customizable | Customizable |
| Premium | `PremiumEmptyState` (Discover) | Customizable | Customizable |
| Vault | `EmptyState` (Watchlist) | `bookmark_add` | "Start Your Vault" |
| Search | `SearchEmptyState` | `search_off` | "No Results Found" |
| Discover | `PremiumEmptyState` | `explore` | "Start Exploring" |
| Collections | `EmptyState` | `folder_open` | "No Collections Yet" |

---

## 21. Loading State Layout

### 21.1 Skeleton Pattern

Skeletons use the `shimmer` animation (1.6s infinite gradient sweep):

```
┌─────────────────────────────┐
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░ │  ← skeleton-base
│ ░░░░░░░░░░░░               │  ← shorter for text
│ ░░░░░░░░░░                 │  ← even shorter
└─────────────────────────────┘
```

| Variant | Class | Radius | Usage |
|---------|-------|--------|-------|
| Block | `skeleton-base` | `--radius-md` (12px) | Images, cards, avatars |
| Text | `skeleton-text` | `--radius-sm` (8px) | Lines of text |

### 21.2 Feature-Specific Skeletons

| Page | Component | Layout |
|------|-----------|--------|
| Discover | `DiscoverSkeleton` | Spotlight skeleton + 3 rail skeletons |
| Profile | `ProfileSkeleton` | Banner + avatar + 3 text lines + taste grid |
| Collection | `CollectionSkeleton` | 2 gray bars |
| Watchlist | `LoadingSkeleton` | Grid of poster-shaped blocks |
| Search | `SearchLoading` | Rail-style poster blocks |

---

## Appendix: Layout Anti-Patterns Found

1. **No consistent section wrapper class** — Discover uses `discover-fold`, Collections uses `collections-fold`, Profile uses `profile-section`, while Settings uses `sec-section`. These all serve the same purpose with different class names.

2. **Hero heights are all hardcoded** — No token or scale; each hero type has a unique pixel value.

3. **No max-width cap on wide pages** — `lg:max-w-none` can lead to uncomfortably wide content on ultrawide monitors.

4. **Bottom padding doesn't consistently account for nav** — Some pages have proper bottom padding for the fixed bottom nav; others may have content hidden behind it.

5. **No tablet-specific breakpoint** — The jump from mobile (640px) to desktop has no intermediate tablet layout.

6. **Filter chip height (36px) is below touch target minimum (44px)** — Violates WCAG 2.5.5.
