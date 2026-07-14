// src/features/details/components/YourActivityCard.tsx
import { Show, For, Component, createSignal } from "solid-js";
import { Portal } from "solid-js/web";
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
 *   rating, rewatch count, rewatch dates, date added) lives HERE.
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
 * RE-WATCH (v2.2):
 *   When rewatchCount > 0, the Watch Date cell shows a "Re-watched N×"
 *   badge next to the date. Tapping the badge opens a mini dialog that
 *   lists every viewing date in order (1st Watch, Re-watch 1, …, Re-watch N).
 *   When rewatchCount = 0, the cell behaves as before — plain date, no badge.
 */
const YourActivityCard: Component<YourActivityCardProps> = (props) => {
  const [showRewatchDialog, setShowRewatchDialog] = createSignal(false);

  const statusLabel = () => {
    const s = props.vaultItem.status;
    if (s === "Plan to Watch" || s === "Planned") return "Planned";
    if (s === "Watching") return "Watching";
    if (s === "Completed") return "Completed";
    if (s === "Dropped") return "Dropped";
    return s || "—";
  };

  const statusClass = () => {
    const s = props.vaultItem.status;
    if (s === "Watching") return "v2-pill-success";
    if (s === "Completed") return "v2-pill-info";
    if (s === "Dropped") return "v2-pill-danger";
    return "v2-pill-accent";
  };

  /** The date to show in the Watched cell. */
  const watchDate = () => {
    if (!props.vaultItem.watchDate) return null;
    const d = new Date(props.vaultItem.watchDate);
    if (isNaN(d.getTime())) return props.vaultItem.watchDate;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const rewatchCount = () => props.vaultItem.rewatchCount ?? 0;
  const hasRewatches = () => rewatchCount() > 0;

  /** Ordered list of {label, date} for the mini dialog. */
  const rewatchEntries = (): { label: string; date: string | null }[] => {
    const dates = props.vaultItem.rewatchDates ?? [];
    const count = rewatchCount();
    const out: { label: string; date: string | null }[] = [];
    for (let i = 0; i <= count; i++) {
      const raw = dates[i];
      let formatted: string | null = null;
      if (raw) {
        const d = new Date(raw);
        formatted = isNaN(d.getTime())
          ? raw
          : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      }
      out.push({
        label: i === 0 ? "1st Watch" : `Re-watch ${i}`,
        date: formatted,
      });
    }
    return out;
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

        {/* Watch Date — with optional re-watch badge */}
        <div class="your-activity-cell">
          <span class="your-activity-cell-label">Watched</span>
          <Show when={watchDate()} fallback={
            <span class="your-activity-cell-empty">—</span>
          }>
            <div class="your-activity-watch-date-wrap">
              <span class="your-activity-cell-value">{watchDate()}</span>
              <Show when={hasRewatches()}>
                <button
                  type="button"
                  class="rewatch-badge"
                  onClick={() => setShowRewatchDialog(true)}
                  aria-label={`View all ${rewatchCount() + 1} viewing dates`}
                  title={`Watched ${rewatchCount() + 1} times — click to see all dates`}
                >
                  <span class="material-symbols-outlined" style={{"font-size":"11px"}} aria-hidden="true">
                    replay
                  </span>
                  {rewatchCount()}×
                </button>
              </Show>
            </div>
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

      {/* Re-watch dates mini dialog — shown when the user taps the badge */}
      <Show when={showRewatchDialog()}>
        <Portal>
          <div
            class="fixed inset-0 z-[999999] flex items-center justify-center p-4 animate-fade-in"
            onClick={() => setShowRewatchDialog(false)}
            role="dialog"
            aria-modal="true"
            aria-label="All viewing dates"
          >
            <div class="absolute inset-0" style={{ background: "rgba(0,0,0,0.7)", "backdrop-filter": "blur(8px)", "-webkit-backdrop-filter": "blur(8px)" }} aria-hidden="true" />
            <div
              class="rewatch-dialog"
              onClick={(e) => e.stopPropagation()}
            >
              <div class="rewatch-dialog-header">
                <div>
                  <h3 class="rewatch-dialog-title">Viewing History</h3>
                  <p class="rewatch-dialog-subtitle">
                    {rewatchCount() + 1} {rewatchCount() === 0 ? "viewing" : "viewings"} total
                  </p>
                </div>
                <button
                  type="button"
                  class="rewatch-dialog-close"
                  onClick={() => setShowRewatchDialog(false)}
                  aria-label="Close"
                >
                  <span class="material-symbols-outlined" style={{"font-size":"18px"}} aria-hidden="true">close</span>
                </button>
              </div>
              <div class="rewatch-dialog-list">
                <For each={rewatchEntries()}>
                  {(entry, i) => (
                    <div class={`rewatch-dialog-row${i() === 0 ? " rewatch-dialog-row-first" : ""}`}>
                      <span class="rewatch-dialog-row-label">{entry.label}</span>
                      <Show when={entry.date} fallback={
                        <span class="rewatch-dialog-row-date rewatch-dialog-row-date-empty">Not set</span>
                      }>
                        <span class="rewatch-dialog-row-date">{entry.date}</span>
                      </Show>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </div>
        </Portal>
      </Show>
    </div>
  );
};

export default YourActivityCard;
