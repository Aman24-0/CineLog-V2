# CineLog Design Language (CDL)

> **Version:** 1.0  
> **Date:** 2026-07-12  
> **Status:** Foundation Document — Permanent  
> **Scope:** This document defines the unchangeable design philosophy of CineLog. Every feature, redesign, and future decision must pass through these principles.

---

## 1. Product Philosophy

CineLog is a **single-player cinematic journal** — not a social network, not a review platform, not a recommendation engine that talks at you.

The core identity is built on three convictions:

1. **Your taste is the algorithm.** CineLog does not tell you what to watch. It reveals what you already love, what you gravitate toward, and what you haven't discovered yet — all derived from your own watching history. Every recommendation is a mirror, not a megaphone.

2. **The dark room is the theater.** CineLog is designed to feel like walking into a cinema before the lights go down. The void-black backgrounds, the accent glow, the cinematic typography — these are not aesthetic choices. They are the product. The visual environment must preserve the emotional space of watching film.

3. **Data belongs to the watcher.** Every frame of data — your ratings, your history, your collections — is yours. Portable. Exportable. Deletable. CineLog is a vault, not a platform. No followers. No public feed. No social graph. This is not a limitation. It is the product.

---

## 2. Design Principles

### P1 — Content First, Chrome Never

The poster, the title, the rating — these are the content. Everything else (buttons, borders, backgrounds, navigation) is chrome. Chrome must be invisible until needed. A user looking at a movie card should see the poster and the title. The status badge, the rating chips, the action buttons — these appear on hover, on scroll, on interaction. Never before.

**In practice:**
- Cards lead with the poster image at 2:3 aspect ratio
- Text overlays appear over gradient masks, not beside images
- Navigation is hidden until scroll or tap
- Actions are tucked behind contextual menus, not exposed in rows

### P2 — The Black Stays

CineLog's base is always black. Not dark gray. Not dark mode with a toggle to light. Black. This is non-negotiable.

The void (`#000000`) is the canvas. Surfaces are layered above it in carefully tiered elevations (`--tier-0` through `--tier-4`). The accent color — sage, matrix, netflix, interstellar, neonhorizon, vibranium, cinematic, pearl — is the only color that breathes life into the void.

**In practice:**
- No light mode. Ever.
- All surfaces are built from the tier system, not arbitrary grays
- Accent color is the single source of visual energy
- Text exists on a calibrated opacity scale: strong → body → soft → muted → dim

### P3 — Typographic Voice

CineLog speaks in three voices:

| Voice | Typeface | Role | Personality |
|-------|----------|------|-------------|
| **Display** | Bebas Neue | Page titles, hero text, stat values | Confident, cinematic, tall |
| **Label** | Azeret Mono | Eyebrows, metadata, micro-labels, section titles | Technical, precise, compact |
| **Body** | Outfit | Descriptions, body copy, buttons | Warm, readable, human |

These three typefaces are the only voices in the product. No decorative fonts. No script fonts. No exceptions. The hierarchy between them creates rhythm — display for impact, mono for structure, sans for conversation.

**In practice:**
- Page titles: Bebas Neue, 2-3.25rem, uppercase, letter-spacing 0.02-0.04em
- Section eyebrows: Azeret Mono, 0.625-0.6875rem, uppercase, letter-spacing 0.12-0.18em, accent color
- Body text: Outfit, 0.875-0.9375rem, letter-spacing 0.01em
- Card titles: Outfit bold with text-shadow for readability over images

### P4 — Motion with Purpose

Every animation must answer: *What does the user learn from this motion?*

If the answer is "it looks cool," the animation should not exist. Motion in CineLog exists to:
- **Guide attention** — fade-up draws the eye downward through content
- **Confirm action** — spring pop confirms a tap landed
- **Reveal hierarchy** — stagger animations show content arriving in priority order
- **Preserve context** — slide-up maintains spatial awareness during transitions

The motion system has six speeds: micro (80ms), fast (150ms), base (220ms), modal (280ms), page (320ms), slow (450ms). Nothing moves faster than 80ms. Nothing moves slower than 450ms unless it's a decorative ambient effect.

**In practice:**
- Page transitions use `--dur-page` (320ms) with smooth easing
- Card hover uses `--dur-base` (220ms) with spring easing
- Modal entrance uses `--dur-modal` (280ms) with smooth easing
- Shimmer loading uses 1.6s infinite loop
- `prefers-reduced-motion` kills all non-essential animation

