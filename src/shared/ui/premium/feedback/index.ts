// src/shared/ui/premium/feedback/index.ts
/**
 * Premium Feedback Components — Barrel Export
 *
 * Reusable, design-token-driven feedback/indicator components for CineLog V2.
 * Each component supports variants, sizes, states, ARIA, keyboard
 * navigation, focus rings, and prefers-reduced-motion.
 *
 * Components:
 * - PremiumBadge          — Badge indicator for counts, statuses, and overlay markers
 * - PremiumDivider        — Visual divider line with optional centered label
 * - PremiumEmptyState     — Premium empty state display with icon, title, message, action
 * - PremiumSkeleton       — Skeleton loading placeholder with multiple shape variants
 * - PremiumCarouselHeader — Header for carousel/rail sections with eyebrow, count, see-all
 */

export { PremiumBadge } from "./PremiumBadge";
export type { PremiumBadgeProps } from "./PremiumBadge";
export { default as PremiumBadgeDefault } from "./PremiumBadge";

export { PremiumDivider } from "./PremiumDivider";
export type { PremiumDividerProps } from "./PremiumDivider";
export { default as PremiumDividerDefault } from "./PremiumDivider";

export { PremiumEmptyState } from "./PremiumEmptyState";
export type { PremiumEmptyStateProps } from "./PremiumEmptyState";
export { default as PremiumEmptyStateDefault } from "./PremiumEmptyState";

export { PremiumSkeleton } from "./PremiumSkeleton";
export type { PremiumSkeletonProps } from "./PremiumSkeleton";
export { default as PremiumSkeletonDefault } from "./PremiumSkeleton";

export { PremiumCarouselHeader } from "./PremiumCarouselHeader";
export type { PremiumCarouselHeaderProps } from "./PremiumCarouselHeader";
export { default as PremiumCarouselHeaderDefault } from "./PremiumCarouselHeader";
