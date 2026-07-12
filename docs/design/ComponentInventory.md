# CineLog Component Inventory

> **Version:** 1.0  
> **Date:** 2026-07-12  
> **Status:** Audit Document — Complete Component Audit  
> **Rule:** Do NOT modify or rebuild any component. This document is an audit only.

---

## Shared UI Primitives (`src/shared/ui/primitives/`)

---

### 1. Button

| Field | Detail |
|-------|--------|
| **Purpose** | Premium button primitive with primary (solid accent + glow) and ghost (translucent + blur) variants in three sizes |
| **Where Used** | ProfilePage, EmptyState primitive, SyncPage, SettingsPage (Sign Out), DiscoverPage (Guest CTA) |
| **Key Props** | `variant: "primary" \| "ghost"`, `size: "sm" \| "md" \| "lg"`, `icon: string`, `iconFill: boolean`, `fullWidth: boolean`, plus all `ButtonHTMLAttributes` |
| **CSS Classes** | `btn-primary`, `btn-ghost`, `focus-ring`, `material-symbols-outlined` |
| **Strengths** | Extends native button attributes; size-aware padding; fullWidth convenience; icon support with size-aware font-size |
| **Weaknesses** | Only 2 variants (missing danger, outline, link); `loading` prop absent (consumers build own spinners); duplicates Icon component logic; string `style` prop silently dropped |
| **Should Rebuild?** | NO |
| **Priority** | High (add `loading` + `danger` variant; use Icon component internally) |

---

### 2. Badge

| Field | Detail |
|-------|--------|
| **Purpose** | Premium badge primitive with accent (glass pill) and glow (accent-tinted with glow) variants |
| **Where Used** | MovieCard (status badges), DiscoverPage (spotlight badge), CollectionsPage (universe badge) |
| **Key Props** | `variant: "accent" \| "glow"`, `icon: string`, `iconFill: boolean`, `class`, `style`, `aria-label` |
| **CSS Classes** | `badge-glow`, `badge-accent`, `material-symbols-outlined` |
| **Strengths** | Clean variant API; optional icon with fill control; pass-through props |
| **Weaknesses** | Only 2 variants (no success/error/warning semantic variants); no `size` prop; duplicates Icon component logic instead of using it |
| **Should Rebuild?** | NO |
| **Priority** | Low |

---

### 3. EmptyState

| Field | Detail |
|-------|--------|
| **Purpose** | Premium empty state primitive with icon tile, title, optional message, and optional action button |
| **Where Used** | Watchlist (vault empty), Collections (no collections), Search (no results), Discover (guest state) |
| **Key Props** | `icon: string`, `title: string`, `message?: string`, `actionLabel?: string`, `onAction?: () => void`, `iconFill?: boolean`, `class`, `style` |
| **CSS Classes** | `empty-premium`, `empty-premium-icon`, `empty-premium-title`, `empty-premium-body`, `btn-primary`, `focus-ring`, `material-symbols-outlined` |
| **Strengths** | `role="status"` + `aria-live="polite"`; icon is `aria-hidden`; action button has descriptive aria-label; uses design-system CSS classes |
| **Weaknesses** | Doesn't use Icon or Button primitives (duplicates their logic); no illustration/image variant beyond Material Symbols; action always uses `btn-primary` |
| **Should Rebuild?** | NO |
| **Priority** | Medium (use Icon and Button primitives internally) |

---

### 4. GlassCard

| Field | Detail |
|-------|--------|
| **Purpose** | Frosted-glass container with two blur strengths for insight panels, overlays, and floating cards |
| **Where Used** | ActionDock, RatingCluster, MetadataCell, InsightCard, YourActivityCard, SearchHeader, ProfileCompletion |
| **Key Props** | `strength: "default" \| "strong"`, `padding: string`, `radius: string`, plus all `HTMLAttributes<HTMLDivElement>` |
| **CSS Classes** | `surface-glass`, `surface-glass-strong` |
| **Strengths** | Extends native div attributes; configurable padding and radius; two documented strength variants |
| **Weaknesses** | String `style` prop silently dropped (only handles object styles); no `border` prop despite glass surfaces needing visible edges |
| **Should Rebuild?** | NO |
| **Priority** | Low |

---

### 5. Section

| Field | Detail |
|-------|--------|
| **Purpose** | Universal page content block with optional header (eyebrow + title + icon + action) and consistent bottom-margin rhythm |
| **Where Used** | StatsPage, AchievementsPage, HistoryPage, all Settings sub-pages, SyncPage, ProfilePage |
| **Key Props** | `title?: string`, `eyebrow?: string`, `icon?: string`, `actionLabel?: string`, `onAction?: () => void`, `spacing: "default" \| "tight" \| "loose"`, `class`, `style` |
| **CSS Classes** | `mb-4`, `mb-6`, `mb-8`, `section-header`, `type-eyebrow`, `section-header-title`, `section-header-action`, `material-symbols-outlined` |
| **Strengths** | Renders bare `<section>` when no title (flexible); spacing map for rhythm; eyebrow + icon + action in one header |
| **Weaknesses** | Header rendering **duplicates SectionHeader.tsx** — both have identical markup; icon doesn't use Icon component; action arrow icon is hardcoded |
| **Should Rebuild?** | NO |
| **Priority** | Medium (refactor to use SectionHeader internally, eliminating duplication) |

