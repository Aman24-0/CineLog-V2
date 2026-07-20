// src/shared/ui/premium/index.ts
// Premium Shared UI Library
//
// Barrel export for all LIVE premium reusable components.
// Dead scaffolding components were removed — only components actually
// consumed by feature pages remain.
//
// Groups:
//   layout     — Page/section containers
//   cards      — Card variants (hero, stat)
//   surfaces   — Surface primitives (solid, glass, gradient)
//   buttons    — Button variants (primary, icon)
//   feedback   — Divider, empty state, skeleton
//   navigation — Section header
//   display    — Avatar, status badge, list item

// ─── Layout ───
export { PremiumPageContainer, PremiumSectionContainer } from "./layout";

// ─── Cards ───
export { PremiumCard, type PremiumCardProps } from "./cards";
export { PremiumHeroCard, type PremiumHeroCardProps } from "./cards";
export { PremiumStatCard, type PremiumStatCardProps } from "./cards";

// ─── Surfaces ───
export {
  PremiumSurface,
  PremiumGlassSurface,
  PremiumGradientSurface,
} from "./surfaces";

// ─── Buttons ───
export { PremiumButton, PremiumIconButton } from "./buttons";

// ─── Feedback ───
export { PremiumDivider, type PremiumDividerProps } from "./feedback";
export { PremiumEmptyState, type PremiumEmptyStateProps } from "./feedback";
export { PremiumSkeleton, type PremiumSkeletonProps } from "./feedback";

// ─── Navigation ───
export { PremiumSectionHeader, type PremiumSectionHeaderProps } from "./navigation";

// ─── Display ───
export { PremiumAvatar, type PremiumAvatarProps } from "./display";
export { PremiumStatusBadge, type PremiumStatusBadgeProps } from "./display";
export { PremiumListItem, type PremiumListItemProps } from "./display";
