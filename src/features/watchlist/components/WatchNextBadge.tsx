// src/features/watchlist/components/WatchNextBadge.tsx
import { Show, type Component } from "solid-js";
import { getNextEpisode } from "~/shared/utils/progress";
import type { WatchlistItem } from "~/shared/types";

/**
 * WatchNextBadge — Phase 6.2 Task 1b
 *
 * Small overlay badge rendered on top of a VaultShelf card when the item
 * is a TV series the user is currently watching. Shows the next
 * unwatched episode label (e.g. "Next: S2 E5") so the user can resume
 * without opening the Details modal first.
 *
 * RENDERING:
 *   - The badge is positioned absolute, bottom-left of the poster area.
 *   - Uses the accent color (`var(--p)`) with a translucent background
 *     so it's visible against any poster image.
 *   - When the series is "caught up" (no next episode), the badge shows
 *     a "Caught up" label with a checkmark icon instead.
 *   - When the next-episode computation returns null (not Watching,
 *     not a TV series, etc.), the badge is NOT rendered.
 *
 * ACCESSIBILITY:
 *   - The badge is purely informational — tapping anywhere on the card
 *     still opens the Details modal (the card's own onClick handler).
 *   - We set `pointer-events: none` so the badge doesn't intercept the
 *     card's click. The `aria-label` is set for screen readers.
 */
interface WatchNextBadgeProps {
  item: WatchlistItem;
}

const WatchNextBadge: Component<WatchNextBadgeProps> = (props) => {
  const next = () => getNextEpisode(props.item);

  return (
    <Show when={next()}>
      {(n) => (
        <div
          class="watch-next-badge"
          style={{
            position: "absolute",
            left: "8px",
            bottom: "8px",
            "z-index": "2",
            display: "inline-flex",
            "align-items": "center",
            gap: "4px",
            padding: "3px 8px",
            "border-radius": "9999px",
            "font-size": "0.5625rem",
            "font-weight": 700,
            "letter-spacing": "0.02em",
            "pointer-events": "none",
            background: n().isAtEnd
              ? "rgba(16, 185, 129, 0.85)"
              : "rgba(124, 58, 237, 0.85)",
            color: "#ffffff",
            "backdrop-filter": "blur(8px)",
            "-webkit-backdrop-filter": "blur(8px)",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            "box-shadow": "0 2px 6px rgba(0, 0, 0, 0.3)"
          }}
          aria-label={
            n().isAtEnd
              ? `Caught up on ${props.item.title ?? props.item.name ?? "this series"}`
              : `Next episode: ${n().label} of ${props.item.title ?? props.item.name ?? "this series"}`
          }
        >
          <span
            class="material-symbols-outlined"
            style={{
              "font-size": "11px",
              "line-height": "1"
            }}
            aria-hidden="true"
          >
            {n().isAtEnd ? "check_circle" : "play_arrow"}
          </span>
          <span>{n().isAtEnd ? "Caught up" : `Next: ${n().label}`}</span>
        </div>
      )}
    </Show>
  );
};

export default WatchNextBadge;
