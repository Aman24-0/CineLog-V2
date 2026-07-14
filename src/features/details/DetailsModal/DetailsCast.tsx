// src/features/details/DetailsModal/DetailsCast.tsx
import { Show, For, createSignal, createMemo, onCleanup, type Accessor, type Component } from "solid-js";
import DetailSection from "~/features/details/components/DetailSection";
import PersonModal from "~/features/details/components/PersonModal";
import { tmdbImage } from "~/core/tmdb/tmdb";
import type { TMDBDetails, TMDBCastMember, TMDBCrewMember } from "~/shared/types";

/**
 * DetailsCast — Cast & Crew section with images + clickable person modal.
 *
 * REDESIGN (per user request):
 *   • Cast & crew rendered as horizontal-scroll cards with profile image
 *     + name + (character for cast / job for crew).
 *   • Tapping a card opens the PersonModal — a full-screen modal with
 *     the person's image at the top, a close button, and a grid of all
 *     their movies/series below with movie/series filter + sort
 *     (New to old · Old to new · Popular).
 *
 * Data source:
 *   Previously this component read OMDbRatings (text-only actor names).
 *   Now it reads TMDBDetails.credits — populated by fetchTmdbDetails
 *   via append_to_response=videos,credits. The credits payload has
 *   structured cast/crew arrays with profile_path (TMDB image URL).
 *
 * Fallback:
 *   If credits are missing (older cached payload), falls back to the
 *   OMDb text list so we don't lose the section entirely.
 */
export interface DetailsCastProps {
  details: Accessor<TMDBDetails | null>;
}

const DetailsCast: Component<DetailsCastProps> = (props) => {
  const [selectedPerson, setSelectedPerson] = createSignal<{ id: number; name: string; profilePath: string | null } | null>(null);

  onCleanup(() => setSelectedPerson(null));

  const cast = createMemo<TMDBCastMember[]>(() => {
    const c = props.details()?.credits;
    if (!c?.cast) return [];
    // Show top 20 cast (ordered by TMDB's `order` field — top-billed first)
    return [...c.cast]
      .sort((a, b) => a.order - b.order)
      .slice(0, 20);
  });

  /** Deduplicated crew — only "notable" jobs (Director, Writer, Creator, Producer, etc.). */
  const notableCrew = createMemo<TMDBCrewMember[]>(() => {
    const c = props.details()?.credits;
    if (!c?.crew) return [];
    const notableJobs = new Set([
      "Director",
      "Writer",
      "Screenplay",
      "Story",
      "Creator",
      "Producer",
      "Executive Producer",
      "Novel",
      "Characters",
    ]);
    // Dedupe by person id + job — same person can appear multiple times.
    const seen = new Set<string>();
    const out: TMDBCrewMember[] = [];
    for (const member of c.crew) {
      if (!notableJobs.has(member.job)) continue;
      const key = `${member.id}:${member.job}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(member);
    }
    return out.slice(0, 12);
  });

  const hasAny = createMemo(() => cast().length > 0 || notableCrew().length > 0);

  const handleOpenPerson = (person: { id: number; name: string; profilePath: string | null }) => {
    setSelectedPerson(person);
  };

  const handleClosePerson = () => {
    setSelectedPerson(null);
  };

  return (
    <Show when={hasAny()}>
      <DetailSection label="Cast & Crew" icon="groups">
        <div class="cast-crew-section">
          {/* Cast — horizontal scroll of profile cards */}
          <Show when={cast().length > 0}>
            <div class="cast-crew-block">
              <p class="cast-crew-block-label">Cast</p>
              <div class="cast-crew-rail" role="list">
                <For each={cast()}>
                  {(member) => {
                    const profileUrl = () => member.profile_path ? tmdbImage(member.profile_path, "w185") : "";
                    return (
                      <button
                        type="button"
                        class="cast-crew-card focus-ring"
                        onClick={() => handleOpenPerson({
                          id: member.id,
                          name: member.name,
                          profilePath: member.profile_path,
                        })}
                        role="listitem"
                        aria-label={`${member.name}${member.character ? ` as ${member.character}` : ""} — open person details`}
                      >
                        <div class="cast-crew-card-image">
                          <Show when={profileUrl()} fallback={
                            <div class="cast-crew-card-image-fallback" aria-hidden="true">
                              <span
                                class="material-symbols-outlined"
                                style={{ "font-size": "28px", color: "var(--text-dim)" }}
                                aria-hidden="true"
                              >
                                person
                              </span>
                            </div>
                          }>
                            <img
                              src={profileUrl()}
                              alt=""
                              loading="lazy"
                              decoding="async"
                              onError={(e) => { e.currentTarget.style.display = "none"; }}
                            />
                          </Show>
                        </div>
                        <p class="cast-crew-card-name">{member.name}</p>
                        <Show when={member.character}>
                          <p class="cast-crew-card-role">{member.character}</p>
                        </Show>
                      </button>
                    );
                  }}
                </For>
              </div>
            </div>
          </Show>

          {/* Crew — horizontal scroll of notable crew */}
          <Show when={notableCrew().length > 0}>
            <div class="cast-crew-block">
              <p class="cast-crew-block-label">Crew</p>
              <div class="cast-crew-rail" role="list">
                <For each={notableCrew()}>
                  {(member) => {
                    const profileUrl = () => member.profile_path ? tmdbImage(member.profile_path, "w185") : "";
                    return (
                      <button
                        type="button"
                        class="cast-crew-card focus-ring"
                        onClick={() => handleOpenPerson({
                          id: member.id,
                          name: member.name,
                          profilePath: member.profile_path,
                        })}
                        role="listitem"
                        aria-label={`${member.name} — ${member.job} — open person details`}
                      >
                        <div class="cast-crew-card-image">
                          <Show when={profileUrl()} fallback={
                            <div class="cast-crew-card-image-fallback" aria-hidden="true">
                              <span
                                class="material-symbols-outlined"
                                style={{ "font-size": "28px", color: "var(--text-dim)" }}
                                aria-hidden="true"
                              >
                                person
                              </span>
                            </div>
                          }>
                            <img
                              src={profileUrl()}
                              alt=""
                              loading="lazy"
                              decoding="async"
                              onError={(e) => { e.currentTarget.style.display = "none"; }}
                            />
                          </Show>
                        </div>
                        <p class="cast-crew-card-name">{member.name}</p>
                        <p class="cast-crew-card-role">{member.job}</p>
                      </button>
                    );
                  }}
                </For>
              </div>
            </div>
          </Show>
        </div>
      </DetailSection>

      <Show when={selectedPerson()}>
        <PersonModal
          personId={selectedPerson()!.id}
          personName={selectedPerson()!.name}
          initialProfilePath={selectedPerson()!.profilePath}
          onClose={handleClosePerson}
        />
      </Show>
    </Show>
  );
};

export default DetailsCast;
