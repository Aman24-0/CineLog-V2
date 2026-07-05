// src/features/details/components/FranchiseInfo.tsx
import { For, Show, createMemo } from "solid-js";
import type { WatchlistItem } from "~/shared/types";

interface FranchiseInfoProps {
  currentItem: WatchlistItem;
  watchlist: WatchlistItem[];
  onSelect: (item: WatchlistItem) => void;
}

const FRANCHISES = [
  { name: "Marvel Cinematic Universe", keywords: ["avengers", "iron man", "captain america", "thor", "black panther", "doctor strange", "spider-man", "guardians of the galaxy", "black widow", "hawkeye", "eternals", "shang-chi", "ant-man", "captain marvel"] },
  { name: "DC Extended Universe", keywords: ["batman", "superman", "wonder woman", "aquaman", "flash", "justice league", "suicide squad", "man of steel", "black adam", "shazam"] },
  { name: "Harry Potter", keywords: ["harry potter", "deathly hallows", "philosopher's stone", "chamber of secrets", "prisoner of azkaban", "goblet of fire", "order of the phoenix", "half-blood prince", "fantastic beasts"] },
  { name: "Mission Impossible", keywords: ["mission impossible"] },
  { name: "John Wick", keywords: ["john wick"] },
  { name: "Fast & Furious", keywords: ["fast and furious", "fast & furious", "furious", "tokyo drift"] },
  { name: "Star Wars", keywords: ["star wars", "empire strikes back", "return of the jedi", "force awakens", "last jedi", "rise of skywalker"] },
  { name: "Lord of the Rings", keywords: ["lord of the rings", "hobbit", "fellowship of the ring", "two towers", "return of the king"] }
];

export default function FranchiseInfo(props: FranchiseInfoProps) {
  const detectedFranchise = createMemo(() => {
    const title = (props.currentItem.title || props.currentItem.name || "").toLowerCase();
    return FRANCHISES.find((f) => f.keywords.some((k) => title.includes(k)));
  });

  const franchiseItems = createMemo(() => {
    const franchise = detectedFranchise();
    if (!franchise) return [];
    
    return props.watchlist
      .filter((m) => {
        const itemTitle = (m.title || m.name || "").toLowerCase();
        return franchise.keywords.some((k) => itemTitle.includes(k));
      })
      .sort((a, b) => {
        const dateA = a.release_date || a.first_air_date || "";
        const dateB = b.release_date || b.first_air_date || "";
        return dateA.localeCompare(dateB);
      });
  });

  return (
    <Show when={detectedFranchise() && franchiseItems().length > 1}>
      <div class="mt-6 animate-fade-in">
        <h3 class="type-section-title mb-4">{detectedFranchise()!.name}</h3>
        <div class="space-y-2">
          <For each={franchiseItems()}>
            {(item, i) => (
              <div
                class="flex items-center gap-3 p-3 rounded-xl border border-white/5 hover:border-[color:var(--p)] hover:bg-white/5 cursor-pointer transition-all"
                onClick={() => props.onSelect(item)}
              >
                <div class="w-8 h-8 rounded-full flex items-center justify-center bg-[var(--p-dim)] text-[var(--p)] font-bold text-sm">
                  {i() + 1}
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-bold text-white truncate">{item.title || item.name}</p>
                  <p class="text-xs text-gray-500">{item.release_date || item.first_air_date || "Unknown Date"}</p>
                </div>
                <Show when={item.id === props.currentItem.id}>
                  <div class="w-2 h-2 rounded-full bg-[var(--p)]" />
                </Show>
              </div>
            )}
          </For>
        </div>
      </div>
    </Show>
  );
}
