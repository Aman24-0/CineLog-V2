# CineLog Component Families

> **Version:** 1.0
> **Date:** 2026-07-12
> **Status:** Permanent Reference — Component Family Catalog
> **Scope:** Every reusable component and pattern in CineLog V2, grouped into permanent families with consolidation recommendations.
> **Cross-refs:** [ComponentInventory.md](./ComponentInventory.md) | [DesignDebt.md](./DesignDebt.md) | [DesignTokens.md](./DesignTokens.md) | [CDL.md](./CDL.md)

---

## How to Read This Document

Each family is documented with seven sections:

| Section | Purpose |
|---------|---------|
| **Family Purpose** | Why this family exists and what unifies its members |
| **Member Inventory** | Every component in the family with source path and role |
| **Shared Patterns** | Props, CSS classes, and conventions that members already share |
| **Overlaps & Duplications** | Members that are near-identical, redundant, or conflict |
| **Canonical Member** | The member that should survive consolidation (or the name for a merged component) |
| **Consolidation Plan** | Which members to merge, remove, or rename |
| **Unified API** | The shared props/interface the family should expose after consolidation |

Members are tagged with their lifecycle status:

| Tag | Meaning |
|-----|---------|
| **primitive** | Lives in `src/shared/ui/primitives/` — shared across all features |
| **shared** | Lives in `src/shared/ui/` — app-wide but not a primitive |
| **feature** | Lives in a feature directory — scoped to one feature |
| **css-only** | Pattern exists only as CSS classes, no component extraction |
| **phase-2** | Introduced during Phase 2.1/2.2 — may overlap with original |

---

## Family 1: Navigation

### Purpose

All components that control where the user is, where they can go, and how they get back. Navigation members share a common visual language: accent color for active state, glass surfaces for sticky elements, and Azeret Mono for labels.

### Member Inventory

| # | Component | Location | Tag | Role |
|---|-----------|----------|-----|------|
| 1 | `AppHeader` | `src/shared/ui/AppHeader.tsx` | shared | Sticky glass header with wordmark + avatar pill |
| 2 | `BottomNavigation` | `src/shared/ui/BottomNavigation.tsx` | shared | Fixed 4-tab bottom bar (Discover/Search/Watchlist/Collections) |
| 3 | `NavButton` | `src/shared/ui/NavButton.tsx` | shared | Single tab in bottom nav: icon + label + animated active indicator |
| 4 | `ScrollToTop` | `src/shared/ui/ScrollToTop.tsx` | shared | Floating glass button, appears on scroll via IntersectionObserver |
| 5 | `QuickLinks` | `src/features/profile/components/QuickLinks.tsx` | feature | Profile nav rows: icon + label + chevron → sub-pages |
| 6 | `collections-back-btn` | `src/styles/features/collections.css` (CSS) | css-only | Back button for collection edit page |
| 7 | `universe-detail-back-btn` | `src/styles/features/collections.css` (CSS) | css-only | Back button for universe detail page |
| 8 | `discover-guest-nudge` | `src/styles/features/discover.css` (CSS) | css-only | Guest sign-in nudge at bottom of discover |

### Shared Patterns

| Pattern | Details |
|---------|---------|
| Active state | Accent color (`var(--p)`) + glow shadow (`var(--p-glow)`) |
| Label typography | Azeret Mono, 9px, 700 weight, 0.08em letter-spacing, uppercase |
| Sticky surfaces | `backdrop-filter: blur(20px)`, `--hairline` borders, `z-30`+ |
| Touch targets | All nav buttons ≥ 44×44px (NavButton = 64px height via `--nav-height`) |
| Back navigation pattern | Accent eyebrow text + left arrow icon + "Back to [Parent]" |

### Overlaps & Duplications

| Overlap | Details |
|---------|---------|
| **Back button variants** | `collections-back-btn` and `universe-detail-back-btn` are nearly identical CSS patterns — same hover/active transitions, same layout. They differ only in: (1) `collections-back-btn` has margin-bottom + plain hover; (2) `universe-detail-back-btn` has transparent bg + scale active. Both should be one component. |
| **Guest nudge vs EmptyState** | `discover-guest-nudge` and the guest-variant `EmptyState` in Watchlist both render a sign-in prompt for unauthenticated users. The nudge is discover-specific; the EmptyState is watchlist-specific. Same intent, different markup. |
| **QuickLinks vs Settings rows** | QuickLinks rows (icon + label + chevron) use the same layout pattern as settings rows but with different styling. Both are "navigation rows." |

### Canonical Member

**`BackButton`** (new) — a single, reusable back navigation component that replaces both CSS-only back button patterns.

### Consolidation Plan

| Action | Component | Details |
|--------|-----------|---------|
| **Keep** | `AppHeader` | No changes needed. Well-scoped. |
| **Keep** | `BottomNavigation` | No changes needed. Correct scope. |
| **Keep** | `NavButton` | No changes needed. Clean component. |
| **Keep** | `ScrollToTop` | No changes needed. Good IntersectionObserver pattern. |
| **Keep** | `QuickLinks` | Profile-specific, acceptable scope. |
| **Merge** | `collections-back-btn` + `universe-detail-back-btn` → `BackButton` | Extract to `src/shared/ui/BackButton.tsx` with `parentName: string` and `variant: "inline" | "overlay"` props. |
| **Merge** | `discover-guest-nudge` → `EmptyState` variant | Guest nudge is an empty state with a sign-in CTA. Replace with `<EmptyState variant="guest">`. |

### Unified API

```ts
// After consolidation, the Navigation family exposes:

interface AppHeaderProps {}           // unchanged, consumes useAuth/useAuthModal
interface BottomNavigationProps {}    // unchanged, consumes useLocation
interface NavButtonProps {            // unchanged
  icon: string;
  label: string;
  active?: boolean;
  onClick: () => void;
}
interface ScrollToTopProps {}         // unchanged

// New unified component:
interface BackButtonProps {
  parentName: string;                // "Collections", "Universe", "Settings", etc.
  href?: string;                     // route to navigate to
  onClick?: () => void;              // alternative to href
  variant?: "inline" | "overlay";   // inline = collections-back, overlay = universe-detail
}
```

---

## Family 2: Cards

### Purpose

The largest family. Cards are the primary content-display surfaces in CineLog — every piece of movie, show, collection, or stat data is presented inside a card. All cards share a common visual grammar: poster-first hierarchy, gradient overlays, tier-based backgrounds, and `--radius-lg` to `--radius-xl` corners.

### Member Inventory

| # | Component | Location | Tag | Role |
|---|-----------|----------|-----|------|
| 1 | `MovieCard` | `src/shared/ui/MovieCard.tsx` | shared | Poster card, 3 variants: compact/default/featured |
| 2 | `VaultCard` | `src/features/watchlist/components/VaultCard.tsx` | feature | Timeline card, horizontal poster+info |
| 3 | `VaultShelf` | `src/features/watchlist/components/VaultShelf.tsx` | feature | Status-grouped shelf with header + rail |
| 4 | `CollectionCard` | `src/features/collections/CollectionsGrid.tsx` (inline) | feature | Folder card with 4-poster collage |
| 5 | `FranchiseCard` | `src/features/collections/components/FranchiseGrid.tsx` (inline) | feature | Franchise → universe group card |
| 6 | `StatCard` / `.stat-card` | `src/styles/components/cards.css` | css-only | Stats display card (icon + value + label) |
| 7 | `ContinueCard` | discover rails (inline in DiscoverPage) | feature | Continue watching, 16:9 + progress bar |
| 8 | `UpcomingCard` | discover rails (inline) | feature | Upcoming release row |
| 9 | `ProfileCompletion` | `src/features/profile/components/ProfileCompletion.tsx` | feature | Checklist card with SVG progress ring |
| 10 | `TasteCard` | `src/features/profile/components/TasteCard.tsx` | feature | 2×2 favorites grid with poster thumbnails |
| 11 | `AchievementCard` | `src/features/profile/AchievementsPage.tsx` (inline) | feature | Milestone card, locked/unlocked states |
| 12 | `HistoryCard` | `src/features/profile/HistoryPage.tsx` (inline) | feature | Chronological entry row |
| 13 | `GenreDetailFilmRow` | `src/features/search/SearchPage.tsx` (inline) | feature | Genre-browse film row |
| 14 | `NotesCard` | collection detail (inline) | feature | Journal note card |
| 15 | `FolderCard` | `src/features/collections/components/CollectionsGrid.tsx` (inline) | feature | Folder card (same as CollectionCard?) |
| 16 | `EpisodeCard` | `src/features/details/components/EpisodeCard.tsx` | feature | TV episode row with still + number + title |
| 17 | `SimilarTitleCard` | `src/features/details/components/SimilarTitles.tsx` (inline) | feature | Recommendation poster card |
| 18 | `CosmosCard` | `src/features/discover/components/CosmosView.tsx` (inline) | feature | Themed cluster card |
| 19 | `TrajectoryCard` | `src/features/discover/components/TrajectoryCard.tsx` | feature | Intent-based cluster card |
| 20 | `EditorialCard` | `src/features/discover/components/EditorialCard.tsx` | feature | Premium editorial card (16:9 + overlay text) |
| 21 | `SearchRailCard` | discover rails (inline) | feature | Search/trending poster card (compact MovieCard variant) |
| 22 | `SearchResultRow` | `src/features/search/SearchResultRow.tsx` | feature | Horizontal search result with poster + metadata |
| 23 | `CollectionTimelineItem` / `TimelineEntry` | `src/features/collections/components/TimelineEntry.tsx` | feature | Numbered timeline row in collection detail |
| 24 | `YourActivityCard` | `src/features/details/components/YourActivityCard.tsx` | feature | Detail page "your activity" card |
| 25 | `.stat-card` | `src/styles/components/cards.css` | css-only | Phase 1 stat card |
| 26 | `CardPremium` | `src/styles/components/_phase21.css` | css-only | Phase 2.1 card surface |
| 27 | `V2Card` / `V2CardFeatured` | `src/styles/components/_phase22_sprint1.css` | css-only | Phase 2.2 card surface |

### Shared Patterns

