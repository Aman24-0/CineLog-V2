# CineLog V2 — Component Dependency Map

> **Version:** 1.0  
> **Date:** 2026-07-12  
> **Status:** Reference Document — Complete Dependency Graph  
> **Rule:** This is a read-only reference. Do NOT use it to justify refactors without a separate redesign proposal.

---

## Table of Contents

1. [Page Dependency Matrix](#part-1-page-dependency-matrix)
2. [Component Dependency Graph](#part-2-component-dependency-graph)
3. [Cross-Cutting Dependencies](#part-3-cross-cutting-dependencies)
4. [Circular Dependencies](#part-4-circular-dependencies)

---

# PART 1: PAGE DEPENDENCY MATRIX

Every page in CineLog V2, with a full inventory of what it uses, what it duplicates inline, what it uniquely owns, and what it should promote to shared.

## Legend

| Symbol | Meaning |
|--------|---------|
| 🔵 | Shared component (imported from `shared/ui/`) |
| 🟢 | Feature-local component (within the same feature folder) |
| 🔴 | Duplicated inline — pattern that exists as a shared component but was reimplemented locally |
| 🟡 | Should be shared — component that could/should be promoted to `shared/ui/` |
| ⚪ | Unique to this page — no other page uses it |

---

### 1. Dashboard/Discover (DiscoverPage)

| Category | Component | Origin |
|----------|-----------|--------|
| **Shared UI** | PageContainer | 🔵 `shared/ui/PageContainer` |
| **Shared UI** | MovieCard (compact) | 🔵 `shared/ui/MovieCard` |
| **Shared UI** | Button | 🔵 `shared/ui/primitives/Button` |
| **Shared UI** | Badge | 🔵 `shared/ui/primitives/Badge` |
| **Shared UI** | SectionHeader | 🔵 `shared/ui/primitives/SectionHeader` |
| **Discover** | Spotlight | 🟢 `features/discover/components/Spotlight` |
| **Discover** | DiscoverRail | 🟢 `features/discover/components/DiscoverRail` |
| **Discover** | CosmosView | 🟢 `features/discover/components/CosmosView` |
| **Discover** | GenreExplorer | 🟢 `features/discover/components/GenreExplorer` |
| **Discover** | TasteSurface | 🟢 `features/discover/components/TasteSurface` |
| **Discover** | TrajectoryCard | 🟢 `features/discover/components/TrajectoryCard` |
| **Discover** | OttSection | 🟢 `features/discover/components/OttSection` |
| **Discover** | EditorialCard | 🟢 `features/discover/components/EditorialCard` |
| **Discover** | RelationshipPill | 🟢 `features/discover/components/RelationshipPill` |
| **Discover** | PremiumEmptyState | 🟢 `features/discover/components/PremiumEmptyState` |
| **Discover** | DiscoverSkeleton | 🟢 `features/discover/components/DiscoverSkeleton` |
| **Discover** | LazyMount | 🟢 `features/discover/components/LazyMount` |
| **Inline dup** | `<span class="material-symbols-outlined">` | 🔴 Should use `Icon` component |
| **Inline dup** | Guest CTA with `btn-primary` | 🔴 Should use `Button` primitive |

| Components Used | Duplicated Inline | Unique to Page | Should Be Shared |
|-----------------|-------------------|----------------|------------------|
| 17 | 2 patterns (Icon spans, guest CTA) | LazyMount, PremiumEmptyState, RelationshipPill, EditorialCard, OttSection, TrajectoryCard, TasteSurface, GenreExplorer, CosmosView, DiscoverRail, Spotlight | LazyMount (generic IO deferral), PremiumEmptyState (could generalize) |

---

### 2. Vault/Watchlist (WatchlistView)

| Category | Component | Origin |
|----------|-----------|--------|
| **Shared UI** | PageContainer | 🔵 `shared/ui/PageContainer` |
| **Shared UI** | ScrollToTop | 🔵 `shared/ui/ScrollToTop` |
| **Watchlist** | WatchlistHeader | 🟢 `features/watchlist/components/WatchlistHeader` |
| **Watchlist** | WatchlistStats | 🟢 `features/watchlist/components/WatchlistStats` |
| **Watchlist** | WatchlistGrid | 🟢 `features/watchlist/components/WatchlistGrid` |
| **Watchlist** | WatchlistDialogs | 🟢 `features/watchlist/components/WatchlistDialogs` |
| **Watchlist** | EmptyState | 🟢 `features/watchlist/components/EmptyState` |
| **Watchlist** | LoadingSkeleton | 🟢 `features/watchlist/components/LoadingSkeleton` |

| Components Used | Duplicated Inline | Unique to Page | Should Be Shared |
|-----------------|-------------------|----------------|------------------|
| 7 | EmptyState (duplicates `shared/ui/primitives/EmptyState`), LoadingSkeleton (duplicates Skeleton pattern) | WatchlistHeader, WatchlistGrid, WatchlistDialogs, WatchlistStats | EmptyState (watchlist) → should use shared `EmptyState` primitive; LoadingSkeleton → should use shared `Skeleton` primitive |

---

### 3. Search (SearchPage)

| Category | Component | Origin |
|----------|-----------|--------|
| **Shared UI** | PageContainer | 🔵 `shared/ui/PageContainer` |
| **Shared UI** | ScrollToTop | 🔵 `shared/ui/ScrollToTop` |
| **Search** | SearchHeader | 🟢 `features/search/SearchHeader` |
| **Search** | SearchGrid | 🟢 `features/search/SearchGrid` |
| **Search** | SearchResults | 🟢 `features/search/SearchResults` |
| **Search** | SearchFilters | 🟢 `features/search/SearchFilters` |
| **Cross-feature** | useVault | 🟡 imported from `features/watchlist/useVault` |

| Components Used | Duplicated Inline | Unique to Page | Should Be Shared |
|-----------------|-------------------|----------------|------------------|
| 6 | — | SearchHeader, SearchGrid, SearchResults, SearchFilters | SearchHeader (generic search input + filter bar), SearchResults (could share pattern with WatchlistGrid) |

---

### 4. Collections (CollectionsPage)

| Category | Component | Origin |
|----------|-----------|--------|
| **Shared UI** | PageContainer | 🔵 `shared/ui/PageContainer` |
| **Shared UI** | ScrollToTop | 🔵 `shared/ui/ScrollToTop` |
| **Collections** | CollectionsGrid | 🟢 `features/collections/components/CollectionsGrid` |
| **Collections** | FolderEditor | 🟢 `features/collections/components/FolderEditor` |
| **Collections** | SmartCollectionBuilder | 🟢 `features/collections/components/SmartCollectionBuilder` |
| **Collections** | AddUniverseModal (lazy) | 🟢 `features/collections/components/AddUniverseModal` |
| **Cross-feature** | useVault | 🟡 from `features/watchlist/useVault` |
| **Inline dup** | Unsubscribe confirm dialog (full modal markup) | 🔴 Should use ConfirmRemoveSheet pattern |
| **Inline dup** | `<span class="material-symbols-outlined">` × 6 | 🔴 Should use `Icon` component |
| **Inline dup** | Error fallback UI (copy-pasted) | 🔴 Should use shared `EmptyState` |

| Components Used | Duplicated Inline | Unique to Page | Should Be Shared |
|-----------------|-------------------|----------------|------------------|
| 6+lazy | 3 patterns (confirm dialog, Icon spans, error fallback) | CollectionsGrid, FolderEditor, SmartCollectionBuilder, AddUniverseModal | Unsubscribe confirm → should share ConfirmRemoveSheet pattern |

---

### 5. Collection Detail (CollectionDetailPage)

| Category | Component | Origin |
|----------|-----------|--------|
| **Shared UI** | PageContainer | 🔵 `shared/ui/PageContainer` |
| **Shared UI** | ScrollToTop | 🔵 `shared/ui/ScrollToTop` |
| **Collections** | UniverseDashboard | 🟢 `features/collections/components/UniverseDashboard` |
| **Collections** | TimelineEngine | 🟢 `features/collections/components/TimelineEngine` |
| **Cross-feature** | useVault | 🟡 from `features/watchlist/useVault` |
| **Inline dup** | Skeleton loaders (inline `skeleton-base` divs) | 🔴 Should use `Skeleton` primitive |
| **Inline dup** | Error fallback (inline markup) | 🔴 Should use `EmptyState` primitive |

| Components Used | Duplicated Inline | Unique to Page | Should Be Shared |
|-----------------|-------------------|----------------|------------------|
| 4 | 2 patterns (skeleton, error fallback) | UniverseDashboard, TimelineEngine | — |

---

### 6. Universe Edit (UniverseEditPage)

| Category | Component | Origin |
|----------|-----------|--------|
| **Collections** | UniverseEditEntry | 🟢 `features/collections/components/UniverseEditEntry` |
| **Collections** | ProgressRing | 🟢 `features/collections/components/ProgressRing` |
| **Collections** | FranchiseGrid | 🟢 `features/collections/components/FranchiseGrid` |
| **Collections** | UniverseSuggestions | 🟢 `features/collections/components/UniverseSuggestions` |

| Components Used | Duplicated Inline | Unique to Page | Should Be Shared |
|-----------------|-------------------|----------------|------------------|
| 4 | Drag-and-drop UI (no shared pattern) | UniverseEditEntry, ProgressRing, FranchiseGrid, UniverseSuggestions | ProgressRing (could be shared for Stats, Achievements, Collection) |

---

### 7. Profile (ProfilePage)

| Category | Component | Origin |
|----------|-----------|--------|
| **Shared UI** | PageContainer | 🔵 `shared/ui/PageContainer` |
| **Shared UI** | Button | 🔵 `shared/ui/primitives/Button` |
| **Profile** | ProfileBanner | 🟢 `features/profile/components/ProfileBanner` |
| **Profile** | BannerEditor | 🟢 `features/profile/components/BannerEditor` |
| **Profile** | TasteCard | 🟢 `features/profile/components/TasteCard` |
| **Profile** | ProfileCompletion | 🟢 `features/profile/components/ProfileCompletion` |
| **Profile** | WatchlistSummary | 🟢 `features/profile/components/WatchlistSummary` |
| **Profile** | QuickLinks | 🟢 `features/profile/components/QuickLinks` |
| **Profile** | ProfileSkeleton | 🟢 `features/profile/components/ProfileSkeleton` |
| **Profile** | FavoritesPicker | 🟢 `features/profile/components/FavoritesPicker` |
| **Inline dup** | Guest empty state (`empty-premium` markup) | 🔴 Should use `EmptyState` primitive |
| **Inline dup** | Error empty state (`empty-premium` markup) | 🔴 Should use `EmptyState` primitive |

| Components Used | Duplicated Inline | Unique to Page | Should Be Shared |
|-----------------|-------------------|----------------|------------------|
| 10 | 2 patterns (guest empty, error empty) | ProfileBanner, BannerEditor, TasteCard, ProfileCompletion, WatchlistSummary, QuickLinks, ProfileSkeleton, FavoritesPicker | ProfileSkeleton → should use shared `Skeleton`; EmptyState patterns → use shared primitive |

---

### 8. Stats (StatsPage)

| Category | Component | Origin |
|----------|-----------|--------|
| **Shared UI** | PageContainer | 🔵 `shared/ui/PageContainer` |
| **Inline dup** | Empty state (`empty-premium` markup) | 🔴 Should use `EmptyState` primitive |
| **Inline dup** | Skeleton (`sec-skeleton-block`) | 🔴 Should use `Skeleton` primitive |
| **Inline dup** | Icon spans (`material-symbols-outlined`) × 8 | 🔴 Should use `Icon` component |
| **Inline dup** | Stat grid cells (pure inline CSS) | 🔴 Should be a shared `StatCard` component |
| **Inline dup** | Insight cards (pure inline CSS) | 🔴 Should be a shared `InsightCard` component |
| **Inline dup** | Heatmap (pure inline IIFE) | 🟡 Should be a component |

| Components Used | Duplicated Inline | Unique to Page | Should Be Shared |
|-----------------|-------------------|----------------|------------------|
| 1 | 6 patterns (empty, skeleton, icon, stat cells, insight cards, heatmap) | 0 (entirely inline) | StatCard, InsightCard, HeatmapGrid, ProgressRing — all should be shared |

---

### 9. History (HistoryPage)

| Category | Component | Origin |
|----------|-----------|--------|
| **Shared UI** | PageContainer | 🔵 `shared/ui/PageContainer` |
| **Inline dup** | Search bar (`search-premium` markup) | 🔴 Should share with Watchlist Search |
| **Inline dup** | Filter tabs (`quick-filter-tab` markup) | 🔴 Should share with Watchlist QuickFilterTabs |
| **Inline dup** | Empty states (`empty-premium` markup × 3) | 🔴 Should use `EmptyState` primitive |
| **Inline dup** | Skeleton (`sec-skeleton-block`) | 🔴 Should use `Skeleton` primitive |
| **Inline dup** | Icon spans × 4 | 🔴 Should use `Icon` component |
| **Inline dup** | History list items (pure inline) | 🟡 Should be a HistoryItem component |

| Components Used | Duplicated Inline | Unique to Page | Should Be Shared |
|-----------------|-------------------|----------------|------------------|
| 1 | 6 patterns (search bar, filter tabs, empty states, skeleton, icons, list items) | 0 (entirely inline) | QuickFilterTabs (shared with Watchlist), EmptyState → use primitive, HistoryItem → new component |

---

### 10. Achievements (AchievementsPage)

| Category | Component | Origin |
|----------|-----------|--------|
| **Shared UI** | PageContainer | 🔵 `shared/ui/PageContainer` |
| **Inline dup** | Empty states (`empty-premium` markup × 2) | 🔴 Should use `EmptyState` primitive |
| **Inline dup** | Skeleton (`sec-skeleton-block`) | 🔴 Should use `Skeleton` primitive |
| **Inline dup** | Icon spans × 2 | 🔴 Should use `Icon` component |
| **Inline dup** | Achievement cards (pure inline) | 🟡 Should be an AchievementCard component |
| **Inline dup** | Progress bars (pure inline) | 🔴 Should use ProgressRing or shared pattern |

| Components Used | Duplicated Inline | Unique to Page | Should Be Shared |
|-----------------|-------------------|----------------|------------------|
| 1 | 5 patterns (empty, skeleton, icons, achievement cards, progress bars) | 0 (entirely inline) | AchievementCard → new component; ProgressRing → promote from Collections; EmptyState → use primitive |

---

### 11. Settings (SettingsPage)

| Category | Component | Origin |
|----------|-----------|--------|
| **Shared UI** | PageContainer | 🔵 `shared/ui/PageContainer` |
| **Inline dup** | Icon spans (`material-symbols-outlined`) × 4 | 🔴 Should use `Icon` component |
| **Inline dup** | Setting row (`setting-row` markup) | 🟡 Should be a SettingRow component |

| Components Used | Duplicated Inline | Unique to Page | Should Be Shared |
|-----------------|-------------------|----------------|------------------|
| 1 | 2 patterns (icon spans, setting rows) | 0 (entirely inline) | SettingRow → new shared component (reused across all settings sub-pages) |

---

### 12. Settings Sync (SyncRoute)

| Category | Component | Origin |
|----------|-----------|--------|
| **Shared UI** | PageContainer | 🔵 `shared/ui/PageContainer` |
| **Shared UI** | Button | 🔵 `shared/ui/primitives/Button` |
| **Sync** | CloudStatusCard | 🟢 `features/sync/components/CloudStatusCard` |
| **Sync** | ImportHub | 🟢 `features/sync/components/ImportHub` |
| **Sync** | BackupCards | 🟢 `features/sync/components/BackupCards` |
| **Sync** | DevicesCard | 🟢 `features/sync/components/DevicesCard` |
| **Sync** | SyncHistoryTimeline | 🟢 `features/sync/components/SyncHistoryTimeline` |
| **Sync** | StorageStats | 🟢 `features/sync/components/StorageStats` |
| **Sync** | PrivacyCard | 🟢 `features/sync/components/PrivacyCard` |
| **Sync** | DangerZoneCard | 🟢 `features/sync/components/DangerZoneCard` |
| **Inline dup** | Guest empty state (`sync-guest` markup) | 🔴 Should use `EmptyState` primitive |
| **Inline dup** | Icon spans × 2 | 🔴 Should use `Icon` component |

| Components Used | Duplicated Inline | Unique to Page | Should Be Shared |
|-----------------|-------------------|----------------|------------------|
| 10 | 2 patterns (guest empty, icon spans) | CloudStatusCard, ImportHub, BackupCards, DevicesCard, SyncHistoryTimeline, StorageStats, PrivacyCard, DangerZoneCard | — |

---

### 13. Details Modal (DetailsModal)

| Category | Component | Origin |
|----------|-----------|--------|
| **Details (modal)** | DetailsHero | 🟢 `features/details/DetailsModal/DetailsHero` |
| **Details (modal)** | DetailsHeader | 🟢 `features/details/DetailsModal/DetailsHeader` |
| **Details (modal)** | DetailsActions | 🟢 `features/details/DetailsModal/DetailsActions` |
| **Details (modal)** | DetailsRatings | 🟢 `features/details/DetailsModal/DetailsRatings` |
| **Details (modal)** | DetailsOverview | 🟢 `features/details/DetailsModal/DetailsOverview` |
| **Details (modal)** | DetailsCast | 🟢 `features/details/DetailsModal/DetailsCast` |
| **Details (modal)** | DetailsSeasons | 🟢 `features/details/DetailsModal/DetailsSeasons` |
| **Details (modal)** | DetailsMetadata | 🟢 `features/details/DetailsModal/DetailsMetadata` |
| **Details (modal)** | DetailsRecommendations | 🟢 `features/details/DetailsModal/DetailsRecommendations` |
| **Details (components)** | DetailsSkeleton | 🟢 `features/details/components/DetailsSkeleton` |
| **Details (components)** | DetailsError | 🟢 `features/details/components/DetailsError` |
| **Details (components)** | DetailSection | 🟢 `features/details/components/DetailSection` |
| **Details (components)** | DetailsEditForm | 🟢 `features/details/components/DetailsEditForm` |
| **Details (components)** | YourActivityCard | 🟢 `features/details/components/YourActivityCard` |
| **Details (components)** | AddToFolderSheet | 🟢 `features/details/components/AddToFolderSheet` |
| **Details (components)** | ConfirmRemoveSheet | 🟢 `features/details/components/ConfirmRemoveSheet` |
| **Details (components)** | CinematicHero | 🟢 `features/details/components/CinematicHero` |
| **Details (components)** | RatingCluster | 🟢 `features/details/components/RatingCluster` |
| **Details (components)** | ActionDock | 🟢 `features/details/components/ActionDock` |
| **Details (components)** | SeasonNavigator | 🟢 `features/details/components/SeasonNavigator` |
| **Details (components)** | EpisodeCard | 🟢 `features/details/components/EpisodeCard` |
| **Details (components)** | FranchiseInfo | 🟢 `features/details/components/FranchiseInfo` |
| **Details (components)** | HeroContentCluster | 🟢 `features/details/components/HeroContentCluster` |
| **Details (components)** | MetadataGrid | 🟢 `features/details/components/MetadataGrid` |
| **Details (components)** | SimilarTitles | 🟢 `features/details/components/SimilarTitles` |
| **Cross-feature** | useVault | 🟡 from `features/watchlist/useVault` |
| **Shared UI** | SafeImage | 🔵 `shared/ui/SafeImage` |
| **Shared UI** | Icon | 🔵 `shared/ui/Icon` |

| Components Used | Duplicated Inline | Unique to Page | Should Be Shared |
|-----------------|-------------------|----------------|------------------|
| 26 | — (well-factored) | All Details components | RatingCluster (could share with MovieCardRatings), DetailSection (similar to Section), SafeImage (already shared ✓) |

---

### 14. Collection Modal (CollectionModal)

| Category | Component | Origin |
|----------|-----------|--------|
| **Collection** | CollectionHero | 🟢 `features/collection/components/CollectionHero` |
| **Collection** | CollectionStats | 🟢 `features/collection/components/CollectionStats` |
| **Collection** | CollectionTimeline | 🟢 `features/collection/components/CollectionTimeline` |
| **Collection** | CollectionSkeleton | 🟢 `features/collection/components/CollectionSkeleton` |
| **Cross-feature** | useVault | 🟡 from `features/watchlist/useVault` |

| Components Used | Duplicated Inline | Unique to Page | Should Be Shared |
|-----------------|-------------------|----------------|------------------|
| 5 | — | CollectionHero, CollectionStats, CollectionTimeline, CollectionSkeleton | CollectionStats (similar to UniverseDashboard stats), ProgressRing (shared with UniverseEdit) |

---

## Page Dependency Summary

| # | Page | Shared Imports | Feature-Local Components | Inline Duplications | Should Promote |
|---|------|---------------|-------------------------|---------------------|----------------|
| 1 | Discover | 5 (PageContainer, MovieCard, Button, Badge, SectionHeader) | 11 | 2 | 2 (LazyMount, PremiumEmptyState) |
| 2 | Watchlist | 2 (PageContainer, ScrollToTop) | 5 | 2 | 2 (EmptyState, LoadingSkeleton) |
| 3 | Search | 2 (PageContainer, ScrollToTop) | 4 | 0 | 1 (SearchHeader) |
| 4 | Collections | 2 (PageContainer, ScrollToTop) | 4+lazy | 3 | 1 (ConfirmRemoveSheet) |
| 5 | Collection Detail | 2 (PageContainer, ScrollToTop) | 2 | 2 | 0 |
| 6 | Universe Edit | 0 | 4 | 1 | 1 (ProgressRing) |
| 7 | Profile | 2 (PageContainer, Button) | 8 | 2 | 2 (ProfileSkeleton, EmptyState) |
| 8 | Stats | 1 (PageContainer) | 0 | **6** | **4** (StatCard, InsightCard, HeatmapGrid, ProgressRing) |
| 9 | History | 1 (PageContainer) | 0 | **6** | **3** (QuickFilterTabs, EmptyState, HistoryItem) |
| 10 | Achievements | 1 (PageContainer) | 0 | **5** | **3** (AchievementCard, ProgressRing, EmptyState) |
| 11 | Settings | 1 (PageContainer) | 0 | 2 | 1 (SettingRow) |
| 12 | Sync | 2 (PageContainer, Button) | 8 | 2 | 0 |
| 13 | Details Modal | 2 (SafeImage, Icon) | 26 | 0 | 2 (RatingCluster, DetailSection) |
| 14 | Collection Modal | 0 | 4 | 0 | 1 (ProgressRing) |
| | **Total** | | **68** | **31** | **22** |

**Key finding:** Stats, History, Achievements, and Settings have almost zero component decomposition — they render everything inline, duplicating patterns that exist as shared primitives or should be extracted.

---

# PART 2: COMPONENT DEPENDENCY GRAPH

Every component in CineLog V2, with what it imports, what CSS it uses, what design tokens it references, who uses it, and what duplicates its pattern.

---

## Shared UI Components (`src/shared/ui/`)

---

### MovieCard

```
MovieCard
├── Imports: Icon, HighlightText, MovieCardRatings, formatRuntime, tmdbImage, WatchlistItem type
├── CSS Classes: vault-card-premium, animate-fade-up, touch-ripple, focus-ring, v2-card-featured,
│               vault-card-inner, poster-loading, vault-card-poster, img-loaded,
│               tag-chip, status-badge-planned, status-badge-watching, status-badge-completed,
│               badge-glow, type-card-title, type-subtitle, rating-chip, rating-chip-imdb,
│               rating-chip-rt, rating-chip-user
├── Design Tokens: --tier-3, --tier-2, --text-dim, --p
├── Used By: DiscoverPage (DiscoverRail), WatchlistGrid (VaultGrid/VaultCard), SearchResults, CollectionTimeline
└── Duplicated By: VaultCard (similar card with shelf-specific layout)
```

### MovieCardRatings

```
MovieCardRatings
├── Imports: Icon, WatchlistItem type
├── CSS Classes: rating-chip, rating-chip-imdb, rating-chip-rt, rating-chip-user
├── Design Tokens: --p
├── Used By: MovieCard
└── Duplicated By: RatingCluster (details page — expanded 3-source rating with different layout)
```

### AppHeader

```
AppHeader
├── Imports: useNavigate, useAuth, useAuthModal
├── CSS Classes: focus-ring, font-headline
├── Design Tokens: --hairline, --hairline-2, --p, --p-dim, --text-body, --dur-base, --dur-fast, --ease-out, --ease-spring
├── Used By: AppShell
└── Duplicated By: None (zero-props, hook-dependent)
```

### BottomNavigation

```
BottomNavigation
├── Imports: useNavigate, useLocation, NavButton
├── CSS Classes: (none — inline styles only)
├── Design Tokens: --nav-total-height, --nav-safe-area, --tier-1, --hairline
├── Used By: AppShell
└── Duplicated By: None (zero-props, hook-dependent)
```

### NavButton

```
NavButton
├── Imports: Icon
├── CSS Classes: focus-ring
├── Design Tokens: --nav-height, --p, --p-glow, --text-muted, --dur-base, --ease-out, --ease-spring
├── Used By: BottomNavigation
└── Duplicated By: None
```

### Icon

```
Icon
├── Imports: (solid-js JSX)
├── CSS Classes: material-symbols-outlined, filled
├── Design Tokens: (none directly — callers pass color via style)
├── Used By: MovieCard, MovieCardRatings, NavButton, DetailsHero, DetailsActions, DetailsSeasons,
│           DiscoverRail, Spotlight, VaultHeader, SearchHeader, SectionHeader, Badge, Button,
│           EmptyState, ToastContainer, ScrollToTop, GlobalErrorBoundary
└── Duplicated By: ~40 inline `<span class="material-symbols-outlined">` spans across Stats, History,
                   Achievements, Settings, Collections, CollectionDetail pages
```

### PageContainer

```
PageContainer
├── Imports: (solid-js)
├── CSS Classes: px-5, animate-fade-in, max-w-2xl, lg:max-w-4xl, lg:max-w-none, mx-auto
├── Design Tokens: --sp-6, --sp-10
├── Used By: DiscoverPage, WatchlistView, SearchPage, CollectionsPage, CollectionDetailPage,
│           ProfilePage, StatsPage, HistoryPage, AchievementsPage, SettingsPage, SyncRoute
└── Duplicated By: None (universally adopted)
```

### SafeImage

```
SafeImage
├── Imports: Show, createSignal
├── CSS Classes: (caller-specified)
├── Design Tokens: (none)
├── Used By: DetailsHero, SimilarTitles, EpisodeCard, FranchiseInfo
└── Duplicated By: MovieCard (inline createSignal + onError pattern)
```

### HighlightText

```
HighlightText
├── Imports: Show, For
├── CSS Classes: (none — inline style with var(--p))
├── Design Tokens: --p
├── Used By: MovieCard
└── Duplicated By: SearchResultRow (likely similar search-highlight pattern)
```

### ToastContainer

```
ToastContainer
├── Imports: For, Show, useToast, ToastType
├── CSS Classes: toast-stack, toast, toast-success, toast-error, toast-info, toast-action,
│               toast-exit, toast-icon, toast-message, toast-action-btn, toast-close
├── Design Tokens: (none directly — uses CSS classes)
├── Used By: AppShell
└── Duplicated By: None (zero-props, hook-dependent)
```

### AuthModal

```
AuthModal
├── Imports: Show, createSignal, onMount, onCleanup, createEffect, Portal,
│           signInWithEmail, signUpWithEmail, signInWithGoogle
├── CSS Classes: modal-backdrop, modal-sheet-enter, modal-surface, sheet-handle,
│               filter-input-premium, btn-primary, btn-ghost, focus-ring, animate-soft-pulse
├── Design Tokens: --radius-xl, --radius-md, --radius-sm, --sp-1 through --sp-6,
│               --hairline, --hairline-2, --text-soft, --text-strong, --text-muted,
│               --p, --dur-base, --dur-fast, --ease-out, --ease-spring
├── Used By: AppShell
└── Duplicated By: None (single instance, portal-rendered)
```

### GlobalErrorBoundary

```
GlobalErrorBoundary
├── Imports: ErrorBoundary, Show, createSignal
├── CSS Classes: material-symbols-outlined, btn-primary, btn-ghost, focus-ring
├── Design Tokens: --void, --tier-2, --hairline, --hairline-2, --shadow-elevated,
│               --text-strong, --text-soft, --text-muted, --text-dim, --p,
│               --sp-1 through --sp-6, --radius-md
├── Used By: app.tsx (root)
└── Duplicated By: None
```

### ScrollToTop

```
ScrollToTop
├── Imports: createSignal, onMount, onCleanup
├── CSS Classes: scroll-to-top, material-symbols-outlined
├── Design Tokens: (none directly)
├── Used By: WatchlistView, SearchPage, CollectionsPage, CollectionDetailPage
└── Duplicated By: None (zero-props, hook-dependent)
```

### LoadingScreen

```
LoadingScreen
├── Imports: Component
├── CSS Classes: material-symbols-outlined
├── Design Tokens: --void, --tier-2, --hairline-2, --shadow-elevated, --p, --p-glow,
│               --text-strong, --text-muted, --sp-3, --sp-5
├── Used By: app.tsx (Suspense fallback)
└── Duplicated By: None (zero-props, SSR-safe)
```

---

## Primitives (`src/shared/ui/primitives/`)

---

### Button

```
Button
├── Imports: splitProps
├── CSS Classes: btn-primary, btn-ghost, focus-ring, material-symbols-outlined
├── Design Tokens: (padding varies by size, font-variation-settings for icon fill)
├── Used By: ProfilePage, EmptyState primitive, SyncRoute, DiscoverPage (Guest CTA),
│           GlobalErrorBoundary (fallback)
└── Duplicated By: ~10 inline `btn-primary`/`btn-ghost` buttons across Collections, CollectionDetail,
                   Stats, History, Achievements, Settings pages (use CSS classes but not the component)
```

### Badge

```
Badge
├── Imports: Show
├── CSS Classes: badge-glow, badge-accent, material-symbols-outlined
├── Design Tokens: (font-variation-settings for icon fill)
├── Used By: MovieCard (status badges), DiscoverPage (spotlight badge), CollectionsPage (universe badge)
└── Duplicated By: Inline `badge-glow`, `tag-chip`, `collection-badge` spans across pages
```

### Skeleton

```
Skeleton
├── Imports: (none beyond solid-js)
├── CSS Classes: skeleton-base, skeleton-text
├── Design Tokens: --radius-sm, --radius-md
├── Used By: DiscoverSkeleton, WatchlistGrid (via LoadingSkeleton)
└── Duplicated By: ProfileSkeleton (custom), LoadingSkeleton (watchlist), CollectionSkeleton,
                   DetailsSkeleton, sec-skeleton-block (inline in Stats, History, Achievements),
                   inline skeleton-base divs in CollectionDetailPage
```

### SectionHeader

```
SectionHeader
├── Imports: Show
├── CSS Classes: section-header, section-header-title, section-header-action, material-symbols-outlined
├── Design Tokens: --p
├── Used By: DiscoverPage (via DiscoverRail), WatchlistGrid
└── Duplicated By: Section (has its own inline section-header rendering),
                   sec-header (Stats, History, Achievements, Settings use a different CSS class),
                   collections-fold-label (Collections uses yet another pattern)
```

### GlassCard

```
GlassCard
├── Imports: splitProps
├── CSS Classes: surface-glass, surface-glass-strong
├── Design Tokens: (none directly — applied via CSS classes)
├── Used By: (identified in inventory but limited current usage)
└── Duplicated By: insight-card (Stats, Achievements pages use a different glass pattern),
                   modal-surface (AuthModal, CollectionModal use different glass patterns)
```

### Section

```
Section
├── Imports: Show
├── CSS Classes: section-header, section-header-title, section-header-action, type-eyebrow,
│               material-symbols-outlined, mb-4, mb-6, mb-8
├── Design Tokens: --p
├── Used By: DiscoverPage (wrapping DiscoverRail sections)
└── Duplicated By: sec-section (Stats, History, Achievements, Settings — different class, same concept),
                   collections-fold (Collections — different class, same concept),
                   DetailSection (Details — different class, same concept)
```

### EmptyState

```
EmptyState
├── Imports: Show
├── CSS Classes: empty-premium, empty-premium-icon, empty-premium-title, empty-premium-body,
│               btn-primary, focus-ring, material-symbols-outlined
├── Design Tokens: --p, --sp-2
├── Used By: (shared primitive — available for import)
└── Duplicated By: Watchlist EmptyState (feature-local with different props),
                   Discover PremiumEmptyState (feature-local with different props),
                   inline empty-premium markup in Profile (×2), Stats (×2), History (×3),
                   Achievements (×2), Sync (×1), Collections (unsubscribe dialog),
                   CollectionDetail (not-found + error states)
```

---

## Details Components (`src/features/details/`)

---

### DetailsModal (orchestrator)

```
DetailsModal
├── Imports: Portal, useModalState, useVault, useUserLibrary, useDetails,
│           DetailsSkeleton, DetailsError, DetailSection, DetailsEditForm,
│           YourActivityCard, AddToFolderSheet, ConfirmRemoveSheet,
│           DetailsHero, DetailsHeader, DetailsActions, DetailsRatings,
│           DetailsOverview, DetailsMetadata, DetailsCast, DetailsSeasons,
│           DetailsRecommendations, useDetailsForm, useDetailsActions
├── CSS Classes: animate-fade-in, cinematic-ambient, cinematic-modal, cinematic-scroll,
│               cinematic-close-btn
├── Design Tokens: (none directly — delegates to child components)
├── Used By: AppShell (lazy-loaded)
└── Duplicated By: CollectionModal (similar portal + backdrop + scroll architecture)
```

### DetailsHero

```
DetailsHero
├── Imports: CinematicHero, HeroContentCluster
├── CSS Classes: (delegates to CinematicHero)
├── Design Tokens: (delegates to CinematicHero)
├── Used By: DetailsModal
└── Duplicated By: CollectionHero (similar backdrop + overlay pattern)
```

### CinematicHero

```
CinematicHero
├── Imports: SafeImage, tmdbImage
├── CSS Classes: cinematic-hero, cinematic-hero-img, cinematic-hero-gradient
├── Design Tokens: --tier-2, --hairline
├── Used By: DetailsHero
└── Duplicated By: CollectionHero (similar backdrop image + gradient overlay)
```

### HeroContentCluster

```
HeroContentCluster
├── Imports: Badge, Icon
├── CSS Classes: type-body-soft, type-subtitle, badge-glow, badge-accent
├── Design Tokens: --text-dim, --p
├── Used By: DetailsHero
└── Duplicated By: None
```

### DetailsHeader

```
DetailsHeader
├── Imports: Icon, Badge
├── CSS Classes: type-headline, type-body-soft, badge-glow, badge-accent
├── Design Tokens: --p, --text-dim
├── Used By: DetailsModal
└── Duplicated By: None
```

### DetailsActions

```
DetailsActions
├── Imports: ActionDock
├── CSS Classes: (delegates to ActionDock)
├── Design Tokens: (delegates to ActionDock)
├── Used By: DetailsModal
└── Duplicated By: None
```

### ActionDock

```
ActionDock
├── Imports: Icon
├── CSS Classes: action-dock, action-dock-btn, focus-ring, material-symbols-outlined
├── Design Tokens: --p, --p-glow, --hairline, --text-body
├── Used By: DetailsActions
└── Duplicated By: None
```

### DetailsRatings

```
DetailsRatings
├── Imports: RatingCluster
├── CSS Classes: (delegates to RatingCluster)
├── Design Tokens: (delegates to RatingCluster)
├── Used By: DetailsModal
└── Duplicated By: None
```

### RatingCluster

```
RatingCluster
├── Imports: Icon
├── CSS Classes: rating-chip, rating-chip-imdb, rating-chip-rt, rating-chip-user
├── Design Tokens: --p, --p-dim
├── Used By: DetailsRatings
└── Duplicated By: MovieCardRatings (3-source rating chips, simpler layout)
```

### DetailsOverview

```
DetailsOverview
├── Imports: DetailSection
├── CSS Classes: type-body, type-label
├── Design Tokens: --text-body, --text-dim
├── Used By: DetailsModal
└── Duplicated By: None
```

### DetailsCast

```
DetailsCast
├── Imports: DetailSection, SafeImage
├── CSS Classes: cast-grid, cast-card, cast-img, cast-name, cast-role
├── Design Tokens: --hairline
├── Used By: DetailsModal
└── Duplicated By: None
```

### DetailsSeasons

```
DetailsSeasons
├── Imports: Show, SeasonNavigator, EpisodeCard
├── CSS Classes: (delegates to child components)
├── Design Tokens: (delegates to child components)
├── Used By: DetailsModal
└── Duplicated By: None
```

### SeasonNavigator

```
SeasonNavigator
├── Imports: Icon
├── CSS Classes: season-nav, season-btn, focus-ring, material-symbols-outlined
├── Design Tokens: --hairline, --p, --text-body
├── Used By: DetailsSeasons
└── Duplicated By: None
```

### EpisodeCard

```
EpisodeCard
├── Imports: SafeImage, Icon
├── CSS Classes: episode-card, episode-img, material-symbols-outlined, focus-ring
├── Design Tokens: --hairline, --p, --text-dim
├── Used By: DetailsSeasons
└── Duplicated By: None
```

### DetailsMetadata

```
DetailsMetadata
├── Imports: DetailSection, MetadataGrid, FranchiseInfo
├── CSS Classes: (delegates to child components)
├── Design Tokens: (delegates to child components)
├── Used By: DetailsModal
└── Duplicated By: None
```

### MetadataGrid

```
MetadataGrid
├── Imports: Icon
├── CSS Classes: metadata-grid, metadata-cell, metadata-label, metadata-value
├── Design Tokens: --p, --text-dim
├── Used By: DetailsMetadata
└── Duplicated By: None
```

### FranchiseInfo

```
FranchiseInfo
├── Imports: DetailSection, SafeImage, openCollection, tmdbImage
├── CSS Classes: franchise-trigger, focus-ring
├── Design Tokens: --p, --text-body
├── Used By: DetailsMetadata
└── Duplicated By: None
```

### DetailsRecommendations

```
DetailsRecommendations
├── Imports: DetailSection, SimilarTitles
├── CSS Classes: (delegates to SimilarTitles)
├── Design Tokens: (delegates to SimilarTitles)
├── Used By: DetailsModal
└── Duplicated By: None
```

### SimilarTitles

```
SimilarTitles
├── Imports: For, SafeImage, tmdbImage
├── CSS Classes: similar-title-poster-img, similar-title-poster-fallback
├── Design Tokens: --tier-3, --text-dim
├── Used By: DetailsRecommendations
└── Duplicated By: None
```

### DetailSection

```
DetailSection
├── Imports: (none beyond solid-js JSX)
├── CSS Classes: detail-section
├── Design Tokens: (none directly)
├── Used By: DetailsOverview, DetailsCast, DetailsMetadata, DetailsRecommendations,
│           DetailsModal (directly wrapping YourActivityCard and DetailsEditForm)
└── Duplicated By: Section (shared primitive — same concept, different CSS class),
                   sec-section (Stats/History/Achievements/Settings — same concept)
```

### DetailsEditForm

```
DetailsEditForm
├── Imports: (none beyond solid-js)
├── CSS Classes: filter-input-premium, btn-primary, btn-ghost, focus-ring
├── Design Tokens: --sp-2, --sp-3, --sp-4, --radius-md
├── Used By: DetailsModal
└── Duplicated By: None
```

### YourActivityCard

```
YourActivityCard
├── Imports: Icon
├── CSS Classes: activity-card, material-symbols-outlined
├── Design Tokens: --p, --text-dim, --hairline
├── Used By: DetailsModal
└── Duplicated By: None
```

### AddToFolderSheet

```
AddToFolderSheet
├── Imports: Portal, useVault
├── CSS Classes: modal-backdrop, modal-surface, sheet-handle, focus-ring
├── Design Tokens: --radius-xl, --sp-3 through --sp-6
├── Used By: DetailsModal
└── Duplicated By: None
```

### ConfirmRemoveSheet

```
ConfirmRemoveSheet
├── Imports: Portal
├── CSS Classes: modal-backdrop, modal-surface, sheet-handle, btn-primary, btn-ghost, focus-ring
├── Design Tokens: --radius-xl, --sp-3 through --sp-6
├── Used By: DetailsModal
└── Duplicated By: Unsubscribe confirm dialog in CollectionsPage (inline, same pattern)
```

### DetailsSkeleton

```
DetailsSkeleton
├── Imports: (none beyond solid-js)
├── CSS Classes: skeleton-base, skeleton-text
├── Design Tokens: --sp-3, --sp-4, --radius-md
├── Used By: DetailsModal
└── Duplicated By: CollectionSkeleton, ProfileSkeleton, Watchlist LoadingSkeleton,
                   inline skeleton-base divs in CollectionDetailPage
```

### DetailsError

```
DetailsError
├── Imports: Icon
├── CSS Classes: empty-premium, empty-premium-icon, btn-primary, focus-ring
├── Design Tokens: --p, --sp-2
├── Used By: DetailsModal
└── Duplicated By: Inline error fallbacks in Collections, CollectionDetail, Profile routes
```

---

## Discover Components (`src/features/discover/`)

---

### DiscoverPage

```
DiscoverPage
├── Imports: PageContainer, MovieCard, Button, Badge, SectionHeader,
│           useUserLibrary, useDiscoverTaste, useSpotlight, useDiscoverFeeds, useDiscoverActions,
│           Spotlight, DiscoverRail, CosmosView, GenreExplorer, TasteSurface, TrajectoryCard,
│           OttSection, EditorialCard, RelationshipPill, PremiumEmptyState, DiscoverSkeleton, LazyMount
├── CSS Classes: discover-page, ambient-glow, page-enter, btn-primary, focus-ring,
│               material-symbols-outlined, empty-premium
├── Design Tokens: --p, --p-glow, --text-strong, --text-soft, --text-dim, --text-muted,
│               --sp-2 through --sp-10, --tier-2, --tier-3, --hairline, --hairline-2
├── Used By: discover.tsx route (lazy)
└── Duplicated By: None
```

### Spotlight

```
Spotlight
├── Imports: Icon, Badge, tmdbImage, SafeImage
├── CSS Classes: spotlight-card, spotlight-img, spotlight-badge, focus-ring,
│               material-symbols-outlined, badge-glow
├── Design Tokens: --p, --p-glow, --text-strong
├── Used By: DiscoverPage
└── Duplicated By: None
```

### DiscoverRail

```
DiscoverRail
├── Imports: SectionHeader, MovieCard
├── CSS Classes: discover-rail, rail-scroll
├── Design Tokens: (none directly)
├── Used By: DiscoverPage
└── Duplicated By: None
```

### CosmosView

```
CosmosView
├── Imports: useCosmos
├── CSS Classes: cosmos-container, cosmos-node
├── Design Tokens: --p, --p2, --p-glow, --text-muted
├── Used By: DiscoverPage
└── Duplicated By: None
```

### GenreExplorer

```
GenreExplorer
├── Imports: (genre data)
├── CSS Classes: genre-grid, genre-pill
├── Design Tokens: --p, --hairline
├── Used By: DiscoverPage
└── Duplicated By: None
```

### TasteSurface

```
TasteSurface
├── Imports: useTasteSurfaces
├── CSS Classes: taste-surface
├── Design Tokens: --p, --hairline
├── Used By: DiscoverPage
└── Duplicated By: None
```

### TrajectoryCard

```
TrajectoryCard
├── Imports: Icon, Badge
├── CSS Classes: trajectory-card, badge-accent
├── Design Tokens: --p, --text-dim
├── Used By: DiscoverPage
└── Duplicated By: None
```

### OttSection

```
OttSection
├── Imports: DiscoverRail, ottProviderRegistry
├── CSS Classes: ott-chips, ott-chip
├── Design Tokens: --p, --hairline
├── Used By: DiscoverPage
└── Duplicated By: None
```

### EditorialCard

```
EditorialCard
├── Imports: Icon
├── CSS Classes: editorial-card, material-symbols-outlined
├── Design Tokens: --p, --text-soft
├── Used By: DiscoverPage
└── Duplicated By: None
```

### RelationshipPill

```
RelationshipPill
├── Imports: (none beyond solid-js)
├── CSS Classes: relationship-pill
├── Design Tokens: --p
├── Used By: DiscoverPage
└── Duplicated By: None
```

### PremiumEmptyState

```
PremiumEmptyState
├── Imports: Button
├── CSS Classes: empty-premium
├── Design Tokens: --p, --sp-2
├── Used By: DiscoverPage
└── Duplicated By: shared EmptyState primitive (same concept, different API surface)
```

### DiscoverSkeleton

```
DiscoverSkeleton
├── Imports: Skeleton
├── CSS Classes: discover-skeleton
├── Design Tokens: (delegates to Skeleton)
├── Used By: DiscoverPage
└── Duplicated By: ProfileSkeleton, LoadingSkeleton (watchlist), CollectionSkeleton, DetailsSkeleton
```

### LazyMount

```
LazyMount
├── Imports: createSignal, onMount, onCleanup, Show
├── CSS Classes: (none)
├── Design Tokens: (none)
├── Used By: DiscoverPage (wrapping below-the-fold sections)
└── Duplicated By: None — should be shared (generic IntersectionObserver-based mount deferral)
```

---

## Watchlist Components (`src/features/watchlist/`)

---

### WatchlistView

```
WatchlistView
├── Imports: PageContainer, ScrollToTop, useModalState, useAuthModal,
│           useVault, useVaultSections, useVaultFiltering,
│           WatchlistHeader, WatchlistStats, WatchlistGrid, WatchlistDialogs,
│           EmptyState (local), LoadingSkeleton (local)
├── CSS Classes: (none directly — delegates to child components)
├── Design Tokens: --sp-12
├── Used By: watchlist.tsx route (lazy)
└── Duplicated By: None
```

### WatchlistHeader

```
WatchlistHeader
├── Imports: VaultHeader, QuickFilterTabs, VaultSearch, FilterControls, Icon
├── CSS Classes: (delegates to child components)
├── Design Tokens: (delegates to child components)
├── Used By: WatchlistView
└── Duplicated By: None (but search + filter pattern is similar to HistoryPage inline)
```

### WatchlistStats

```
WatchlistStats
├── Imports: Icon
├── CSS Classes: vault-stats, material-symbols-outlined
├── Design Tokens: --text-muted, --p
├── Used By: WatchlistView
└── Duplicated By: None
```

### WatchlistGrid

```
WatchlistGrid
├── Imports: VaultGrid, VaultShelf, EmptyState (local), MovieCard, Icon
├── CSS Classes: (delegates to child components)
├── Design Tokens: (delegates to child components)
├── Used By: WatchlistView
└── Duplicated By: None
```

### WatchlistDialogs

```
WatchlistDialogs
├── Imports: VaultFilters, VaultFiltersContent
├── CSS Classes: modal-backdrop, modal-surface, sheet-handle
├── Design Tokens: --radius-xl, --sp-3 through --sp-6
├── Used By: WatchlistView
└── Duplicated By: None
```

### EmptyState (watchlist-local)

```
EmptyState (watchlist)
├── Imports: Button, Icon
├── CSS Classes: empty-premium, empty-premium-icon, empty-premium-title, empty-premium-body,
│               btn-primary, focus-ring, material-symbols-outlined
├── Design Tokens: --p, --sp-2
├── Used By: WatchlistGrid
└── Duplicated By: shared EmptyState primitive (exact same concept, different props interface)
```

### LoadingSkeleton (watchlist-local)

```
LoadingSkeleton
├── Imports: Skeleton
├── CSS Classes: skeleton-base, skeleton-text
├── Design Tokens: (delegates to Skeleton)
├── Used By: WatchlistView
└── Duplicated By: ProfileSkeleton, DiscoverSkeleton, CollectionSkeleton, DetailsSkeleton
```

### VaultCard

```
VaultCard
├── Imports: MovieCard, Icon
├── CSS Classes: vault-card, status-badge-planned, status-badge-watching, status-badge-completed
├── Design Tokens: --p, --text-dim
├── Used By: VaultGrid, VaultShelf
└── Duplicated By: None (wraps MovieCard with vault-specific badges)
```

### VaultGrid

```
VaultGrid
├── Imports: VaultCard
├── CSS Classes: vault-grid
├── Design Tokens: (none)
├── Used By: WatchlistGrid
└── Duplicated By: None
```

### VaultShelf

```
VaultShelf
├── Imports: VaultCard, SectionHeader
├── CSS Classes: vault-shelf, rail-scroll
├── Design Tokens: (none)
├── Used By: WatchlistGrid
└── Duplicated By: None
```

### VaultFilters

```
VaultFilters
├── Imports: VaultFiltersContent
├── CSS Classes: modal-surface, sheet-handle
├── Design Tokens: --radius-xl
├── Used By: WatchlistDialogs
└── Duplicated By: None
```

### VaultFiltersContent

```
VaultFiltersContent
├── Imports: FilterControls
├── CSS Classes: filter-group, filter-input-premium, focus-ring
├── Design Tokens: --sp-2, --sp-3
├── Used By: VaultFilters
└── Duplicated By: None
```

### VaultSearch

```
VaultSearch
├── Imports: Icon
├── CSS Classes: search-premium, filter-input-premium, search-bar-clear, focus-ring
├── Design Tokens: --text-muted
├── Used By: WatchlistHeader
└── Duplicated By: HistoryPage inline search bar (same pattern, different component)
```

### QuickFilterTabs

```
QuickFilterTabs
├── Imports: (none beyond solid-js)
├── CSS Classes: quick-filter-bar, quick-filter-tab, focus-ring
├── Design Tokens: --p, --text-muted, --hairline
├── Used By: WatchlistHeader
└── Duplicated By: HistoryPage inline filter tabs (same pattern, inline markup)
```

### FilterControls

```
FilterControls
├── Imports: (none beyond solid-js)
├── CSS Classes: filter-chip, filter-chip-active, focus-ring
├── Design Tokens: --p, --hairline
├── Used By: VaultFiltersContent
└── Duplicated By: None
```

### VaultHeader

```
VaultHeader
├── Imports: (none beyond solid-js)
├── CSS Classes: vault-header, material-symbols-outlined
├── Design Tokens: --p, --text-muted
├── Used By: WatchlistHeader
└── Duplicated By: None
```

---

## Collections Components (`src/features/collections/`)

---

### CollectionsPage

```
CollectionsPage
├── Imports: PageContainer, ScrollToTop, useVault, useCollections, useCuratedUniverses,
│           useUniversePrefs, useToast, tmdbImage, FolderEditor, SmartCollectionBuilder,
│           CollectionsGrid, AddUniverseModal (lazy)
├── CSS Classes: ambient-glow, page-enter, collections-eyebrow-block, collections-eyebrow,
│               collections-page-title, collections-page-subtitle, collections-fold,
│               collections-fold-label, collections-fold-action, collections-smart-btn,
│               collections-create-bar, collections-create-input, btn-primary, btn-ghost,
│               focus-ring, collection-card, collection-card-collage-area, collection-card-empty-art,
│               collection-card-badges, collection-badge, collection-card-menu,
│               collection-card-info, collection-card-name, collection-card-desc,
│               collection-card-stats, modal-surface, material-symbols-outlined,
│               collage-grid-4, collage-img, empty-premium-icon, empty-premium-title,
│               empty-premium-desc, btn-primary, setting-row-danger
├── Design Tokens: --sp-2 through --sp-8, --p, --p-glow, --text-dim, --text-soft,
│               --text-body, --text-strong, --hairline, --radius-xl, --sp-5
├── Used By: collections/index.tsx route
└── Duplicated By: None (but 300+ lines of inline markup that should be components)
```

### CollectionDetailPage

```
CollectionDetailPage
├── Imports: PageContainer, ScrollToTop, useVault, useCollections, useModalState,
│           fetchCuratedUniverseBySlug, UniverseDashboard, TimelineEngine
├── CSS Classes: ambient-glow, page-enter, skeleton-base, collections-back-btn,
│               collections-detail-empty, btn-ghost, type-body-soft, material-symbols-outlined
├── Design Tokens: --sp-4, --sp-12, --p, --text-soft
├── Used By: collections/[id]/index.tsx route
└── Duplicated By: None
```

### UniverseEditPage

```
UniverseEditPage
├── Imports: UniverseEditEntry, useCollections, useUniversePrefs
├── CSS Classes: (drag-and-drop timeline editor)
├── Design Tokens: --p, --hairline, --text-body
├── Used By: collections/[id]/edit.tsx route
└── Duplicated By: None
```

### UniverseDashboard

```
UniverseDashboard
├── Imports: ProgressRing, Icon
├── CSS Classes: universe-dashboard, universe-hero, universe-stats
├── Design Tokens: --p, --p-glow, --text-strong, --text-body
├── Used By: CollectionDetailPage
└── Duplicated By: CollectionStats (similar stat cards), StatsPage stat-grid (similar stat cells)
```

### TimelineEngine

```
TimelineEngine
├── Imports: TimelineEntry, SectionHeader
├── CSS Classes: timeline-engine, timeline-scroll
├── Design Tokens: --p, --hairline
├── Used By: CollectionDetailPage
└── Duplicated By: None
```

### TimelineEntry

```
TimelineEntry
├── Imports: MovieCard (compact variant), Icon
├── CSS Classes: timeline-entry, timeline-connector, material-symbols-outlined
├── Design Tokens: --p, --text-dim, --hairline
├── Used By: TimelineEngine
└── Duplicated By: HistoryPage history-item (similar timeline row concept)
```

### CollectionsGrid

```
CollectionsGrid
├── Imports: (none beyond solid-js)
├── CSS Classes: collections-folder-grid, collection-card, empty-premium
├── Design Tokens: --p, --text-dim
├── Used By: CollectionsPage
└── Duplicated By: None
```

### ProgressRing

```
ProgressRing
├── Imports: (none — pure SVG)
├── CSS Classes: progress-ring
├── Design Tokens: --p, --p2
├── Used By: UniverseDashboard
└── Duplicated By: None — should be shared (needed by Stats, Achievements, Collection)
```

### FolderEditor

```
FolderEditor
├── Imports: Portal
├── CSS Classes: modal-backdrop, modal-surface, filter-input-premium, btn-primary, btn-ghost,
│               focus-ring, material-symbols-outlined
├── Design Tokens: --radius-xl, --sp-3 through --sp-6
├── Used By: CollectionsPage
└── Duplicated By: None
```

### SmartCollectionBuilder

```
SmartCollectionBuilder
├── Imports: Portal
├── CSS Classes: modal-surface, filter-input-premium, btn-primary, btn-ghost, focus-ring
├── Design Tokens: --radius-xl, --sp-3 through --sp-6
├── Used By: CollectionsPage
└── Duplicated By: None
```

### AddUniverseModal

```
AddUniverseModal
├── Imports: Portal, useCuratedUniverses
├── CSS Classes: modal-backdrop, modal-surface, sheet-handle
├── Design Tokens: --radius-xl, --sp-3 through --sp-6
├── Used By: CollectionsPage (lazy)
└── Duplicated By: None
```

---

## Collection (singular) Components (`src/features/collection/`)

---

### CollectionModal

```
CollectionModal
├── Imports: Portal, tmdbImage, findInVault, useCollectionModal, useModalState, useVault,
│           normalizeGenres, fetchFranchiseTitles, CollectionHero, CollectionStats,
│           CollectionTimeline, CollectionSkeleton
├── CSS Classes: collection-modal, collection-modal-scroll, collection-error, animate-fade-in,
│               btn-ghost, type-body-soft
├── Design Tokens: (none directly)
├── Used By: AppShell (lazy-loaded)
└── Duplicated By: DetailsModal (similar portal + backdrop + scroll architecture)
```

### CollectionHero

```
CollectionHero
├── Imports: ProgressRing, tmdbImage
├── CSS Classes: collection-hero, collection-hero-img, collection-hero-overlay,
│               collection-hero-close, material-symbols-outlined, focus-ring
├── Design Tokens: --p, --text-strong
├── Used By: CollectionModal
└── Duplicated By: CinematicHero (Details page — same backdrop image + gradient overlay)
```

### CollectionStats

```
CollectionStats
├── Imports: (none beyond solid-js)
├── CSS Classes: collection-stats-grid, collection-stat-cell
├── Design Tokens: --p, --text-body, --hairline
├── Used By: CollectionModal
└── Duplicated By: UniverseDashboard stats (similar stat cards)
```

### CollectionTimeline

```
CollectionTimeline
├── Imports: MovieCard (compact), Icon
├── CSS Classes: collection-timeline, collection-timeline-item, material-symbols-outlined
├── Design Tokens: --p, --text-dim
├── Used By: CollectionModal
└── Duplicated By: TimelineEngine/TimelineEntry (Collections — same concept)
```

### CollectionSkeleton

```
CollectionSkeleton
├── Imports: (none beyond solid-js)
├── CSS Classes: skeleton-base, skeleton-text
├── Design Tokens: --sp-4, --radius-md
├── Used By: CollectionModal
└── Duplicated By: DetailsSkeleton, ProfileSkeleton, DiscoverSkeleton, LoadingSkeleton
```

---

## Profile Components (`src/features/profile/`)

---

### ProfilePage

```
ProfilePage
├── Imports: PageContainer, Button, useAuth, useAuthModal, useToast, useProfileData,
│           useUsernameCheck, validateUsername, sanitizeUsername,
│           ProfileBanner, BannerEditor, TasteCard, ProfileCompletion,
│           WatchlistSummary, QuickLinks, ProfileSkeleton, FavoritesPicker
├── CSS Classes: profile-page, profile-fade-in, profile-section, profile-content,
│               profile-avatar-wrap, profile-avatar, profile-avatar-fallback, img-loaded,
│               profile-identity, profile-name-row, profile-display-name, profile-display-name-input,
│               profile-edit-actions, profile-username, profile-username-edit-wrap,
│               profile-username-input-row, profile-username-input, profile-username-at,
│               profile-username-validation, profile-username-validation-icon,
│               profile-tagline, profile-tagline-input, profile-member-since,
│               profile-section-eyebrow, empty-premium, empty-premium-icon, empty-premium-title,
│               empty-premium-body, material-symbols-outlined, focus-ring
├── Design Tokens: --sp-2 through --sp-12, --p, --p-dim, --text-strong, --text-soft,
│               --text-body, --text-dim, --hairline
├── Used By: profile/index.tsx route
└── Duplicated By: None
```

### ProfileBanner

```
ProfileBanner
├── Imports: tmdbImage
├── CSS Classes: profile-banner, profile-banner-img, profile-banner-overlay,
│               profile-banner-edit-btn, material-symbols-outlined, focus-ring
├── Design Tokens: --p, --text-body, --hairline
├── Used By: ProfilePage
└── Duplicated By: CinematicHero (Details), CollectionHero (Collection) — all use similar
                   backdrop + gradient overlay pattern
```

### BannerEditor

```
BannerEditor
├── Imports: Portal, imageCompress, useProfileData
├── CSS Classes: modal-backdrop, modal-surface, sheet-handle
├── Design Tokens: --radius-xl, --sp-3 through --sp-6
├── Used By: ProfilePage
└── Duplicated By: None
```

### TasteCard

```
TasteCard
├── Imports: Icon
├── CSS Classes: taste-card, taste-tile, taste-tile-edit, material-symbols-outlined
├── Design Tokens: --p, --text-dim, --hairline
├── Used By: ProfilePage
└── Duplicated By: None
```

### ProfileCompletion

```
ProfileCompletion
├── Imports: Icon
├── CSS Classes: profile-completion, completion-item, material-symbols-outlined
├── Design Tokens: --p, --text-dim, --hairline
├── Used By: ProfilePage
└── Duplicated By: None
```

### WatchlistSummary

```
WatchlistSummary
├── Imports: (none beyond solid-js)
├── CSS Classes: watchlist-summary
├── Design Tokens: --p
├── Used By: ProfilePage
└── Duplicated By: None
```

### QuickLinks

```
QuickLinks
├── Imports: (none beyond solid-js)
├── CSS Classes: quick-links, quick-link, focus-ring, material-symbols-outlined
├── Design Tokens: --p, --text-body
├── Used By: ProfilePage
└── Duplicated By: None
```

### ProfileSkeleton

```
ProfileSkeleton
├── Imports: (none beyond solid-js)
├── CSS Classes: skeleton-base, skeleton-text
├── Design Tokens: --sp-4, --radius-md
├── Used By: ProfilePage
└── Duplicated By: DetailsSkeleton, DiscoverSkeleton, LoadingSkeleton, CollectionSkeleton
```

### FavoritesPicker

```
FavoritesPicker
├── Imports: Portal, useSearch, tmdbImage, Icon
├── CSS Classes: modal-backdrop, modal-surface, sheet-handle, filter-input-premium,
│               focus-ring, material-symbols-outlined
├── Design Tokens: --radius-xl, --sp-3 through --sp-6, --p, --text-dim
├── Used By: ProfilePage
└── Duplicated By: None
```

### StatsPage

```
StatsPage
├── Imports: PageContainer, useStats, useAuth, tmdbImage
├── CSS Classes: sec-page, sec-fade-in, sec-header, sec-back, sec-eyebrow, sec-title,
│               sec-subtitle, sec-body, sec-section, sec-section-label, sec-skeleton-block,
│               stat-hero, stat-hero-label, stat-hero-value, stat-hero-sub,
│               stat-grid, stat-cell, stat-cell-value, stat-cell-value-accent, stat-cell-label,
│               stat-cell-sub, insight-card, insight-card-header, insight-card-icon,
│               insight-card-title, insight-card-body, ratio-bar, ratio-bar-segment,
│               ratio-bar-movie, ratio-bar-tv, ratio-labels, ratio-label, genre-bars,
│               genre-bar-row, genre-bar-name, genre-bar-track, genre-bar-fill, genre-bar-count,
│               decade-grid, decade-cell, decade-cell-year, decade-cell-count,
│               heatmap, heatmap-row, heatmap-cell, heatmap-cell-1 through heatmap-cell-4,
│               heatmap-legend, empty-premium, empty-premium-icon, empty-premium-title,
│               empty-premium-body, btn-primary, focus-ring, material-symbols-outlined,
│               type-headline, accent
├── Design Tokens: --p, --p2, --p-glow, --sp-2 through --sp-8, --text-strong, --text-body,
│               --text-soft, --text-dim, --text-muted, --hairline, --radius-sm,
│               --tier-3, --ease-smooth
├── Used By: profile/stats.tsx route
└── Duplicated By: 0 component decomposition — ALL patterns inline
```

### HistoryPage

```
HistoryPage
├── Imports: PageContainer, useUserLibrary, useAuth, tmdbImage
├── CSS Classes: sec-page, sec-fade-in, sec-header, sec-back, sec-eyebrow, sec-title,
│               sec-subtitle, sec-body, sec-skeleton-block, search-premium, filter-input-premium,
│               search-bar-clear, quick-filter-bar, quick-filter-tab, focus-ring,
│               history-group, history-group-header, history-group-title, history-group-count,
│               history-list, history-item, history-poster, history-poster-fallback,
│               history-poster-img, history-info, history-title, history-meta,
│               history-rating, history-status, history-status-completed,
│               history-status-watching, history-status-planned,
│               empty-premium, empty-premium-icon, empty-premium-title, empty-premium-body,
│               material-symbols-outlined
├── Design Tokens: --sp-2 through --sp-8, --p, --text-muted, --hairline
├── Used By: profile/history.tsx route
└── Duplicated By: 0 component decomposition — ALL patterns inline
```

### AchievementsPage

```
AchievementsPage
├── Imports: PageContainer, useUserLibrary, useAuth, hasGenre, collectGenres
├── CSS Classes: sec-page, sec-fade-in, sec-header, sec-back, sec-eyebrow, sec-title,
│               sec-subtitle, sec-body, sec-skeleton-block, sec-stagger,
│               achievement-grid, achievement-card, achievement-card-unlocked,
│               achievement-card-locked, achievement-icon-wrap, achievement-title,
│               achievement-desc, achievement-progress, achievement-progress-bar,
│               achievement-progress-fill, achievement-progress-text,
│               insight-card, insight-card-header, insight-card-icon, insight-card-title,
│               insight-card-body, accent,
│               empty-premium, empty-premium-icon, empty-premium-title, empty-premium-body,
│               material-symbols-outlined
├── Design Tokens: --p, --sp-2 through --sp-6, --hairline
├── Used By: profile/achievements.tsx route
└── Duplicated By: 0 component decomposition — ALL patterns inline
```

---

## Search Components (`src/features/search/`)

---

### SearchPage

```
SearchPage
├── Imports: PageContainer, ScrollToTop, useVault (cross-feature), useToast, useModalState,
│           useAuthModal, getCurrentUid, createVaultItemInSupabase (cross-feature),
│           normalizeGenres, useSearch, SearchHeader, SearchGrid, SearchResults, SearchFilters
├── CSS Classes: (none directly — delegates to child components)
├── Design Tokens: --sp-12
├── Used By: search.tsx route (lazy)
└── Duplicated By: None
```

### SearchHeader

```
SearchHeader
├── Imports: Icon
├── CSS Classes: search-premium, filter-input-premium, search-bar-clear, focus-ring
├── Design Tokens: --text-muted
├── Used By: SearchPage
└── Duplicated By: VaultSearch (Watchlist), HistoryPage inline search bar
```

### SearchGrid

```
SearchGrid
├── Imports: (genre data)
├── CSS Classes: search-genre-grid, genre-pill
├── Design Tokens: --p, --hairline
├── Used By: SearchPage
└── Duplicated By: None
```

### SearchResults

```
SearchResults
├── Imports: SearchResultRow, SearchLoading, SearchEmptyState
├── CSS Classes: search-results-list
├── Design Tokens: (delegates to child components)
├── Used By: SearchPage
└── Duplicated By: None
```

### SearchFilters

```
SearchFilters
├── Imports: SearchResultRow, MovieCard (compact)
├── CSS Classes: search-filters-page
├── Design Tokens: (delegates to child components)
├── Used By: SearchPage
└── Duplicated By: None
```

### SearchResultRow

```
SearchResultRow
├── Imports: HighlightText, tmdbImage, Icon
├── CSS Classes: search-result-row, search-result-poster, search-result-info,
│               search-result-title, search-result-meta, btn-primary, btn-ghost,
│               focus-ring, material-symbols-outlined
├── Design Tokens: --p, --text-dim, --hairline, --sp-1, --sp-2
├── Used By: SearchResults, SearchFilters
└── Duplicated By: None
```

### SearchLoading

```
SearchLoading
├── Imports: Skeleton
├── CSS Classes: skeleton-base, skeleton-text
├── Design Tokens: (delegates to Skeleton)
├── Used By: SearchResults
└── Duplicated By: All other skeleton components
```

### SearchEmptyState

```
SearchEmptyState
├── Imports: Icon
├── CSS Classes: empty-premium, empty-premium-icon, empty-premium-title, empty-premium-body
├── Design Tokens: --p
├── Used By: SearchResults
└── Duplicated By: All other empty state implementations
```

---

## Settings/Sync Components (`src/features/settings/`, `src/features/sync/`)

---

### SettingsPage

```
SettingsPage
├── Imports: PageContainer, signOut, useNavigate
├── CSS Classes: sec-page, sec-fade-in, sec-header, sec-back, sec-eyebrow, sec-title,
│               sec-subtitle, sec-body, sec-section, sec-section-label, setting-group,
│               setting-row, setting-row-icon, setting-row-text, setting-row-label,
│               setting-row-desc, setting-row-chevron, setting-row-danger, focus-ring,
│               material-symbols-outlined
├── Design Tokens: --p, --text-body, --text-dim, --hairline, --sp-2 through --sp-12
├── Used By: settings/index.tsx route
└── Duplicated By: None (but setting-row pattern is repeated in all settings sub-pages)
```

### SyncRoute

```
SyncRoute
├── Imports: PageContainer, Button, useAuth, useAuthModal,
│           CloudStatusCard, ImportHub, BackupCards, DevicesCard,
│           SyncHistoryTimeline, StorageStats, PrivacyCard, DangerZoneCard
├── CSS Classes: sec-page, sec-fade-in, sec-header, sec-back, sec-eyebrow, sec-title,
│               sec-subtitle, sec-body, sec-section, sec-section-label, sec-section-label-danger,
│               sync-guest, sync-guest-icon, sync-guest-title, sync-guest-body,
│               btn-primary, focus-ring, material-symbols-outlined
├── Design Tokens: --p, --sp-2
├── Used By: settings/sync.tsx route
└── Duplicated By: None (well-factored into sub-components)
```

### CloudStatusCard

```
CloudStatusCard
├── Imports: (supabase status hooks)
├── CSS Classes: insight-card, insight-card-header, insight-card-icon, insight-card-title,
│               insight-card-body, material-symbols-outlined
├── Design Tokens: --p, --sp-2, --sp-3
├── Used By: SyncRoute
└── Duplicated By: insight-card pattern in StatsPage and AchievementsPage (inline)
```

### ImportHub

```
ImportHub
├── Imports: ImportSource registry, JsonImportWizard
├── CSS Classes: import-hub
├── Design Tokens: (none directly)
├── Used By: SyncRoute
└── Duplicated By: None
```

### BackupCards

```
BackupCards
├── Imports: BackupService
├── CSS Classes: backup-cards
├── Design Tokens: (none directly)
├── Used By: SyncRoute
└── Duplicated By: None
```

### DevicesCard

```
DevicesCard
├── Imports: (supabase session hooks)
├── CSS Classes: insight-card
├── Design Tokens: --p, --hairline
├── Used By: SyncRoute
└── Duplicated By: None
```

### SyncHistoryTimeline

```
SyncHistoryTimeline
├── Imports: useSyncHistory
├── CSS Classes: sync-timeline
├── Design Tokens: --p, --text-muted
├── Used By: SyncRoute
└── Duplicated By: None
```

### StorageStats

```
StorageStats
├── Imports: (supabase data hooks)
├── CSS Classes: insight-card
├── Design Tokens: --p
├── Used By: SyncRoute
└── Duplicated By: None
```

### PrivacyCard

```
PrivacyCard
├── Imports: (none beyond solid-js)
├── CSS Classes: insight-card
├── Design Tokens: --p, --text-body
├── Used By: SyncRoute
└── Duplicated By: None
```

### DangerZoneCard

```
DangerZoneCard
├── Imports: ResetConfirmSheet
├── CSS Classes: insight-card, setting-row-danger
├── Design Tokens: --p, #f87171 (danger red)
├── Used By: SyncRoute
└── Duplicated By: None
```

### ResetConfirmSheet

```
ResetConfirmSheet
├── Imports: Portal
├── CSS Classes: modal-backdrop, modal-surface, btn-primary, btn-ghost, focus-ring
├── Design Tokens: --radius-xl, --sp-3 through --sp-6
├── Used By: DangerZoneCard
└── Duplicated By: ConfirmRemoveSheet (Details), Unsubscribe dialog (Collections) — same pattern
```

---

## App Shell (`src/app/AppShell.tsx`)

---

### AppShell

```
AppShell
├── Imports: AppHeader, BottomNavigation, ToastContainer, AuthModal,
│           useModalState, useCollectionModal, useAuthModal,
│           DetailsModal (lazy), CollectionModal (lazy)
├── CSS Classes: min-h-screen, bg-black, text-white
├── Design Tokens: --nav-total-height
├── Used By: app.tsx (root layout)
└── Duplicated By: None (single root shell)
```

---

# PART 3: CROSS-CUTTING DEPENDENCIES

Dependencies that are shared across many components and pages, creating coupling points that affect the entire application.

---

## Hooks

### useAuth

```
useAuth
├── Provides: { user, authReady, isSignedIn }
├── Internal: onSessionChange, getSession, ensureProfile
├── Used By: AppHeader, ProfilePage, StatsPage, HistoryPage, AchievementsPage, SyncRoute,
│           DiscoverPage (via useUserLibrary), WatchlistView (via useVault),
│           SearchPage (via useVault → useAuth indirectly)
├── Also: getCurrentUid() — non-reactive accessor used by SearchPage, vaultAdapter
└── Coupling: Module-level signals — shared state across ALL consumers
```

### useToast

```
useToast
├── Provides: { toasts, showToast, dismiss }
├── Used By: ToastContainer, CollectionsPage, SearchPage, ProfilePage, DiscoverPage
├── Coupling: Module-level signals — single global toast stack
└── Risk: Low — well-isolated, single responsibility
```

### useModalState

```
useModalState
├── Provides: { selectedItem, openTitle, closeTitle, setSelectedItem }
├── Internal: findInVault, history.pushState/popstate
├── Used By: AppShell (reads selectedItem to mount DetailsModal),
│           WatchlistView (opens titles), SearchPage (opens titles),
│           CollectionDetailPage (opens entries), DetailsModal (reads selectedItem),
│           CollectionModal (opens titles from franchise)
├── Also Exported: setSelectedItem (direct) — used by useDetailsActions for title switching
└── Coupling: Module-level signals — global modal state; tight coupling with AppShell render logic
```

### useCollectionModal

```
useCollectionModal
├── Provides: { collectionSelectedItem, openCollection, closeCollection }
├── Used By: AppShell (reads to mount CollectionModal),
│           FranchiseInfo (opens collection), CollectionModal (reads selectedItem)
├── Coupling: Module-level signals — parallel pattern to useModalState
└── Risk: Low — mirrors useModalState pattern correctly
```

### useAuthModal

```
useAuthModal
├── Provides: { authModalOpen, openAuthModal, closeAuthModal }
├── Used By: AppHeader, WatchlistView, SearchPage, ProfilePage, SyncRoute,
│           AppShell (renders AuthModal)
├── Coupling: Module-level signals — global modal state
└── Risk: Low — simple boolean signal
```

### useVault (cross-feature import)

```
useVault
├── Location: features/watchlist/useVault
├── Provides: { watchlist, loading, isGuest, error, refresh }
├── Used By: WatchlistView, SearchPage, CollectionsPage, CollectionDetailPage,
│           DetailsModal, CollectionModal
├── Coupling Risk: HIGH — watchlist feature is imported by 4+ other features,
│           creating a dependency DAG where other features depend on the watchlist module
└── Note: Should be in shared/ or a dedicated data layer to avoid feature→feature coupling
```

### useUserLibrary

```
useUserLibrary
├── Location: shared/hooks/useUserLibrary
├── Provides: { watchlist, loading, refresh }
├── Used By: DiscoverPage, DetailsModal, HistoryPage, AchievementsPage
├── Coupling: Medium — shared location is correct, but overlaps with useVault
└── Note: Dual data access paths (useVault vs useUserLibrary) create confusion
```

---

## Shared CSS Classes (Cross-Feature)

| CSS Class | Defined In | Used By (Pages/Components) | Coupling Risk |
|-----------|-----------|---------------------------|---------------|
| `empty-premium` | globals.css | Stats, History, Achievements, Profile (×3), Sync, Collections (×2), CollectionDetail, Search, Discover | **High** — 10+ consumers, no shared component |
| `empty-premium-icon` | globals.css | Same as above | **High** |
| `empty-premium-title` | globals.css | Same as above | **High** |
| `empty-premium-body` | globals.css | Same as above | **High** |
| `skeleton-base` | globals.css | Details, Collection, Profile, Discover, Watchlist, CollectionDetail (inline) | **High** |
| `skeleton-text` | globals.css | Same as above | **High** |
| `btn-primary` | globals.css | AuthModal, GlobalErrorBoundary, Collections, CollectionDetail, Profile, Settings, Stats, Sync | **High** — 10+ consumers |
| `btn-ghost` | globals.css | Same as btn-primary | **High** |
| `focus-ring` | globals.css | Virtually every interactive element | **Critical** — universal |
| `filter-input-premium` | globals.css | AuthModal, VaultFilters, WatchlistHeader, SearchHeader, History, Profile, FavoritesPicker, Collections, FolderEditor, SmartCollectionBuilder | **High** |
| `material-symbols-outlined` | Google Fonts CDN | ~40 inline spans + Icon component | **Critical** — universal |
| `sec-page` | globals.css | Stats, History, Achievements, Settings, Sync | **Medium** — 5 pages, same layout pattern |
| `sec-header` | globals.css | Same as sec-page | **Medium** |
| `sec-section` | globals.css | Same as sec-page | **Medium** |
| `insight-card` | globals.css | Stats, Achievements, Sync (CloudStatus, Storage, Privacy, Devices, Danger) | **High** — cross-feature |
| `modal-surface` | globals.css | AuthModal, FolderEditor, SmartCollectionBuilder, VaultFilters, AddToFolderSheet, ConfirmRemoveSheet, CollectionsPage, ResetConfirmSheet | **High** |
| `page-enter` | globals.css | Collections, CollectionDetail | **Low** — 2 pages |
| `animate-fade-in` | globals.css | DetailsModal, CollectionModal, Collections unsubscribe dialog | **Low** |
| `search-premium` | globals.css | Watchlist (VaultSearch), History, Search (SearchHeader) | **Medium** — 3 features |
| `quick-filter-bar` | globals.css | Watchlist (QuickFilterTabs), History | **Medium** — 2 features, 1 is component, 1 is inline |

---

## Design Token References (Cross-Feature)

| Token | Referenced By | Frequency |
|-------|--------------|-----------|
| `--p` | Virtually every component | **~50+** references |
| `--p-glow` | Spotlight, LoadingScreen, NavButton, UniverseDashboard, Stats, CosmosView | **~10** |
| `--p2` | Stats, ProgressRing | **~3** |
| `--p-dim` | AppHeader, RatingCluster, MovieCardRatings | **~3** |
| `--hairline` | AppHeader, AuthModal, BottomNavigation, DetailsEditForm, History, GenreExplorer, FilterControls, VaultHeader, QuickFilterTabs, Settings, Collections, Profile | **~15+** |
| `--hairline-2` | AppHeader, GlobalErrorBoundary, LoadingScreen, CinematicHero | **~5** |
| `--text-strong` | AppHeader, GlobalErrorBoundary, LoadingScreen, Profile, Collections, Stats | **~10** |
| `--text-body` | AppHeader, ActionDock, Settings, Profile, Collections | **~8** |
| `--text-soft` | AuthModal, GlobalErrorBoundary, Profile, Collections | **~6** |
| `--text-muted` | AuthModal, BottomNavigation, NavButton, Search, Watchlist, History, Stats | **~10** |
| `--text-dim` | MovieCard, Stats, History, MetadataGrid, DetailsOverview | **~8** |
| `--tier-1` | BottomNavigation | **1** |
| `--tier-2` | MovieCard, GlobalErrorBoundary, LoadingScreen, CinematicHero | **~5** |
| `--tier-3` | MovieCard, Stats, SimilarTitles | **~3** |
| `--void` | GlobalErrorBoundary, LoadingScreen | **2** |
| `--sp-*` (spacing scale) | Virtually every component | **~100+** total |
| `--radius-*` | AuthModal, DetailsEditForm, Skeleton, Modals, Profile | **~15+** |
| `--dur-base` | AppHeader, NavButton, ToastContainer, useToast | **~5** |
| `--dur-fast` | AppHeader, NavButton, AuthModal | **~4** |
| `--ease-out` | AppHeader, NavButton, ToastContainer | **~4** |
| `--ease-spring` | AppHeader, NavButton, AuthModal | **~4** |
| `--nav-total-height` | BottomNavigation, AppShell | **2** |
| `--nav-safe-area` | BottomNavigation, NavButton | **2** |
| `--shadow-elevated` | GlobalErrorBoundary, LoadingScreen | **2** |

---

## Shared Patterns (Not Yet Extracted)

| Pattern | Found In | Should Be |
|---------|----------|-----------|
| Shimmer animation | skeleton-base, skeleton-text CSS classes | ✅ Already extracted to CSS (used via Skeleton primitive) |
| Glass/blur surface | surface-glass, modal-surface, insight-card, cinelog-hero gradient | Multiple CSS classes with similar backdrop-filter values — should unify |
| Status color mapping | status-badge-planned/watching/completed, history-status-planned/watching/completed | Duplicated status→color mapping in MovieCard and HistoryPage — extract to shared utility |
| Font family strings | `'Bebas Neue', sans-serif`, `'Outfit', sans-serif`, `'Azeret Mono', monospace` | Repeated ~30+ times as inline styles — should be CSS custom properties or type-* classes |
| Modal portal pattern | AuthModal, FolderEditor, SmartCollectionBuilder, AddUniverseModal, AddToFolderSheet, ConfirmRemoveSheet, ResetConfirmSheet, FavoritesPicker, BannerEditor, DetailsModal, CollectionModal, CollectionsPage (unsubscribe dialog) | 12+ implementations of the same backdrop + Portal + scroll + ESC pattern — should have a shared Modal primitive |
| Error fallback pattern | Collections routes, Profile route, Stats, CollectionDetail | 6+ inline implementations of "icon + title + message + retry button" — should use EmptyState primitive |
| Confirm destructive pattern | ConfirmRemoveSheet, ResetConfirmSheet, CollectionsPage unsubscribe dialog | 3 implementations of "are you sure? Cancel + Destructive button" — should be shared ConfirmSheet |

---

# PART 4: CIRCULAR DEPENDENCIES

Documented circular dependencies and tight coupling patterns that create architectural risk.

---

## 4.1 Zero-Props Components That Depend on Hooks

These components take no props and read their data entirely from global hooks. They cannot be rendered in isolation or tested without mock hook contexts.

| Component | Hook Dependency | Rendered By | Risk |
|-----------|---------------|-------------|------|
| AppHeader | useAuth, useAuthModal, useNavigate | AppShell | Medium — cannot preview/test in isolation |
| BottomNavigation | useNavigate, useLocation | AppShell | Low — router context is standard |
| ToastContainer | useToast | AppShell | Low — reads global state, no actions |
| ScrollToTop | (none — uses IntersectionObserver) | Individual pages | Low — self-contained |
| LoadingScreen | (none — pure markup) | app.tsx Suspense | Low — zero dependencies |

**Verdict:** AppHeader is the highest risk — it imports two hooks and a router primitive. If auth state becomes complex, this component becomes a coupling bottleneck.

---

## 4.2 Feature → Feature Imports (Cross-Feature Coupling)

| Importing Feature | Imported From | What's Imported | Coupling Level |
|-------------------|--------------|-----------------|----------------|
| SearchPage | `features/watchlist/useVault` | useVault, createVaultItemInSupabase | **High** — Search directly writes to Vault |
| CollectionsPage | `features/watchlist/useVault` | useVault | **Medium** — reads watchlist for vault-aware rendering |
| CollectionDetailPage | `features/watchlist/useVault` | useVault | **Medium** — reads watchlist for vault-aware rendering |
| DetailsModal | `features/watchlist/useVault` | useVault | **Medium** — reads watchlist for vault-aware rendering |
| CollectionModal | `features/watchlist/useVault` | useVault | **Medium** — reads watchlist for vault status |
| SearchPage | `features/watchlist/vaultAdapter` | createVaultItemInSupabase | **High** — Search imports a Vault write adapter |

**The Watchlist coupling problem:**

```
                    useVault
                   ↗        ↗
    SearchPage    CollectionsPage
         ↗                   ↗
    DetailsModal           CollectionDetailPage
         ↗
    CollectionModal
```

`useVault` lives in `features/watchlist/` but is imported by 5+ other features. This creates an inverted dependency where the watchlist feature becomes a shared data layer by accident. The correct architecture would move `useVault` (or a `useLibrary` equivalent) into `shared/hooks/`.

**Dual data access paths:**

```
useVault         (features/watchlist/)  → used by Search, Collections, Details, Collection
useUserLibrary   (shared/hooks/)        → used by Discover, Details, History, Achievements
```

These two hooks provide overlapping functionality (`watchlist()` data, `loading()` state, `refresh()` method) from different import paths. Consumers must choose between them, and the choice is inconsistent.

---

## 4.3 CSS Class Dependencies Across Feature Files

| CSS Class | Defined For | Used By (Different Feature) | Risk |
|-----------|-----------|---------------------------|------|
| `insight-card` | Stats/Profile pages | Sync feature (CloudStatusCard, StorageStats, PrivacyCard, DevicesCard, DangerZoneCard) | **Medium** — Sync depends on Profile CSS |
| `sec-page`, `sec-header`, `sec-section` | Stats/Profile pages | Settings, Sync | **Medium** — Settings/Sync depend on Profile CSS |
| `empty-premium*` | Shared global | All features | **Low** — in globals.css, accessible to all |
| `quick-filter-bar`, `quick-filter-tab` | Watchlist feature CSS | HistoryPage (inline) | **Medium** — History depends on Watchlist CSS |
| `search-premium` | Search feature CSS | HistoryPage (inline), VaultSearch (Watchlist) | **Medium** — cross-feature CSS dependency |
| `collection-card*` | Collections feature CSS | CollectionsPage (inline in the same feature) | **Low** — same feature |
| `modal-surface`, `modal-backdrop` | Global modal CSS | AuthModal, all sheet/modal components | **Low** — in globals.css |

**Highest risk:** `insight-card` and `sec-*` classes are defined in the Stats/Profile CSS but consumed by the Sync feature. If the Profile CSS is refactored, the Sync page breaks silently.

---

## 4.4 Component Pattern Duplication Graph

This graph shows which components duplicate the pattern of other components, creating maintenance risk where a fix to one must be applied to all copies.

```
EmptyState (shared primitive)
├── Duplicated by: Watchlist EmptyState (feature-local)
├── Duplicated by: Discover PremiumEmptyState (feature-local)
├── Duplicated inline by: Profile (×2)
├── Duplicated inline by: Stats (×2)
├── Duplicated inline by: History (×3)
├── Duplicated inline by: Achievements (×2)
├── Duplicated inline by: Sync (×1)
├── Duplicated inline by: Collections (unsubscribe dialog)
└── Duplicated inline by: CollectionDetail (not-found + error)

Skeleton (shared primitive)
├── Duplicated by: DiscoverSkeleton (feature-local)
├── Duplicated by: LoadingSkeleton (watchlist-local)
├── Duplicated by: ProfileSkeleton (feature-local)
├── Duplicated by: CollectionSkeleton (feature-local)
├── Duplicated by: DetailsSkeleton (feature-local)
└── Duplicated inline by: CollectionDetailPage (skeleton-base divs)
└── Duplicated inline by: StatsPage (sec-skeleton-block)
└── Duplicated inline by: HistoryPage (sec-skeleton-block)
└── Duplicated inline by: AchievementsPage (sec-skeleton-block)

Section (shared primitive)
├── Duplicated by: DetailSection (details-local, different CSS)
├── Duplicated by: sec-section (Stats/History/Achievements/Settings CSS class)
└── Duplicated by: collections-fold (Collections CSS class)

MovieCardRatings (shared UI)
└── Duplicated by: RatingCluster (details-local, expanded layout)

CinematicHero (details component)
└── Duplicated by: CollectionHero (collection-local, same pattern)
└── Duplicated by: ProfileBanner (profile-local, same backdrop+gradient pattern)

Modal portal + ESC + backdrop pattern
├── DetailsModal
├── CollectionModal
├── AuthModal
├── FolderEditor
├── SmartCollectionBuilder
├── AddUniverseModal
├── AddToFolderSheet
├── ConfirmRemoveSheet
├── ResetConfirmSheet
├── FavoritesPicker
├── BannerEditor
└── CollectionsPage (unsubscribe dialog)

Confirm destructive pattern
├── ConfirmRemoveSheet (details)
├── ResetConfirmSheet (sync)
└── CollectionsPage (unsubscribe inline dialog)

Icon component (shared)
└── Duplicated inline by: ~40 `<span class="material-symbols-outlined">` spans
    across Stats, History, Achievements, Settings, Collections,
    CollectionDetail, GlobalErrorBoundary, LoadingScreen
```

---

## 4.5 Coupling Density Summary

| Component | Direct Dependents | Transitive Dependents | Coupling Score |
|-----------|------------------|-----------------------|----------------|
| useVault | 5 features | ~15 components | 🔴 **Critical** |
| useAuth | 6 pages + AppHeader | ~20 components | 🟡 **High** |
| useModalState | 5 features | ~8 components | 🟡 **High** |
| PageContainer | 11 pages | ~11 pages | 🟢 **Low** (stable API) |
| Icon | 15+ components | ~15+ components | 🟢 **Low** (stable API) |
| `empty-premium*` CSS | 10+ pages | ~30+ inline uses | 🔴 **Critical** (no shared component) |
| `focus-ring` CSS | Virtually all | Virtually all | 🟢 **Low** (stable, single class) |
| `btn-primary` CSS | 10+ locations | ~30+ buttons | 🟡 **High** (class used without Button component) |
| tmdbImage | 8 components | ~8 components | 🟢 **Low** (pure utility) |
| WatchlistItem type | 20+ components | ~30+ references | 🟢 **Low** (stable type) |

---

## 4.6 Recommendations (Informational Only)

These are NOT action items — they are architectural observations for future consideration:

1. **Promote `useVault` to shared**: The watchlist data layer is effectively shared infrastructure. Move it to `shared/hooks/` or a dedicated data layer to eliminate feature→feature imports.

2. **Unify `useVault` and `useUserLibrary`**: Two overlapping hooks for the same data creates confusion. Merge into a single `useLibrary` hook in `shared/hooks/`.

3. **Extract `ProgressRing` to shared**: Needed by UniverseDashboard, CollectionHero, AchievementsPage, StatsPage. Currently locked in `features/collections/`.

4. **Extract `LazyMount` to shared**: Generic IntersectionObserver-based mount deferral. No discover-specific logic. Should be in `shared/ui/`.

5. **Create a shared `Modal` primitive**: 12+ components implement the same Portal + backdrop + ESC + scroll-lock pattern. A `Modal` primitive would eliminate hundreds of lines of duplication.

6. **Create a shared `ConfirmSheet` primitive**: 3 implementations of "Cancel + Destructive action" sheet. Should be one component with `title`, `message`, `confirmLabel`, `onConfirm` props.

7. **Mandate `Icon` over inline spans**: ~40 inline `<span class="material-symbols-outlined">` should use the Icon component for consistency, fill support, and aria-hidden defaults.

8. **Mandate `EmptyState` primitive over inline markup**: 10+ pages write raw `empty-premium*` markup. The shared `EmptyState` primitive already exists — pages should import it.

9. **Decompose Stats, History, Achievements, Settings into components**: These four pages are 100% inline markup (0 feature-local components). Each should extract its repeated patterns (StatCard, InsightCard, HistoryItem, AchievementCard, SettingRow) into components.

10. **Consolidate `Section` variants**: `Section`, `DetailSection`, `sec-section`, `collections-fold` all serve the same purpose. Unify around one component with variant props.

---

*End of Component Dependency Map*
