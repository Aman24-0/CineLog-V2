// src/shared/ui/premium/display/index.ts
/**
 * Premium Display Components — Barrel Export
 *
 * Live components:
 * - PremiumAvatar      — user avatar with image, fallback, online indicator
 * - PremiumStatusBadge — watch status badge with status colors
 * - PremiumListItem    — list item with image, icon, trailing content
 *   (PremiumStatusBadge is exported because PremiumListItem consumes it)
 */

export { PremiumAvatar } from "./PremiumAvatar";
export type { PremiumAvatarProps } from "./PremiumAvatar";

export { PremiumStatusBadge } from "./PremiumStatusBadge";
export type { PremiumStatusBadgeProps } from "./PremiumStatusBadge";

export { PremiumListItem } from "./PremiumListItem";
export type { PremiumListItemProps } from "./PremiumListItem";
