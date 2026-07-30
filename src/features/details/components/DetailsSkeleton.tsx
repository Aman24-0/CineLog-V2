// src/features/details/components/DetailsSkeleton.tsx
import { Skeleton } from "~/shared/ui/primitives";

/**
 * V2 Details Skeleton — mirrors the new cinematic layout.
 *
 * Layout:
 *  - Full-bleed backdrop skeleton (50vh)
 *  - Floating poster skeleton + title skeleton
 *  - Action dock skeleton
 *  - Content section skeletons
 */
export default function DetailsSkeleton() {
  return (
    <div class="cinematic-modal modal-sheet-enter">
      <div class="cinematic-scroll">
        {/* Cinematic hero skeleton */}
        <div class="cinematic-hero">
          <div
            class="skeleton-base"
            style={{ position: "absolute", inset: 0, "border-radius": 0 }}
          />
        </div>

        {/* Hero content cluster skeleton */}
        <div class="hero-content-cluster">
          <div class="floating-poster">
            <div
              class="skeleton-base"
              style={{ width: "100%", height: "100%" }}
            />
          </div>
          <div class="flex-1 pb-1">
            <Skeleton width="70%" height="2.25rem" />
            <Skeleton
              width="50%"
              height="0.875rem"
              variant="text"
              style={{ "margin-top": "0.5rem" }}
            />
            <div class="mt-3 flex gap-2">
              <Skeleton
                width="60px"
                height="1.25rem"
                radius="var(--radius-pill)"
              />
              <Skeleton
                width="80px"
                height="1.25rem"
                radius="var(--radius-pill)"
              />
              <Skeleton
                width="70px"
                height="1.25rem"
                radius="var(--radius-pill)"
              />
            </div>
          </div>
        </div>

        {/* Action dock skeleton */}
        <div class="action-dock">
          <Skeleton width="100%" height="44px" radius="var(--radius-md)" />
          <div class="action-dock-divider" />
          <Skeleton width="60px" height="44px" radius="var(--radius-md)" />
          <Skeleton width="60px" height="44px" radius="var(--radius-md)" />
          <Skeleton width="60px" height="44px" radius="var(--radius-md)" />
        </div>

        {/* Content sections skeleton */}
        <div class="detail-section" style={{ "margin-top": "1.5rem" }}>
          <Skeleton
            width="120px"
            height="0.75rem"
            variant="text"
            style={{ "margin-bottom": "0.75rem" }}
          />
          <Skeleton width="100%" height="4rem" />
        </div>

        <div class="detail-section">
          <Skeleton
            width="80px"
            height="0.75rem"
            variant="text"
            style={{ "margin-bottom": "0.75rem" }}
          />
          <div class="metadata-grid">
            <Skeleton width="100%" height="3.5rem" radius="var(--radius-md)" />
            <Skeleton width="100%" height="3.5rem" radius="var(--radius-md)" />
            <Skeleton width="100%" height="3.5rem" radius="var(--radius-md)" />
            <Skeleton width="100%" height="3.5rem" radius="var(--radius-md)" />
          </div>
        </div>
      </div>
    </div>
  );
}
