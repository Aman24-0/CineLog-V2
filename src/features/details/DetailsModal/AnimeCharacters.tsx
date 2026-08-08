// src/features/details/DetailsModal/AnimeCharacters.tsx
//
// AnimeCharacters — AniList Characters & Voice Actors + Crew section.
//
// For anime titles, this replaces the TMDB Cast & Crew section entirely.
// The layout is:
//   1. Characters & Voice Actors — grid of AniList characters with VA info
//   2. Crew — horizontal scrolling carousel of TMDB crew filtered to
//      anime-relevant roles (Director, Producer, Script, Music,
//      Animation Director, Series Composition, etc.)
//
// Characters are the primary focus (grid). Crew is secondary (carousel).
// This hierarchy feels natural for anime — characters and VAs matter more
// than live-action crew.
//
// Gated by the admin `charactersStaff` setting.

import { For, Show, createMemo, type Component } from "solid-js";
import type { Accessor } from "solid-js";
import DetailSection from "~/features/details/components/DetailSection";
import type { AniListMedia } from "~/lib/anilist";
import type { TMDBDetails } from "~/shared/types";
import { tmdbImage } from "~/core/tmdb/tmdb";

interface AnimeCharactersProps {
  anilist: Accessor<AniListMedia | null>;
  /** Whether the admin has enabled the characters/staff section. */
  enabled: Accessor<boolean>;
  /** TMDB details — used for crew data (anime-relevant roles). */
  details?: Accessor<TMDBDetails | null>;
}

/**
 * Build a person's initials from their name.
 * Used for the crew card avatar fallback when profile_path is null.
 */
function getInitials(name: string): string {
  const trimmed = (name || "").trim();
  if (!trimmed) return "?";
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length === 1) {
    const t = tokens[0];
    return t.length >= 2 ? t.slice(0, 2).toUpperCase() : t.toUpperCase();
  }
  return (tokens[0][0] + tokens[1][0]).toUpperCase();
}

/**
 * A single deduplicated crew entry.
 * TMDB lists a person once per job — this merges them into one card.
 */
interface MergedCrewMember {
  id: number;
  name: string;
  /** All jobs for this person, joined by ", ". */
  jobs: string;
  profile_path: string | null;
}

const AnimeCharacters: Component<AnimeCharactersProps> = (props) => {
  // Top characters (limit to 8 for the grid).
  const characters = () => {
    const m = props.anilist();
    const edges = m?.characters?.edges;
    if (!edges || edges.length === 0) return [];
    return edges.slice(0, 8);
  };

  /**
   * Anime-relevant crew — filtered to roles that matter for anime.
   * Unlike movies/TV where "Writer" and "Screenplay" are key,
   * anime crew roles are different: Director, Script, Music,
   * Animation Director, Series Composition, etc.
   *
   * Deduplicated by person id — if someone has multiple jobs,
   * they're joined into a single card (e.g. "Director, Script").
   */
  const animeCrew = createMemo<MergedCrewMember[]>(() => {
    const d = props.details?.();
    if (!d?.credits?.crew) return [];
    const notableJobs = new Set([
      "Director",
      "Producer",
      "Executive Producer",
      "Script",
      "Music",
      "Animation Director",
      "Series Composition",
      "Original Creator",
      "Character Design",
      "Art Director",
      "Sound Director",
      "Chief Animation Director",
      "Assistant Director",
      "Theme Song Composition",
      "Theme Song Lyrics",
      "Theme Song Performance",
      "Theme Song Arrangement"
    ]);

    const byId = new Map<number, MergedCrewMember>();
    for (const member of d.credits.crew) {
      if (!notableJobs.has(member.job)) continue;
      const existing = byId.get(member.id);
      if (existing) {
        if (!existing.jobs.includes(member.job)) {
          existing.jobs = existing.jobs
            ? `${existing.jobs}, ${member.job}`
            : member.job;
        }
      } else {
        byId.set(member.id, {
          id: member.id,
          name: member.name,
          jobs: member.job,
          profile_path: member.profile_path
        });
      }
    }
    return Array.from(byId.values()).slice(0, 12);
  });

  const hasCharacters = () => characters().length > 0;
  const hasCrew = () => animeCrew().length > 0;
  const hasAny = () => hasCharacters() || hasCrew();

  return (
    <Show when={props.enabled() && hasAny()}>
      <DetailSection label="Characters & Voice Actors" icon="groups">
        {/* Characters grid — primary focus for anime */}
        <Show when={hasCharacters()}>
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
        </Show>

        {/* Crew — horizontal scrolling carousel (secondary focus for anime).
            Shows anime-relevant roles: Director, Script, Music,
            Animation Director, Series Composition, etc. */}
        <Show when={hasCrew()}>
          <div class="cast-crew-block" style={{ "margin-top": hasCharacters() ? "var(--space-3)" : "0" }}>
            <p class="cast-crew-block-label">Crew</p>
            <div class="cast-crew-rail" role="list">
              <For each={animeCrew()}>
                {(member) => {
                  const profileUrl = () =>
                    member.profile_path
                      ? tmdbImage(member.profile_path, "w185")
                      : "";
                  return (
                    <div
                      class="cast-crew-card"
                      role="listitem"
                      aria-label={`${member.name} — ${member.jobs}`}
                    >
                      <div class="cast-crew-card-image">
                        <Show
                          when={profileUrl()}
                          fallback={
                            <div
                              class="cast-crew-card-image-fallback cast-crew-card-initials"
                              aria-hidden="true"
                            >
                              <span>{getInitials(member.name)}</span>
                            </div>
                          }
                        >
                          <img
                            src={profileUrl()}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        </Show>
                      </div>
                      <p class="cast-crew-card-name">{member.name}</p>
                      <p class="cast-crew-card-role">{member.jobs}</p>
                    </div>
                  );
                }}
              </For>
            </div>
          </div>
        </Show>
      </DetailSection>
    </Show>
  );
};

export default AnimeCharacters;
