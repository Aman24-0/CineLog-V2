// src/features/upcoming/components/CountdownBadge.tsx
//
// CountdownBadge — small pill that shows "TODAY", "TOMORROW", or "N DAYS"
// relative to a release date. Colour-coded:
//   • ≤ 1 day  → green (imminent)
//   • 2-7 days → yellow (soon)
//   • > 7 days → muted grey (distant)
//
// The badge is purely visual; the page already groups titles into
// Today / Tomorrow / This Week / Later sections, so the badge is mostly
// useful on the calendar view and inside the detail modal.

import { type Component, createMemo } from "solid-js";

interface CountdownBadgeProps {
  /** ISO date string (YYYY-MM-DD). */
  date: string;
  /** Optional size — "sm" for card overlays, "md" for headers. @default "sm" */
  size?: "sm" | "md";
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
    if (d < 0) return "OUT NOW";
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
