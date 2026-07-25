// src/features/profile/components/YourStoryCard.tsx
//
// Your Story — CineLog's signature feature.
//
//   One beautiful reflection card. Not a dashboard. Not a chatbot. Not a
//   gamification panel. Just a quiet sentence that tells the viewer who
//   they are, derived from the shape of their vault.
//
//   Replaces the old "Dedicated Viewer" / milestone / achievements
//   gamification cluster with editorial insight. The card should feel
//   like a journal entry — read once, felt deeply.
//
// Visual language:
//   • Large premium glass card with subtle primary glow
//   • Glass blur + soft gradient wash
//   • Generous breathing room (large padding, line-height-relaxed)
//   • Headline in display family (Bebas Neue), body in body family (Outfit)
//   • One accent word/phrase in the body uses --p (green accent)
//   • Soft pulsing glow on the accent — feels alive, never noisy
//   • Hides entirely when there is insufficient signal (< 3 titles)
//
// Architecture:
//   ProfilePage → YourStoryCard → storyGenerator.generateYourStory
//                                  ↑ pure function over (stats, watchlist)

import { Show, For, createMemo, type Component, type Accessor } from "solid-js";
import type { WatchlistItem } from "~/shared/types";
import type { StatsData } from "../useStats";
import { generateYourStory } from "../utils/storyGenerator";
import { GlassCard } from "~/shared/ui/glass";

interface YourStoryCardProps {
  stats: Accessor<StatsData | null>;
  watchlist: Accessor<WatchlistItem[]>;
}

const YourStoryCard: Component<YourStoryCardProps> = (props) => {
  const story = createMemo(() => generateYourStory(props.stats(), props.watchlist()));

  /**
   * Split the body so the accentPhrase (if any) can be wrapped in a
   * highlighted span. We do this client-side to keep storyGenerator pure.
   */
  const segments = createMemo<{ text: string; isAccent: boolean }[]>(() => {
    const s = story();
    if (!s || !s.accentPhrase) return s ? [{ text: s.body, isAccent: false }] : [];
    const idx = s.body.indexOf(s.accentPhrase);
    if (idx === -1) return [{ text: s.body, isAccent: false }];
    return [
      { text: s.body.slice(0, idx), isAccent: false },
      { text: s.accentPhrase, isAccent: true },
      { text: s.body.slice(idx + s.accentPhrase.length), isAccent: false },
    ];
  });

  return (
    <Show when={story()}>
      {(s) => (
        <section class="profile-section your-story" aria-label="Your story">
          <div class="your-story-card" role="article">
            {/* Ambient glow layer */}
            <div class="your-story-glow" aria-hidden="true" />
            {/* Subtle gradient wash */}
            <div class="your-story-wash" aria-hidden="true" />

            {/* Eyebrow */}
            <p class="your-story-eyebrow">
              <span class="material-symbols-outlined your-story-eyebrow-icon" aria-hidden="true">
                {s().icon}
              </span>
              Your Story
            </p>

            {/* Headline */}
            <h2 class="your-story-headline">{s().headline}</h2>

            {/* Body with optional accent phrase */}
            <p class="your-story-body">
              <For each={segments()}>
                {(seg) =>
                  seg.isAccent
                    ? <span class="your-story-accent">{seg.text}</span>
                    : seg.text
                }
              </For>
            </p>

            {/* Quiet footer line — a poetic anchor */}
            <p class="your-story-footer">A reflection, not a record.</p>
          </div>
        </section>
      )}
    </Show>
  );
};

export default YourStoryCard;
