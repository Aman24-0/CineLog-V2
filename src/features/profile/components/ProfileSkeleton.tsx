// src/features/profile/components/ProfileSkeleton.tsx
//
// Sprint 2B — Migrated to PremiumSkeleton and Premium UI components.
// Every skeleton matches the final element's dimensions exactly so
// there is zero layout shift between skeleton and content.

import { type Component } from "solid-js";
import { PremiumSkeleton, PremiumSectionHeader, PremiumStatCard } from "~/shared/ui/premium";

/**
 * ProfileSkeleton — loading state for the Profile page.
 *
 * Uses PremiumSkeleton and PremiumStatCard (in loading state)
 * for consistent shimmer animations and token-based styling.
 */
const ProfileSkeleton: Component = () => {
  return (
    <div class="profile-page">
      {/* Banner skeleton */}
      <PremiumSkeleton variant="block" width="100%" radius="none" />

      {/* Identity block skeleton */}
      <div class="profile-identity">
        <PremiumSkeleton variant="avatar" width="xl" />
        <PremiumSkeleton variant="text" lines={3} style={{ "margin-top": "var(--sp-4)", "max-width": "320px" }} />
      </div>

      {/* Stats row skeleton */}
      <div class="profile-section">
        <PremiumSectionHeader title="Statistics" eyebrow="Library" accent="bar" variant="compact" />
        <div class="profile-stats-row">
          <PremiumStatCard value="—" label="Total" loading />
          <PremiumStatCard value="—" label="Watching" loading />
          <PremiumStatCard value="—" label="Completed" loading />
          <PremiumStatCard value="—" label="Planned" loading />
        </div>
      </div>

      {/* Taste card skeleton */}
      <div class="profile-section">
        <PremiumSectionHeader title="Your Taste" eyebrow="Identity" accent="bar" variant="compact" />
        <div class="taste-card">
          <PremiumSkeleton variant="poster" radius="none" />
          <PremiumSkeleton variant="poster" radius="none" />
          <PremiumSkeleton variant="poster" radius="none" />
          <PremiumSkeleton variant="poster" radius="none" />
        </div>
      </div>

      {/* Watchlist summary skeleton */}
      <div class="profile-section">
        <PremiumSkeleton variant="block" width="100%" height="5rem" radius="lg" />
      </div>

      {/* Quick links skeleton */}
      <div class="profile-section">
        <PremiumSectionHeader title="Quick Links" eyebrow="Explore" accent="dot" variant="compact" />
        <PremiumSkeleton variant="text" lines={4} style={{ gap: "1px" }} />
      </div>
    </div>
  );
};

export default ProfileSkeleton;
