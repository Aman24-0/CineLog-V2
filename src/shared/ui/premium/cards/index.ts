// src/shared/ui/premium/cards/index.ts
/**
 * Premium Card Components — Barrel Export
 *
 * Reusable, design-token-driven card components for CineLog V2.
 * Each component supports variants, sizes, states, ARIA, keyboard
 * navigation, focus rings, and prefers-reduced-motion.
 *
 * Components:
 * - PremiumCard              — versatile card with variant/size/state support
 * - PremiumHeroCard          — cinematic hero card with backdrop image
 * - PremiumStatCard          — stat display card with icon and trend
 * - PremiumMiniCard          — compact card for rails and dense grids
 * - PremiumHorizontalCard    — horizontal card with image left, content right
 * - PremiumPosterStack       — stacked poster display for collections
 * - PremiumCollectionPreview — collection preview card with color accents
 */

export { PremiumCard } from "./PremiumCard";
export type { PremiumCardProps } from "./PremiumCard";

export { PremiumHeroCard } from "./PremiumHeroCard";
export type { PremiumHeroCardProps } from "./PremiumHeroCard";

export { PremiumStatCard } from "./PremiumStatCard";
export type { PremiumStatCardProps } from "./PremiumStatCard";

export { PremiumMiniCard } from "./PremiumMiniCard";
export type { PremiumMiniCardProps } from "./PremiumMiniCard";

export { PremiumHorizontalCard } from "./PremiumHorizontalCard";
export type {
  PremiumHorizontalCardProps,
  HorizontalAction,
  HorizontalVariant,
  HorizontalWatchStatus,
} from "./PremiumHorizontalCard";

export { PremiumPosterStack } from "./PremiumPosterStack";
export type {
  PremiumPosterStackProps,
  PosterEntry,
  StackSize,
  StackOffset,
  StackVariant,
} from "./PremiumPosterStack";

export { PremiumCollectionPreview } from "./PremiumCollectionPreview";
export type {
  PremiumCollectionPreviewProps,
  CollectionType,
  CollectionColor,
  CollectionPoster,
} from "./PremiumCollectionPreview";

// Default exports
export { default as PremiumCardDefault } from "./PremiumCard";
export { default as PremiumHeroCardDefault } from "./PremiumHeroCard";
export { default as PremiumStatCardDefault } from "./PremiumStatCard";
export { default as PremiumMiniCardDefault } from "./PremiumMiniCard";
export { default as PremiumHorizontalCardDefault } from "./PremiumHorizontalCard";
export { default as PremiumPosterStackDefault } from "./PremiumPosterStack";
export { default as PremiumCollectionPreviewDefault } from "./PremiumCollectionPreview";
