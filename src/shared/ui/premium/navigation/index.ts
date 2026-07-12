// src/shared/ui/premium/navigation/index.ts
/**
 * Premium Navigation Components — Barrel Export
 *
 * Reusable, design-token-driven navigation/header components for CineLog V2.
 * Each component supports variants, sizes, states, ARIA, keyboard
 * navigation, focus rings, and prefers-reduced-motion.
 *
 * Components:
 * - PremiumPageHeader   — Page-level header with back nav, eyebrow, title, actions, glass/sticky
 * - PremiumSectionHeader — Section-level header with eyebrow, accent decorations, description, action
 */

export { PremiumPageHeader } from "./PremiumPageHeader";
export type { PremiumPageHeaderProps, PageHeaderAction } from "./PremiumPageHeader";
export { default as PremiumPageHeaderDefault } from "./PremiumPageHeader";

export { PremiumSectionHeader } from "./PremiumSectionHeader";
export type { PremiumSectionHeaderProps } from "./PremiumSectionHeader";
export { default as PremiumSectionHeaderDefault } from "./PremiumSectionHeader";
