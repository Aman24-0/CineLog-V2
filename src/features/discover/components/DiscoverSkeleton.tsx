// src/features/discover/components/DiscoverSkeleton.tsx
import { Component } from "solid-js";

/**
 * DiscoverSkeleton — loading state that mirrors the 4-fold layout.
 *
 * No layout shift on load — the skeleton occupies the same vertical
 * space as the real content, so the page doesn't jump when data
 * arrives. Inherited from DashboardSkeleton / DetailsSkeleton.
 */
const DiscoverSkeleton: Component = () => (
  <div class="discover-skeleton" aria-hidden="true">
    {/* Fold 0 — Spotlight skeleton */}
    <div class="discover-skeleton-spotlight">
      <div class="discover-skeleton-spotlight-backdrop" />
      <div class="discover-skeleton-spotlight-content">
        <div class="discover-skeleton-reason" />
        <div class="discover-skeleton-title" />
        <div class="discover-skeleton-meta" />
        <div class="discover-skeleton-actions" />
      </div>
    </div>

    {/* Fold 1 — Trajectories skeleton */}
    <div class="discover-skeleton-section">
      <div class="discover-skeleton-section-label" />
      <div class="discover-skeleton-trajectory">
        <div class="discover-skeleton-trajectory-hero" />
        <div class="discover-skeleton-trajectory-supporting">
          <div class="discover-skeleton-trajectory-item" />
          <div class="discover-skeleton-trajectory-item" />
          <div class="discover-skeleton-trajectory-item" />
        </div>
      </div>
    </div>

    {/* Fold 2 — Taste surfaces skeleton */}
    <div class="discover-skeleton-section">
      <div class="discover-skeleton-section-label" />
      <div class="discover-skeleton-rail">
        <div class="discover-skeleton-card" />
        <div class="discover-skeleton-card" />
        <div class="discover-skeleton-card" />
        <div class="discover-skeleton-card" />
      </div>
    </div>
  </div>
);

export default DiscoverSkeleton;