---

### 6. SectionHeader

| Field | Detail |
|-------|--------|
| **Purpose** | Standalone section header with accent bar, title, optional icon, and optional action button |
| **Where Used** | DiscoverPage (some sections), WatchlistPage (shelf titles), DetailsModal (detail sections) |
| **Key Props** | `title: string`, `actionLabel?: string`, `onAction?: () => void`, `icon?: string`, `class`, `style` |
| **CSS Classes** | `section-header`, `section-header-title`, `section-header-action`, `material-symbols-outlined` |
| **Strengths** | Clean, minimal API; consistent CSS classes; action button with contextual aria-label |
| **Weaknesses** | **Near-complete duplicate of Section.tsx's header block** — most significant DRY violation in component library; no `eyebrow` prop (Section has it); icon doesn't use Icon component; required `title` prop |
| **Should Rebuild?** | YES |
| **Priority** | High (merge into Section; Section should render this component internally) |

---

### 7. Skeleton

| Field | Detail |
|-------|--------|
| **Purpose** | Loading skeleton primitive with block and text variants using CSS shimmer animation |
| **Where Used** | DiscoverSkeleton, ProfileSkeleton, CollectionSkeleton, SearchLoading, Watchlist LoadingSkeleton |
| **Key Props** | `width?: string`, `height?: string`, `radius?: string`, `variant: "block" \| "text"`, `class`, `style` |
| **CSS Classes** | `skeleton-base`, `skeleton-text` |
| **Strengths** | SSR-safe (pure CSS); smart default radius per variant; `aria-hidden="true"`; clean prop API |
| **Weaknesses** | No `count` prop for multiple skeleton lines; no `circle` variant for avatars; no animation speed control |
| **Should Rebuild?** | NO |
| **Priority** | Low |

---

## Shared UI Components (`src/shared/ui/`)

---

### 8. AppHeader

| Field | Detail |
|-------|--------|
| **Purpose** | Sticky header bar displaying "CINELOG" wordmark and avatar pill that routes to /profile (signed-in) or opens AuthModal (guest) |
| **Where Used** | AppShell (rendered on every page) |
| **Key Props** | None — consumes useAuth() and useAuthModal() |
| **CSS Classes** | `sticky`, `top-0`, `z-30`, `flex`, `items-center`, `justify-between`, `font-headline`, `focus-ring`, `rounded-full`, `overflow-hidden` |
| **Strengths** | Safe-area-aware (env(safe-area-inset-top)); strong backdrop blur (20px); proper role="banner"; detailed aria-label on avatar |
| **Weaknesses** | Inline onMouseEnter/onMouseLeave mutate style directly (CSP risk); heavy inline styles; no prefers-reduced-motion for hover; image onError uses display:none instead of fallback |
| **Should Rebuild?** | NO |
| **Priority** | Medium (move hover handlers to CSS) |

---

### 9. AuthModal

| Field | Detail |
|-------|--------|
| **Purpose** | Full email/password authentication modal (sign-in + sign-up) with Google OAuth fallback |
| **Where Used** | AppHeader (guest avatar click), various pages (guest state actions) |
| **Key Props** | `show: Accessor<boolean>`, `onClose: () => void` |
| **CSS Classes** | `modal-backdrop`, `modal-sheet-enter`, `modal-surface`, `sheet-handle`, `animate-soft-pulse`, `filter-input-premium`, `focus-ring`, `btn-primary` |
| **Strengths** | Complete focus-trap; Escape key dismissal; auto-focus first input; bottom-sheet mobile / centered desktop; proper ARIA; state resets on close |
| **Weaknesses** | Massive component (470 lines) — should extract sub-components; inline hover handlers; minimal password validation (length ≥ 6 only); no "forgot password"; z-[999999] is extreme; no loading state on Google OAuth |
| **Should Rebuild?** | NO |
| **Priority** | High (refactor into sub-components; add password toggle + forgot-password) |

---

### 10. BottomNavigation

| Field | Detail |
|-------|--------|
| **Purpose** | Fixed bottom navigation bar with 4 tabs (Discover, Search, Watchlist, Collections) |
| **Where Used** | AppShell (rendered on every page) |
| **Key Props** | None — reads useLocation() |
| **CSS Classes** | `fixed`, `bottom-0`, `left-0`, `flex`, `w-full` |
| **Strengths** | Active state from URL pathname; opaque bar for thumb-zone stability; nested route matching for Collections; aria-label="Primary navigation" |
| **Weaknesses** | Hardcoded route paths; no transition animation on tab switch; missing role="tablist"/role="tab" semantics |
| **Should Rebuild?** | NO |
| **Priority** | Low |

---

### 11. MovieCard