### P5 — Glass, Not Solid

When surfaces need to float above content, CineLog uses glass — not opaque panels. Glass surfaces blur the content behind them (`backdrop-filter: blur(20-28px)`), creating depth without losing context. The user always knows where they are because they can see through the overlay.

Glass comes in two strengths:
- **Default glass** — 72% opacity, 20px blur (ambient, breathable)
- **Strong glass** — 88% opacity, 28px blur (focused, task-oriented)

**In practice:**
- App header: glass over scrolling content
- Bottom sheets: glass for Add to Folder, Confirm Remove
- Action dock: strong glass for detail page actions
- Toast notifications: glass with saturation boost

### P6 — Consistent Rhythm, Not Consistent Spacing

CineLog does not use the same spacing everywhere. It uses the same **rhythm** everywhere. The spacing scale (4, 8, 12, 16, 20, 24, 28, 32, 40, 48px) is a musical scale. The choice of which note to play depends on the section's role in the page's visual melody.

- Page padding: 20px (mobile), scaling up at breakpoints
- Section gaps: 24px (tight) / 32px (default) / 48px (loose)
- Card internal padding: 12-16px
- Chip/tag gaps: 4-8px
- Hero content padding: 24-32px

The key is that adjacent sections should **never** have the same spacing as inner-element spacing. Section gaps > element gaps > text gaps. This creates visual grouping without borders.

### P7 — Accent as Identity

The accent color is the user's signature. Choosing a theme is not a cosmetic preference — it is an act of self-expression. The accent color appears in:
- Section eyebrow text
- Active navigation indicator
- Button fills and glows
- Focus rings
- Progress bars and fills
- Timeline accent marks
- Rating cluster highlights

The accent should **never** be used for large background areas. It is a spice, not the meal. Accent-tinted surfaces use `--p-dim` (8% opacity) for backgrounds and `--p-glow` (22% opacity) for shadows.

### P8 — Progressive Disclosure

Information should appear when it becomes relevant, not before. CineLog pages follow a reveal pattern:
1. **Hero/Summary** — the most important single piece of information
2. **Primary sections** — the 2-3 things the user came to see
3. **Secondary sections** — related information that enriches understanding
4. **Tertiary sections** — deep cuts for engaged users

Sections below the fold should use `LazyMount` (IntersectionObserver) to defer rendering until they're about to scroll into view. This keeps initial paint fast and prevents rendering work for content the user may never reach.

### P9 — Touch Targets Are Sacred

Every interactive element must have a minimum touch target of 44x44px (the `--touch-min` token). This applies to:
- All buttons and icon buttons
- All navigation tabs
- All card tap areas
- All filter chips and pills
- All input fields

If a visual element is smaller than 44px, its tap area must be padded with invisible hit area. Visual size can be smaller; interactive size cannot.

### P10 — Error is Design

