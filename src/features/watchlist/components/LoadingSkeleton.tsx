// src/features/watchlist/components/LoadingSkeleton.tsx
import { For } from "solid-js";
import { Skeleton } from "~/shared/ui/primitives";

/**
 * V2.2 Sprint 4 Vault Skeleton — mirrors the new shelf layout.
 *
 * Shows skeleton shelves with headers + poster rails, so the loading
 * state matches the real layout. No jarring reflow when Firestore resolves.
 *
 * Accessibility:
 *   - The wrapper exposes role="status" + aria-live="polite" +
 *     aria-busy="true" + aria-label so screen readers announce that the
 *     watchlist is loading. Each skeleton bar inside is aria-hidden so
 *     AT users aren't bombarded with "decorative bar, decorative bar…"
 *     announcements while the page is loading.
 */
export default function LoadingSkeleton() {
  const shelfLabels = ["Continue Watching", "Planned", "Recently Completed"];

  return (
    <div
      class="animate-fade-in"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading watchlist"
    >
      <For each={shelfLabels}>
        {(label) => (
          <div class="vault-shelf">
            {/* Shelf header skeleton */}
            <div class="vault-shelf-header">
              <div class="vault-shelf-title-cluster">
                <Skeleton
                  width={label.length > 15 ? "180px" : "120px"}
                  height="1.25rem"
                />
                <Skeleton width="80px" height="0.5625rem" variant="text" />
              </div>
            </div>

            {/* Rail skeleton */}
            <div class="flex gap-3 overflow-hidden pb-2">
              <For each={Array.from({ length: 5 })}>
                {() => (
                  <div class="shrink-0" style={{ width: "140px" }}>
                    <Skeleton
                      width="100%"
                      height="0"
                      radius="var(--radius-card)"
                      style={{ "aspect-ratio": "2 / 3" }}
                    />
                    <Skeleton
                      width="80%"
                      height="0.75rem"
                      style={{ "margin-top": "0.5rem" }}
                    />
                    <Skeleton
                      width="50%"
                      height="0.5rem"
                      variant="text"
                      style={{ "margin-top": "0.25rem" }}
                    />
                  </div>
                )}
              </For>
            </div>
          </div>
        )}
      </For>
    </div>
  );
}
