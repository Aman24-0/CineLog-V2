// src/shared/ui/premium/display/index.ts
/**
 * Premium Display Components — Barrel Export
 *
 * Reusable, design-token-driven display components for CineLog V2.
 * Each component supports variants, sizes, states, ARIA, keyboard
 * navigation, focus rings, and prefers-reduced-motion.
 *
 * Components:
 * - PremiumAvatar         — user avatar with image, fallback, online indicator
 * - PremiumProfileStat    — profile statistics with value, label, trend
 * - PremiumRatingDisplay  — rating display for IMDb/TMDb/RT/user ratings
 * - PremiumStatusBadge    — watch status badge with status colors
 * - PremiumMediaInfo      — inline media metadata (year, type, runtime)
 * - PremiumProviderChip   — streaming provider chip with icon
 * - PremiumMetric         — metric/stat with value, unit, and label
 * - PremiumLabel          — label/eyebrow/caption/overline/subtitle text
 * - PremiumMetaRow        — horizontal metadata row with separators
 * - PremiumInfoRow        — label-value info row with icon and action
 * - PremiumListItem       — list item with image, icon, trailing content
 * - PremiumTimelineRow    — vertical timeline entry with connector
 */

export { PremiumAvatar } from "./PremiumAvatar";
export type { PremiumAvatarProps } from "./PremiumAvatar";

export { PremiumProfileStat } from "./PremiumProfileStat";
export type { PremiumProfileStatProps } from "./PremiumProfileStat";

export { PremiumRatingDisplay } from "./PremiumRatingDisplay";
export type { PremiumRatingDisplayProps } from "./PremiumRatingDisplay";

export { PremiumStatusBadge } from "./PremiumStatusBadge";
export type { PremiumStatusBadgeProps } from "./PremiumStatusBadge";

export { PremiumMediaInfo } from "./PremiumMediaInfo";
export type { PremiumMediaInfoProps } from "./PremiumMediaInfo";

export { PremiumProviderChip } from "./PremiumProviderChip";
export type { PremiumProviderChipProps } from "./PremiumProviderChip";

export { PremiumMetric } from "./PremiumMetric";
export type { PremiumMetricProps } from "./PremiumMetric";

export { PremiumLabel } from "./PremiumLabel";
export type { PremiumLabelProps } from "./PremiumLabel";

export { PremiumMetaRow } from "./PremiumMetaRow";
export type { PremiumMetaRowProps, MetaItem, MetaSeparator, MetaSpacing, MetaAlign } from "./PremiumMetaRow";

export { PremiumInfoRow } from "./PremiumInfoRow";
export type { PremiumInfoRowProps } from "./PremiumInfoRow";

export { PremiumListItem } from "./PremiumListItem";
export type { PremiumListItemProps } from "./PremiumListItem";

export { PremiumTimelineRow } from "./PremiumTimelineRow";
export type { PremiumTimelineRowProps } from "./PremiumTimelineRow";
