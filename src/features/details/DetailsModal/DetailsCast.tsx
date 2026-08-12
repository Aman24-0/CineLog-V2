// src/features/details/DetailsModal/DetailsCast.tsx
import {
  Show,
  For,
  createSignal,
  createMemo,
  onCleanup,
  lazy,
  Suspense,
  type Accessor,
  type Component
} from "solid-js";
import DetailSection from "~/features/details/components/DetailSection";
import { tmdbImage } from "~/core/tmdb/tmdb";
import type {
  TMDBDetails,
  TMDBCastMember,
  TMDBAggregateCastMember
} from "~/shared/types";

// Dynamic import — PersonModal is a heavy component (full-screen modal
// with its own TMDB API calls). Lazy loading reduces initial bundle
// size since it's only needed when a user clicks a cast/crew card.
const PersonModal = lazy(
  () => import("~/features/details/components/PersonModal")
);

/**
 * Build a person's initials from their name.
 *
 * Rules:
 *   - Split on whitespace, take the first letter of the first two tokens.
 *   - Single-token names: take the first two letters of the token.
 *   - Empty/whitespace-only input: returns "?".
 *
 * Examples:
 *   "Honey Irani"      → "HI"
 *   "Christopher Nolan" → "CN"
 *   "Bong Joon-ho"     → "BJ"
 *   "Prince"           → "PR"
 *   ""                 → "?"
 *
 * Used for the cast/crew card avatar fallback when `profile_path` is
 * null (no headshot available). Previously showed a generic
 * material-icon `person` glyph, which gave every missing-photo crew
 * member an identical, anonymous look. Initials give each person a
 * distinct, recognizable avatar on a dark glass background.
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
 *
 * The TMDB credits payload lists a person once per job — so a writer
 * who did both "Story" and "Screenplay" appears as two separate
 * `TMDBCrewMember` rows. This shape merges them into one card.
 */
