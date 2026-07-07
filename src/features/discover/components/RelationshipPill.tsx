// src/features/discover/components/RelationshipPill.tsx
import { Show, createMemo, Component } from "solid-js";
import type { TMDBTitle, WatchlistItem } from "~/shared/types";
import { findInVault } from "~/shared/utils/vaultMatch";

interface RelationshipPillProps {
  item: TMDBTitle;
  vault: WatchlistItem[];
  /** Compact variant — smaller text, for tight supporting slots */
  compact?: boolean;
}

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
  const vaultItem = createMemo(() => findInVault(props.vault, props.item));

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
