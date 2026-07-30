// src/features/details/components/YourActivityCard.tsx
import { Show, For, Component, createSignal, createMemo } from "solid-js";
import { Portal } from "solid-js/web";
import type { WatchlistItem } from "~/shared/types";
import { formatDateShort } from "~/shared/utils/format";

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
 *
 * SERIES per-season (v2.3):
 *   For TV titles with seasonDates and/or seasonRewatchDates, the watch
 *   date shows the latest season end date (or start if no end set), and
 *   the rewatch badge reflects seasonRewatchCount. The mini dialog shows:
 *     - Original watch: per-season start → end rows
 *     - Each re-watch pass: per-season start → end rows (grouped)
 *   For movies, the existing flat rewatchDates list is used.
 */
const YourActivityCard: Component<YourActivityCardProps> = (props) => {
  const [showRewatchDialog, setShowRewatchDialog] = createSignal(false);

  // NOTE: The "Status" cell was removed from this card. Watch status is
  // owned by the ActionDock's 4 dedicated status buttons (Planned /
  // Watching / Completed / Dropped), which set the value directly via
  // handleSetStatus and reflect the active state via the pressed
  // highlight. Showing status here too was redundant. The remaining
  // cells — Watched date, Your Rating, Date Added — are user-owned
  // states that the ActionDock does NOT display, so they stay here.

  const isSeries = () => props.vaultItem.media_type === "tv";

  /** For movies: the flat rewatch count. For series: the season rewatch count. */
  const effectiveRewatchCount = () => {
    if (isSeries()) return props.vaultItem.seasonRewatchCount ?? 0;
    return props.vaultItem.rewatchCount ?? 0;
  };
  const hasRewatches = () => effectiveRewatchCount() > 0;

  /**
   * Whether the WATCHED date has per-season detail to show in the dialog.
   * For series: true when seasonDates has at least one season entry.
   * For movies: always false (movies use the flat rewatchDates list,
   *   which is already accessible via the ×N badge when rewatchCount > 0).
   */
  const hasSeasonDates = () => {
    if (!isSeries()) return false;
    const sd = props.vaultItem.seasonDates ?? {};
    return Object.keys(sd).length > 0;
  };

  /**
   * Whether the WATCHED date cell should be clickable to open the dialog.
   * True when there's ANY per-viewing detail to show:
   *   - Series with seasonDates (per-season start → end)
   *   - Any title with rewatches (rewatch dates list)
   */
  const canShowDialog = () => hasRewatches() || hasSeasonDates();

  /**
   * The date to show in the Watched cell.
   * - Movies: vaultItem.watchDate (the first/only watch date, or the
   *   1st entry of rewatchDates if watchDate is empty).
   * - Series: the LATEST season end date from seasonDates (or start if
   *   no end set). Falls back to seasonRewatchDates' latest end if the
   *   original seasonDates is empty but re-watches have dates. This
   *   matches the timeline view's resolveTimelineDate logic.
   */
  const watchDate = () => {
    if (isSeries()) {
      // Gather all end dates from seasonDates + seasonRewatchDates,
      // pick the latest. Fall back to start dates if no ends set.
      const candidates: Date[] = [];
      const sd = props.vaultItem.seasonDates ?? {};
      for (const entry of Object.values(sd)) {
        if (entry?.end) {
          const d = new Date(entry.end);
          if (!isNaN(d.getTime())) candidates.push(d);
        }
        if (entry?.start) {
          const d = new Date(entry.start);
          if (!isNaN(d.getTime())) candidates.push(d);
        }
      }
      const srDates = props.vaultItem.seasonRewatchDates ?? [];
      for (const pass of srDates) {
        for (const entry of Object.values(pass)) {
          if (entry?.end) {
            const d = new Date(entry.end);
            if (!isNaN(d.getTime())) candidates.push(d);
          }
          if (entry?.start) {
            const d = new Date(entry.start);
            if (!isNaN(d.getTime())) candidates.push(d);
          }
        }
      }
      if (candidates.length > 0) {
        const latest = new Date(
          Math.max(...candidates.map((d) => d.getTime()))
        );
        return formatDateShort(latest);
      }
      // Fall back to flat watchDate if no season dates set
      if (props.vaultItem.watchDate) {
        const formatted = formatDateShort(props.vaultItem.watchDate);
        if (formatted) return formatted;
      }
      return null;
    }
    // Movie
    const raw =
      props.vaultItem.watchDate || props.vaultItem.rewatchDates?.[0] || "";
    if (!raw) return null;
    return formatDateShort(raw) ?? raw;
  };

  /**
   * Build the ordered list of viewing entries for the mini dialog.
   * - Movies: flat list of {label, date} from rewatchDates.
   * - Series: grouped list — original watch (per-season), then each
   *   re-watch pass (per-season).
   */
  type DialogEntry = { label: string; date: string | null; isHeader?: boolean };

  /**
   * Format a { start, end } season entry as "Sep 3, 2024 → Sep 6, 2024".
   * Handles partial dates (start only → "Sep 3, 2024 → …", end only →
   * "… → Sep 6, 2024"). Returns null when neither date is set.
   *
   * Used for both the original watch and each re-watch pass.
   */
  const formatSeasonRange = (
    entry: { start?: string; end?: string } | undefined
  ): string | null => {
    if (!entry) return null;
    const startStr = entry.start ? formatDateShort(entry.start) : null;
    const endStr = entry.end ? formatDateShort(entry.end) : null;
    if (startStr && endStr) return `${startStr} → ${endStr}`;
    if (startStr) return `${startStr} → …`;
    if (endStr) return `… → ${endStr}`;
    return null;
  };

  const dialogEntries = createMemo<DialogEntry[]>(() => {
    if (isSeries()) {
      const out: DialogEntry[] = [];
      const seasonDates = props.vaultItem.seasonDates ?? {};
      const seasonNumbers = Object.keys(seasonDates)
        .map((k) => parseInt(k, 10))
        .filter((n) => !isNaN(n))
        .sort((a, b) => a - b);

      // Original watch
      out.push({ label: "Original Watch", date: null, isHeader: true });
      if (seasonNumbers.length === 0) {
        out.push({ label: "No season dates set", date: null });
      } else {
        for (const s of seasonNumbers) {
          out.push({
            label: `Season ${s}`,
            date: formatSeasonRange(seasonDates[String(s)])
          });
        }
      }

      // Re-watch passes
      const rewatchDates = props.vaultItem.seasonRewatchDates ?? [];
      for (let i = 0; i < rewatchDates.length; i++) {
        const pass = rewatchDates[i];
        out.push({ label: `Re-watch ${i + 1}`, date: null, isHeader: true });
        const passSeasons = Object.keys(pass)
          .map((k) => parseInt(k, 10))
          .filter((n) => !isNaN(n))
          .sort((a, b) => a - b);
        if (passSeasons.length === 0) {
          out.push({ label: "No season dates set", date: null });
        } else {
          for (const s of passSeasons) {
            out.push({
              label: `Season ${s}`,
              date: formatSeasonRange(pass[String(s)])
            });
          }
        }
      }
      return out;
    }
    // Movie
    const dates = props.vaultItem.rewatchDates ?? [];
    const count = props.vaultItem.rewatchCount ?? 0;
    const out: DialogEntry[] = [];
    for (let i = 0; i <= count; i++) {
      const raw = dates[i];
      out.push({
        label: i === 0 ? "1st Watch" : `Re-watch ${i}`,
        date: raw ? (formatDateShort(raw) ?? raw) : null
      });
    }
    return out;
  });

  /** Total viewings count for the dialog subtitle. */
  const totalViewings = () => {
    if (isSeries()) return effectiveRewatchCount() + 1;
    return effectiveRewatchCount() + 1;
  };

  const userRating = () => {
    const r = props.vaultItem.rating;
    if (typeof r !== "number" || r <= 0) return null;
    return r.toFixed(1);
  };

  const dateAdded = () => {
    const added = props.vaultItem.addedAt;
    if (!added) return null;
    // Handle Firestore Timestamp shape ({ seconds, nanoseconds }) by
    // converting to ms before delegating to formatDateShort.
    if (typeof added === "object" && added !== null && "seconds" in added) {
      return formatDateShort(new Date(added.seconds * 1000));
    }
    return formatDateShort(added);
  };

  return (
    <div class="your-activity-card">
      {/* Header — accent bar + "Your Activity" label (no Edit button — that's in the ActionDock) */}
      <div class="your-activity-header">
        <div class="your-activity-label">
          <span
            class="material-symbols-outlined your-activity-icon"
            aria-hidden="true"
          >
            bookmark
          </span>
          Your Activity
        </div>
      </div>

      {/* Activity cells — 3 cells in a 2-col grid (third cell spans full width) */}
      <div class="your-activity-grid">
        {/* Watch Date — clickable when there's per-season or rewatch detail */}
        <div class="your-activity-cell">
          <span class="your-activity-cell-label">Watched</span>
          <Show
            when={watchDate()}
            fallback={<span class="your-activity-cell-empty">—</span>}
          >
            <div class="your-activity-watch-date-wrap">
              <Show
                when={canShowDialog()}
                fallback={
                  <span class="your-activity-cell-value">{watchDate()}</span>
                }
              >
                <button
                  type="button"
                  class="your-activity-watch-date-btn focus-ring"
                  onClick={() => setShowRewatchDialog(true)}
                  title={
                    isSeries()
                      ? "View per-season watch dates"
                      : "View all viewing dates"
                  }
                  aria-label={
                    isSeries()
                      ? "View per-season watch dates"
                      : "View all viewing dates"
                  }
                >
                  <span class="your-activity-cell-value">{watchDate()}</span>
                  <span
                    class="material-symbols-outlined your-activity-watch-date-chevron"
                    aria-hidden="true"
                  >
                    expand_more
                  </span>
                </button>
              </Show>
              <Show when={hasRewatches()}>
                <button
                  type="button"
                  class="rewatch-badge"
                  onClick={() => setShowRewatchDialog(true)}
                  aria-label={`View all ${totalViewings()} viewing dates`}
                  title={`Watched ${totalViewings()} times — click to see all dates`}
                >
                  <span
                    class="material-symbols-outlined"
                    style={{ "font-size": "11px" }}
                    aria-hidden="true"
                  >
                    replay
                  </span>
                  {effectiveRewatchCount()}×
                </button>
              </Show>
            </div>
          </Show>
        </div>

        {/* Your Rating */}
        <div class="your-activity-cell">
          <span class="your-activity-cell-label">Your Rating</span>
          <Show
            when={userRating()}
            fallback={<span class="your-activity-cell-empty">Not rated</span>}
          >
            <span class="your-activity-cell-value your-activity-rating">
              <span
                class="material-symbols-outlined"
                style={{
                  "font-size": "14px",
                  color: "#f5c518",
                  "font-variation-settings":
                    "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24"
                }}
                aria-hidden="true"
              >
                star
              </span>
              {userRating()}
            </span>
          </Show>
        </div>

        {/* Date Added — full-width row when present (grid-column: 1 / -1) */}
        <Show when={dateAdded()}>
          <div class="your-activity-cell your-activity-cell-wide">
            <span class="your-activity-cell-label">Added</span>
            <span class="your-activity-cell-value your-activity-cell-muted">
              {dateAdded()}
            </span>
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
            class="animate-fade-in fixed inset-0 z-[999999] flex items-center justify-center p-4"
            onClick={() => setShowRewatchDialog(false)}
            role="dialog"
            aria-modal="true"
            aria-label="All viewing dates"
          >
            <div
              class="absolute inset-0"
              style={{
                background: "rgba(0,0,0,0.7)",
                "backdrop-filter": "blur(8px)",
                "-webkit-backdrop-filter": "blur(8px)"
              }}
              aria-hidden="true"
            />
            <div class="rewatch-dialog" onClick={(e) => e.stopPropagation()}>
              <div class="rewatch-dialog-header">
                <div>
                  <h3 class="rewatch-dialog-title">
                    {isSeries() ? "Season Watch Dates" : "Viewing History"}
                  </h3>
                  <p class="rewatch-dialog-subtitle">
                    {isSeries()
                      ? hasRewatches()
                        ? `Original watch + ${effectiveRewatchCount()} re-watch${effectiveRewatchCount() === 1 ? "" : "es"}`
                        : `${Object.keys(props.vaultItem.seasonDates ?? {}).length} season${Object.keys(props.vaultItem.seasonDates ?? {}).length === 1 ? "" : "s"} tracked`
                      : `${totalViewings()} ${totalViewings() === 1 ? "viewing" : "viewings"} total`}
                  </p>
                </div>
                <button
                  type="button"
                  class="rewatch-dialog-close"
                  onClick={() => setShowRewatchDialog(false)}
                  aria-label="Close"
                >
                  <span
                    class="material-symbols-outlined"
                    style={{ "font-size": "18px" }}
                    aria-hidden="true"
                  >
                    close
                  </span>
                </button>
              </div>
              <div class="rewatch-dialog-list">
                <For each={dialogEntries()}>
                  {(entry) => (
                    <Show
                      when={entry.isHeader}
                      fallback={
                        <div class="rewatch-dialog-row">
                          <span class="rewatch-dialog-row-label">
                            {entry.label}
                          </span>
                          <Show
                            when={entry.date}
                            fallback={
                              <span class="rewatch-dialog-row-date rewatch-dialog-row-date-empty">
                                Not set
                              </span>
                            }
                          >
                            <span class="rewatch-dialog-row-date">
                              {entry.date}
                            </span>
                          </Show>
                        </div>
                      }
                    >
                      <div class="rewatch-dialog-section-header">
                        {entry.label}
                      </div>
                    </Show>
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
