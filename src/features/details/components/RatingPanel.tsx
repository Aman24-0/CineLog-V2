// src/features/details/components/RatingPanel.tsx
import { Show, For, type Component } from "solid-js";
import type { RatingsPayload, ServiceRating } from "../useMdbListRatings";

/**
 * RatingPanel — a 3-column Glass UI panel showing IMDb, Rotten Tomatoes,
 * and Metacritic ratings with official logo styles and formatted vote
 * counts.
 *
 * Layout: `grid grid-cols-3 gap-3 p-4 glass-panel rounded-2xl`
 *
 * Each column:
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
 * SINGLE-LINE LAYOUT (INP + mobile fix):
 *   The previous cell used `flex-col` on the outer wrapper + `flex-wrap`
 *   on the inner row. On narrow mobile screens the vote count (e.g.
 *   `(553K)`) wrapped to a second line, breaking the visual alignment.
 *
 *   Fix: the outer wrapper is now a strict horizontal `flex-row` with
 *   `whitespace-nowrap` + `overflow-hidden` so the Logo, Score, and
 *   Votes stay on ONE line regardless of viewport width. The vote
 *   count uses `truncate` so on extremely tight screens it ellipsizes
 *   instead of wrapping.
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

  return (
    <div
      class="flex flex-row items-center justify-center gap-1 sm:gap-1.5 whitespace-nowrap w-full overflow-hidden"
      role="group"
      aria-label={`${props.label} rating: ${score()}${hasVotes() ? `, ${votes()} votes` : ""}`}
    >
      {/* Brand logo box — official color + text */}
      <span
        class={props.logoClass}
        aria-hidden="true"
      >
        {props.logoText}
      </span>
      {/* Score — bold white text */}
      <span class="font-bold text-white text-sm" data-testid={`rating-score-${props.label.toLowerCase()}`}>
        {score()}
      </span>
      {/* Votes — muted, smaller, in parentheses.
          `truncate` ensures it ellipsizes on extremely tight screens
          instead of wrapping to a second line. */}
      <Show when={hasVotes()}>
        <span class="text-text-muted text-[10px] sm:text-xs truncate">({votes()})</span>
      </Show>
    </div>
  );
};

/** Skeleton cell shown while ratings are loading.
 *
 * Matches the single-line `flex-row` layout of the real cell so the
 * skeleton-to-content transition doesn't cause a layout shift.
 */
const SkeletonCell: Component<{ label: string }> = (props) => (
  <div
    class="flex flex-row items-center justify-center gap-1 sm:gap-1.5 whitespace-nowrap w-full overflow-hidden"
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
      class="grid grid-cols-3 gap-3 p-4 glass-panel rounded-2xl"
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
