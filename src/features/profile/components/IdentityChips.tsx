// src/features/profile/components/IdentityChips.tsx
//
// Viewer Identity Chips — small elegant chips that answer "who is this viewer?"
//
//   Sits below the bio in the hero. Maximum 4 chips. Generated from
//   viewing history (top genre, top director, era, pace, origin, format).
//
// Visual language:
//   • Tiny glass pills with a subtle hairline border
//   • Emoji icon + label, single line
//   • Quiet, never insistent
//   • Lifts gently on hover/tap
//
// Architecture:
//   ProfilePage → IdentityChips → storyGenerator.generateIdentityChips
//                                  ↑ pure function over (stats, watchlist)

import { Show, For, createMemo, type Component, type Accessor } from "solid-js";
import type { WatchlistItem } from "~/shared/types";
import type { StatsData } from "../useStats";
import { generateIdentityChips } from "../utils/storyGenerator";

interface IdentityChipsProps {
  stats: Accessor<StatsData | null>;
  watchlist: Accessor<WatchlistItem[]>;
}

const IdentityChips: Component<IdentityChipsProps> = (props) => {
  const chips = createMemo(() => generateIdentityChips(props.stats(), props.watchlist()));

  return (
    <Show when={chips().length > 0}>
      <div class="identity-chips" role="list" aria-label="Viewer identity">
        <For each={chips()}>
          {(chip) => (
            <span class="identity-chip" role="listitem">
              <span class="identity-chip-icon" aria-hidden="true">{chip.icon}</span>
              <span class="identity-chip-label">{chip.label}</span>
            </span>
          )}
        </For>
      </div>
    </Show>
  );
};

export default IdentityChips;
