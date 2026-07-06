// src/features/details/components/FranchiseInfo.tsx
import { For, Show, createMemo } from "solid-js";
import DetailSection from "./DetailSection";
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

/**
 * Franchise Info — shows other titles from the same franchise.
 *
 * Uses the DetailSection wrapper for consistent spacing. The franchise list
 * is numbered with accent badges. The current item is highlighted with a
 * dot indicator.
 */
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
      <DetailSection label={detectedFranchise()!.name} icon="auto_awesome">
        <div class="space-y-2">
          <For each={franchiseItems()}>
            {(item, i) => (
              <div
                class="flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all v2-card"
                style={{ "border-radius": "var(--radius-md)" }}
                onClick={() => props.onSelect(item)}
              >
                <div
                  class="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                  style={{
                    background: "var(--p-dim)",
                    color: "var(--p)",
                    "font-weight": 800,
                    "font-size": "0.75rem",
                    "font-family": "'Bebas Neue', cursive"
                  }}
                >
                  {i() + 1}
                </div>
                <div class="flex-1 min-w-0">
                  <p class="type-body-sm truncate" style={{ color: "var(--text-strong)", "font-weight": 700 }}>
                    {item.title || item.name}
                  </p>
                  <p class="type-micro" style={{ color: "var(--text-muted)" }}>
                    {item.release_date || item.first_air_date || "Unknown Date"}
                  </p>
                </div>
                <Show when={item.id === props.currentItem.id}>
                  <div
                    class="w-2 h-2 rounded-full shrink-0"
                    style={{ background: "var(--p)", "box-shadow": "0 0 8px var(--p-glow)" }}
                    aria-label="Current item"
                  />
                </Show>
              </div>
            )}
          </For>
        </div>
      </DetailSection>
    </Show>
  );
}