| Pattern | Details |
|---------|---------|
| Background | `var(--tier-2)` (#111317) or `var(--tier-3)` (#181b21) for elevated |
| Border radius | `--radius-card` (16px) for poster cards, `--radius-lg` (20px) for stat/info cards, `--radius-xl` (24px) for featured/editorial |
| Gradient overlay | `linear-gradient(to top, rgba(0,0,0,0.97) 0%, ...transparent 100%)` on poster-based cards |
| Hover | `transform: scale(1.03)`, `--dur-base` (220ms) with `--ease-spring` |
| Active/pressed | `transform: scale(0.96-0.97)`, `--dur-fast` (150ms) |
| Status badge | `tag-chip` class with `status-badge-watching/completed/planned` color variants |
| Loading skeleton | `poster-loading` / `skeleton-base` shimmer, 1.4-1.6s animation |
| Accessibility | `role="button"`, `tabindex={0}`, Enter/Space activation, `aria-label` with title + year + status |

### Overlaps & Duplications

| Overlap | Details |
|---------|---------|
| **MovieCard vs VaultCard** | VaultCard is a horizontal variant of MovieCard. Both render poster + title + metadata + status badge + ratings. VaultCard could be a `layout="horizontal"` variant of MovieCard. |
| **MovieCard vs SearchRailCard vs SimilarTitleCard** | SearchRailCard and SimilarTitleCard are both `MovieCard variant="compact"`. They are inline renderings that duplicate MovieCard logic. |
| **CollectionCard vs FolderCard** | Both display a folder with a poster collage + name + count. Likely the same component with different names in different contexts. Verify and unify. |
| **StatCard (CSS) vs StatCard (feature)** | The CSS `.stat-card` class and the feature-level stat cards in StatsPage/WatchlistStats may render differently. Phase 2.1 `CardPremium` and Phase 2.2 `V2Card` introduce competing surface classes for the same purpose. |
| **HistoryCard vs TimelineEntry vs SearchResultRow** | All three are horizontal rows with poster + title + metadata. Minor layout differences (numbering, metadata fields) but structurally identical. Could be one `ListRow` component with variants. |
| **Card surface CSS proliferation** | `.stat-card`, `.card-premium`, `.v2-card`, `.v2-card-featured` are all "card background" classes that do similar things (background, border, border-radius, shadow). Should consolidate to one surface system. |
| **ContinueCard vs EpisodeCard** | Both show a 16:9 image + progress bar. ContinueCard = movie progress; EpisodeCard = TV episode + number. Could share a base. |

### Canonical Member

**`MovieCard`** — already the most evolved card with variant support. Extend with `layout` prop to absorb VaultCard, SearchResultRow, and TimelineEntry variants.

**`SurfaceCard`** (new) — replaces `.stat-card`, `CardPremium`, `V2Card`, `V2CardFeatured` with a single prop-driven surface component.

### Consolidation Plan

| Action | Component | Details |
|--------|-----------|---------|
| **Keep** | `MovieCard` | Extend with `layout: "grid" | "horizontal"` prop |
| **Merge** | `VaultCard` → `MovieCard layout="horizontal"` | VaultCard = horizontal MovieCard |
| **Merge** | `SearchRailCard` → `MovieCard variant="compact"` | Already a compact variant; stop inlining |
| **Merge** | `SimilarTitleCard` → `MovieCard variant="compact"` | Same as above |
| **Merge** | `SearchResultRow` → `MovieCard layout="horizontal" variant="compact"` | Unified horizontal variant |
| **Merge** | `HistoryCard` + `TimelineEntry` → `ListRow` | New `ListRow` component with `showNumber`, `showDate`, `showStatus` props |
| **Merge** | `CollectionCard` + `FolderCard` → `CollectionCard` | Verify equivalence, keep one name |
| **Merge** | `.stat-card` + `CardPremium` + `V2Card` + `V2CardFeatured` → `SurfaceCard` | Single card surface primitive with `elevation` and `featured` props |
| **Keep** | `EpisodeCard` | TV-specific (episode number + season context); keep separate |
| **Keep** | `EditorialCard` | Unique 16:9 + overlay text pattern; keep separate |
| **Keep** | `TasteCard` | Profile-specific 2×2 grid; keep separate |
| **Keep** | `ProfileCompletion` | Complex checklist + progress; keep separate |
| **Keep** | `AchievementCard` | Locked/unlocked states are unique; keep separate |
| **Keep** | `CosmosCard` + `TrajectoryCard` | Discover-specific cluster patterns; keep separate |
| **Keep** | `VaultShelf` | Shelf is a container (header + rail), not a card; keep |
| **Keep** | `YourActivityCard` | Detail-specific; keep separate |
| **Evaluate** | `ContinueCard` + `UpcomingCard` | Both are 16:9 horizontal cards. Could be `MovieCard layout="wide"` or a shared `ContinueRow` component. |
| **Evaluate** | `GenreDetailFilmRow` | Likely a horizontal MovieCard variant; consolidate after MovieCard has `layout` prop |

### Unified API

```ts
// MovieCard — extended
interface MovieCardProps {
  movie: WatchlistItem;
  variant?: "compact" | "default" | "featured";  // existing
  layout?: "grid" | "horizontal" | "wide";        // NEW: absorbs VaultCard, SearchResultRow, ContinueCard
  search?: string;
  onClick: () => void;
}

// SurfaceCard — new card surface primitive
interface SurfaceCardProps extends JSX.HTMLAttributes<HTMLDivElement> {
  elevation?: "base" | "raised" | "glass" | "glass-strong";
  featured?: boolean;                              // adds accent border + glow
  padding?: string;
  radius?: string;
}

// ListRow — new horizontal list row component
interface ListRowProps {
  posterUrl?: string;
  title: string;
  subtitle?: string;
  metadata?: string[];
  status?: VaultStatus;
  index?: number;          // show number (for timeline entries)
  date?: string;           // show date (for history entries)
  onClick?: () => void;
}
```

---

## Family 3: Inputs

### Purpose

All form input components. Inputs in CineLog share a consistent dark-surface aesthetic: `--tier-2` or `--tier-3` backgrounds, `--hairline` borders that brighten on focus, and Azeret Mono for placeholder text.

### Member Inventory

| # | Component | Location | Tag | Role |
|---|-----------|----------|-----|------|
| 1 | `SearchBar` | `src/features/watchlist/components/VaultSearch.tsx` + `search-premium` CSS | feature | Search input with clear button, glass background |
| 2 | `FilterSelect` | `filter-select-premium` CSS class | css-only | Dropdown select for vault filters |
| 3 | `FilterInput` | `filter-input-premium` CSS class | css-only | Text input inside filter drawer |
| 4 | `RangeFilter` | vault filters (inline) | feature | Min/max input pair for year/runtime ranges |
| 5 | `NoteTextarea` | `cinematic-note-textarea` CSS class | css-only | Multi-line note input with cinematic styling |
| 6 | `EditorTitleInput` | note editor (inline) | feature | Title input for note editing |
| 7 | `EditorBodyInput` | note editor (inline) | feature | Body/content textarea for note editing |
| 8 | `CollectionCreateInput` | `src/features/collections/components/FolderEditor.tsx` (inline) | feature | Input for creating a new collection folder |
| 9 | `FolderEditorNameInput` | `src/features/collections/components/FolderEditor.tsx` (inline) | feature | Input for renaming an existing folder |

### Shared Patterns

| Pattern | Details |
|---------|---------|
| Background | `var(--tier-2)` or `var(--tier-3)` depending on elevation context |
| Border | `1px solid var(--hairline)`, transitions to `var(--hairline-2)` or `var(--p)` on focus |
| Border radius | `--radius-lg` (20px) for all inputs |
| Typography | Outfit for input text (0.875rem), Azeret Mono for labels |
| Focus ring | `focus-ring` class: 2px solid accent, 2px offset |
| Placeholder | `var(--text-muted)` color, slightly smaller font |
| Touch target | Minimum 44px height (`--touch-min`) |

### Overlaps & Duplications

| Overlap | Details |
|---------|---------|
| **CollectionCreateInput vs FolderEditorNameInput** | Both are text inputs for naming folders/collections. Same purpose (name a folder), different contexts (create vs rename). Should be one component. |
| **EditorTitleInput + EditorBodyInput vs NoteTextarea** | The note editor uses separate title + body inputs, while the inline note display uses a single `cinematic-note-textarea`. These represent the same content but in different modes. |
| **FilterInput vs SearchBar** | FilterInput is a simplified SearchBar without the clear button. Same base input pattern. |
| **CSS-only inputs** | Most inputs are CSS classes applied to native `<input>` / `<textarea>` elements. No component extraction, leading to inconsistent focus handling and missing aria attributes. |

### Canonical Member

**`TextInput`** — a single input primitive that replaces all text input variants. Add `multiline` prop to absorb textareas.

### Consolidation Plan

| Action | Component | Details |
|--------|-----------|---------|
| **Create** | `TextInput` | New primitive in `src/shared/ui/primitives/TextInput.tsx` |
| **Merge** | `SearchBar` → `TextInput variant="search"` | Search variant adds clear button + glass bg |
| **Merge** | `FilterInput` → `TextInput variant="filter"` | Filter variant adds compact sizing |
| **Merge** | `FilterSelect` → `SelectInput` | New `SelectInput` primitive for dropdowns |
| **Merge** | `CollectionCreateInput` + `FolderEditorNameInput` → `TextInput` | Both are just `<TextInput>` with different placeholders |
| **Merge** | `EditorTitleInput` → `TextInput size="lg"` | Title input = larger TextInput |
| **Merge** | `EditorBodyInput` + `NoteTextarea` → `TextInput multiline` | Both become `<TextInput multiline>` |
| **Keep** | `RangeFilter` | Dual-input pattern is unique; keep as composed component using two `TextInput` instances |

### Unified API

```ts
interface TextInputProps extends JSX.InputHTMLAttributes<HTMLInputElement> {
  variant?: "default" | "search" | "filter";      // styling variant
  size?: "sm" | "md" | "lg";                      // height/padding
  multiline?: boolean;                             // renders <textarea> instead of <input>
  icon?: string;                                   // left icon (search icon for variant="search")
  clearable?: boolean;                             // show clear button (auto-true for variant="search")
  error?: string;                                  // error message below input
  label?: string;                                  // visible label above input
}

interface SelectInputProps extends JSX.SelectHTMLAttributes<HTMLSelectElement> {
  variant?: "default" | "filter";
  options: { value: string; label: string }[];
  label?: string;
}
```

---

## Family 4: Buttons

### Purpose

All interactive trigger elements — from the primary CTA to filter pills. Buttons share a consistent press-feedback pattern (scale 0.96-0.98 on active), accent-colored focus rings, and the Material Symbols icon system.

### Member Inventory

| # | Component | Location | Tag | Role |
|---|-----------|----------|-----|------|
| 1 | `Button` | `src/shared/ui/primitives/Button.tsx` | primitive | Primary/ghost variants, sm/md/lg sizes |
| 2 | `CinematicCloseBtn` | details hero (inline) | feature | Glass circle close button for modals/heroes |
| 3 | `ActionDock` | `src/features/details/components/ActionDock.tsx` | feature | Floating glass bar with multiple action buttons |
| 4 | `ViewToggle` | watchlist (inline) | feature | Grid/timeline toggle with icon buttons |
| 5 | `FilterButton` | watchlist (inline) | feature | Filter trigger with count badge |
| 6 | `QuickFilterTabs` | `src/features/watchlist/components/QuickFilterTabs.tsx` | feature | Status filter pills with counts |
| 7 | `GenreChip` | search + discover genre explorer | feature | Genre browse/select pill |
| 8 | `OTTProviderChip` | discover OTT section | feature | Streaming provider selector pill |
| 9 | `CinematicCloseBtn` (CSS) | `.cinematic-close-btn` | css-only | Close button for cinematic hero |

### Shared Patterns

| Pattern | Details |
|---------|---------|
| Press feedback | `:active { transform: scale(0.96-0.98) }`, 150ms spring easing |
| Focus ring | `focus-ring` class: 2px solid `var(--p)`, 2px offset |
| Icon integration | Material Symbols Outlined, `font-variation-settings` for fill state |
| Glass surfaces | Close button, action dock use `backdrop-filter: blur(28px)` + `saturate(1.4)` |
| Button typography | Outfit 900 weight, 0.6875rem, 0.14em letter-spacing (`.type-button`) |

### Overlaps & Duplications

| Overlap | Details |
|---------|---------|
| **GenreChip vs OTTProviderChip** | Both are selectable pills with the same visual pattern: pill shape, accent when active, count/label text. They differ only in data source (genre list vs OTT provider list). |
| **QuickFilterTabs vs GenreChip** | Both are selectable filter pills with counts. QuickFilterTabs show vault status counts; GenreChips show genre names. Same interaction model, different content. |
| **Button missing variants** | Button only has primary/ghost. The codebase needs danger (red, destructive), outline (border-only), and link (text-only) variants. CinematicCloseBtn is essentially `Button variant="ghost" shape="circle"`. |
| **CinematicCloseBtn inline** | The close button is inline JSX in DetailsHero, not a component. Should be extracted. |

### Canonical Member

**`Button`** — extend with additional variants and shape prop to absorb close buttons and icon buttons.

**`FilterChip`** — new component to absorb GenreChip, OTTProviderChip, and QuickFilterTab into one selectable pill.

### Consolidation Plan

| Action | Component | Details |
|--------|-----------|---------|
| **Extend** | `Button` | Add `variant: "primary" | "ghost" | "danger" | "outline" | "link"` and `shape: "rect" | "circle" | "pill"` |
| **Merge** | `CinematicCloseBtn` → `Button variant="ghost" shape="circle"` | Close button becomes a Button variant |
| **Keep** | `ActionDock` | Complex floating dock with multiple buttons; keep as composed component |
| **Keep** | `ViewToggle` | Specialized binary toggle; keep separate |
| **Merge** | `GenreChip` + `OTTProviderChip` + `QuickFilterTab` → `FilterChip` | New `FilterChip` component with `selected`, `count`, `icon` props |
| **Keep** | `FilterButton` | Filter trigger with count badge; keep separate (it opens a drawer, not a toggle) |

### Unified API

```ts
// Button — extended
interface ButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "danger" | "outline" | "link";
  size?: "sm" | "md" | "lg";
  shape?: "rect" | "circle" | "pill";
  icon?: string;
  iconFill?: boolean;
  fullWidth?: boolean;
  loading?: boolean;                // NEW: shows spinner, disables button
}

// FilterChip — new
interface FilterChipProps {
  label: string;
  icon?: string;
  count?: number;
  selected?: boolean;
  onSelect: () => void;
  variant?: "default" | "accent";   // accent = uses primary accent when selected
}
```

---

## Family 5: Sheets & Modals

### Purpose

All overlay surfaces that interrupt the primary flow — from authentication to confirmation to configuration. Sheets and modals share a common backdrop pattern, entrance/exit animations, and focus-trap behavior.

### Member Inventory

| # | Component | Location | Tag | Role |
|---|-----------|----------|-----|------|
| 1 | `AuthModal` | `src/shared/ui/AuthModal.tsx` | shared | Email/password + Google, bottom-sheet mobile / center desktop |
| 2 | `DetailsModal` | `src/features/details/DetailsModal/DetailsModal.tsx` | feature | Cinematic details, full-screen mobile / large modal desktop |
| 3 | `CollectionModal` | `src/features/collection/CollectionModal.tsx` | feature | Collection viewer modal |
| 4 | `AddToFolderSheet` | `src/features/details/components/AddToFolderSheet.tsx` | feature | Add to collection bottom sheet |
| 5 | `ConfirmRemoveSheet` | `src/features/details/components/ConfirmRemoveSheet.tsx` | feature | Destructive confirmation bottom sheet |
| 6 | `VaultFilters` | `src/features/watchlist/components/VaultFilters.tsx` | feature | Filter drawer (slide-up sheet) |
| 7 | `AddUniverseModal` | `src/features/collections/components/AddUniverseModal.tsx` | feature | Browse curated universes modal |
| 8 | `SmartCollectionBuilder` | `src/features/collections/components/SmartCollectionBuilder.tsx` | feature | Rule-based builder modal |
| 9 | `FolderEditor` | `src/features/collections/components/FolderEditor.tsx` | feature | Collection customization inline form |
| 10 | `BannerEditor` | `src/features/profile/components/BannerEditor.tsx` | feature | Profile banner edit modal |
| 11 | `FavoritesPicker` | `src/features/profile/components/FavoritesPicker.tsx` | feature | Choose favorites modal |
| 12 | `ResetConfirmSheet` | `src/features/sync/components/ResetConfirmSheet.tsx` | feature | Library reset confirmation |
| 13 | `BackupRestorePanel` | `src/features/sync/components/BackupCards.tsx` (inline) | feature | Backup/restore wizard panels |
| 14 | `ImportWizard` | `src/features/sync/import/sources/JsonImportWizard.tsx` | feature | Import wizard modal |

### Shared Patterns

| Pattern | Details |
|---------|---------|
| Backdrop | `rgba(0,0,0,0.70)`, `z-[999999]` (extreme, needs tokenization) |
| Surface | `--tier-3` background, `--radius-modal` (32px) desktop, `--radius-2xl` (28px) mobile bottom-sheet |
| Entrance animation | `--dur-modal` (280ms), `--ease-smooth`, slide-up for sheets, fade-scale for modals |
| Exit animation | 150ms fade-out (fast, per CDL P4) |
| Drag handle | `.sheet-handle` class — 36px pill, centered top |
| Focus trap | AuthModal has complete trap; others are inconsistent |
| Escape key | Most modals close on Escape; some don't |
| Mobile vs desktop | 639px breakpoint: below = bottom sheet, above = centered modal |

### Overlaps & Duplications

| Overlap | Details |
|---------|---------|
| **ConfirmRemoveSheet vs ResetConfirmSheet** | Both are destructive confirmation sheets with Cancel (safe) + Confirm (danger red) buttons. Same structure, different copy. Should be one `ConfirmSheet` component. |
| **AddToFolderSheet + VaultFilters + BannerEditor + FavoritesPicker** | All are bottom sheets with different content but identical chrome (backdrop, handle, surface, close button). No shared sheet shell component exists. |
| **AuthModal z-index** | Uses `z-[999999]` which is extreme and not tokenized. Other modals use various z-index values. Should use a single `--z-modal` token. |
| **Focus trap inconsistency** | AuthModal has complete focus trap. DetailsModal, CollectionModal, and others may not. All modals must trap focus per WCAG. |

### Canonical Member

**`SheetShell`** (new) — a reusable modal/sheet shell that handles backdrop, focus trap, entrance/exit animation, drag handle, and close-on-escape. All modals and sheets become content passed into SheetShell.

**`ConfirmSheet`** (new) — a destructive confirmation sheet built on SheetShell with Cancel + Confirm buttons.

### Consolidation Plan

| Action | Component | Details |
|--------|-----------|---------|
| **Create** | `SheetShell` | New primitive in `src/shared/ui/primitives/SheetShell.tsx` |
| **Create** | `ConfirmSheet` | Built on SheetShell, replaces both ConfirmRemoveSheet and ResetConfirmSheet |
| **Refactor** | `AuthModal` | Extract inner content; wrap in SheetShell |
| **Refactor** | `DetailsModal` | Extract inner content; wrap in SheetShell |
| **Refactor** | `CollectionModal` | Extract inner content; wrap in SheetShell |
| **Refactor** | `AddToFolderSheet` | Wrap in SheetShell |
| **Refactor** | `VaultFilters` | Wrap in SheetShell |
| **Refactor** | `AddUniverseModal` | Wrap in SheetShell |
| **Refactor** | `SmartCollectionBuilder` | Wrap in SheetShell |
| **Refactor** | `BannerEditor` | Wrap in SheetShell |
| **Refactor** | `FavoritesPicker` | Wrap in SheetShell |
| **Merge** | `ConfirmRemoveSheet` + `ResetConfirmSheet` → `ConfirmSheet` | Single component with customizable title/message/confirmLabel |
| **Keep** | `FolderEditor` | Inline form, not a modal; no SheetShell needed |
| **Keep** | `BackupRestorePanel` | Wizard flow, not a modal; keep separate |
| **Keep** | `ImportWizard` | Multi-step wizard; keep separate but wrap in SheetShell |

### Unified API

```ts
// SheetShell — new
interface SheetShellProps {
  open: boolean;
  onClose: () => void;
  variant?: "modal" | "bottom-sheet";       // auto-detected by viewport, or forced
  showHandle?: boolean;                      // drag handle for bottom-sheet
  closeOnBackdrop?: boolean;                 // default true
  closeOnEscape?: boolean;                   // default true
  zIndex?: number;                           // default: --z-modal token
  class?: string;
  style?: JSX.CSSProperties;
  children: JSX.Element;
}

// ConfirmSheet — new, built on SheetShell
interface ConfirmSheetProps {
  open: boolean;
  onClose: () => void;                       // cancel
  onConfirm: () => void;                     // destructive action
  title: string;
  message: string;
  confirmLabel?: string;                     // default: "Remove" / "Reset"
  danger?: boolean;                          // red confirm button
}
```

---

## Family 6: Feedback

### Purpose

All components that communicate state to the user — loading, empty, error, and toast notifications. These are the "first-class design surfaces" mandated by CDL P10: they must be as polished as the happy path.

### Member Inventory

| # | Component | Location | Tag | Role |
|---|-----------|----------|-----|------|
| 1 | `ToastContainer` | `src/shared/ui/ToastContainer.tsx` | shared | Global toast stack, success/error/info/action variants |
| 2 | `EmptyState` | `src/shared/ui/primitives/EmptyState.tsx` | primitive | Icon + title + message + action CTA |
| 3 | `PremiumEmptyState` | `src/features/discover/components/PremiumEmptyState.tsx` | feature | Discover's empty/error state |
| 4 | `DetailsError` | `src/features/details/components/DetailsError.tsx` | feature | Error state for details modal |
| 5 | `SearchEmptyState` | `src/features/search/SearchEmptyState.tsx` | feature | Search no-results state |
| 6 | `GlobalErrorBoundary` | `src/shared/ui/GlobalErrorBoundary.tsx` | shared | App crash fallback |
| 7 | `LoadingScreen` | `src/shared/ui/LoadingScreen.tsx` | shared | Initial load experience |
| 8 | `Skeleton` | `src/shared/ui/primitives/Skeleton.tsx` | primitive | Block/text shimmer variants |
| 9 | Watchlist `EmptyState` | `src/features/watchlist/components/EmptyState.tsx` | feature | Watchlist-specific empty state with guest variant |

### Shared Patterns

| Pattern | Details |
|---------|---------|
| Empty state layout | Icon tile (72px, accent glow) → title (h3) → message (max 280px) → action button |
| Error state layout | Icon → error message → retry button |
| Skeleton animation | `skeleton-base` / `skeleton-text`, 1.4-1.6s shimmer loop |
| Toast animation | 220ms slide-up + scale entrance, 150ms fade-out exit |
| ARIA | `role="status"` + `aria-live="polite"` on empty states; `role="alert"` on errors |
| Color coding | Success = `#4ade80`, Error = `#f87171`, Info = `#60a5fa` |

### Overlaps & Duplications

| Overlap | Details |
|---------|---------|
| **EmptyState vs PremiumEmptyState** | PremiumEmptyState has a slightly different visual treatment (larger icon, different max-width). The difference is minor — could be `EmptyState size="lg"` or `variant="premium"`. |
| **EmptyState vs SearchEmptyState** | SearchEmptyState adds query echo ("No results for '[query]'") and a suggestion. This is a specialized variant of EmptyState. |
| **EmptyState vs Watchlist EmptyState** | Watchlist has its own EmptyState with guest variant (glass surface + sign-in CTA). This is `EmptyState variant="guest"`. |
| **DetailsError vs EmptyState** | DetailsError is an error state with retry. Could be `EmptyState variant="error"` with a retry action. |
| **Three empty states doing the same thing** | The primitive `EmptyState` exists but three features built their own instead of using/extending it. This is the most significant DRY violation in the Feedback family. |

### Canonical Member

**`EmptyState`** — extend with variants to absorb all specialized empty/error states.

### Consolidation Plan

| Action | Component | Details |
|--------|-----------|---------|
| **Extend** | `EmptyState` | Add `variant: "default" | "premium" | "guest" | "error"` and `size: "default" | "lg"` |
| **Merge** | `PremiumEmptyState` → `EmptyState variant="premium"` | Discover's empty state becomes a variant |
| **Merge** | `SearchEmptyState` → `EmptyState variant="default"` with `query` prop | Add `query?: string` to show echo |
| **Merge** | `Watchlist EmptyState` → `EmptyState variant="guest"` | Guest state becomes a variant |
| **Merge** | `DetailsError` → `EmptyState variant="error"` | Error state with retry becomes a variant |
| **Keep** | `ToastContainer` | Unique global stack; keep separate |
| **Keep** | `GlobalErrorBoundary` | App-level crash handler; keep separate |
| **Keep** | `LoadingScreen` | Initial load experience; keep separate |
| **Keep** | `Skeleton` | Loading primitive; keep separate |
| **Extend** | `Skeleton` | Add `variant: "block" | "text" | "circle" | "poster"` and `count?: number` |

### Unified API

```ts
// EmptyState — extended
interface EmptyStateProps {
  icon: string;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  variant?: "default" | "premium" | "guest" | "error";  // NEW
  size?: "default" | "lg";                               // NEW
  query?: string;                                        // NEW: for search echo
  iconFill?: boolean;
  class?: string;
  style?: JSX.CSSProperties;
}

// Skeleton — extended
interface SkeletonProps {
  width?: string;
  height?: string;
  radius?: string;
  variant?: "block" | "text" | "circle" | "poster";     // NEW: circle + poster
  count?: number;                                        // NEW: repeat count
  class?: string;
  style?: JSX.CSSProperties;
}
```

---

## Family 7: Typography

### Purpose

The type system is the backbone of CineLog's visual hierarchy. Three typefaces (Bebas Neue, Azeret Mono, Outfit) express three voices (display, label, body). This family documents every type class in use — including the overlap between V1, Phase 2.1, and Phase 2.2 definitions.

### Member Inventory

| # | Class | Source | Tag | Voice | Size | Used For |
|---|-------|--------|-----|-------|------|----------|
| 1 | `.type-display` | `_phase22_sprint1.css` | phase-2 | Display | 3.25rem | Page titles, hero text |
| 2 | `.type-display-sm` | `_phase22_sprint1.css` | phase-2 | Display | 2rem | Smaller page titles |
| 3 | `.type-display-lg` | `_phase21.css` (dead) | phase-2 | Display | 3.25rem | **Overridden by .type-display in V2** |
| 4 | `.type-page-title` | `base/typography.css` | css-only | Display | 2.25rem | **V1 — replaced by .type-display-sm** |
| 5 | `.type-headline` | `_phase22_sprint1.css` | phase-2 | Body | 1.25rem | Section headers, card titles |
| 6 | `.type-headline-sm` | `_phase22_sprint1.css` | phase-2 | Body | 1rem | Smaller headlines |
| 7 | `.type-body` | `_phase22_sprint1.css` | phase-2 | Body | 0.9375rem | Body text, descriptions |
| 8 | `.type-body-soft` | `_phase22_sprint1.css` | phase-2 | Body | 0.9375rem | Secondary body text (72% opacity) |
| 9 | `.type-eyebrow` | `_phase22_sprint1.css` | phase-2 | Label | 0.6875rem | Section eyebrows |
| 10 | `.type-meta` | `_phase22_sprint1.css` | phase-2 | Label | 0.75rem | Metadata, labels |
| 11 | `.type-micro` | `_phase22_sprint1.css` | phase-2 | Label | 0.5625rem | Tiny labels, badge text |
| 12 | `.type-section-title` | `base/typography.css` | css-only | Label | 0.6875rem | **V1 — same as .type-eyebrow V2** |
| 13 | `.section-header-title` | globals.css | css-only | Body | 1.25rem | **Same as .type-headline** |
| 14 | `.v2-section-title` | `_phase22_sprint1.css` | phase-2 | Label | — | **Same role as .type-eyebrow** |
| 15 | `.type-card-title` | `base/typography.css` | css-only | Body | 0.6875rem | Card titles (Outfit bold + text-shadow) |
| 16 | `.type-subtitle` | `base/typography.css` | css-only | Label | 0.5625rem | **V1 — same as .type-micro** |
| 17 | `.type-stat` | `base/typography.css` | css-only | Display | 2rem | Stat values (Bebas Neue) |
| 18 | `.type-stat-lg` | `_phase21.css` | phase-2 | Display | 2.5rem | **V1 .type-stat + .type-stat-lg = one scale** |
| 19 | `.type-label` | `base/typography.css` | css-only | Label | 0.5625rem | **Same as .type-micro** |
| 20 | `.type-caption` | `base/typography.css` | css-only | Label | 0.5rem | Smallest label |
| 21 | `.type-button` | `base/typography.css` | css-only | Body | 0.6875rem | Button labels (Outfit 900) |
| 22 | `.type-metadata` | `base/typography.css` | css-only | Body | 0.8125rem | **Same as .type-body in V2** |
| 23 | `.font-headline` | globals.css | css-only | — | — | Font-family alias for Bebas Neue |
| 24 | `.font-mono` | globals.css | css-only | — | — | Font-family alias for Azeret Mono |

### Shared Patterns

| Pattern | Details |
|---------|---------|
| Three voices | Display = Bebas Neue (impact), Label = Azeret Mono (structure), Body = Outfit (readability) |
| Text opacity scale | strong (100%) → body (92%) → soft (72%) → muted (48%) → dim (24%) |
| Letter-spacing | Display: 0.02-0.04em, Label: 0.08-0.18em, Body: 0-0.01em |
| Text-shadow | Used on `.type-card-title` for readability over poster images |

### Overlaps & Duplications

| Overlap | Details |
|---------|---------|
| **`.type-display-lg` vs `.type-display`** | Phase 2.1 defined `.type-display-lg` at 3.25rem and `.type-display` at 2.5rem. Phase 2.2 overrode `.type-display` to 3.25rem, making `.type-display-lg` dead code. |
| **`.type-page-title` vs `.type-display-sm`** | V1's `.type-page-title` (2.25rem, Bebas Neue) serves the same role as `.type-display-sm` (2rem). Close enough to be the same class. |
| **`.type-section-title` vs `.type-eyebrow`** | V1's `.type-section-title` (0.6875rem, Azeret Mono, 0.14em spacing, accent color) is identical in purpose and nearly identical in style to `.type-eyebrow` (0.6875rem, Azeret Mono, 0.18em spacing, accent color). Only letter-spacing differs slightly. |
| **`.type-subtitle` vs `.type-micro`** | V1's `.type-subtitle` (0.5625rem, Azeret Mono) and V2's `.type-micro` (0.5625rem, Azeret Mono) are the same class with different names. |
| **`.type-label` vs `.type-micro`** | Same font, same size, same weight. Different names for the same thing. |
| **`.type-metadata` vs `.type-body`** | V1's `.type-metadata` (0.8125rem, Outfit 600) is close to V2's `.type-body` (0.9375rem, Outfit 400). Not identical but serve the same role. |
| **`.section-header-title` vs `.type-headline`** | Same size (1.25rem), same purpose (section header title). One uses Outfit bold, the other is defined in V2. |
| **`.type-stat` + `.type-stat-lg`** | Two sizes of the same thing. Should be one class with a size modifier. |
| **`.type-card-title` unique** | Card title is the only class with text-shadow for poster readability. No V2 equivalent exists. Must be preserved. |

### Canonical Member

The **V2 type ramp** (`_phase22_sprint1.css`) is the canonical system. All V1 and Phase 2.1 classes that duplicate V2 classes should be deprecated.

### Consolidation Plan

| Action | Class | Details |
|--------|-------|---------|
| **Keep** | `.type-display` | Primary page title |
| **Keep** | `.type-display-sm` | Secondary page title (absorbs `.type-page-title`) |
| **Remove** | `.type-display-lg` | Dead code (identical to `.type-display` after V2 override) |
| **Deprecate** | `.type-page-title` | Replace with `.type-display-sm` |
| **Keep** | `.type-headline` | Section header title (absorbs `.section-header-title`) |
| **Keep** | `.type-headline-sm` | Smaller headline |
| **Keep** | `.type-body` | Primary body text |
| **Keep** | `.type-body-soft` | Secondary body text |
| **Keep** | `.type-eyebrow` | Section eyebrow (absorbs `.type-section-title`, `.v2-section-title`) |
| **Keep** | `.type-meta` | Metadata and labels |
| **Keep** | `.type-micro` | Tiny labels (absorbs `.type-subtitle`, `.type-label`) |
| **Keep** | `.type-card-title` | Card titles with text-shadow — unique, must preserve |
| **Keep** | `.type-stat` + `.type-stat-lg` | Merge into `.type-stat` with `size: "md" | "lg"` modifier or keep both |
| **Keep** | `.type-caption` | Smallest label — unique size, keep |
| **Keep** | `.type-button` | Button label typography — unique context, keep |
| **Deprecate** | `.type-section-title` | Replace with `.type-eyebrow` |
| **Deprecate** | `.type-subtitle` | Replace with `.type-micro` |
| **Deprecate** | `.type-label` | Replace with `.type-micro` |
| **Deprecate** | `.type-metadata` | Replace with `.type-body` or `.type-meta` depending on weight |
| **Deprecate** | `.section-header-title` | Replace with `.type-headline` |
| **Deprecate** | `.v2-section-title` | Replace with `.type-eyebrow` |

### Unified API (Post-Consolidation Type Ramp)

| Class | Font | Size | Weight | Spacing | Color | Role |
|-------|------|------|--------|---------|-------|------|
| `.type-display` | Bebas Neue | 3.25rem | — | 0.02em | `--text-strong` | Page title (large) |
| `.type-display-sm` | Bebas Neue | 2rem | — | 0.03em | `--text-strong` | Page title (small) |
| `.type-headline` | Outfit | 1.25rem | 700 | -0.01em | `--text-strong` | Section header |
| `.type-headline-sm` | Outfit | 1rem | 700 | -0.005em | `--text-strong` | Small headline |
| `.type-body` | Outfit | 0.9375rem | 400 | — | `--text-body` | Body text |
| `.type-body-soft` | Outfit | 0.9375rem | 400 | — | `--text-soft` | Secondary body |
| `.type-eyebrow` | Azeret Mono | 0.6875rem | 700 | 0.18em | `var(--p)` | Section eyebrow |
| `.type-meta` | Azeret Mono | 0.75rem | 600 | 0.08em | `--text-muted` | Metadata labels |
| `.type-micro` | Azeret Mono | 0.5625rem | 700 | 0.12em | `--text-muted` | Tiny labels |
| `.type-card-title` | Outfit | 0.6875rem | 700 | — | `#fff` + shadow | Card titles over images |
| `.type-stat` | Bebas Neue | 2rem | — | 0.02em | `--text-strong` | Stat values |
| `.type-stat-lg` | Bebas Neue | 2.5rem | — | 0.02em | `--text-strong` | Hero stat values |
| `.type-caption` | Azeret Mono | 0.5rem | 700 | 0.1em | `--text-muted` | Smallest text |
| `.type-button` | Outfit | 0.6875rem | 900 | 0.14em | — | Button labels |

**14 classes total** (down from 24, a 42% reduction).

---

## Family 8: Media

### Purpose

All components that display visual media — backdrops, posters, progress indicators, and image wrappers. Media components handle the cinematic visual identity of CineLog.

### Member Inventory

| # | Component | Location | Tag | Role |
|---|-----------|----------|-----|------|
| 1 | `CinematicHero` | `src/features/details/components/CinematicHero.tsx` | feature | Full-bleed backdrop + parallax + trailer |
| 2 | `Spotlight` | `src/features/discover/components/Spotlight.tsx` | feature | Discover's hero with backdrop + content cluster |
| 3 | `CollectionHero` | `src/features/collection/components/CollectionHero.tsx` | feature | Collection/universe hero with banner |
| 4 | `UniverseHero` | collection detail (inline) | feature | Universe hero with banner + progress |
| 5 | `ProfileBanner` | `src/features/profile/components/ProfileBanner.tsx` | feature | Dynamic backdrop with edit capability |
| 6 | `SafeImage` | `src/shared/ui/SafeImage.tsx` | shared | Defensive img wrapper with error fallback |
| 7 | `PosterLoading` | `.poster-loading` CSS class | css-only | Shimmer placeholder for poster images |
| 8 | `ProgressRing` | `src/features/collections/components/ProgressRing.tsx` | feature | SVG circular progress for universes |
| 9 | `ProgressBar` | `.progress-premium` / `.progress-bar` CSS | css-only | Linear progress bar |
| 10 | `ProgressPremium` | `.progress-premium` CSS class | css-only | Premium linear progress bar |

### Shared Patterns

| Pattern | Details |
|---------|---------|
| Backdrop gradient | `linear-gradient(to top, rgba(0,0,0,1) 0%, ...transparent 100%)` with optional right-side gradient |
| Poster aspect ratio | 2:3 (movies/shows), 16:9 (episodes, banners, editorial) |
| Image loading | Lazy loading + `decoding="async"` + shimmer skeleton fallback |
| Progress accent | `var(--p)` fill with `0 0 8px var(--p-glow)` glow shadow |
| Ambient backdrop | 60px blur, low-opacity tint behind hero content |

### Overlaps & Duplications

| Overlap | Details |
|---------|---------|
| **CinematicHero vs Spotlight** | Both render a full-bleed backdrop + gradient + content cluster. Spotlight adds a badge and CTA; CinematicHero adds a floating poster and trailer. They share ~60% of markup. Could share a `HeroShell` base. |
| **CollectionHero vs UniverseHero** | Both render a banner image + gradient + stats. Very similar structure. CollectionHero may already handle both; verify. |
| **ProgressBar vs ProgressPremium** | Two CSS classes for linear progress. ProgressPremium appears to be an updated version of ProgressBar. Should be one class with a `premium` variant. |
| **PosterLoading not using Skeleton** | `PosterLoading` is a CSS-only shimmer that duplicates what `<Skeleton variant="poster">` could provide. |
| **SafeImage vs inline image patterns** | MovieCard, Spotlight, and others handle image error/fallback inline instead of using SafeImage. |

### Canonical Member

**`HeroShell`** (new) — a base hero component that handles full-bleed backdrop + gradient + content positioning. CinematicHero, Spotlight, and CollectionHero become specialized content inside HeroShell.

### Consolidation Plan

| Action | Component | Details |
|--------|-----------|---------|
| **Create** | `HeroShell` | New base component for all hero sections |
| **Refactor** | `CinematicHero` | Use HeroShell as wrapper |
| **Refactor** | `Spotlight` | Use HeroShell as wrapper |
| **Refactor** | `CollectionHero` | Use HeroShell as wrapper |
| **Merge** | `UniverseHero` → `CollectionHero variant="universe"` | Or confirm they're already the same |
| **Keep** | `ProfileBanner` | Unique edit capability; keep separate but could use HeroShell internally |
| **Merge** | `PosterLoading` → `Skeleton variant="poster"` | Replace CSS-only shimmer with Skeleton primitive |
| **Merge** | `ProgressBar` + `ProgressPremium` → `ProgressBar` | One component with `variant: "default" | "premium"` |
| **Keep** | `ProgressRing` | SVG circle is unique; keep separate |
| **Adopt** | `SafeImage` | Use in MovieCard and all image contexts instead of inline fallbacks |

### Unified API

```ts
// HeroShell — new
interface HeroShellProps {
  backdropUrl: string;
  aspectRatio?: "16:9" | "21:9" | "auto";       // controls height
  gradient?: "cinematic" | "subtle" | "none";     // preset gradient overlays
  children: JSX.Element;                           // content cluster
  class?: string;
  style?: JSX.CSSProperties;
}

// ProgressBar — consolidated
interface ProgressBarProps {
  value: number;                                   // 0-100
  variant?: "default" | "premium";                 // premium = accent glow
  size?: "sm" | "md" | "lg";                       // height
  label?: string;                                  // aria-label
  showValue?: boolean;                             // display percentage
}

// SafeImage — extended
interface SafeImageProps {
  src: string;
  alt?: string;
  fallback?: "icon" | "initials" | "none";         // NEW
  aspectRatio?: "2:3" | "16:9" | "16:5" | "auto"; // NEW
  loading?: "lazy" | "eager";
}
```

---

## Family 9: Surfaces

### Purpose

All background/container components that define the visual layering of the UI. Surfaces implement the elevation system (`--tier-0` through `--tier-4`) and the glass system (default/strong blur). Every visible element sits on a surface.

### Member Inventory

| # | Component | Location | Tag | Role |
|---|-----------|----------|-----|------|
| 1 | `GlassCard` | `src/shared/ui/primitives/GlassCard.tsx` | primitive | Frosted glass container, default/strong |
| 2 | `.glass-surface` | CSS class | css-only | Generic glass surface (no component) |
| 3 | `.surface-base` / `.surface-raised` | `_phase21.css` | css-only | Phase 2.1 solid surfaces |
| 4 | `.surface-glass` / `.surface-glass-strong` | `_phase21.css` | css-only | Phase 2.1 glass surfaces (used by GlassCard) |
| 5 | `.v2-card` / `.v2-card-featured` | `_phase22_sprint1.css` | css-only | Phase 2.2 card surfaces |
| 6 | `.card-premium` | `_phase21.css` | css-only | Phase 2.1 card surface |
| 7 | `.stat-card` | `cards.css` | css-only | Stat card surface |
| 8 | `.modal-surface` | `dialogs.css` | css-only | Modal background surface |
| 9 | `.sheet-handle` | `dialogs.css` | css-only | Drag handle for bottom sheets |

### Shared Patterns

| Pattern | Details |
|---------|---------|
| Elevation tiers | `--tier-0` (#000) → `--tier-1` (#0a0b0e) → `--tier-2` (#111317) → `--tier-3` (#181b21) → `--tier-4` (#20242c) |
| Glass system | Default: 72% opacity + 20px blur; Strong: 88% opacity + 28px blur |
| Border | `1px solid var(--hairline)` for most surfaces |
| Border radius | `--radius-lg` (20px) for cards, `--radius-xl` (24px) for featured, `--radius-modal` (32px) for modals |
| Shadow | `--shadow-card` at rest, `--shadow-raised` on hover, `--shadow-float` for floating elements |

### Overlaps & Duplications

| Overlap | Details |
|---------|---------|
| **`.surface-glass` vs `.glass-surface`** | Two CSS classes that do the same thing. GlassCard uses `.surface-glass`; some inline styles use `.glass-surface`. Pick one. |
| **`.v2-card` vs `.card-premium` vs `.stat-card`** | Three CSS classes for "card background surface" that do slightly different things. `.v2-card` is the latest; `.card-premium` and `.stat-card` are earlier versions. |
| **`.surface-base` vs no component** | `.surface-base` exists as a CSS class but has no component wrapper. GlassCard only handles glass variants, not solid surfaces. |
| **Phase proliferation** | Each phase (V1, 2.1, 2.2) introduced new surface classes without removing old ones. The result is 8+ surface classes where 3-4 would suffice. |

### Canonical Member

**`Surface`** (new) — a single surface primitive that handles all elevation and glass variants, replacing GlassCard and all CSS-only surface classes.

### Consolidation Plan

| Action | Component | Details |
|--------|-----------|---------|
| **Create** | `Surface` | New primitive in `src/shared/ui/primitives/Surface.tsx` |
| **Deprecate** | `GlassCard` | Replace with `Surface variant="glass"` |
| **Deprecate** | `.glass-surface` | Replace with `.surface-glass` (or vice versa — pick one) |
| **Deprecate** | `.card-premium` | Replace with `Surface elevation="raised"` |
| **Deprecate** | `.stat-card` | Replace with `Surface elevation="raised"` |
| **Deprecate** | `.v2-card` | Replace with `Surface elevation="raised"` |
| **Deprecate** | `.v2-card-featured` | Replace with `Surface elevation="raised" featured` |
| **Keep** | `.surface-glass` / `.surface-glass-strong` | Used by GlassCard/Surface internally |
| **Keep** | `.surface-base` / `.surface-raised` | Used by Surface internally |
| **Keep** | `.modal-surface` | Modal-specific styling; keep separate |
| **Keep** | `.sheet-handle` | Sheet-specific; keep separate |

### Unified API

```ts
// Surface — new, replaces GlassCard + all card surface CSS classes
interface SurfaceProps extends JSX.HTMLAttributes<HTMLDivElement> {
  elevation?: "base" | "raised" | "elevated";     // solid surfaces
  variant?: "solid" | "glass" | "glass-strong";   // surface type
  featured?: boolean;                              // accent border + glow
  padding?: string;
  radius?: string;
  border?: boolean;                                // show hairline border (default: true)
}
```

---

## Family 10: Lists & Rails

### Purpose

All horizontal and vertical scrolling content containers. Rails are the primary browsing mechanism in CineLog — every section of content is presented as a scrollable row or grid.

### Member Inventory

| # | Component | Location | Tag | Role |
|---|-----------|----------|-----|------|
| 1 | `DiscoverRail` | `src/features/discover/components/DiscoverRail.tsx` | feature | Horizontal scroll-snap carousel |
| 2 | `VaultShelfRail` | `src/features/watchlist/components/VaultShelf.tsx` (inline) | feature | Status-grouped horizontal rail |
| 3 | `SearchRail` | `src/features/search/SearchPage.tsx` (inline) | feature | Trending/genre poster rail |
| 4 | `CastRail` | `src/features/details/DetailsModal/DetailsCast.tsx` (inline) | feature | Horizontal cast member list |
| 5 | `OTTRail` | `src/features/discover/components/OttSection.tsx` (inline) | feature | Streaming provider rail |
| 6 | `SimilarRail` | `src/features/details/DetailsModal/DetailsRecommendations.tsx` (inline) | feature | Recommendation rail |
| 7 | `UniverseSuggestionsRail` | `src/features/collections/components/UniverseSuggestions.tsx` | feature | Suggested universes rail |
| 8 | `CollectionMembersGrid` | collection modal (inline) | feature | Grid of collection members |

### Shared Patterns

| Pattern | Details |
|---------|---------|
| Scroll behavior | `overflow-x: auto`, `scroll-snap-type: x mandatory`, `scroll-padding` |
| Snap alignment | `scroll-snap-align: start` on items |
| Gap | 12px (mobile) / 16px (desktop) between items |
| Item width | 130-140px (compact), 150-200px (default), ~200px (continue/wide) |
| Rail padding | Matches page padding (20px mobile, 32px desktop) |
| Masking | Optional fade-out gradient on right edge to indicate more content |
| Section integration | Most rails live inside `<Section>` components for title + eyebrow + action |

### Overlaps & Duplications

| Overlap | Details |
|---------|---------|
| **7 rails, no shared component** | Every rail is built inline with the same scroll-snap CSS pattern. None use a shared `Rail` component. This is the most significant structural duplication in the codebase. |
| **VaultShelfRail = DiscoverRail** | VaultShelf's rail section is structurally identical to DiscoverRail — same scroll-snap, same gap, same item sizing. |
| **SearchRail = DiscoverRail variant="compact"** | Search trending rail uses compact cards, identical to DiscoverRail's compact mode. |

### Canonical Member

**`Rail`** (new) — a single rail component that handles horizontal scroll-snap, gap, masking, and responsive item sizing.

### Consolidation Plan

| Action | Component | Details |
|--------|-----------|---------|
| **Create** | `Rail` | New shared component in `src/shared/ui/Rail.tsx` |
| **Refactor** | `DiscoverRail` | Use `<Rail>` internally |
| **Refactor** | `VaultShelfRail` | Use `<Rail>` internally |
| **Refactor** | `SearchRail` | Use `<Rail>` internally |
| **Refactor** | `CastRail` | Use `<Rail>` internally |
| **Refactor** | `OTTRail` | Use `<Rail>` internally |
| **Refactor** | `SimilarRail` | Use `<Rail>` internally |
| **Refactor** | `UniverseSuggestionsRail` | Use `<Rail>` internally |
| **Keep** | `CollectionMembersGrid` | Grid, not rail; keep separate |

### Unified API

```ts
// Rail — new
interface RailProps {
  gap?: string;                                    // default: "12px" / "16px" @640px
  itemWidth?: string;                              // explicit item width, or auto
  snap?: boolean;                                  // scroll-snap (default: true)
  mask?: boolean;                                  // fade-out on right edge (default: false)
  padding?: string;                                // horizontal padding (default: matches page)
  class?: string;
  style?: JSX.CSSProperties;
  children: JSX.Element;
}
```

---

## Family 11: Data Display

### Purpose

All components that display discrete data values — badges, pills, tags, ratings, and metadata. These are the "chrome" elements that provide context without dominating the visual hierarchy (per CDL P1: Content First, Chrome Never).

### Member Inventory

| # | Component | Location | Tag | Role |
|---|-----------|----------|-----|------|
| 1 | `Badge` | `src/shared/ui/primitives/Badge.tsx` | primitive | Accent/glow badge pill |
| 2 | `.tag-chip` | CSS class | css-only | Overlay tag on cards |
| 3 | `RatingPill` | inline in MovieCardRatings | feature | Compact rating display |
| 4 | `RatingCluster` | `src/features/details/components/RatingCluster.tsx` | feature | Integrated multi-source rating display |
| 5 | `RelationshipPill` | `src/features/discover/components/RelationshipPill.tsx` | feature | Vault-awareness indicator (in vault / planned) |
| 6 | `.v2-pill` / `.v2-pill-accent` / `.v2-pill-success` / `.v2-pill-info` | `_phase22_sprint1.css` | css-only | Phase 2.2 pill variants |
| 7 | `StatusBadge` | `.status-badge-watching/completed/planned` CSS | css-only | Vault status badge |
| 8 | `QuickFilterTab` | QuickFilterTabs (inline) | feature | Filter pill with count |
| 9 | `SectionHeader` | `src/shared/ui/primitives/SectionHeader.tsx` | primitive | Section label + accent bar + action |
| 10 | `V2SectionHeader` | `_phase22_sprint1.css` CSS | css-only | Phase 2.2 section header |
| 11 | `InfoGroup` / `MetaRow` | details metadata (inline) | feature | Metadata display patterns |
| 12 | `StorageStatsTile` | sync components (inline) | feature | Stat tile |
| 13 | `StatsHeroStat` | stats page (inline) | feature | Hero stat display |

### Shared Patterns

| Pattern | Details |
|---------|---------|
| Pill shape | `border-radius: var(--radius-pill)` (999px) |
| Pill sizing | Height: 20-24px, padding: 2-4px horizontal, font: 7-9px Azeret Mono |
| Color coding | Success = `#4ade80`, Error/Danger = `#f87171`, Info = `#60a5fa`, Accent = `var(--p)` |
| Badge variants | Accent (glass, neutral), Glow (accent-tinted with glow shadow) |
| Rating sources | IMDb (#f5c518 gold), RT (#ff7878 red), User (accent color) |
| Status colors | Watching = green, Completed = blue, Planned = neutral/amber |

### Overlaps & Duplications

| Overlap | Details |
|---------|---------|
| **Badge vs V2Pill variants** | Badge has `accent`/`glow`. V2 has `.v2-pill`, `.v2-pill-accent`, `.v2-pill-success`, `.v2-pill-info`. These overlap significantly — `v2-pill-accent` ≈ Badge `glow`, `v2-pill-success` has no Badge equivalent. Should be unified. |
| **`.tag-chip` vs Badge** | Tag chips on MovieCard serve a similar role to Badge (small overlay indicators). Tag chips are CSS-only; Badge is a component. Should use Badge. |
| **StatusBadge vs Badge** | Status badges (watching/completed/planned) are specialized badges with semantic colors. Could be `Badge variant="success" | "info" | "neutral"`. |
| **RelationshipPill vs Badge** | RelationshipPill shows vault status (in vault, planned). Overlaps with StatusBadge and Badge. |
| **SectionHeader vs V2SectionHeader** | Two CSS classes for the same thing. SectionHeader is a component; V2SectionHeader is CSS-only. Unify to the component. |
| **SectionHeader duplicated in Section** | Section.tsx renders its own header block that duplicates SectionHeader.tsx markup (documented in ComponentInventory). |

### Canonical Member

**`Badge`** — extend with semantic variants to absorb all pill/tag/badge patterns.

**`SectionHeader`** — absorb V2SectionHeader; then refactor Section.tsx to use SectionHeader internally.

### Consolidation Plan

| Action | Component | Details |
|--------|-----------|---------|
| **Extend** | `Badge` | Add variants: `"accent" | "glow" | "success" | "error" | "info" | "neutral"` |
| **Merge** | `.tag-chip` → `Badge` | Replace CSS-only tag chips with Badge component |
| **Merge** | `StatusBadge` → `Badge variant="success/info/neutral"` | Status colors map to semantic variants |
| **Merge** | `RelationshipPill` → `Badge` with custom content | RelationshipPill becomes a Badge with vault-status icon |
| **Merge** | `.v2-pill-*` → `Badge` | All V2 pill variants become Badge variants |
| **Merge** | `V2SectionHeader` → `SectionHeader` | Unify to component |
| **Refactor** | `Section.tsx` | Use `SectionHeader` internally instead of duplicating markup |
| **Keep** | `RatingCluster` | Complex multi-source display; keep separate |
| **Keep** | `RatingPill` | Single-source rating chip; keep separate (used by RatingCluster) |
| **Keep** | `InfoGroup` / `MetaRow` | Metadata layout patterns; keep separate |
| **Keep** | `StorageStatsTile` / `StatsHeroStat` | Specialized stat display; keep separate |

### Unified API

```ts
// Badge — extended
interface BadgeProps {
  variant?: "accent" | "glow" | "success" | "error" | "info" | "neutral";
  size?: "sm" | "md" | "lg";                        // NEW
  icon?: string;
  iconFill?: boolean;
  children: JSX.Element;
  class?: string;
  style?: JSX.CSSProperties;
  "aria-label"?: string;
}

// SectionHeader — unified (absorbs V2SectionHeader)
interface SectionHeaderProps {
  title: string;
  eyebrow?: string;                                  // NEW: from Section.tsx
  icon?: string;
  actionLabel?: string;
  onAction?: () => void;
  variant?: "default" | "v2";                        // V2 has accent bar
  class?: string;
  style?: JSX.CSSProperties;
}
```

---

## Family 12: Sections

### Purpose

All container/wrapper components that define page-level rhythm and content grouping. Sections ensure consistent spacing between content blocks and provide the "visual melody" mandated by CDL P6.

### Member Inventory

| # | Component | Location | Tag | Role |
|---|-----------|----------|-----|------|
| 1 | `Section` | `src/shared/ui/primitives/Section.tsx` | primitive | Title + eyebrow + action + content + spacing |
| 2 | `DetailSection` | `src/features/details/components/DetailSection.tsx` | feature | Details page section wrapper |
| 3 | `DiscoverSection` / `DiscoverFold` | DiscoverPage (inline) | feature | Discover page section |
| 4 | `CollectionsFold` | CollectionsPage (inline) | feature | Collections section |
| 5 | `SecSection` | settings/secondary pages (CSS) | css-only | Settings/secondary section |
| 6 | `PageContainer` | `src/shared/ui/PageContainer.tsx` | shared | Page-level rhythm wrapper |
| 7 | `.page-rhythm` / `.page-rhythm-tight` / `.page-rhythm-loose` | `_phase22_sprint1.css` | css-only | Phase 2.2 page rhythm classes |

### Shared Patterns

| Pattern | Details |
|---------|---------|
| Bottom margin | tight: 24px (`mb-4`), default: 32px (`mb-6`), loose: 48px (`mb-8`) |
| Header layout | Eyebrow → Title → Action button, flex row with justify-between |
| Section element | Semantic `<section>` element |
| Page container | `<main>` wrapper with consistent padding, max-width, centering |

### Overlaps & Duplications

| Overlap | Details |
|---------|---------|
| **Section vs DetailSection** | DetailSection is a simplified Section without the eyebrow/spacing options. Could be `Section spacing="tight"` or `Section variant="detail"`. |
| **Section vs DiscoverSection** | DiscoverSection adds LazyMount behavior. Could be `Section lazy={true}`. |
| **Section vs SecSection** | SecSection (CSS-only) is Section with settings-specific styling. Could be `Section class="sec-section"`. |
| **Section vs DiscoverFold** | DiscoverFold is a named pattern for discover sections. Same as Section. |
| **PageContainer vs .page-rhythm** | PageContainer handles horizontal rhythm; `.page-rhythm` handles vertical. They complement each other but are not unified. |
| **5 section wrappers for the same concept** | Every page has its own section wrapper because Section doesn't support all needed variants. |

### Canonical Member

**`Section`** — extend with lazy loading, detail variant, and page rhythm integration to absorb all section wrappers.

### Consolidation Plan

| Action | Component | Details |
|--------|-----------|---------|
| **Extend** | `Section` | Add `lazy?: boolean`, `variant?: "default" | "detail"`, `fold?: boolean` |
| **Merge** | `DetailSection` → `Section variant="detail"` | Detail page sections become a Section variant |
| **Merge** | `DiscoverSection` / `DiscoverFold` → `Section lazy={true}` | Lazy-mount becomes a Section prop |
| **Merge** | `CollectionsFold` → `Section` | Same as above |
| **Merge** | `SecSection` → `Section class="sec-section"` | Settings sections use Section with CSS class |
| **Keep** | `PageContainer` | Page-level wrapper is a different concern; keep separate |
| **Merge** | `.page-rhythm-*` → `PageContainer spacing` prop | Page rhythm becomes a PageContainer prop |

### Unified API

```ts
// Section — extended
interface SectionProps {
  title?: string;
  eyebrow?: string;
  icon?: string;
  actionLabel?: string;
  onAction?: () => void;
  spacing?: "tight" | "default" | "loose";
  variant?: "default" | "detail";          // detail = tighter, no eyebrow
  lazy?: boolean;                           // NEW: wraps content in LazyMount
  fold?: boolean;                           // NEW: discover fold naming
  class?: string;
  style?: JSX.CSSProperties;
}

// PageContainer — extended
interface PageContainerProps {
  width?: "narrow" | "wide";
  spacing?: "default" | "tight" | "loose";  // NEW: replaces .page-rhythm-* classes
  paddingTop?: string;
  paddingBottom?: string;
  class?: string;
  style?: JSX.CSSProperties;
}
```

---

## Family 13: Content Blocks

### Purpose

Self-contained content blocks that combine data display with narrative or functional purpose. Unlike Cards (which display a single entity), Content Blocks combine multiple data points into a story or functional unit.

### Member Inventory

| # | Component | Location | Tag | Role |
|---|-----------|----------|-----|------|
| 1 | `WatchlistSummary` | `src/features/profile/components/WatchlistSummary.tsx` | feature | Story-driven sentence about watching habits |
| 2 | `CloudStatusCard` | `src/features/sync/components/CloudStatusCard.tsx` | feature | Sync status with last sync time + manual sync button |
| 3 | `PrivacyCard` | `src/features/sync/components/PrivacyCard.tsx` | feature | Data privacy reassurance |
| 4 | `DevicesCard` | `src/features/sync/components/DevicesCard.tsx` | feature | Connected devices info |
| 5 | `DangerZoneCard` | `src/features/sync/components/DangerZoneCard.tsx` | feature | Destructive action card (reset + delete) |
| 6 | `SyncHistoryTimeline` | `src/features/sync/components/SyncHistoryTimeline.tsx` | feature | Activity timeline |
| 7 | `GuestBanner` / `GuestNudge` | discover + sync pages (inline CSS) | css-only | Signed-out prompt for guest users |

### Shared Patterns

| Pattern | Details |
|---------|---------|
| Surface | `--tier-2` background, `--radius-lg` (20px), `--hairline` border |
| Icon + title + body | Most content blocks follow this layout |
| Action | Optional CTA button or destructive action |
| Sync cards | All sync content cards share consistent padding and spacing |

### Overlaps & Duplications

| Overlap | Details |
|---------|---------|
| **GuestBanner vs GuestNudge vs EmptyState variant="guest"** | Three implementations of the same concept: show a sign-in prompt to unauthenticated users. GuestBanner is CSS in secondary.css; GuestNudge is CSS in discover.css; EmptyState with guest variant is in the watchlist. All should be one thing. |
| **CloudStatusCard + DevicesCard + PrivacyCard** | All are "info cards" in the sync section with the same surface + icon + title + description pattern. Could share a base `InfoCard` component. |
| **DangerZoneCard** | Unique because of red/danger styling. Keep separate but could use a shared `InfoCard` base with `variant="danger"`. |

### Canonical Member

**`InfoCard`** (new) — a generic content block with icon + title + description + optional action, with surface and variant support.

### Consolidation Plan

| Action | Component | Details |
|--------|-----------|---------|
| **Create** | `InfoCard` | New shared component for icon + title + body + action blocks |
| **Refactor** | `CloudStatusCard` | Use `InfoCard variant="sync"` internally |
| **Refactor** | `PrivacyCard` | Use `InfoCard variant="privacy"` internally |
| **Refactor** | `DevicesCard` | Use `InfoCard variant="devices"` internally |
| **Refactor** | `DangerZoneCard` | Use `InfoCard variant="danger"` internally |
| **Keep** | `WatchlistSummary` | Unique narrative component; keep separate |
| **Keep** | `SyncHistoryTimeline` | Timeline pattern; keep separate |
| **Merge** | `GuestBanner` + `GuestNudge` → `EmptyState variant="guest"` | Already covered in Feedback family consolidation |

### Unified API

```ts
// InfoCard — new
interface InfoCardProps {
  icon: string;
  iconFill?: boolean;
  title: string;
  description?: string;
  variant?: "default" | "sync" | "privacy" | "devices" | "danger";
  actionLabel?: string;
  onAction?: () => void;
  surface?: "solid" | "glass";                      // background treatment
  class?: string;
  style?: JSX.CSSProperties;
}
```

---

## Consolidation Summary

### Family Size Before vs After

| Family | Members Before | Members After | Reduction |
|--------|---------------|---------------|-----------|
| Navigation | 8 | 6 | 25% |
| Cards | 27 | 16 | 41% |
| Inputs | 9 | 3 | 67% |
| Buttons | 9 | 6 | 33% |
| Sheets & Modals | 14 | 12 | 14% |
| Feedback | 9 | 6 | 33% |
| Typography | 24 classes | 14 classes | 42% |
| Media | 10 | 8 | 20% |
| Surfaces | 9 | 3 | 67% |
| Lists & Rails | 8 | 2 | 75% |
| Data Display | 13 | 8 | 38% |
| Sections | 7 | 3 | 57% |
| Content Blocks | 7 | 5 | 29% |
| **Total** | **154** | **92** | **40%** |

### New Components to Create

| Component | Family | Priority | Rationale |
|-----------|--------|----------|-----------|
| `BackButton` | Navigation | High | Eliminates 2 CSS-only back button patterns |
| `TextInput` | Inputs | High | Replaces 7 inline/CSS-only input patterns |
| `SelectInput` | Inputs | Medium | Replaces CSS-only filter select |
| `FilterChip` | Buttons | High | Replaces 3 overlapping chip components |
| `SheetShell` | Sheets & Modals | High | Provides shared modal/sheet infrastructure |
| `ConfirmSheet` | Sheets & Modals | High | Replaces 2 destructive confirmation sheets |
| `Surface` | Surfaces | High | Replaces 5+ CSS-only surface classes + GlassCard |
| `Rail` | Lists & Rails | High | Replaces 7 inline rail implementations |
| `InfoCard` | Content Blocks | Medium | Replaces 4 sync content cards |
| `HeroShell` | Media | Medium | Reduces duplication across 4 hero components |
| `ListRow` | Cards | Medium | Replaces 3 overlapping horizontal row patterns |
| `SurfaceCard` | Cards | Medium | Replaces 4 card surface CSS classes |

### Components to Deprecate/Remove

| Component | Family | Replacement |
|-----------|--------|-------------|
| `SectionHeader` (standalone) | Data Display / Sections | Section renders SectionHeader internally |
| `GlassCard` | Surfaces | `Surface variant="glass"` |
| `.type-page-title` | Typography | `.type-display-sm` |
| `.type-section-title` | Typography | `.type-eyebrow` |
| `.type-subtitle` | Typography | `.type-micro` |
| `.type-label` | Typography | `.type-micro` |
| `.type-metadata` | Typography | `.type-body` or `.type-meta` |
| `.type-display-lg` | Typography | `.type-display` (identical after V2 override) |
| `.card-premium` | Surfaces | `Surface elevation="raised"` |
| `.stat-card` | Surfaces | `Surface elevation="raised"` |
| `.v2-card` / `.v2-card-featured` | Surfaces | `Surface elevation="raised" featured` |
| `.glass-surface` | Surfaces | `.surface-glass` (unify naming) |
| `.v2-pill-*` | Data Display | `Badge` component with semantic variants |
| `.tag-chip` | Data Display | `Badge` component |
| `.page-rhythm-*` | Sections | `PageContainer spacing` prop |

### Priority Order for Consolidation

| Phase | Family | Key Actions | Impact |
|-------|--------|-------------|--------|
| **1** | Typography | Deprecate 10 V1 classes, adopt V2 ramp | Foundation — affects everything |
| **2** | Surfaces | Create `Surface`, deprecate 5+ CSS classes | Every card/modal uses surfaces |
| **3** | Sheets & Modals | Create `SheetShell` + `ConfirmSheet` | 14 components affected |
| **4** | Lists & Rails | Create `Rail` | 7 inline rails eliminated |
| **5** | Feedback | Extend `EmptyState` with variants | 4 specialized empty states unified |
| **6** | Inputs | Create `TextInput` + `SelectInput` | 7 input patterns unified |
| **7** | Cards | Extend `MovieCard` layout, create `SurfaceCard` + `ListRow` | Largest family, highest payoff |
| **8** | Buttons | Extend `Button` variants, create `FilterChip` | 3 chip patterns unified |
| **9** | Navigation | Create `BackButton` | 2 CSS-only patterns eliminated |
| **10** | Data Display | Extend `Badge`, unify `SectionHeader` | 5+ badge/pill patterns unified |
| **11** | Media | Create `HeroShell`, merge progress bars | 4 hero components unified |
| **12** | Sections | Extend `Section` with lazy/variant | 5 section wrappers unified |
| **13** | Content Blocks | Create `InfoCard` | 4 sync cards unified |

---

## Appendix A: Component-to-Family Cross Reference

| Component | Family | Status After Consolidation |
|-----------|--------|---------------------------|
| `ActionDock` | Buttons | Keep |
| `AddToFolderSheet` | Sheets & Modals | Refactor (use SheetShell) |
| `AddUniverseModal` | Sheets & Modals | Refactor (use SheetShell) |
| `AppHeader` | Navigation | Keep |
| `AuthModal` | Sheets & Modals | Refactor (use SheetShell) |
| `AchievementCard` | Cards | Keep |
| `BackButton` (new) | Navigation | Create |
| `Badge` | Data Display | Extend (6 variants) |
| `BannerEditor` | Sheets & Modals | Refactor (use SheetShell) |
| `BottomNavigation` | Navigation | Keep |
| `Button` | Buttons | Extend (5 variants + shape) |
| `CinematicHero` | Media | Refactor (use HeroShell) |
| `CloudStatusCard` | Content Blocks | Refactor (use InfoCard) |
| `CollectionCard` | Cards | Keep (verify vs FolderCard) |
| `CollectionHero` | Media | Refactor (use HeroShell) |
| `CollectionModal` | Sheets & Modals | Refactor (use SheetShell) |
| `ConfirmSheet` (new) | Sheets & Modals | Create |
| `ConfirmRemoveSheet` | Sheets & Modals | Merge → ConfirmSheet |
| `ContinueCard` | Cards | Evaluate → MovieCard layout="wide" |
| `CosmosCard` | Cards | Keep |
| `DangerZoneCard` | Content Blocks | Refactor (use InfoCard) |
| `DetailsError` | Feedback | Merge → EmptyState variant="error" |
| `DetailsModal` | Sheets & Modals | Refactor (use SheetShell) |
| `DevicesCard` | Content Blocks | Refactor (use InfoCard) |
| `EditorialCard` | Cards | Keep |
| `EmptyState` | Feedback | Extend (4 variants) |
| `EpisodeCard` | Cards | Keep |
| `FavoritesPicker` | Sheets & Modals | Refactor (use SheetShell) |
| `FilterButton` | Buttons | Keep |
| `FilterChip` (new) | Buttons | Create |
| `FolderEditor` | Sheets & Modals | Keep (inline form) |
| `GenreDetailFilmRow` | Cards | Evaluate → MovieCard layout="horizontal" |
| `GlobalErrorBoundary` | Feedback | Keep |
| `HeroShell` (new) | Media | Create |
| `HistoryCard` | Cards | Merge → ListRow |
| `ImportWizard` | Sheets & Modals | Keep (wrap in SheetShell) |
| `InfoCard` (new) | Content Blocks | Create |
| `ListRow` (new) | Cards | Create |
| `LoadingScreen` | Feedback | Keep |
| `MovieCard` | Cards | Extend (layout prop) |
| `NavButton` | Navigation | Keep |
| `NoteTextarea` | Inputs | Merge → TextInput multiline |
| `PageContainer` | Sections | Extend (spacing prop) |
| `PosterLoading` | Media | Merge → Skeleton variant="poster" |
| `PremiumEmptyState` | Feedback | Merge → EmptyState variant="premium" |
| `PrivacyCard` | Content Blocks | Refactor (use InfoCard) |
| `ProfileBanner` | Media | Keep (use HeroShell internally) |
| `ProfileCompletion` | Cards | Keep |
| `ProgressRing` | Media | Keep |
| `QuickFilterTabs` | Buttons | Merge → FilterChip |
| `QuickLinks` | Navigation | Keep |
| `Rail` (new) | Lists & Rails | Create |
| `RatingCluster` | Data Display | Keep |
| `RelationshipPill` | Data Display | Merge → Badge |
| `ResetConfirmSheet` | Sheets & Modals | Merge → ConfirmSheet |
| `SafeImage` | Media | Adopt (use everywhere) |
| `ScrollToTop` | Navigation | Keep |
| `SearchEmptyState` | Feedback | Merge → EmptyState + query prop |
| `SearchResultRow` | Cards | Merge → MovieCard layout="horizontal" |
| `Section` | Sections | Extend (lazy, variant, fold) |
| `SectionHeader` | Data Display | Merge into Section (internal) |
| `SelectInput` (new) | Inputs | Create |
| `SheetShell` (new) | Sheets & Modals | Create |
| `SimilarTitleCard` | Cards | Merge → MovieCard variant="compact" |
| `Skeleton` | Feedback | Extend (circle, poster, count) |
| `SmartCollectionBuilder` | Sheets & Modals | Refactor (use SheetShell) |
| `Spotlight` | Media | Refactor (use HeroShell) |
| `Surface` (new) | Surfaces | Create |
| `SurfaceCard` (new) | Cards | Create |
| `SyncHistoryTimeline` | Content Blocks | Keep |
| `TasteCard` | Cards | Keep |
| `TextInput` (new) | Inputs | Create |
| `TimelineEntry` | Cards | Merge → ListRow |
| `ToastContainer` | Feedback | Keep |
| `TrajectoryCard` | Cards | Keep |
| `VaultCard` | Cards | Merge → MovieCard layout="horizontal" |
| `VaultFilters` | Sheets & Modals | Refactor (use SheetShell) |
| `VaultShelf` | Cards | Keep |
| `ViewToggle` | Buttons | Keep |
| `WatchlistSummary` | Content Blocks | Keep |
| `YourActivityCard` | Cards | Keep |

---

## Appendix B: Shared Prop Patterns Across All Families

These props appear in multiple families and should follow consistent conventions:

| Prop | Families | Convention |
|------|----------|------------|
| `variant` | Buttons, Cards, Feedback, Surfaces, Inputs | String union; `"default"` is always first and default |
| `size` | Buttons, Cards, Badges, Inputs | `"sm" \| "md" \| "lg"`; `"md"` is default |
| `class` | All | Always optional; appended to generated class string |
| `style` | All | `JSX.CSSProperties`; object styles only (never string) |
| `icon` | Buttons, Badges, Cards, Navigation, Content Blocks | Material Symbols name string |
| `iconFill` | Buttons, Badges, Cards | `boolean`; controls `FILL` axis of Material Symbols |
| `elevation` | Surfaces, Cards | `"base" \| "raised" \| "elevated"`; maps to tier tokens |
| `spacing` | Sections, PageContainer | `"tight" \| "default" \| "loose"`; maps to spacing scale |
| `loading` | Buttons, Inputs | `boolean`; shows spinner/skeleton and disables interaction |
| `error` | Inputs, Feedback | `string`; error message below input or in error state |
| `onAction` | Sections, Content Blocks, EmptyState | `() => void`; primary action callback |

---

*This document is a permanent reference. Update it when components are consolidated, new families are identified, or shared patterns change.*
