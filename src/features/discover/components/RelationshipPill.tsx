// src/features/discover/components/RelationshipPill.tsx
import { Show, createMemo, Component } from "solid-js";
import type { TMDBTitle, WatchlistItem } from "~/shared/types";

interface RelationshipPillProps {
  item: TMDBTitle;
  vault: WatchlistItem[];
  /** Compact variant — smaller text, for tight supporting slots */
  compact?: boolean;
}

/* Franchise keyword table — mirrored for franchise relationship detection. */
const FRANCHISES: { name: string; keywords: string[] }[] = [
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
 * RelationshipPill — the "vault is always visible" indicator.
 *
 * Every Discover card shows exactly ONE pill, in priority order:
 *   1. WATCHING     — title is in vault with status === "Watching"
 *   2. COMPLETED    — title is in vault with status === "Completed"
 *   3. PLANNED      — title is in vault with status === "Planned" / "Plan to Watch"
 *   4. ★ YOUR N     — title is in vault with a user rating of N
 *   5. + ADD        — not in vault; primary add action
 *
 * (Franchise/director relationships are intentionally NOT shown here —
 *  they would clutter the pill. The TasteSurface fold already calls
 *  those out at the shelf level. The pill stays simple: vault-aware only.)
 *
 * This single component is what makes Discover feel *aware* of the user.
 * Without it, Discover is just another TMDB browser.
 */
const RelationshipPill: Component<RelationshipPillProps> = (props) => {
  const vaultItem = createMemo(() =>
    props.vault.find((m) => String(m.id) === String(props.item.id))
  );

  const pill = createMemo<{ label: string; cls: string } | null>(() => {
    const v = vaultItem();
    if (!v) return null;

    if (v.status === "Watching") return { label: "Watching", cls: "v2-pill-success" };
    if (v.status === "Completed") return { label: "Completed", cls: "v2-pill-info" };
    if (v.status === "Planned" || v.status === "Plan to Watch") {
      return { label: "Planned", cls: "v2-pill" };
    }
    // In vault but no recognized status — show user rating if any
    if (v.rating && v.rating > 0) {
      return { label: `★ Your ${v.rating}`, cls: "v2-pill-accent" };
    }
    return { label: "In Vault", cls: "v2-pill" };
  });

  return (
    <Show
      when={pill()}
      fallback={
        <span
          class={`relationship-pill-add${props.compact ? " relationship-pill-compact" : ""}`}
          aria-label="Not in your vault — tap to add"
        >
          <span class="material-symbols-outlined" style={{ "font-size": "10px" }} aria-hidden="true">
            add
          </span>
          Add
        </span>
      }
    >
      <span
        class={`v2-pill ${pill()!.cls}${props.compact ? " relationship-pill-compact" : ""}`}
        aria-label={`${pill()!.label} — in your vault`}
      >
        {pill()!.label}
      </span>
    </Show>
  );
};

export default RelationshipPill;
