// src/features/profile/components/ProfileSkeleton.tsx
import { type Component } from "solid-js";

/**
 * ProfileSkeleton — loading state for the Profile page.
 *
 * Every skeleton matches the final element's dimensions exactly so
 * there is zero layout shift between skeleton and content. Uses the
 * same shimmer animation as the rest of the app (1.6s ease-in-out).
 *
 * The skeleton is on-brand: the banner skeleton uses a hint of
 * accent-tinted gradient so the page feels like a teaser, not a
 * broken state.
 */
const ProfileSkeleton: Component = () => {
  return (
    <div class="profile-page">
      {/* Banner skeleton */}
      <div class="profile-skeleton-banner" />

      {/* Identity block skeleton */}
      <div class="profile-identity">
        <div class="profile-skeleton-avatar" />
        <div class="profile-skeleton-line" style={{ width: "180px", height: "2rem", "margin-top": "var(--sp-4)" }} />
        <div class="profile-skeleton-line" style={{ width: "120px", height: "0.75rem", "margin-top": "var(--sp-2)" }} />
        <div class="profile-skeleton-line" style={{ width: "240px", height: "0.875rem", "margin-top": "var(--sp-3)" }} />
      </div>

      {/* Taste card skeleton */}
      <div class="profile-section">
        <div class="profile-skeleton-line" style={{ width: "120px", height: "0.5625rem", "margin-bottom": "var(--sp-4)" }} />
        <div class="taste-card">
          <div class="profile-skeleton-tile" />
          <div class="profile-skeleton-tile" />
          <div class="profile-skeleton-tile" />
          <div class="profile-skeleton-tile" />
        </div>
      </div>

      {/* Watchlist summary skeleton */}
      <div class="profile-section">
        <div class="profile-skeleton-line" style={{ width: "100%", height: "3rem", "border-radius": "var(--radius-lg)" }} />
      </div>

      {/* Quick links skeleton */}
      <div class="profile-section">
        <div class="profile-skeleton-line" style={{ width: "100%", height: "3.5rem" }} />
        <div class="profile-skeleton-line" style={{ width: "100%", height: "3.5rem", "margin-top": "1px" }} />
        <div class="profile-skeleton-line" style={{ width: "100%", height: "3.5rem", "margin-top": "1px" }} />
      </div>
    </div>
  );
};

export default ProfileSkeleton;
