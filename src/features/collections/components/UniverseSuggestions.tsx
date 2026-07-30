// src/features/collections/components/UniverseSuggestions.tsx
import { For, Show } from "solid-js";
import { useCollections } from "../hooks/useCollections";
import { tmdbImage } from "~/core/tmdb/tmdb";
import type { SuggestedUniverse } from "~/shared/data/suggestedUniverses";

/**
 * UniverseSuggestions — horizontal rail of suggested universes.
 *
 * Shows universes the user hasn't added yet. Each card has
 * Add and Hide actions. Hidden universes can be restored
 * from a separate "Hidden Universes" section.
 */
export default function UniverseSuggestions() {
  const {
    suggestedUniverses,
    hiddenUniverses,
    addUniverseToPrefs,
    hideUniverseFromPrefs,
    restoreUniverseToPrefs
  } = useCollections();

  const handleAdd = (uni: SuggestedUniverse) => {
    addUniverseToPrefs(uni.id);
  };

  const handleHide = (uni: SuggestedUniverse) => {
    hideUniverseFromPrefs(uni.id);
  };

  return (
    <>
      <Show when={suggestedUniverses().length > 0}>
        <div class="collections-fold">
          <div class="collections-fold-label">
            <span
              class="material-symbols-outlined"
              style={{ "font-size": "12px", color: "var(--p)" }}
              aria-hidden="true"
            >
              lightbulb
            </span>
            Suggested Universes
          </div>
          <div class="universe-suggestion-rail hide-scrollbar" role="list">
            <For each={suggestedUniverses()}>
              {(uni) => (
                <div class="universe-suggestion-card" role="listitem">
                  <div class="universe-suggestion-poster">
                    <Show
                      when={uni.backdrop_path}
                      fallback={
                        <div class="universe-suggestion-poster-fallback">
                          <span
                            class="material-symbols-outlined"
                            style={{
                              "font-size": "24px",
                              color: "var(--text-dim)"
                            }}
                            aria-hidden="true"
                          >
                            movie
                          </span>
                        </div>
                      }
                    >
                      <img
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                        src={tmdbImage(uni.backdrop_path, "w500")}
                        class="universe-suggestion-img"
                        loading="lazy"
                        decoding="async"
                        alt=""
                        aria-hidden="true"
                      />
                    </Show>
                    <div
                      class="universe-suggestion-overlay"
                      aria-hidden="true"
                    />
                  </div>
                  <div class="universe-suggestion-info">
                    <p class="universe-suggestion-name">{uni.name}</p>
                    <p class="universe-suggestion-meta">
                      {uni.entryCount} titles
                    </p>
                  </div>
                  <div class="universe-suggestion-actions">
                    <button
                      type="button"
                      class="universe-suggestion-add-btn"
                      onClick={() => handleAdd(uni)}
                      aria-label={`Add ${uni.name}`}
                    >
                      <span
                        class="material-symbols-outlined"
                        style={{ "font-size": "16px" }}
                        aria-hidden="true"
                      >
                        add
                      </span>
                      Add
                    </button>
                    <button
                      type="button"
                      class="universe-suggestion-hide-btn"
                      onClick={() => handleHide(uni)}
                      aria-label={`Hide ${uni.name}`}
                    >
                      <span
                        class="material-symbols-outlined"
                        style={{ "font-size": "14px" }}
                        aria-hidden="true"
                      >
                        close
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>

      {/* Hidden universes — restore option */}
      <Show when={hiddenUniverses().length > 0}>
        <div class="collections-fold">
          <div class="collections-fold-label">
            <span
              class="material-symbols-outlined"
              style={{ "font-size": "12px", color: "var(--text-soft)" }}
              aria-hidden="true"
            >
              visibility_off
            </span>
            Hidden
          </div>
          <div class="universe-hidden-list">
            <For each={hiddenUniverses()}>
              {(uni) => (
                <div class="universe-hidden-item">
                  <span class="universe-hidden-name">{uni.name}</span>
                  <button
                    type="button"
                    class="universe-hidden-restore"
                    onClick={() => restoreUniverseToPrefs(uni.id)}
                    aria-label={`Restore ${uni.name}`}
                  >
                    Restore
                  </button>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>
    </>
  );
}