| Field | Detail |
|-------|--------|
| **Purpose** | Scalable movie/show card with three variants (compact, default, featured), poster loading, status badges, metadata, and rating chips |
| **Where Used** | WatchlistGrid, VaultGrid, SearchGrid, DiscoverRails, SimilarTitles, CosmosView |
| **Key Props** | `movie: WatchlistItem`, `search?: string`, `onClick: () => void`, `variant: "compact" \| "default" \| "featured"` |
| **CSS Classes** | `vault-card-premium`, `animate-fade-up`, `touch-ripple`, `focus-ring`, `v2-card-featured`, `vault-card-inner`, `poster-loading`, `tag-chip`, `status-badge-*`, `badge-glow`, `type-card-title`, `type-subtitle` |
| **Strengths** | Variant-aware rendering; keyboard activation (Enter/Space); image loading skeleton + error fallback; status-aware badge colors; HighlightText integration; aria-label with title + year + status |
| **Weaknesses** | Nearly 300 lines — largest component; CardPoster/CardBadges sub-components planned but not extracted; poster-loading skeleton uses fragile absolute positioning; featured variant only adds CSS class — no structural difference |
| **Should Rebuild?** | NO |
| **Priority** | High (extract CardPoster, CardBadges sub-components; add featured structural differences) |

---

### 12. MovieCardRatings

