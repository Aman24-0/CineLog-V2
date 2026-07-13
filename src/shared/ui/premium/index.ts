// src/shared/ui/premium/index.ts
// Premium Shared UI Library — Sprint 2A
//
// Barrel export for all premium reusable components.
// These components exist but are NOT yet consumed by any existing page.
// Future sprints will migrate pages onto these components.
//
// Groups:
//   layout     — Page/section/rail/hero/content containers
//   cards      — Card variants (hero, stat, mini, horizontal, poster stack, collection)
//   surfaces   — Surface primitives (solid, glass, gradient, overlay, backdrop)
//   buttons    — Button variants (primary, icon, floating, action row, toolbar, bottom bar)
//   chips      — Chip/tag/pill components
//   feedback   — Badge, divider, empty state, skeleton, carousel header
//   navigation — Page header, section header
//   display    — Avatar, stats, ratings, status, media info, labels, lists, timeline
//   loading    — Re-export of skeleton components
//   empty      — Re-export of empty state components

// ─── Layout ───
export {
  PremiumPageContainer,
  PremiumSectionContainer,
  PremiumContentContainer,
  PremiumHeroContainer,
  PremiumRailContainer,
} from "./layout";

// ─── Cards ───
export {
  PremiumCard,
  type PremiumCardProps,
} from "./cards";

export {
  PremiumHeroCard,
  type PremiumHeroCardProps,
} from "./cards";

export {
  PremiumStatCard,
  type PremiumStatCardProps,
} from "./cards";

export {
  PremiumMiniCard,
  type PremiumMiniCardProps,
} from "./cards";

export {
  PremiumHorizontalCard,
  type PremiumHorizontalCardProps,
  type HorizontalAction,
  type HorizontalVariant,
  type HorizontalWatchStatus,
} from "./cards";

export {
  PremiumPosterStack,
  type PremiumPosterStackProps,
  type PosterEntry,
  type StackSize,
  type StackOffset,
  type StackVariant,
} from "./cards";

export {
  PremiumCollectionPreview,
  type PremiumCollectionPreviewProps,
  type CollectionType,
  type CollectionColor,
  type CollectionPoster,
} from "./cards";

// ─── Surfaces ───
export {
  PremiumSurface,
  PremiumGlassSurface,
  PremiumGradientSurface,
  PremiumOverlay,
  PremiumBackdrop,
} from "./surfaces";

// ─── Buttons ───
export {
  PremiumButton,
  PremiumIconButton,
  PremiumFloatingButton,
} from "./buttons";

export {
  PremiumActionRow,
  type ActionItem,
  type ActionSpacing,
  type ActionAlignment,
} from "./buttons";

export {
  PremiumBottomActionBar,
  type BottomActionItem,
} from "./buttons";

export {
  PremiumToolbar,
  type ToolItem,
  type ToolbarPosition,
} from "./buttons";

// ─── Chips ───
export {
  PremiumChip,
  type PremiumChipProps,
} from "./chips";

export {
  PremiumTag,
  type PremiumTagProps,
} from "./chips";

export {
  PremiumPill,
  type PremiumPillProps,
} from "./chips";

// ─── Feedback ───
export {
  PremiumBadge,
  type PremiumBadgeProps,
} from "./feedback";

export {
  PremiumDivider,
  type PremiumDividerProps,
} from "./feedback";

export {
  PremiumEmptyState,
  type PremiumEmptyStateProps,
} from "./feedback";

export {
  PremiumSkeleton,
  type PremiumSkeletonProps,
} from "./feedback";

export {
  PremiumCarouselHeader,
  type PremiumCarouselHeaderProps,
} from "./feedback";

// ─── Navigation ───
export {
  PremiumPageHeader,
  type PremiumPageHeaderProps,
  type PageHeaderAction,
} from "./navigation";

export {
  PremiumSectionHeader,
  type PremiumSectionHeaderProps,
} from "./navigation";

// ─── Display ───
export {
  PremiumAvatar,
  type PremiumAvatarProps,
} from "./display";

export {
  PremiumProfileStat,
  type PremiumProfileStatProps,
} from "./display";

export {
  PremiumRatingDisplay,
  type PremiumRatingDisplayProps,
} from "./display";

export {
  PremiumStatusBadge,
  type PremiumStatusBadgeProps,
} from "./display";

export {
  PremiumMediaInfo,
  type PremiumMediaInfoProps,
} from "./display";

export {
  PremiumProviderChip,
  type PremiumProviderChipProps,
} from "./display";

export {
  PremiumMetric,
  type PremiumMetricProps,
} from "./display";

export {
  PremiumLabel,
  type PremiumLabelProps,
} from "./display";

export {
  PremiumMetaRow,
  type PremiumMetaRowProps,
  type MetaItem,
  type MetaSeparator,
  type MetaSpacing,
  type MetaAlign,
} from "./display";

export {
  PremiumInfoRow,
  type PremiumInfoRowProps,
} from "./display";

export {
  PremiumListItem,
  type PremiumListItemProps,
} from "./display";

export {
  PremiumTimelineRow,
  type PremiumTimelineRowProps,
} from "./display";
