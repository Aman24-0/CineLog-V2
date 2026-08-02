// src/features/settings/sections/index.ts
//
// Barrel export for all section components. Import from
// `~/features/settings/sections` to get all seven sections + the
// `SettingsState` type.

export type {
  SettingsState,
  SectionMeta,
  SegmentedOption
} from "./types";

export {
  SECTIONS,
  DANGER_ZONE_META
} from "./meta";

export { AccountSection } from "./AccountSection";
export { AppearanceSection } from "./AppearanceSection";
export { ContentDiscoverSection } from "./ContentDiscoverSection";
export { NotificationSection } from "./NotificationSection";
export { CalendarSection } from "./CalendarSection";
export { SyncSection } from "./SyncSection";
export { DangerZoneSection } from "./DangerZoneSection";