interface MergedCrewMember {
  id: number;
  name: string;
  /** All jobs for this person, in the order they appeared in the payload, joined by ", ". */
  jobs: string;
  profile_path: string | null;
}

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
 * CREW DEDUPLICATION (v2.5):
 *   The TMDB credits payload lists a person once per job. A writer who
 *   did both "Story" and "Screenplay" appeared as two duplicate cards
 *   with the same headshot and name — only the job label differed.
 *   Now `notableCrew` merges crew entries by `id`, joining their jobs
 *   into a comma-separated string ("Story, Screenplay") so a single
 *   card renders per person.
 *
 * AVATAR FALLBACK (v2.5):
 *   When `profile_path` is null (no headshot), the card previously
 *   showed a generic material-icon `person` glyph — every missing-photo
 *   crew member looked identical. Now the fallback extracts the
 *   person's initials (e.g. "Honey Irani" → "HI") and renders them on
 *   a dark glass background, giving each person a distinct, recognizable
 *   avatar.
 *
 * TV AGGREGATE CREDITS (v2.6):
 *   For TV series, TMDB's regular `/tv/{id}/credits` endpoint only
 *   returns a small subset of the cast (often just 1-2 people for
 *   older shows like *Dark*) — it's meant for "current season" cast.
 *   The `aggregate_credits` payload lists EVERY person who appeared in
 *   ANY episode across ALL seasons, with per-season/per-episode role
 *   detail. `fetchTmdbDetails` now appends `aggregate_credits` for TV
 *   titles, and this component prefers `details.aggregate_credits.cast`
 *   over `details.credits.cast` when the media type is TV and the
 *   aggregate payload is present. This fixes the bug where TV shows
 *   showed only 1-2 cast members instead of the full main cast.
 *
 *   For movies, the regular `credits.cast` is used (movies don't have
 *   aggregate_credits).
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
  const [selectedPerson, setSelectedPerson] = createSignal<{
    id: number;
    name: string;
    profilePath: string | null;
  } | null>(null);

  onCleanup(() => setSelectedPerson(null));

  /**
   * Cast list — prefers `aggregate_credits.cast` for TV (which
   * includes the full series cast across all seasons) and falls back
   * to `credits.cast` for movies or when the aggregate payload isn't
   * available (e.g. older cached responses that predate v2.6).
   *
   * The aggregate cast has a different shape than regular cast —
   * each member has a `roles` array (per-season/per-credit breakdown)
   * instead of a single `character` field. We flatten the roles into
   * a comma-separated character string ("Rick Grimes, Rick Grimes (voice)")
   * and use the total episode count for sorting.
   *
   * Sorting:
   *   - Aggregate cast: by total_episode_count desc (most appearances
   *     first). TMDB sets `order` to 0 for all aggregate entries.
   *   - Regular cast: by `order` asc (TMDB's top-billing order).
   *
   * Capped at 20 entries to keep the rail scrollable and the DOM
   * size reasonable. Even with the full series cast, the top 20 by
   * episode count is the right "main cast" cutoff.
   */
  const cast = createMemo<TMDBCastMember[]>(() => {
    const d = props.details();
    if (!d) return [];
    const isTv = d.media_type === "tv";
    const aggregate = isTv ? d.aggregate_credits?.cast : undefined;
    if (aggregate && aggregate.length > 0) {
      // Flatten aggregate cast into the regular TMDBCastMember shape
      // so the rest of the component (rendering, PersonModal wiring)
      // doesn't need to know about the aggregate vs regular distinction.
      return aggregate
        .map((m: TMDBAggregateCastMember) => {
          // Combine all character names — dedupe identical strings so
          // "Rick Grimes" + "Rick Grimes" doesn't show as "Rick Grimes, Rick Grimes".
          const characters = Array.from(
            new Set(
              (m.roles ?? [])
                .map((r) => r.character)
                .filter((c): c is string => !!c && c.trim().length > 0)
            )
          );
          const totalEpisodes =
            m.total_episode_count ??
            (m.roles ?? []).reduce((sum, r) => sum + (r.episode_count ?? 0), 0);
          const characterStr =
            characters.length > 0 ? characters.join(", ") : undefined;
          return {
            id: m.id,
            name: m.name,
            character: characterStr,
            profile_path: m.profile_path,
            // Stash the total episode count in `episodes_count` so the
            // sort below can use it. Cast to TMDBCastMember shape —
            // `episodes_count` is an existing optional field on that type.
            order: m.order ?? 0,
            episodes_count: totalEpisodes
          } as TMDBCastMember;
        })
        .sort((a, b) => {
          // Aggregate cast: sort by total episodes desc (main cast first).
          const ea = a.episodes_count ?? 0;
          const eb = b.episodes_count ?? 0;
          if (ea !== eb) return eb - ea;
          // Tiebreaker: name asc for stable ordering.
          return a.name.localeCompare(b.name);
        })
        .slice(0, 20);
    }
    // Regular credits (movies, or TV without aggregate_credits).
    const c = d.credits;
    if (!c?.cast) return [];
    return [...c.cast].sort((a, b) => a.order - b.order).slice(0, 20);
  });

  /**
   * Deduplicated notable crew — grouped by person `id`, with all their
   * notable jobs joined into a single comma-separated string.
   *
   * Why group by `id` (not name): TMDB ids are stable per-person, while
   * name strings can collide (two different "John Smith"s would merge
   * incorrectly). Grouping by id is the correct identity.
   *
   * Why keep job order: the crew payload lists jobs in roughly
   * importance order (Director before Writer before Producer), so
   * joining in payload order preserves the natural "primary role
   * first" display.
   */
  const notableCrew = createMemo<MergedCrewMember[]>(() => {
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
      "Characters"
    ]);

    // Group by person id, preserving first-seen order so the rail
    // stays stable across renders (no reshuffling when refetching).
    const byId = new Map<number, MergedCrewMember>();
    for (const member of c.crew) {
      if (!notableJobs.has(member.job)) continue;
      const existing = byId.get(member.id);
      if (existing) {
        // Append this job — avoid duplicate job strings (e.g. two
        // "Director" entries for the same person in different units).
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

  const hasAny = createMemo(
    () => cast().length > 0 || notableCrew().length > 0
  );

  const handleOpenPerson = (person: {
    id: number;
    name: string;
    profilePath: string | null;
  }) => {
    setSelectedPerson(person);
  };

  const handleClosePerson = () => {
    setSelectedPerson(null);
  };

  return (
    <Show when={hasAny()}>
      <DetailSection label="Cast & Crew" icon="groups">
        <div class="cast-crew-section">
          {/* Cast — horizontal scroll of profile cards.
              For TV series, this is sourced from aggregate_credits
              (the full series cast across all seasons). For movies,
              it's the regular credits.cast (top-billed first). */}
          <Show when={cast().length > 0}>
            <div class="cast-crew-block">
              <p class="cast-crew-block-label">Cast</p>
              <div class="cast-crew-rail" role="list">
                <For each={cast()}>
                  {(member) => {
                    const profileUrl = () =>
                      member.profile_path
                        ? tmdbImage(member.profile_path, "w185")
                        : "";
                    return (
                      <button
                        type="button"
                        class="cast-crew-card focus-ring"
                        onClick={() =>
                          handleOpenPerson({
                            id: member.id,
                            name: member.name,
                            profilePath: member.profile_path
                          })
                        }
                        role="listitem"
                        aria-label={`${member.name}${member.character ? ` as ${member.character}` : ""} — open person details`}
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
                              width={185}
                              height={185}
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
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

          {/* Crew — horizontal scroll of notable crew (deduplicated by id) */}
          <Show when={notableCrew().length > 0}>
            <div class="cast-crew-block">
              <p class="cast-crew-block-label">Crew</p>
              <div class="cast-crew-rail" role="list">
                <For each={notableCrew()}>
                  {(member) => {
                    const profileUrl = () =>
                      member.profile_path
                        ? tmdbImage(member.profile_path, "w185")
                        : "";
                    return (
                      <button
                        type="button"
                        class="cast-crew-card focus-ring"
                        onClick={() =>
                          handleOpenPerson({
                            id: member.id,
                            name: member.name,
                            profilePath: member.profile_path
                          })
                        }
                        role="listitem"
                        aria-label={`${member.name} — ${member.jobs} — open person details`}
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
                              width={185}
                              height={185}
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                          </Show>
                        </div>
                        <p class="cast-crew-card-name">{member.name}</p>
                        <p class="cast-crew-card-role">{member.jobs}</p>
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
        <Suspense fallback={<div class="v2-card h-24 animate-pulse" />}>
          <PersonModal
            personId={selectedPerson()!.id}
            personName={selectedPerson()!.name}
            initialProfilePath={selectedPerson()!.profilePath}
            onClose={handleClosePerson}
          />
        </Suspense>
      </Show>
    </Show>
  );
};

export default DetailsCast;
