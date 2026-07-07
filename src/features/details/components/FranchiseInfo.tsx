// src/features/details/components/FranchiseInfo.tsx
import { Show, createMemo, Component } from "solid-js";
import { useNavigate } from "@solidjs/router";
import DetailSection from "./DetailSection";
import { detectFranchise } from "~/shared/data/franchises";
import type { WatchlistItem } from "~/shared/types";

interface FranchiseInfoProps {
  currentItem: WatchlistItem;
  watchlist: WatchlistItem[];
  onSelect: (item: WatchlistItem) => void;
}

/**
 * FranchiseInfo — a TRIGGER that navigates to a curated collection page
 * when the current title belongs to a known franchise.
 *
 * Detects the franchise via the shared detectFranchise function, then
 * links to /collections/{curated-slug} if a curated collection exists
 * for that franchise. If no curated collection exists, links to the
 * Collections page as a fallback.
 */
const FranchiseInfo: Component<FranchiseInfoProps> = (props) => {
  const navigate = useNavigate();

  const franchise = createMemo(() => {
    const title = props.currentItem.title || props.currentItem.name || "";
    return detectFranchise(title);
  });

  const ownedCount = createMemo(() => {
    const f = franchise();
    if (!f) return 0;
    return props.watchlist.filter((m) => {
      const itemTitle = (m.title || m.name || "").toLowerCase();
      return f.keywords.some((k) => itemTitle.includes(k));
    }).length;
  });

  // Map franchise names to curated collection slugs
  const curatedSlug = createMemo(() => {
    const name = franchise()?.name ?? "";
    const slugMap: Record<string, string> = {
      "Marvel Cinematic Universe": "mcu-chronological",
      "Star Wars": "star-wars-timeline",
      "Lord of the Rings": "middle-earth",
      "The Dark Knight": "dark-knight-trilogy",
      "John Wick": "john-wick",
      "Harry Potter": "harry-potter"
    };
    return slugMap[name] ?? null;
  });

  const handleOpenCollection = () => {
    const slug = curatedSlug();
    if (slug) {
      navigate(`/collections/${slug}`);
    } else {
      navigate("/collections");
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
          <div class="franchise-trigger-icon">
            <span class="material-symbols-outlined" style="font-size: 24px; color: var(--p)" aria-hidden="true">
              collection
            </span>
          </div>
          <div class="franchise-trigger-text">
            <p class="franchise-trigger-name">{franchise()!.name}</p>
            <p class="franchise-trigger-meta">
              {ownedCount() > 0
                ? `${ownedCount()} title${ownedCount() !== 1 ? "s" : ""} in your vault · `
                : "Not in your vault yet · "}
              View full collection
            </p>
          </div>
          <span class="material-symbols-outlined franchise-trigger-chevron" aria-hidden="true">
            chevron_right
          </span>
        </button>
      </DetailSection>
    </Show>
  );
};

export default FranchiseInfo;
