// src/features/details/components/YourActivityCard.tsx
import { Show, Component } from "solid-js";
import type { WatchlistItem } from "~/shared/types";

interface YourActivityCardProps {
  /** User-owned vault item — always present (parent gates on vaultItem) */
  vaultItem: WatchlistItem;
}

/**
 * YourActivityCard — the user-owned section of the Details page.
 *
 * DESIGN PHILOSOPHY:
 *   Personal information does not belong inside TMDB Details. TMDB data
 *   (year, runtime, genres, status, network, country, language) lives in
 *   the MetadataGrid. User-owned data (watch status, watch date, personal
 *   rating, future: rewatch count, personal notes, date added) lives HERE.
 *
 *   This separation is the ownership boundary made visible: non-vault
 *   titles show only TMDB metadata; vault titles show this card ABOVE
 *   the TMDB metadata as the user's personal anchor.
 *
 *   This is a PURE INFORMATION card — no Edit button. The Edit action
 *   lives exclusively in the ActionDock to avoid duplication. The card
 *   just displays the user's current state.
 *
 * LAYOUT:
 *   A glass card with a 2×2 grid of activity cells:
 *     ┌─────────────┬─────────────┐
 *     │ Watch Status │ Watch Date  │
 *     ├─────────────┼─────────────┤
 *     │ Your Rating  │ Date Added  │
 *     └─────────────┴─────────────┘
 *   Plus a notes preview (if any).
 *
 * FUTURE SCALABILITY:
 *   The card is designed to grow. Future fields (rewatch count, personal
 *   notes preview, last watched timestamp) can be added as new cells
 *   without changing the component's architecture.
 */
const YourActivityCard: Component<YourActivityCardProps> = (props) => {
  const statusLabel = () => {
    const s = props.vaultItem.status;
    if (s === "Plan to Watch" || s === "Planned") return "Planned";
    if (s === "Watching") return "Watching";
    if (s === "Completed") return "Completed";
    return s || "—";
  };

  const statusClass = () => {
    const s = props.vaultItem.status;
    if (s === "Watching") return "v2-pill-success";
    if (s === "Completed") return "v2-pill-info";
    return "v2-pill-accent";
  };

  const watchDate = () => {
    if (!props.vaultItem.watchDate) return null;
    const d = new Date(props.vaultItem.watchDate);
    if (isNaN(d.getTime())) return props.vaultItem.watchDate;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const userRating = () => {
    const r = props.vaultItem.rating;
    if (typeof r !== "number" || r <= 0) return null;
    return r.toFixed(1);
  };

  const dateAdded = () => {
    const added = props.vaultItem.addedAt;
    if (!added) return null;
    let ms: number;
    if (added instanceof Date) ms = added.getTime();
    else if (typeof added === "string") ms = new Date(added).getTime();
    else if (typeof added === "object" && "seconds" in added) ms = added.seconds * 1000;
    else return null;
    if (isNaN(ms)) return null;
    const d = new Date(ms);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <div class="your-activity-card animate-fade-up">
      {/* Header — accent bar + "Your Activity" label (no Edit button — that's in the ActionDock) */}
      <div class="your-activity-header">
        <div class="your-activity-label">
          <span class="material-symbols-outlined your-activity-icon" aria-hidden="true">
            bookmark
          </span>
          Your Activity
        </div>
      </div>

      {/* Activity cells — 2×2 grid */}
      <div class="your-activity-grid">
        {/* Watch Status */}
        <div class="your-activity-cell">
          <span class="your-activity-cell-label">Status</span>
          <span class={`v2-pill ${statusClass()}`}>{statusLabel()}</span>
        </div>

        {/* Watch Date */}
        <div class="your-activity-cell">
          <span class="your-activity-cell-label">Watched</span>
          <Show when={watchDate()} fallback={
            <span class="your-activity-cell-empty">—</span>
          }>
            <span class="your-activity-cell-value">{watchDate()}</span>
          </Show>
        </div>

        {/* Your Rating */}
        <div class="your-activity-cell">
          <span class="your-activity-cell-label">Your Rating</span>
          <Show when={userRating()} fallback={
            <span class="your-activity-cell-empty">Not rated</span>
          }>
            <span class="your-activity-cell-value your-activity-rating">
              <span class="material-symbols-outlined" style={{"font-size":"14px","color":"#f5c518","font-variation-settings":"'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24"}} aria-hidden="true">star</span>
              {userRating()}
            </span>
          </Show>
        </div>

        {/* Date Added */}
        <Show when={dateAdded()}>
          <div class="your-activity-cell">
            <span class="your-activity-cell-label">Added</span>
            <span class="your-activity-cell-value your-activity-cell-muted">{dateAdded()}</span>
          </div>
        </Show>
      </div>

      {/* Notes preview (if any) */}
      <Show when={props.vaultItem.notes && props.vaultItem.notes.trim()}>
        <div class="your-activity-notes">
          <span class="your-activity-cell-label">Notes</span>
          <p class="your-activity-notes-text">{props.vaultItem.notes}</p>
        </div>
      </Show>
    </div>
  );
};

export default YourActivityCard;
