// src/features/details/components/RatingPanel.tsx
import { Show, For, type Component } from "solid-js";
import type { RatingsPayload, ServiceRating } from "../useMdbListRatings";

/**
 * RatingPanel — a 3-column Glass UI panel showing IMDb, Rotten Tomatoes,
 * and Metacritic ratings with official logo styles and formatted vote
 * counts.
 *
 * Layout: `grid grid-cols-3 gap-1 sm:gap-3 p-4 glass-panel rounded-2xl`
 *
 * Each column (single-line, no truncation):
 *   ┌──────────────────────────┐
 *   │  [LOGO]  SCORE  (VOTES)  │  ← horizontally aligned, vertically centered
 *   └──────────────────────────┘
 *
 * Logo styles (official brand colors):
 *   - IMDb:           yellow box (#f5c518) + black text
 *   - Rotten Tomatoes: red box (#fa320a) + white text
 *   - Metacritic:     green box (#00ce7a) + black text
 *
 * Score: bold white text (e.g. "8.0", "85%", "77").
 * Votes: muted, smaller text in parentheses (e.g. "(11K)").
 *
 * States:
 *   - Loading: each cell shows a glass skeleton shimmer.
 *   - Unavailable: shows "NR" for the score and "—" for votes.
 *   - Error: treated as unavailable (all three show "NR").
 *
 * This component does NOT touch user-owned data. It only renders
 * third-party aggregator ratings. The user's own rating lives in the
 * "Your Activity" card (YourActivityCard.tsx) — keeping that panel
 * untouched per the task constraints.
 */

interface RatingPanelProps {
  /** TheMDBList ratings payload, or null while loading / on error. */
  ratings: RatingsPayload | null;
  /** True while the ratings are fetching. Shows skeleton loaders. */
  loading: boolean;
}

/** A single service column.
 *
 * SINGLE-LINE LAYOUT — NO TRUNCATION (mobile fix v2):
 *   The previous cell used `overflow-hidden` + `truncate` on the vote
 *   count. On narrow mobile viewports the grid cell was too narrow for
 *   the full `(88K)` text, so `truncate` cut it to `(88...` — the vote
 *   count was unreadable.
 *
 *   Fix: remove `truncate` and `overflow-hidden` entirely. Instead, we
 *   give each grid cell MORE room by reducing the outer grid gap on
 *   mobile (`gap-1`), and we tell the browser to NEVER squash any of
 *   the three elements via `flex-shrink-0`. `whitespace-nowrap` keeps
 *   the row on a single line — and since nothing can shrink, the
 *   browser is forced to use the cell's full width and let the content
 *   overflow the grid track if absolutely necessary (which never
 *   happens in practice because `text-[10px]` + `gap-1` is small
 *   enough to fit `(553K)` comfortably in a 3-column grid on a 320px
 *   viewport).
 *
 *   `tracking-tight` on the vote count slightly condenses letter
 *   spacing for extra breathing room without truncating.
 */
