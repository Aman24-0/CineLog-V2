// src/features/profile/components/ProfileSkeleton.tsx
//
// Sprint 2C — Updated to match new profile section architecture.
// Skeletons now mirror the 8-section layout for zero layout shift.

import { type Component } from "solid-js";
import { PremiumSkeleton, PremiumSectionHeader, PremiumStatCard } from "~/shared/ui/premium";

/**
 * ProfileSkeleton — loading state for the Profile page.
 *
 * Matches the Sprint 2C section architecture:
 *   1. Hero (35vh block + avatar + text)
 *   2. Statistics (featured + 3 compact)
 *   3. Taste Identity (asymmetric grid)
 *   4. Cinema DNA
 *   5. Achievements
 *   6. Quick Actions
 *   7. Settings
 *   8. Danger Zone
 */
const ProfileSkeleton: Component = () => {
  return (
    <div class="profile-page">
      {/* 1. Hero skeleton — 35vh banner */}
      <PremiumSkeleton variant="block" width="100%" height="35vh" radius="none" />

      {/* Identity overlay skeleton */}
      <div style={{ "margin-top": "-80px", position: "relative", "z-index": "2", padding: "0 var(--space-4, 16px)" }}>
        <div style={{ display: "flex", "align-items": "flex-end", gap: "var(--space-4, 16px)" }}>
          <PremiumSkeleton variant="avatar" width="xl" />
          <PremiumSkeleton variant="text" lines={3} style={{ "max-width": "280px" }} />
        </div>
      </div>

      {/* 2. Statistics skeleton */}
      <div class="profile-section" style={{ "margin-top": "var(--space-12, 48px)" }}>
        <PremiumSectionHeader title="Statistics" eyebrow="Library" accent="bar" variant="compact" />
        <div class="profile-stats-featured">
          <PremiumStatCard value="—" label="Titles" loading size="large" class="profile-stat-featured" />
          <div class="profile-stats-supporting">
            <PremiumStatCard value="—" label="Watching" loading size="compact" />
            <PremiumStatCard value="—" label="Completed" loading size="compact" />
            <PremiumStatCard value="—" label="Planned" loading size="compact" />
          </div>
        </div>
      </div>

      {/* 3. Taste Identity skeleton — asymmetric grid */}
      <div class="profile-section" style={{ "margin-top": "var(--space-12, 48px)" }}>
        <PremiumSectionHeader title="Your Taste" eyebrow="Identity" accent="bar" variant="compact" />
        <div class="taste-identity">
          <div style={{ "grid-area": "movie" }}>
            <PremiumSkeleton variant="poster" radius="lg" height="240px" />
          </div>
          <div style={{ "grid-area": "series" }}>
            <PremiumSkeleton variant="poster" radius="lg" height="100px" />
          </div>
          <div style={{ "grid-area": "director" }}>
            <PremiumSkeleton variant="poster" radius="lg" height="100px" />
          </div>
          <div style={{ "grid-area": "genre" }}>
            <PremiumSkeleton variant="block" width="100%" height="64px" radius="lg" />
          </div>
        </div>
      </div>

      {/* 4. Cinema DNA skeleton */}
      <div class="profile-section" style={{ "margin-top": "var(--space-12, 48px)" }}>
        <PremiumSectionHeader title="Cinema DNA" eyebrow="Insight" accent="bar" variant="compact" />
        <PremiumSkeleton variant="block" width="100%" height="160px" radius="lg" />
      </div>

      {/* 5. Achievements skeleton */}
      <div class="profile-section" style={{ "margin-top": "var(--space-8, 32px)" }}>
        <PremiumSectionHeader title="Achievements" eyebrow="Milestones" accent="dot" variant="compact" />
        <PremiumSkeleton variant="text" lines={1} style={{ "max-width": "400px" }} />
      </div>

      {/* 6. Quick Actions skeleton */}
      <div class="profile-section" style={{ "margin-top": "var(--space-12, 48px)" }}>
        <PremiumSectionHeader title="Quick Actions" eyebrow="Explore" accent="dot" variant="compact" />
        <PremiumSkeleton variant="text" lines={3} style={{ gap: "2px" }} />
      </div>
    </div>
  );
};

export default ProfileSkeleton;
