// src/features/profile/components/ProfileCompletion.tsx
import { For, Show, type Component } from "solid-js";
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
 * ProfileCompletion — an elegant checklist, not a percentage bar.
 *
 * Shows the user what's missing from their profile. Each item is a
 * tappable CTA that opens the corresponding picker. When all items
 * are complete, the entire section hides (the parent gates on
 * `isComplete()`).
 *
 * Items:
 *   ✓ Add Bio
 *   ✓ Choose Favorite Movie
 *   ✓ Choose Favorite Series
 *   ✓ Choose Favorite Director
 *   ✓ Choose Favorite Genre
 */
const ProfileCompletion: Component<ProfileCompletionProps> = (props) => {
  const items = (): CompletionItem[] => {
    const p = props.data?.profile;
    return [
      { slot: "bio", label: "Add a bio", done: !!(p?.bio && p.bio.trim().length > 0) },
      { slot: "movie", label: "Choose your favorite movie", done: !!p?.favorite_movie_id },
      { slot: "series", label: "Choose your favorite series", done: !!p?.favorite_series_id },
      { slot: "director", label: "Choose your favorite director", done: !!p?.favorite_director_id },
      { slot: "genre", label: "Choose your favorite genre", done: !!p?.favorite_genre },
    ];
  };

  return (
    <div class="completion-card">
      <p class="completion-title">
        <span class="material-symbols-outlined" style={{ "font-size": "12px", color: "var(--p)" }} aria-hidden="true">
          task_alt
        </span>
        Complete your profile
      </p>
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
            </li>
          )}
        </For>
      </ul>
    </div>
  );
};

export default ProfileCompletion;
