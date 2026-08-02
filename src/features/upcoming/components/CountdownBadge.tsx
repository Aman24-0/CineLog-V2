// src/features/upcoming/components/CountdownBadge.tsx
//
// CountdownBadge — small pill that shows "TODAY", "TOMORROW", or "N DAYS"
// relative to a release date. Colour-coded:
//   • ≤ 1 day  → green (imminent)
//   • 2-7 days → yellow (soon)
//   • > 7 days → muted grey (distant)
//   • < 0      → blue (past / out now)
//
// v5: added an optional `fallbackLabel` prop. When the date is in the
// past AND a fallbackLabel is provided (e.g. "RETURNING" for TV series
// whose next-episode air date is unknown but which /discover/tv
// confirmed has an episode in the window), the badge shows the
// fallback label instead of "OUT NOW". This keeps the badge visible
// and informative rather than misleading.
//
// The badge is purely visual; the page already groups titles into
// Today / Tomorrow / This Week / Later sections, so the badge is mostly
// useful inside the action bar row (where it lives in v5+) and inside
// the detail modal.

import { type Component, createMemo } from "solid-js";

interface CountdownBadgeProps {
  /** ISO date string (YYYY-MM-DD). */
  date: string;
  /** Optional size — "sm" for card overlays, "md" for headers. @default "sm" */
  size?: "sm" | "md";
  /**
   * Optional label to show when the date is in the past. Used for TV
   * series whose `first_air_date` is in the past but which have an
   * upcoming episode in the window (per /discover/tv). When omitted,
   * past dates show "OUT NOW".
   */
  fallbackLabel?: string;
}

function daysFromToday(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

const CountdownBadge: Component<CountdownBadgeProps> = (props) => {
  const days = createMemo(() => daysFromToday(props.date));
  const label = createMemo<string>(() => {
    const d = days();
    if (d === 0) return "TODAY";
    if (d === 1) return "TOMORROW";
    if (d < 0) return props.fallbackLabel ?? "OUT NOW";
    return `${d} DAYS`;
  });
  const tier = createMemo<"imminent" | "soon" | "distant" | "past">(() => {
    const d = days();
    if (d < 0) return "past";
    if (d <= 1) return "imminent";
    if (d <= 7) return "soon";
    return "distant";
  });

  return (
    <span
      class={`upcoming-countdown-badge upcoming-countdown-${tier()} upcoming-countdown-${props.size ?? "sm"}`}
      aria-label={`Releases ${label().toLowerCase()}`}
    >
      {label()}
    </span>
  );
};

export default CountdownBadge;
