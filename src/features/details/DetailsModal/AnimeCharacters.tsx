// src/features/details/DetailsModal/AnimeCharacters.tsx
//
// AnimeCharacters — AniList Characters & Voice Actors section.
//
// Extracted from AnimeSections to replace TMDB Cast for anime titles.
// This section renders in the same slot where DetailsCast would go
// for movies/TV, so anime pages show animated characters + voice
// actors instead of real actors.
//
// For anime users, characters and voice actors are more relevant
// than live-action cast. This section replaces the TMDB Cast section
// entirely — never both are shown for the same title.
//
// Gated by the admin `charactersStaff` setting.

import { For, Show, type Component } from "solid-js";
import type { Accessor } from "solid-js";
import DetailSection from "~/features/details/components/DetailSection";
import type { AniListMedia } from "~/lib/anilist";

interface AnimeCharactersProps {
  anilist: Accessor<AniListMedia | null>;
  /** Whether the admin has enabled the characters/staff section. */
  enabled: Accessor<boolean>;
}

const AnimeCharacters: Component<AnimeCharactersProps> = (props) => {
  // Top characters (limit to 8 for the grid).
  const characters = () => {
    const m = props.anilist();
    const edges = m?.characters?.edges;
    if (!edges || edges.length === 0) return [];
    return edges.slice(0, 8);
  };

  return (
    <Show when={props.enabled() && characters().length > 0}>
      <DetailSection label="Characters & Voice Actors" icon="groups">
        <div class="anime-characters-grid">
          <For each={characters()}>
            {(edge) => (
              <div class="anime-character-card">
                <Show
                  when={edge.node.image?.large || edge.node.image?.medium}
                  fallback={
                    <div class="anime-character-image-placeholder">
                      <span class="material-symbols-outlined" aria-hidden="true">
                        person
                      </span>
                    </div>
                  }
                >
                  {(img) => (
                    <img
                      src={img()}
                      alt={edge.node.name.full || "Character"}
                      class="anime-character-image"
                      loading="lazy"
                      decoding="async"
                    />
                  )}
                </Show>
                <div class="anime-character-info">
                  <div class="anime-character-name">
                    {edge.node.name.full || edge.node.name.native || "Unknown"}
                  </div>
                  <div class="anime-character-role">{edge.role || ""}</div>
                  <Show when={edge.voiceActors && edge.voiceActors.length > 0}>
                    <div class="anime-character-va">
                      <Show when={edge.voiceActors![0].image?.large || edge.voiceActors![0].image?.medium}>
                        {(vaImg) => (
                          <img
                            src={vaImg()}
                            alt=""
                            class="anime-va-image"
                            loading="lazy"
                            aria-hidden="true"
                          />
                        )}
                      </Show>
                      <span>{edge.voiceActors![0].name.full || ""}</span>
                    </div>
                  </Show>
                </div>
              </div>
            )}
          </For>
        </div>
      </DetailSection>
    </Show>
  );
};

export default AnimeCharacters;