| Field | Detail |
|-------|--------|
| **Purpose** | 3-source rating chip cluster (IMDb, Rotten Tomatoes, User) displayed inside MovieCard for default/featured variants |
| **Where Used** | MovieCard (inline) |
| **Key Props** | `movie: WatchlistItem` |
| **CSS Classes** | `grid`, `w-full`, `rating-chip`, `rating-chip-imdb`, `rating-chip-rt`, `rating-chip-user`, `justify-center` |
| **Strengths** | Clean extraction from MovieCard; each chip has role="img" with descriptive aria-label; grid layout for equal widths |
| **Weaknesses** | Hardcoded emoji 🍅 for Rotten Tomatoes; inline styles for color values (#f5c518, #ff7878) are magic strings; no "certified fresh" vs "rotten" distinction; em dash fallback is visually heavy |
| **Should Rebuild?** | NO |
| **Priority** | Medium (replace emoji with icon; extract color constants) |

---

### 13. NavButton

| Field | Detail |
|-------|--------|
| **Purpose** | Single tab button for bottom navigation with animated active indicator and icon scaling |
| **Where Used** | BottomNavigation (4 instances) |
| **Key Props** | `icon: string`, `label: string`, `active?: boolean`, `disabled?: boolean`, `onClick?: EventHandler` |
| **CSS Classes** | `flex`, `flex-1`, `flex-col`, `items-center`, `justify-center`, `gap-1`, `relative`, `focus-ring`, `material-symbols-outlined` |
| **Strengths** | Active indicator animates width (no mount/unmount flash); icon scales 1.08 when active; aria-current="page" on active; 64px touch target; smooth color transition |
| **Weaknesses** | Active indicator position coupled to BottomNavigation layout; no role="tab" semantics; label font at 9px may fail WCAG minimum |
| **Should Rebuild?** | NO |
| **Priority** | Medium (add tab ARIA semantics; consider minimum font size) |

---

### 14. PageContainer

| Field | Detail |
|-------|--------|
| **Purpose** | Single source of truth for page-level rhythm — consistent padding, max-width, top/bottom spacing, and centering |
| **Where Used** | Every page route |
| **Key Props** | `width: "narrow" \| "wide"`, `paddingTop?: string`, `paddingBottom?: string`, `class`, `style` |
| **CSS Classes** | `px-5`, `max-w-2xl`, `lg:max-w-4xl`, `lg:max-w-none`, `mx-auto`, `relative`, `z-10`, `animate-fade-in` |
| **Strengths** | Guarantees consistent page rhythm; configurable width + padding overrides; renders as `<main>` (semantic); animate-fade-in transition |
| **Weaknesses** | "wide" mode removes max-width entirely (too wide on ultrawide); no safe-area bottom padding; no prefers-reduced-motion guard on animation |
| **Should Rebuild?** | NO |
| **Priority** | Medium (add safe-area bottom padding; cap wide max-width; add reduced-motion guard) |

---

### 15. SafeImage

| Field | Detail |
|-------|--------|
| **Purpose** | Defensive `<img>` wrapper with error fallback, centralising signal-based pattern for CDN failures |
| **Where Used** | MovieCard, VaultCard, SearchResultRow, ProfileBanner, EpisodeCard, UniverseDashboard |
| **Key Props** | `src: string`, `alt?: string`, `class`, `style`, `fallback?: JSX.Element`, `onError?: () => void`, `loading: "lazy" \| "eager"`, `decoding: "async" \| "sync" \| "auto"` |
| **CSS Classes** | Pass-through via `class` prop |
| **Strengths** | Clean API with sensible defaults; shows fallback immediately if src is empty; optional onError callback |
| **Weaknesses** | **Bug:** Once errored=true, the signal never resets — if src changes reactively after an error, image never recovers; fallback defaults to null (invisible broken state) |
| **Should Rebuild?** | NO |
| **Priority** | High (add reactive error reset when src changes — this is a real bug) |

---

### 16. ScrollToTop

| Field | Detail |
|-------|--------|
| **Purpose** | Floating button that appears after scrolling past a sentinel, using IntersectionObserver for performance |
| **Where Used** | Watchlist, Collections, CollectionDetail, Profile |
| **Key Props** | None |
| **CSS Classes** | `scroll-to-top`, `material-symbols-outlined` |
| **Strengths** | IntersectionObserver (performant); respects prefers-reduced-motion; proper onCleanup for observer; data-visible attribute for CSS-driven show/hide |
| **Weaknesses** | Sentinel div requires positioned parent; no animation transition in component (relies on external CSS) |
| **Should Rebuild?** | NO |
| **Priority** | Low |

---

### 17. ToastContainer

| Field | Detail |
|-------|--------|
| **Purpose** | Premium toast notification renderer with type-aware toasts (success/error/info/action), icons, accent stripes, and entrance/exit animations |
| **Where Used** | AppShell (rendered globally) |
| **Key Props** | None — consumes useToast() context |
| **CSS Classes** | `toast-stack`, `toast`, `toast-${type}`, `toast-exit`, `toast-icon`, `toast-message`, `toast-action-btn`, `toast-close` |
| **Strengths** | aria-live="polite" on container; role="status" on toasts; action button for interactive toasts; type-aware icons; dismissible |
| **Weaknesses** | No visible auto-dismiss timer; no max-toast limit; close button lacks focus-ring; double aria-live (container + individual) creates double-announcement risk |
| **Should Rebuild?** | NO |
| **Priority** | Medium (fix double aria-live; add focus-ring to close) |

---

### 18. Icon

| Field | Detail |
|-------|--------|
| **Purpose** | Thin wrapper around Material Symbols, centralising class, fill variant, and accessibility |
| **Where Used** | Nearly every component that renders icons |
| **Key Props** | `name: string`, `fill?: boolean`, `class`, `style`, `aria-hidden`, `aria-label` |
| **CSS Classes** | `material-symbols-outlined`, `filled` |
| **Strengths** | Single source of truth for icon rendering; auto-sets aria-hidden; promotes to role="img" when aria-label provided; fill prop for filled variants |
| **Weaknesses** | No `size` prop (consumers must use inline style); no `weight` prop; doesn't set font-variation-settings (consumers must do this themselves repeatedly) |
| **Should Rebuild?** | NO |
| **Priority** | Medium (add size + weight props to eliminate repeated inline font-variation-settings) |

---

### 19. HighlightText

| Field | Detail |
|-------|--------|
| **Purpose** | Splits text by search query and highlights matching substrings with accent color |
| **Where Used** | MovieCard (search results), SearchResultRow |
| **Key Props** | `text?: string`, `search?: string` |
| **CSS Classes** | None (pure inline style) |
| **Strengths** | Proper regex escaping; case-insensitive matching; clean For loop with Show fallback |
| **Weaknesses** | No key prop on For items; non-null assertion inside Show; only color highlight (no background); no limit on highlight count |
| **Should Rebuild?** | NO |
| **Priority** | Low |

---

### 20. LoadingScreen

| Field | Detail |
|-------|--------|
| **Purpose** | Premium full-screen loading state shown during SSR hydration with pulsing accent glow |
| **Where Used** | AppShell (initial load) |
| **Key Props** | None |
| **CSS Classes** | `material-symbols-outlined` |
| **Strengths** | SSR-safe; design-token consistent; ambient glow via radial gradient; 100dvh for mobile viewport |
| **Weaknesses** | Caption says "Initializing Vault" (Vault is deprecated name); no prefers-reduced-motion; ambient glow div may not position correctly (parent lacks position: relative) |
| **Should Rebuild?** | NO |
| **Priority** | Medium (fix caption, add reduced-motion, add position: relative) |

---

### 21. GlobalErrorBoundary

| Field | Detail |
|-------|--------|
| **Purpose** | Application-wide error boundary with friendly fallback and Retry/Back-to-Home actions |
| **Where Used** | AppShell (wraps entire app) |
| **Key Props** | `children: JSX.Element` |
| **CSS Classes** | `material-symbols-outlined`, `btn-primary`, `focus-ring`, `btn-ghost` |
| **Strengths** | Uses window.location.href (works even with broken Router); dev-only stack trace; production shows only message; retry button has spinner |
| **Weaknesses** | retrying signal never resets to false; no error reporting hook; inline animation string may not match keyframe |
| **Should Rebuild?** | NO |
| **Priority** | Medium (add retrying reset + error reporting hook) |

---

## Feature Components

---

### Movie Cards

#### 22. VaultCard (`src/features/watchlist/components/VaultCard.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Watchlist-specific movie card with status badge, rating chips, and progress indicator |
| **Where Used** | VaultGrid, VaultShelf |
| **Should Rebuild?** | NO |
| **Priority** | Medium |

---

### Collection Cards

#### 23. CollectionHero (`src/features/collection/components/CollectionHero.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Cinematic hero banner for collection detail pages with backdrop image, title, and stats |
| **Where Used** | CollectionDetailPage → UniverseDashboard |
| **Should Rebuild?** | NO |
| **Priority** | Low |

#### 24. CollectionStats (`src/features/collection/components/CollectionStats.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Stats bar for collection detail showing entry count, completion, and viewing progress |
| **Where Used** | CollectionDetailPage → UniverseDashboard |
| **Should Rebuild?** | NO |
| **Priority** | Low |

#### 25. CollectionTimeline (`src/features/collection/components/CollectionTimeline.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Timeline visualization showing collection entries in chronological/release order |
| **Where Used** | CollectionDetailPage → TimelineEngine |
| **Should Rebuild?** | NO |
| **Priority** | Low |

---

### Universe Cards

#### 26. UniverseDashboard (`src/features/collections/components/UniverseDashboard.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Dashboard view for a single universe/collection with hero, stats, and timeline |
| **Where Used** | CollectionDetailPage |
| **Should Rebuild?** | NO |
| **Priority** | Low |

#### 27. UniverseEditPage (`src/features/collections/components/UniverseEditPage.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Full editing interface for universe entries with drag-and-drop reordering, pinning, hiding, notes, and custom entries |
| **Where Used** | Route: /collections/[id]/edit |
| **Strengths** | Complete editing feature set; local-first (changes are local until Save); custom entries support |
| **Weaknesses** | **Critical accessibility gap:** drag-and-drop is mouse-only with zero ARIA; missing `<Title>`; no virtualization for long timelines |
| **Should Rebuild?** | NO |
| **Priority** | High (add keyboard reorder controls) |

---

### Bottom Sheets

#### 28. AddToFolderSheet (`src/features/details/components/AddToFolderSheet.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Bottom sheet for adding a movie/show to a collection/folder |
| **Where Used** | DetailsModal → ActionDock |
| **Should Rebuild?** | NO |
| **Priority** | Low |

#### 29. ConfirmRemoveSheet (`src/features/details/components/ConfirmRemoveSheet.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Confirmation bottom sheet for removing a movie/show from the vault |
| **Where Used** | DetailsModal → ActionDock |
| **Should Rebuild?** | NO |
| **Priority** | Low |

#### 30. ResetConfirmSheet (`src/features/sync/components/ResetConfirmSheet.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Confirmation bottom sheet for resetting the entire library |
| **Where Used** | SyncPage → DangerZoneCard |
| **Should Rebuild?** | NO |
| **Priority** | Low |

---

### Dialogs / Modals

#### 31. DetailsModal (`src/features/details/DetailsModal/DetailsModal.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Full-featured movie/show detail modal with cinematic hero, metadata, ratings, cast, seasons, similar titles, and actions |
| **Where Used** | Triggered from any MovieCard/VaultCard click |
| **Strengths** | Rich content hierarchy; race condition handling; separate hooks for actions/form/progress |
| **Weaknesses** | Very large component tree; multiple sub-components; no lazy loading for below-fold sections |
| **Should Rebuild?** | NO |
| **Priority** | Medium |

#### 32. CollectionModal (`src/features/collection/CollectionModal.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Modal for creating/editing collections with name, description, and icon selection |
| **Where Used** | CollectionsPage |
| **Should Rebuild?** | NO |
| **Priority** | Low |

#### 33. AddUniverseModal (`src/features/collections/components/AddUniverseModal.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Modal for subscribing to curated universes with search and browsing |
| **Where Used** | CollectionsPage (lazy-loaded) |
| **Should Rebuild?** | NO |
| **Priority** | Low |

---

### Search Bars

#### 34. VaultSearch (`src/features/watchlist/components/VaultSearch.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Sticky search bar for filtering watchlist items with real-time filtering |
| **Where Used** | WatchlistView |
| **Should Rebuild?** | NO |
| **Priority** | Low |

#### 35. SearchHeader (`src/features/search/SearchHeader.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Search page header with autofocus input, recent searches, and genre pills |
| **Where Used** | SearchPage |
| **Should Rebuild?** | NO |
| **Priority** | Low |

---

### Hero Sections

#### 36. CinematicHero (`src/features/details/components/CinematicHero.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Full-bleed cinematic hero with backdrop image, gradient overlay, floating poster, and content cluster |
| **Where Used** | DetailsModal |
| **Should Rebuild?** | NO |
| **Priority** | Low |

#### 37. Spotlight (`src/features/discover/components/Spotlight.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Featured movie spotlight with large backdrop, editorial copy, and CTA |
| **Where Used** | DiscoverPage |
| **Should Rebuild?** | NO |
| **Priority** | Low |

#### 38. ProfileBanner (`src/features/profile/components/ProfileBanner.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | User profile banner with custom image, gradient overlay, and shimmer loading state |
| **Where Used** | ProfilePage |
| **Should Rebuild?** | NO |
| **Priority** | Low |

---

### Carousels / Rails

#### 39. DiscoverRail (`src/features/discover/components/DiscoverRail.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Horizontal scrollable rail of movie cards with snap scrolling and lazy rendering |
| **Where Used** | DiscoverPage (multiple instances) |
| **Should Rebuild?** | NO |
| **Priority** | Low |

---

### Badges

#### 40. ProgressRing (`src/features/collections/components/ProgressRing.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Circular progress indicator with accent color glow |
| **Where Used** | UniverseDashboard, CollectionStats |
| **Should Rebuild?** | NO |
| **Priority** | Low |

---

### Tags / Chips

#### 41. RelationshipPill (`src/features/discover/components/RelationshipPill.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Pill showing relationship between user taste and a recommendation (e.g., "Because you love...") |
| **Where Used** | DiscoverPage |
| **Should Rebuild?** | NO |
| **Priority** | Low |

---

### Empty States

#### 42. SearchEmptyState (`src/features/search/SearchEmptyState.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Search-specific empty state for no results |
| **Where Used** | SearchPage |
| **Should Rebuild?** | NO |
| **Priority** | Low |

#### 43. PremiumEmptyState (`src/features/discover/components/PremiumEmptyState.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Premium-styled empty state for Discover page guest/new-user states |
| **Where Used** | DiscoverPage |
| **Should Rebuild?** | NO |
| **Priority** | Low |

#### 44. EmptyState (`src/features/watchlist/components/EmptyState.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Watchlist-specific empty state with custom icon and action |
| **Where Used** | WatchlistView |
| **Should Rebuild?** | NO |
| **Priority** | Low |

---

### Loading Skeletons

#### 45. DiscoverSkeleton (`src/features/discover/components/DiscoverSkeleton.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Skeleton layout matching Discover page structure |
| **Where Used** | DiscoverPage |
| **Should Rebuild?** | NO |
| **Priority** | Low |

#### 46. ProfileSkeleton (`src/features/profile/components/ProfileSkeleton.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Skeleton layout matching Profile page structure |
| **Where Used** | ProfilePage |
| **Should Rebuild?** | NO |
| **Priority** | Low |

#### 47. CollectionSkeleton (`src/features/collection/components/CollectionSkeleton.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Basic skeleton for collection detail (2 gray bars) |
| **Where Used** | CollectionDetailPage |
| **Should Rebuild?** | NO |
| **Priority** | Medium (too basic — doesn't match actual content layout) |

#### 48. SearchLoading (`src/features/search/SearchLoading.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Loading state for search results |
| **Where Used** | SearchPage |
| **Should Rebuild?** | NO |
| **Priority** | Low |

#### 49. LoadingSkeleton (`src/features/watchlist/components/LoadingSkeleton.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Grid of poster-shaped skeleton blocks for watchlist loading |
| **Where Used** | WatchlistView |
| **Should Rebuild?** | NO |
| **Priority** | Low |

#### 50. DetailsSkeleton (`src/features/details/components/DetailsSkeleton.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Skeleton layout matching DetailsModal structure |
| **Where Used** | DetailsModal |
| **Should Rebuild?** | NO |
| **Priority** | Low |

---

### Toasts

#### 51. useToast (`src/shared/hooks/useToast.ts`)

| Field | Detail |
|-------|--------|
| **Purpose** | Global toast notification hook providing success/error/info/action toast methods |
| **Where Used** | Virtually every feature that needs user feedback |
| **Should Rebuild?** | NO |
| **Priority** | Low |

---

### Navigation

#### 52. AppShell (`src/app/AppShell.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Root layout shell wrapping AppHeader + Router + BottomNavigation + ToastContainer + AuthModal |
| **Where Used** | app.tsx (root) |
| **Should Rebuild?** | NO |
| **Priority** | Low |

---

### Profile Header

#### 53. ProfileBanner (`src/features/profile/components/ProfileBanner.tsx`)

Covered in Hero Sections above.

#### 54. BannerEditor (`src/features/profile/components/BannerEditor.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Inline banner image editor with upload and remove capabilities |
| **Where Used** | ProfilePage (edit mode) |
| **Should Rebuild?** | NO |
| **Priority** | Low |

---

### Stats Cards

#### 55. WatchlistStats (`src/features/watchlist/components/WatchlistStats.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Stats bar showing watching/completed/planned/on-hold/dropped counts |
| **Where Used** | WatchlistView |
| **Should Rebuild?** | NO |
| **Priority** | Low |

#### 56. CollectionsStats (`src/features/collections/components/CollectionsStats.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Stats summary for the collections index page |
| **Where Used** | CollectionsPage |
| **Should Rebuild?** | NO |
| **Priority** | Low |

#### 57. StorageStats (`src/features/sync/components/StorageStats.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Storage usage statistics for the sync page |
| **Where Used** | SyncPage |
| **Should Rebuild?** | NO |
| **Priority** | Low |

---

### Settings Rows

#### 58. SettingsPage (`src/features/settings/SettingsPage.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Settings index page with grouped setting rows — gold standard for sec-* pattern |
| **Where Used** | Route: /settings |
| **Should Rebuild?** | NO |
| **Priority** | Low (reference implementation) |

---

### Sync Cards

#### 59. CloudStatusCard (`src/features/sync/components/CloudStatusCard.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Card showing cloud sync status with last sync time and manual sync trigger |
| **Where Used** | SyncPage |
| **Should Rebuild?** | NO |
| **Priority** | Low |

#### 60. BackupCards (`src/features/sync/components/BackupCards.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Cards for backup and restore operations |
| **Where Used** | SyncPage |
| **Should Rebuild?** | NO |
| **Priority** | Low |

#### 61. ImportHub (`src/features/sync/components/ImportHub.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Hub for importing data from external sources (JSON, future: Letterboxd, Trakt) |
| **Where Used** | SyncPage |
| **Should Rebuild?** | NO |
| **Priority** | Low |

#### 62. DevicesCard (`src/features/sync/components/DevicesCard.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Card showing connected devices |
| **Where Used** | SyncPage |
| **Should Rebuild?** | NO |
| **Priority** | Low |

#### 63. DangerZoneCard (`src/features/sync/components/DangerZoneCard.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Destructive actions card with reset library and delete account |
| **Where Used** | SyncPage |
| **Should Rebuild?** | NO |
| **Priority** | Low |

#### 64. PrivacyCard (`src/features/sync/components/PrivacyCard.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Privacy information card for the sync page |
| **Where Used** | SyncPage |
| **Should Rebuild?** | NO |
| **Priority** | Low |

#### 65. SyncHistoryTimeline (`src/features/sync/components/SyncHistoryTimeline.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Timeline of recent sync operations |
| **Where Used** | SyncPage |
| **Should Rebuild?** | NO |
| **Priority** | Low |

---

### Details Sub-Components

#### 66. ActionDock (`src/features/details/components/ActionDock.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Floating glass dock with contextual actions (add to vault, rate, add to folder, remove) |
| **Where Used** | DetailsModal |
| **Strengths** | Glass surface with blur; contextual action set; danger state for remove |
| **Should Rebuild?** | NO |
| **Priority** | Low |

#### 67. DetailSection (`src/features/details/components/DetailSection.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Section wrapper for detail modal content sections |
| **Where Used** | DetailsModal |
| **Should Rebuild?** | NO |
| **Priority** | Low |

#### 68. EpisodeCard (`src/features/details/components/EpisodeCard.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Episode card with still image, number, title, runtime, and watched status |
| **Where Used** | DetailsModal → DetailsSeasons |
| **Should Rebuild?** | NO |
| **Priority** | Low |

#### 69. SeasonNavigator (`src/features/details/components/SeasonNavigator.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Accordion-style season navigator with episode grid |
| **Where Used** | DetailsModal → DetailsSeasons |
| **Should Rebuild?** | NO |
| **Priority** | Low |

#### 70. SimilarTitles (`src/features/details/components/SimilarTitles.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Horizontal rail of similar movie/show recommendations |
| **Where Used** | DetailsModal → DetailsRecommendations |
| **Should Rebuild?** | NO |
| **Priority** | Low |

#### 71. RatingCluster (`src/features/details/components/RatingCluster.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Detailed rating display with multiple sources (IMDb, RT, Metacritic, User) |
| **Where Used** | DetailsModal → DetailsRatings |
| **Should Rebuild?** | NO |
| **Priority** | Low |

#### 72. MetadataGrid (`src/features/details/components/MetadataGrid.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Grid of metadata key-value pairs (director, writer, language, etc.) |
| **Where Used** | DetailsModal → DetailsMetadata |
| **Should Rebuild?** | NO |
| **Priority** | Low |

#### 73. YourActivityCard (`src/features/details/components/YourActivityCard.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Card showing user's personal activity for a title (status, rating, date added, notes) |
| **Where Used** | DetailsModal → DetailsActions |
| **Should Rebuild?** | NO |
| **Priority** | Low |

#### 74. FranchiseInfo (`src/features/details/components/FranchiseInfo.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Information about the franchise/universe a title belongs to |
| **Where Used** | DetailsModal |
| **Should Rebuild?** | NO |
| **Priority** | Low |

---

### Discover Sub-Components

#### 75. CosmosView (`src/features/discover/components/CosmosView.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Visual "cosmos" of the user's taste profile with genre clusters |
| **Where Used** | DiscoverPage |
| **Should Rebuild?** | NO |
| **Priority** | Low |

#### 76. EditorialCard (`src/features/discover/components/EditorialCard.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Editorial-style card with large image and overlay text for curated recommendations |
| **Where Used** | DiscoverPage |
| **Should Rebuild?** | NO |
| **Priority** | Low |

#### 77. GenreExplorer (`src/features/discover/components/GenreExplorer.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Expandable genre browser with sub-genre chips and result grid |
| **Where Used** | DiscoverPage |
| **Should Rebuild?** | NO |
| **Priority** | Low |

#### 78. OttSection (`src/features/discover/components/OttSection.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | OTT/streaming platform section showing what's new on specific platforms |
| **Where Used** | DiscoverPage |
| **Should Rebuild?** | NO |
| **Priority** | Low |

#### 79. TasteSurface (`src/features/discover/components/TasteSurface.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Visual surface showing the user's taste profile as a poster mosaic |
| **Where Used** | DiscoverPage |
| **Should Rebuild?** | NO |
| **Priority** | Low |

#### 80. TrajectoryCard (`src/features/discover/components/TrajectoryCard.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Card showing a "trajectory" — a themed collection of recommendations based on taste direction |
| **Where Used** | DiscoverPage |
| **Should Rebuild?** | NO |
| **Priority** | Low |

#### 81. LazyMount (`src/features/discover/components/LazyMount.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Utility component that defers rendering until the element scrolls into view (IntersectionObserver) |
| **Where Used** | DiscoverPage (sections 8+) |
| **Should Rebuild?** | NO |
| **Priority** | Low |

---

### Profile Sub-Components

#### 82. TasteCard (`src/features/profile/components/TasteCard.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Card showing user's top genres/directors/actors with poster tiles and swap overlays |
| **Where Used** | ProfilePage |
| **Should Rebuild?** | NO |
| **Priority** | Low |

#### 83. ProfileCompletion (`src/features/profile/components/ProfileCompletion.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Checklist card showing profile completion steps with progress tracking |
| **Where Used** | ProfilePage |
| **Should Rebuild?** | NO |
| **Priority** | Low |

#### 84. WatchlistSummary (`src/features/profile/components/WatchlistSummary.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Summary card showing watchlist statistics on the profile page |
| **Where Used** | ProfilePage |
| **Should Rebuild?** | NO |
| **Priority** | Low |

#### 85. QuickLinks (`src/features/profile/components/QuickLinks.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Quick link cards to Stats, History, Achievements, and Settings from profile |
| **Where Used** | ProfilePage |
| **Should Rebuild?** | NO |
| **Priority** | Low |

#### 86. FavoritesPicker (`src/features/profile/components/FavoritesPicker.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Modal for selecting favorite titles to feature on the taste card |
| **Where Used** | ProfilePage |
| **Should Rebuild?** | NO |
| **Priority** | Low |

---

### Collections Sub-Components

#### 87. CollectionsGrid (`src/features/collections/components/CollectionsGrid.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Grid of collection cards with poster collage thumbnails |
| **Where Used** | CollectionsPage |
| **Should Rebuild?** | NO |
| **Priority** | Low |

#### 88. CollectionsHeader (`src/features/collections/components/CollectionsHeader.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Header section for collections page with title and action buttons |
| **Where Used** | CollectionsPage |
| **Should Rebuild?** | NO |
| **Priority** | Low |

#### 89. CollectionsFilters (`src/features/collections/components/CollectionsFilters.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Filter controls for the collections grid |
| **Where Used** | CollectionsPage |
| **Should Rebuild?** | NO |
| **Priority** | Low |

#### 90. FranchiseGrid (`src/features/collections/components/FranchiseGrid.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Grid of franchise/universe cards |
| **Where Used** | CollectionsPage |
| **Should Rebuild?** | NO |
| **Priority** | Low |

#### 91. FolderEditor (`src/features/collections/components/FolderEditor.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Inline editor for creating and naming a new collection/folder |
| **Where Used** | CollectionsPage |
| **Should Rebuild?** | NO |
| **Priority** | Low |

#### 92. SmartCollectionBuilder (`src/features/collections/components/SmartCollectionBuilder.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Builder for creating smart collections with rules (genre, year, rating, etc.) |
| **Where Used** | CollectionsPage |
| **Should Rebuild?** | NO |
| **Priority** | Low |

#### 93. TimelineEngine (`src/features/collections/components/TimelineEngine.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Timeline visualization engine for rendering collection entries in chronological order |
| **Where Used** | CollectionDetailPage |
| **Should Rebuild?** | NO |
| **Priority** | Low |

#### 94. TimelineEntry (`src/features/collections/components/TimelineEntry.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Single entry in the collection timeline |
| **Where Used** | TimelineEngine |
| **Should Rebuild?** | NO |
| **Priority** | Low |

#### 95. UniverseEditEntry (`src/features/collections/components/UniverseEditEntry.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Editable entry row in the universe edit page with drag handle, pin, hide, notes |
| **Where Used** | UniverseEditPage |
| **Should Rebuild?** | NO |
| **Priority** | Low |

#### 96. UniverseSuggestions (`src/features/collections/components/UniverseSuggestions.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Suggested entries to add to a universe based on franchise data |
| **Where Used** | UniverseEditPage |
| **Should Rebuild?** | NO |
| **Priority** | Low |

---

### Watchlist Sub-Components

#### 97. VaultCard (`src/features/watchlist/components/VaultCard.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Vault-specific movie card variant |
| **Where Used** | VaultGrid |
| **Should Rebuild?** | NO |
| **Priority** | Low |

#### 98. VaultGrid (`src/features/watchlist/components/VaultGrid.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Grid layout for vault cards with responsive columns |
| **Where Used** | WatchlistView |
| **Should Rebuild?** | NO |
| **Priority** | Low |

#### 99. VaultShelf (`src/features/watchlist/components/VaultShelf.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Horizontal shelf of vault cards grouped by status or category |
| **Where Used** | WatchlistView |
| **Should Rebuild?** | NO |
| **Priority** | Low |

#### 100. VaultFilters / VaultFiltersContent / FilterControls / QuickFilterTabs

| Field | Detail |
|-------|--------|
| **Purpose** | Filter controls for the vault: status tabs, genre/platform/tag filters |
| **Where Used** | WatchlistView |
| **Should Rebuild?** | NO |
| **Priority** | Low |

#### 101. WatchlistDialogs (`src/features/watchlist/components/WatchlistDialogs.tsx`)

| Field | Detail |
|-------|--------|
| **Purpose** | Collection of dialog components used in the watchlist |
| **Where Used** | WatchlistView |
| **Should Rebuild?** | NO |
| **Priority** | Low |

---

## Component Summary

| Category | Count | Rebuild Needed | High Priority |
|----------|-------|----------------|---------------|
| Shared Primitives | 7 | 1 (SectionHeader) | 3 (Button, SectionHeader, Section) |
| Shared UI | 14 | 0 | 3 (SafeImage, MovieCard, AuthModal) |
| Feature Components | 80+ | 0 | 1 (UniverseEditPage — a11y) |
| **Total** | **101+** | **1** | **7** |

### Components Needing Attention (Priority Order)

1. **SectionHeader** — Merge into Section (DRY violation)
2. **SafeImage** — Fix reactive error reset (bug)
3. **UniverseEditPage** — Add keyboard accessibility for drag-and-drop
4. **AuthModal** — Decompose into sub-components; add password toggle
5. **MovieCard** — Extract CardPoster/CardBadges sub-components
6. **Button** — Add `loading` prop + `danger` variant
7. **Icon** — Add `size` + `weight` props
