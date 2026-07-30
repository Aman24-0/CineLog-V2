// src/features/collection/components/CollectionSkeleton.tsx
import { For } from "solid-js";

/**
 * CollectionSkeleton — loading state for the CollectionModal.
 *
 * Three shimmer blocks: hero, stats strip, timeline list.
 */
export default function CollectionSkeleton() {
  return (
    <div class="collection-modal">
      <div class="collection-skeleton-hero" />
      <div class="collection-skeleton-stats">
        <For each={[1, 2, 3, 4]}>
          {() => <div class="collection-skeleton-stat" />}
        </For>
      </div>
      <div class="collection-skeleton-timeline">
        <For each={[1, 2, 3, 4, 5]}>
          {() => <div class="collection-skeleton-item" />}
        </For>
      </div>
    </div>
  );
}
