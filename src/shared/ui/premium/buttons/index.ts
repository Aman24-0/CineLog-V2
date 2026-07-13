// src/shared/ui/premium/buttons/index.ts
/**
 * Premium Button Components — Barrel Export
 *
 * Reusable, design-token-driven button components for CineLog V2.
 * Each component supports variants, sizes, states, ARIA, keyboard
 * navigation, focus rings, and prefers-reduced-motion.
 *
 * Components:
 * - PremiumButton         — full-featured button with icon + label
 * - PremiumIconButton     — compact circular icon-only button with badge
 * - PremiumFloatingButton — floating action button (FAB) with positioning
 * - PremiumActionRow      — horizontal/vertical row of action buttons
 * - PremiumBottomActionBar— sticky bottom action bar with glass effect
 * - PremiumToolbar        — horizontal icon toolbar with roving tabindex
 */

export { PremiumButton } from "./PremiumButton";
export { PremiumIconButton } from "./PremiumIconButton";
export { PremiumFloatingButton } from "./PremiumFloatingButton";
export { PremiumActionRow } from "./PremiumActionRow";
export type { ActionItem, ActionSpacing, ActionAlignment } from "./PremiumActionRow";
export { PremiumBottomActionBar } from "./PremiumBottomActionBar";
export type { BottomActionItem } from "./PremiumBottomActionBar";
export { PremiumToolbar } from "./PremiumToolbar";
export type { ToolItem, ToolbarPosition } from "./PremiumToolbar";
