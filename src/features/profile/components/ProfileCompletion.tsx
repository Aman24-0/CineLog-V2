// src/features/profile/components/ProfileCompletion.tsx
//
// Sprint 2B — Migrated to PremiumGlassSurface for surface treatment.
// Zero changes to progress logic, checklist items, or interactions.

import { For, Show, createMemo, type Component } from "solid-js";
import { PremiumGlassSurface } from "~/shared/ui/premium";
import type { ProfileData } from "../useProfileData";
import type { FavoriteSlot } from "./TasteCard";

interface ProfileCompletionProps {
  data: ProfileData | null;
  onPick: (slot: FavoriteSlot | "bio") => void;
}

interface CompletionItem {
  slot: FavoriteSlot | "bio";
  label: string;
  done: boolean;
}

/**
 * ProfileCompletion — "Build Your Cine Identity"
 *
 * An elegant checklist with animated progress. NOT a percentage bar —
 * it's a checklist with a circular progress indicator that fills as
 * the user completes each item. Hides automatically when complete.
 * Uses PremiumGlassSurface for consistent glass treatment.
 */
const ProfileCompletion: Component<ProfileCompletionProps> = (props) => {
  const items = createMemo((): CompletionItem[] => {
    const p = props.data?.profile;
    return [
      { slot: "bio", label: "Add a bio", done: !!(p?.bio && p.bio.trim().length > 0) },
      { slot: "movie", label: "Choose your favorite movie", done: !!p?.favorite_movie_id },
      { slot: "series", label: "Choose your favorite series", done: !!p?.favorite_series_id },
      { slot: "director", label: "Choose your favorite director", done: !!p?.favorite_director_id },
      { slot: "genre", label: "Choose your favorite genre", done: !!p?.favorite_genre },
    ];
  });

  const completedCount = createMemo(() => items().filter((i) => i.done).length);
  const totalCount = createMemo(() => items().length);
  const pct = createMemo(() => Math.round((completedCount() / totalCount()) * 100));

  // SVG circle progress
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = createMemo(() => circumference - (pct() / 100) * circumference);

  return (
    <PremiumGlassSurface strength="default" border padding="comfortable" radius="lg">
      <div class="completion-header">
        <div class="completion-progress-ring-wrap">
          <svg class="completion-progress-ring" width="48" height="48" viewBox="0 0 48 48">
            <circle
              cx="24" cy="24" r={radius}
              fill="none"
              stroke="var(--tier-1)"
              stroke-width="3"
            />
            <circle
              cx="24" cy="24" r={radius}
              fill="none"
              stroke="var(--p)"
              stroke-width="3"
              stroke-linecap="round"
              stroke-dasharray={String(circumference)}
              stroke-dashoffset={String(dashOffset())}
              style={{
                transition: "stroke-dashoffset 600ms var(--ease-smooth)",
                filter: "drop-shadow(0 0 4px var(--p-glow))",
              }}
              transform="rotate(-90 24 24)"
            />
          </svg>
          <span class="completion-pct">{pct()}%</span>
        </div>
        <div class="completion-header-text">
          <p class="completion-title">Build Your Cine Identity</p>
          <p class="completion-subtitle">
            {completedCount()} of {totalCount()} steps complete
          </p>
        </div>
      </div>
      <ul class="completion-list">
        <For each={items()}>
          {(item) => (
            <li
              class="completion-item focus-ring"
              data-done={item.done}
              role="button"
              tabindex={item.done ? -1 : 0}
              onClick={() => !item.done && props.onPick(item.slot)}
              onKeyDown={(e) => {
                if (!item.done && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  props.onPick(item.slot);
                }
              }}
              aria-label={item.done ? `${item.label} — done` : `${item.label} — tap to complete`}
            >
              <div class="completion-check" aria-hidden="true">
                <Show when={item.done}>
                  <span class="material-symbols-outlined completion-check-icon" aria-hidden="true">
                    check
                  </span>
                </Show>
              </div>
              <span class="completion-label">{item.label}</span>
              <Show when={!item.done}>
                <span class="material-symbols-outlined completion-arrow" aria-hidden="true">
                  chevron_right
                </span>
              </Show>
            </li>
          )}
        </For>
      </ul>
    </PremiumGlassSurface>
  );
};

export default ProfileCompletion;
