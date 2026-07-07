// src/features/details/components/FranchiseInfo.tsx
import { Show, createMemo, Component } from "solid-js";
import DetailSection from "./DetailSection";
import { detectFranchise } from "~/shared/data/franchises";
import { useCollectionModal } from "~/shared/hooks/useCollectionModal";
import type { WatchlistItem } from "~/shared/types";

interface FranchiseInfoProps {
  currentItem: WatchlistItem;
  watchlist: WatchlistItem[];
  onSelect: (item: WatchlistItem) => void;
}

/**
 * FranchiseInfo — a TRIGGER for the Collection modal.
 *
 * When the current title belongs to a known franchise, this renders a
 * cinematic banner that opens the CollectionModal when tapped. The
 * banner shows the franchise name, a preview of how many titles the
 * user owns vs the total, and a "View Collection" call to action.
 *
 * Previously this component rendered a full list of vault items from
 * the same franchise — which was limited to only what the user owned.
 * Now it's a trigger: tapping it opens the full TMDB collection with
 * all entries (owned + missing), timeline, progress, and stats.
 *
 * DETECTION:
 *   Uses the shared `detectFranchise` from `src/shared/data/franchises.ts`
 *   — the single source of truth for franchise definitions. No more
 *   duplicated keyword tables.
 */
const FranchiseInfo: Component<FranchiseInfoProps> = (props) => {
  const { openCollection } = useCollectionModal();

  const franchise = createMemo(() => {
    const title = props.currentItem.title || props.currentItem.name || "";
    return detectFranchise(title);
  });

  // Count how many vault items belong to this franchise (for the preview)
  const ownedCount = createMemo(() => {
    const f = franchise();
    if (!f) return 0;
    return props.watchlist.filter((m) => {
      const itemTitle = (m.title || m.name || "").toLowerCase();
      return f.keywords.some((k) => itemTitle.includes(k));
    }).length;
  });

  const handleOpenCollection = () => {
    const f = franchise();
    if (f) {
      openCollection(f, String(props.currentItem.id));
    }
  };

  return (
    <Show when={franchise()}>
      <DetailSection label={franchise()!.name} icon="auto_awesome">
        <button
          type="button"
          class="franchise-trigger"
          onClick={handleOpenCollection}
          aria-label={`View ${franchise()!.name} collection`}
        >
          {/* Icon */}
          <div class="franchise-trigger-icon">
            <span class="material-symbols-outlined" style="font-size: 24px; color: var(--p)" aria-hidden="true">
              collection
            </span>
          </div>
          {/* Text */}
          <div class="franchise-trigger-text">
            <p class="franchise-trigger-name">{franchise()!.name}</p>
            <p class="franchise-trigger-meta">
              {ownedCount() > 0
                ? `${ownedCount()} title${ownedCount() !== 1 ? "s" : ""} in your vault · `
                : "Not in your vault yet · "}
              View full collection
            </p>
          </div>
          {/* Chevron */}
          <span class="material-symbols-outlined franchise-trigger-chevron" aria-hidden="true">
            chevron_right
          </span>
        </button>
      </DetailSection>
    </Show>
  );
};

export default FranchiseInfo;
