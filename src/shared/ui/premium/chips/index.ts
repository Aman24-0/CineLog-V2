// src/shared/ui/premium/chips/index.ts
/**
 * Premium Chip Components — Barrel Export
 *
 * Reusable, design-token-driven chip/tag/pill components for CineLog V2.
 * Each component supports variants, sizes, states, ARIA, keyboard
 * navigation, focus rings, and prefers-reduced-motion.
 *
 * Components:
 * - PremiumChip — Toggle/selectable chip with variant, color, and remove support
 * - PremiumTag  — Non-interactive label tag for categorization
 * - PremiumPill — Pill-shaped container with glass/accent variants and dot indicator
 */

export { PremiumChip } from "./PremiumChip";
export type { PremiumChipProps } from "./PremiumChip";
export { default as PremiumChipDefault } from "./PremiumChip";

export { PremiumTag } from "./PremiumTag";
export type { PremiumTagProps } from "./PremiumTag";
export { default as PremiumTagDefault } from "./PremiumTag";

export { PremiumPill } from "./PremiumPill";
export type { PremiumPillProps } from "./PremiumPill";
export { default as PremiumPillDefault } from "./PremiumPill";