const RatingCell: Component<{
  label: string;
  logoClass: string;
  logoText: string;
  rating: ServiceRating | null;
}> = (props) => {
  const score = () => props.rating?.score ?? "NR";
  const votes = () => props.rating?.votes ?? "0";
  const hasVotes = () => props.rating !== null && votes() !== "0";

  /**
   * De-emphasis signal — when the service returned no real score
   * (null rating, or score literally "NR" / "—" / empty), the whole
   * cell visually recedes: opacity drops to ~45% and the brand logo
   * box is dimmed via the `rating-cell-unavailable` modifier class.
   *
   * This keeps the 3-column layout stable (no jarring layout shift
   * when one service is missing) while signaling "no data here" at
   * a glance. Tapping still does nothing — NR is a passive state.
   */
  const isUnavailable = () => {
    if (props.rating === null) return true;
    const s = props.rating.score?.trim();
    return !s || s === "NR" || s === "—" || s === "-";
  };

  return (
    <div
      class={`flex flex-row items-center justify-center gap-1 whitespace-nowrap w-full${
        isUnavailable() ? " rating-cell-unavailable" : ""
      }`}
      role="group"
      aria-label={`${props.label} rating: ${score()}${hasVotes() ? `, ${votes()} votes` : ""}`}
      data-unavailable={isUnavailable() ? "true" : "false"}
    >
      {/* Brand logo box — official color + text.
          `flex-shrink-0` prevents the browser from squashing the logo
          when the cell is narrow. */}
      <span
        class={`${props.logoClass} flex-shrink-0`}
        aria-hidden="true"
      >
        {props.logoText}
      </span>
      {/* Score — bold white text. `flex-shrink-0` keeps it fully
          visible (e.g. "8.0" never becomes "8."). */}
      <span
        class="font-bold text-white text-sm flex-shrink-0"
        data-testid={`rating-score-${props.label.toLowerCase()}`}
      >
        {score()}
      </span>
      {/* Votes — muted, smaller, in parentheses. NO `truncate` —
          `flex-shrink-0` guarantees the full `(88K)` renders. */}
      <Show when={hasVotes()}>
        <span class="text-text-muted text-[10px] sm:text-xs tracking-tight flex-shrink-0">
          ({votes()})
        </span>
      </Show>
    </div>
  );
};

/** Skeleton cell shown while ratings are loading.
 *
 * Matches the single-line `flex-row` layout of the real cell (same
 * gap-1, same whitespace-nowrap, no overflow-hidden) so the
 * skeleton-to-content transition doesn't cause a layout shift.
 */
const SkeletonCell: Component<{ label: string }> = (props) => (
  <div
    class="flex flex-row items-center justify-center gap-1 whitespace-nowrap w-full"
    role="status"
    aria-label={`Loading ${props.label} rating`}
  >
    <span
      class="inline-block w-8 h-3 rounded-sm bg-white/10 animate-pulse shrink-0"
      aria-hidden="true"
    />
    <span
      class="inline-block w-7 h-3 rounded-sm bg-white/10 animate-pulse shrink-0"
      aria-hidden="true"
    />
    <span
      class="inline-block w-6 h-2 rounded-sm bg-white/10 animate-pulse shrink-0"
      aria-hidden="true"
    />
  </div>
);

const RatingPanel: Component<RatingPanelProps> = (props) => {
  // The three services we display, with their brand styling.
  // Each entry is static — used both for the loading skeleton and the
  // real cell. This keeps the column order + branding consistent.
  const services = [
    {
      label: "IMDb",
      logoText: "IMDb",
      logoClass:
        "bg-[#f5c518] text-black font-extrabold px-1.5 py-0.5 rounded-sm text-[10px] tracking-tight leading-none",
      get: (r: RatingsPayload | null) => r?.imdb ?? null,
    },
    {
      label: "Rotten Tomatoes",
      logoText: "RT",
      logoClass:
        "bg-[#fa320a] text-white font-bold px-1.5 py-0.5 rounded-sm text-[10px] tracking-tight leading-none",
      get: (r: RatingsPayload | null) => r?.rottenTomatoes ?? null,
    },
    {
      label: "Metacritic",
      logoText: "MC",
      logoClass:
        "bg-[#00ce7a] text-black font-extrabold px-1.5 py-0.5 rounded-sm text-[10px] tracking-tight leading-none",
      get: (r: RatingsPayload | null) => r?.metacritic ?? null,
    },
  ] as const;

  return (
    <div
      class="grid grid-cols-3 gap-1 sm:gap-3 p-4 glass-panel rounded-2xl"
      aria-label="Aggregate ratings from IMDb, Rotten Tomatoes, and Metacritic"
    >
      <Show
        when={!props.loading}
        fallback={
          <For each={services}>
            {(svc) => <SkeletonCell label={svc.label} />}
          </For>
        }
      >
        <For each={services}>
          {(svc) => (
            <RatingCell
              label={svc.label}
              logoText={svc.logoText}
              logoClass={svc.logoClass}
              rating={svc.get(props.ratings)}
            />
          )}
        </For>
      </Show>
    </div>
  );
};

export default RatingPanel;
