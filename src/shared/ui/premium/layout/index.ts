// src/shared/ui/premium/layout/index.ts
/**
 * Premium Layout Components — Barrel Export
 *
 * Reusable layout primitives for CineLog V2. Each component is fully
 * token-driven (CSS custom properties), accessible, and supports
 * variants/sizes/states. These components are not consumed by any
 * existing page yet — they exist as standalone reusable building blocks.
 *
 * Components:
 *  - PremiumPageContainer    — Full-page container with nav-safe padding
 *  - PremiumSectionContainer — Section wrapper with header and collapsible support
 *  - PremiumContentContainer — Content grouping with padding, border, radius
 *  - PremiumHeroContainer    — Full-bleed hero with gradient and lazy-loaded image
 *  - PremiumRailContainer    — Horizontal scrolling rail with snap and overflow
 */

export { PremiumPageContainer } from "./PremiumPageContainer";
export { PremiumSectionContainer } from "./PremiumSectionContainer";
export { PremiumContentContainer } from "./PremiumContentContainer";
export { PremiumHeroContainer } from "./PremiumHeroContainer";
export { PremiumRailContainer } from "./PremiumRailContainer";

export { default as PremiumPageContainerDefault } from "./PremiumPageContainer";
export { default as PremiumSectionContainerDefault } from "./PremiumSectionContainer";
export { default as PremiumContentContainerDefault } from "./PremiumContentContainer";
export { default as PremiumHeroContainerDefault } from "./PremiumHeroContainer";
export { default as PremiumRailContainerDefault } from "./PremiumRailContainer";