Error states, empty states, and loading states are not afterthoughts. They are first-class design surfaces that must be designed before the "happy path." Every page must define:
- **Empty state** — icon + title + message + action (what to do when there's nothing)
- **Loading state** — skeleton that matches the content layout (not generic spinners)
- **Error state** — icon + message + retry (what went wrong and how to fix it)

These states must feel as polished as the loaded state. A user seeing an empty vault for the first time is having their first experience with the product. It must be beautiful.

---

## 3. Information Hierarchy

CineLog organizes information in a strict vertical hierarchy, both within pages and across the entire app.

### App-Level Hierarchy (What matters most)

| Priority | Information Type | Where It Lives |
|----------|-----------------|----------------|
| 1 | What to watch next | Discover — Spotlight + Continue |
| 2 | What you're tracking | Watchlist — Vault |
| 3 | What you've organized | Collections — Universes |
| 4 | Who you are as a watcher | Profile — Taste Card + Stats |
| 5 | How to configure | Settings |

### Page-Level Hierarchy (Within any page)

| Layer | Content | Visual Weight |
|-------|---------|--------------|
| Hero | The single most important piece of information (spotlight movie, profile banner, collection hero) | Highest — full-bleed, cinematic imagery, display typography |
| Primary | The core content the page exists to show (vault grid, collection timeline, search results) | High — occupies majority of viewport |
| Secondary | Supporting content that enriches understanding (stats, filters, recommendations) | Medium — visible but not dominant |
| Tertiary | Deep content for engaged users (achievements, history, advanced settings) | Low — accessible but not prominent |
| Chrome | Navigation, actions, controls | Minimal until interaction |

### Card-Level Hierarchy (Within any card)

| Layer | Content | Visual Weight |
|-------|---------|--------------|
| Poster | Primary visual identifier | Dominant — 2:3 ratio, full card face |
| Title | Text identifier | Strong — text-shadow for readability |
| Metadata | Year, type, runtime | Medium — muted color, small type |
| Status | Watching/Completed/Planned | Low — badge overlay, corner position |
| Ratings | IMDb/RT/User scores | Low — bottom strip, small chips |
| Actions | Add/Remove/Rate | On-demand — visible on interaction |

---

## 4. Visual Hierarchy

Visual hierarchy is achieved through five levers, listed in order of impact:

### 4.1 Contrast Ratio

The most powerful lever. On the void-black canvas:
- **White (#ffffff)** = most important text (titles, active states)
- **Body (#e8eaf0)** = default readable text
- **Soft (72% opacity)** = secondary information
- **Muted (48% opacity)** = metadata, labels
- **Dim (24% opacity)** = decorative, contextual

Each step down reduces visual weight by roughly half. Use this deliberately.

### 4.2 Size

After contrast, size is the second most powerful hierarchy lever:
- Display type (2-3.25rem) = page-level titles
- Headline (1-1.25rem) = section headers
- Body (0.875-0.9375rem) = readable content
- Meta (0.6875-0.75rem) = labels and metadata
- Micro (0.5-0.5625rem) = tiny labels, badges

Never skip more than one size step in adjacent elements. A display title next to micro text creates visual noise.

### 4.3 Accent Color

The accent color is the third lever. It should appear on:
- **Eyebrow labels** above sections (drawing the eye to section starts)
- **Active states** (the selected tab, the focused element)
- **Primary actions** (the main CTA button)
- **Progress indicators** (filled bars, active steps)

The accent should **never** appear on:
- Body text (reduces readability)
- Large background areas (overwhelming)
- More than 3 elements in any single viewport

### 4.4 Elevation

Surface elevation creates depth hierarchy:
- `--tier-0` (#000) = the void, page background
- `--tier-1` (#0a0b0e) = base surface, bottom navigation
- `--tier-2` (#111317) = raised surface, cards, inputs
- `--tier-3` (#181b21) = elevated surface, modals, sheets
- `--tier-4` (#20242c) = highest elevation (reserved, currently unused)

Shadows reinforce elevation:
- `--shadow-card` = resting state
- `--shadow-raised` = hover/interaction
- `--shadow-float` = floating elements (action dock, FAB)
- `--shadow-hero` = hero sections

### 4.5 Spatial Rhythm

Spacing creates grouping, which creates hierarchy:
- Large gaps (48px) = separate sections
- Medium gaps (24-32px) = within-section groups
- Small gaps (8-16px) = within-group elements
- Tiny gaps (4px) = within-element details (icon + text in a badge)

---

## 5. Content-First Philosophy

CineLog's UI exists to present content, not to be content. This means:

### 5.1 Posters Are the UI

The poster image is the primary interaction surface. Users identify movies by their poster, not by text. Therefore:
- Posters must load quickly (lazy loading, CDN optimization)
- Posters must have graceful fallbacks (shimmer skeleton → initials fallback)
- Posters must maintain aspect ratio (2:3 for movies/shows, 16:9 for episodes/banners)
- Poster quality must be high — no low-resolution placeholders in production

### 5.2 Text Supports, Never Leads

Text in CineLog is always in service of the visual content:
- Titles identify what the poster shows
- Metadata provides context (year, runtime, genre)
- Descriptions offer depth when the user engages
- Labels structure information for scannability

No page should be a "wall of text." If a page has more than 3 consecutive text-only rows without a visual break (image, card, stat, chart), it needs a redesign.

### 5.3 Data as Content

Statistics, taste profiles, and watching patterns are content, not decoration. They must be:
- **Personal** — "You love the 1990s" not "Popular decade: 1990s"
- **Narrative** — each stat tells a story, not just a number
- **Visual** — bars, grids, heatmaps, not just numbers in a list
- **Actionable** — every insight should connect to something the user can do

### 5.4 Empty States Are Content

An empty vault is not a bug — it's the first chapter. Empty states must:
- Explain what will appear here
- Show a visual icon that represents the content type
- Provide a single clear action to fill the space
- Feel intentional, not broken

---

## 6. Motion Philosophy

### 6.1 Motion Hierarchy

Motion importance matches content importance:

| Motion Type | When to Use | Duration | Easing |
|-------------|-------------|----------|--------|
| Page transition | Route changes | 320ms | smooth |
| Section entrance | Sections becoming visible | 220ms | smooth |
| Card entrance | Grid items appearing | 220ms + stagger | smooth |
| Modal entrance | Overlays opening | 280ms | smooth |
| Interactive feedback | Hover, press, toggle | 150ms | spring/out |
| Micro feedback | Focus ring, border change | 80-150ms | out |
| Ambient motion | Glow pulse, shimmer | 1.6-2s | ease-in-out infinite |

### 6.2 Stagger Pattern

When multiple items enter simultaneously (grid, list, timeline), they stagger:
- Standard stagger: 50ms per child
- Timeline stagger: 60ms per child
- Maximum stagger depth: 6 children (300ms total delay)

Stagger should never exceed 300ms total. Beyond this, the animation feels sluggish.

### 6.3 Reduced Motion

All non-essential motion must respect `prefers-reduced-motion: reduce`:
- Page transitions: instant (0.001ms)
- Hover effects: instant
- Loading skeletons: static (no shimmer)
- Ambient effects: static

Essential motion (focus indicators, scroll behavior) remains active.

### 6.4 Entrance vs. Exit

Entrances are animated. Exits are fast or instant.
- Modal entrance: 280ms slide-up
- Modal exit: instant or 150ms fade-out
- Toast entrance: 220ms slide-up + scale
- Toast exit: 150ms fade-out + slide-down

Users should never wait for something to leave the screen.

---

## 7. Navigation Philosophy

### 7.1 Tab Bar as Home

The bottom navigation is the primary navigation mechanism. It contains exactly 4 tabs:
1. **Discover** — what to watch next
2. **Search** — find something specific
3. **Watchlist** — what you're tracking
4. **Collections** — what you've organized

No more. No fewer. The tab bar is opaque (not glass) for thumb-zone stability. The active tab is indicated by the accent color and a 20px animated indicator bar.

### 7.2 Back Navigation

Every sub-page must have a back link in the header area. The pattern:
- Text: "← Back to [Parent Name]"
- Position: Top of page, before the main title
- Style: Accent-colored Azeret Mono eyebrow with left arrow icon
- Keyboard: Standard browser back

### 7.3 Deep Navigation

Pages deeper than 2 levels from the tab bar must show breadcrumb-like back navigation. Currently, only Collection Edit is 3 levels deep (Tab → Collections → Collection Detail → Edit). It uses a back button.

### 7.4 Contextual Navigation

Navigation within content (filtering, sorting, searching) should be:
- Sticky (stays visible while scrolling content)
- Compact (doesn't consume excessive vertical space)
- Glass (blurs scrolling content behind it)

### 7.5 No Hamburger Menus

CineLog does not use hamburger menus, drawer navigation, or hidden navigation. All primary destinations are one tap away via the bottom bar. Secondary destinations are reachable through the Profile page's Quick Links.

---

## 8. Interaction Philosophy

### 8.1 Tap as Primary Gesture

CineLog is mobile-first. Tap is the primary interaction:
- Tap a card → open detail modal
- Tap a filter → apply filter immediately (no "Apply" button)
- Tap a tab → switch view
- Tap and hold → no long-press actions currently

### 8.2 Immediate Feedback

Every tap must produce visible feedback within 150ms:
- Button press: scale down to 0.96-0.98
- Card press: scale down to 0.94-0.97
- Chip toggle: color + border transition
- Toggle switch: immediate visual state change

### 8.3 Destructive Actions Require Confirmation

Any action that deletes, removes, or resets data must:
1. Show a bottom sheet or dialog
2. Clearly state what will happen
3. Provide a Cancel button (primary, safe) and a Confirm button (danger, red)
4. Not auto-confirm on tap

Examples: Remove from vault, Delete collection, Reset library, Sign out

### 8.4 Progressive Actions

Multi-step actions (adding to vault, creating a collection) should:
- Start with a single tap (add to vault)
- Reveal additional options on follow-up (add to folder, set status)
- Never require more than 3 taps to complete a core action

### 8.5 Undo Over Confirm

Where possible, prefer undo over confirmation:
- Adding to vault: immediate, with toast offering undo
- Removing from vault: confirm sheet (destructive)
- Status change: immediate, reversible by tapping again

---

## 9. Accessibility Philosophy

### 9.1 Accessibility is Not Optional

CineLog must be usable by everyone, regardless of ability. Accessibility is a design constraint, not a feature flag.

### 9.2 Keyboard Navigation

Every interactive element must be:
- Reachable via Tab key
- Activatable via Enter or Space
- Visible when focused (focus ring: 2px solid accent, or 4px double ring)

Current gaps that must be resolved:
- Notification toggles are `<div>` elements (not keyboard-focusable)
- Collection Edit drag-and-drop has no keyboard alternative
- Developer page has non-functional focusable elements

### 9.3 Screen Reader Support

- All images must have descriptive `alt` text or `aria-label`
- All interactive elements must have `aria-label` or visible text
- Dynamic content changes must use `aria-live` regions
- Modal dialogs must trap focus and announce their role
- Status changes must be announced (e.g., "Added to watchlist")

### 9.4 Color Independence

No information must be conveyed by color alone:
- Status badges use both color and text (Watching = green + "Watching")
- Toggle states use both color and position
- Error states use both color and icon + text
- Success states use both color and icon + text

### 9.5 Touch Target Compliance

All interactive elements must meet WCAG 2.5.5 (minimum 44x44px touch target). Elements that are visually smaller must have expanded hit areas.

### 9.6 Motion Sensitivity

All non-essential animations must respect `prefers-reduced-motion: reduce`. The global kill switch in `base.css` (transition-duration: 0.001ms) handles most cases, but component-level overrides must also be implemented.

### 9.7 Contrast Compliance

Text must meet WCAG 2.1 contrast ratios:
- Large text (18px+ bold, 24px+ normal): 3:1 minimum
- Normal text: 4.5:1 minimum
- `--text-dim` (24% opacity on #e8eaf0 over black) = approximately 2.5:1 — **fails WCAG for normal text**. This token must only be used for decorative text, never for information-carrying text.

---

## 10. Theme System

### 10.1 Always Dark

CineLog is dark-only. There is no light mode and there will never be one. The black canvas is fundamental to the cinematic identity.

### 10.2 Accent as Expression

The 8 themes differ only in accent color. All other tokens (surfaces, text, spacing, motion) remain identical:

| Theme | Accent (`--p`) | Secondary (`--p2`) | Mood |
|-------|---------------|-------------------|------|
| pearl | #ffffff | #a0a0a0 | Minimal, editorial |
| sage | #a8ff78 | #ff78c4 | Organic, natural |
| matrix | #39ff14 | #00f5a0 | Hacker, retro-futurist |
| netflix | #ff2d55 | #ff9500 | Bold, entertainment |
| interstellar | #00c2ff | #f9a620 | Cosmic, exploration |
| neonhorizon | #ff2af0 | #00ffe7 | Cyberpunk, vibrant |
| vibranium | #9d4edd | #06ffd4 | Mystical, powerful |
| cinematic | #FFD700 | #FF6B00 | Golden, premium |

### 10.3 Active State Contrast

Each theme defines `--active-text` to ensure readability on accent-colored surfaces:
- Most themes: `#05060a` (dark text on bright accent)
- Netflix, NeonHorizon, Vibranium: `#ffffff` (light text on dark accent)

### 10.4 Theme Application

Themes are applied by adding the `.theme-*` class to both `<html>` and `<body>`. The JS theme system in `src/core/theme/` manages this. Theme preference is persisted in localStorage.

---

## Appendices

### A. Permanent Rules

These rules may never be changed without a formal CDL revision:

1. The base is always black. No light mode.
2. The three typefaces are permanent: Bebas Neue, Azeret Mono, Outfit.
3. The accent color is the only source of non-neutral color energy.
4. Posters maintain 2:3 aspect ratio. This is the movie industry standard.
5. The bottom navigation has exactly 4 tabs.
6. Every interactive element must be keyboard-accessible.
7. Every destructive action must require confirmation.
8. Empty states are designed first, not last.
9. Motion must answer "what does the user learn?"
10. Data is portable, exportable, and deletable.

### B. Document Maintenance

This document must be updated when:
- A new design principle is established (requires team consensus)
- An existing principle is formally revised (requires CDL revision number)
- New theme colors are added
- Typography changes are made (font replacement requires CDL major version)

This document must NOT be updated for:
- Individual feature decisions (feature specs handle this)
- Implementation details (DesignTokens.md handles this)
- Bug fixes (no philosophy impact)
