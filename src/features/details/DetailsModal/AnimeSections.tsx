// src/features/details/DetailsModal/AnimeSections.tsx
//
// AnimeSections — renders AniList-specific enrichment sections inside
// the Details modal.
//
// This component is a SINGLE entry point that conditionally renders
// each sub-section based on:
//   1. Whether the AniList data is present (some fields may be missing
//      even for mapped anime — e.g. openings/endings are community-
//      moderated and often empty).
//   2. Whether the admin has enabled the corresponding feature toggle
//      in /admin/settings → Anime (charactersStaff, relations,
//      airingSchedule, openingEndingThemes).
//
// SECTIONS RENDERED (in order):
//   1. AniList Score + Popularity + Rank stats strip
//   2. Studio(s) — main animation studios
//   3. Characters & Voice Actors — grid with character images + VA names
//   4. Relations — prequels, sequels, side stories, spin-offs (clickable)
//   5. Source Material — Manga / Light Novel / Original / etc.
//   6. Opening & Ending Themes — song list with artists
//   7. Airing Schedule — next episode number, date, time
//
// All sections are optional. If a section has no data, it simply
// doesn't render (no empty boxes, no "no data" placeholders).
//
// STYLING:
//   Uses the existing Glass design system + .detail-section CSS so
//   the anime sections look native to the Details modal.

import { For, Show, type Component } from "solid-js";
import type { Accessor } from "solid-js";
import DetailSection from "~/features/details/components/DetailSection";
import type { AniListMedia } from "~/lib/anilist";
import type { AnimeSettings } from "~/features/anime/useAnimeSettings";

interface AnimeSectionsProps {
  anilist: Accessor<AniListMedia | null>;
  settings: Accessor<Pick<AnimeSettings,
    "charactersStaff" | "relations" | "airingSchedule" | "openingEndingThemes">>;
}

// ─── Helpers ────────────────────────────────────────────────────────

function formatSeason(season: string | null | undefined, year: number | null | undefined): string {
  if (!season && !year) return "";
  if (!season) return String(year);
  if (!year) return season;
  return `${season.charAt(0) + season.slice(1).toLowerCase()} ${year}`;
}

function formatAiringDate(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatTimeUntil(unixSeconds: number): string {
  const now = Date.now();
  const airing = unixSeconds * 1000;
  const diff = airing - now;
  if (diff <= 0) return "Aired";
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  if (days > 0) return `in ${days}d ${hours}h`;
  const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
  if (hours > 0) return `in ${hours}h ${minutes}m`;
  return `in ${minutes}m`;
}

const SOURCE_LABELS: Record<string, string> = {
  ORIGINAL: "Original",
  MANGA: "Manga",
  LIGHT_NOVEL: "Light Novel",
  VISUAL_NOVEL: "Visual Novel",
  VIDEO_GAME: "Video Game",
  OTHER: "Other",
  NOVEL: "Novel",
  DOUJINSHI: "Doujinshi",
  ANIME: "Anime",
  WEB_NOVEL: "Web Novel",
  LIVE_ACTION: "Live Action",
  GAME: "Game",
  COMIC: "Comic",
  MULTIMEDIA_PROJECT: "Multimedia Project",
  PICTURE_BOOK: "Picture Book"
};

// ─── Component ──────────────────────────────────────────────────────

const AnimeSections: Component<AnimeSectionsProps> = (props) => {
  const media = () => props.anilist();

  // Main studio (animation studio) — AniList returns isMain on the edge.
  const mainStudios = () => {
    const m = media();
    const edges = m?.studios?.edges;
    if (!edges || edges.length === 0) return [];
    return edges
      .filter((e) => e.isMain && e.node?.isAnimationStudio)
      .map((e) => e.node)
      .filter((s): s is NonNullable<typeof s> => s != null);
  };

  // Top characters (limit to 8 for the grid).
  const characters = () => {
    const m = media();
    const edges = m?.characters?.edges;
    if (!edges || edges.length === 0) return [];
    return edges.slice(0, 8);
  };

  // Relations — filter out manga relations (we only show anime).
  const relations = () => {
    const m = media();
    const edges = m?.relations?.edges;
    if (!edges || edges.length === 0) return [];
    return edges.filter((e) => e.node?.type === "ANIME").slice(0, 12);
  };

  // Openings / Endings.
  const openings = () => media()?.openings ?? [];
  const endings = () => media()?.endings ?? [];

  // Next airing episode.
  const nextAiring = () => media()?.nextAiringEpisode ?? null;

  // AniList score + popularity stats.
  const stats = () => {
    const m = media();
    if (!m) return null;
    const items: Array<{ label: string; value: string }> = [];
    if (m.averageScore != null) {
      items.push({ label: "AniList Score", value: (m.averageScore / 10).toFixed(1) });
    }
    if (m.popularity != null) {
      items.push({
        label: "Popularity",
        value: m.popularity >= 1000
          ? `${(m.popularity / 1000).toFixed(1)}k`
          : String(m.popularity)
      });
    }
    if (m.favourites != null) {
      items.push({
        label: "Favourites",
        value: m.favourites >= 1000
          ? `${(m.favourites / 1000).toFixed(1)}k`
          : String(m.favourites)
      });
    }
    const seasonStr = formatSeason(m.season, m.seasonYear);
    if (seasonStr) items.push({ label: "Season", value: seasonStr });
    if (m.format) items.push({ label: "Format", value: m.format });
    if (m.episodes != null) items.push({ label: "Episodes", value: String(m.episodes) });
    return items.length > 0 ? items : null;
  };

  // Top rank (all-time rated or popular).
  const topRank = () => {
    const m = media();
    if (!m?.rankings || m.rankings.length === 0) return null;
    // Pick the highest all-time rated rank.
    const rated = m.rankings.filter((r) => r.type === "RATED" && r.allTime);
    if (rated.length > 0) {
      const top = rated.sort((a, b) => a.rank - b.rank)[0];
      return `#${top.rank} Highest Rated (All Time)`;
    }
    const popular = m.rankings.filter((r) => r.type === "POPULAR" && r.allTime);
    if (popular.length > 0) {
      const top = popular.sort((a, b) => a.rank - b.rank)[0];
      return `#${top.rank} Most Popular (All Time)`;
    }
    return null;
  };

  return (
    <>
      {/* 1. AniList stats strip — only if any stats available */}
      <Show when={stats()}>
        {(s) => (
          <DetailSection label="AniList Stats" icon="analytics">
            <div class="anime-stats-grid">
              <For each={s()}>
                {(stat) => (
                  <div class="anime-stat-card">
                    <div class="anime-stat-value">{stat.value}</div>
                    <div class="anime-stat-label">{stat.label}</div>
                  </div>
                )}
              </For>
            </div>
            <Show when={topRank()}>
              {(r) => (
                <div class="anime-rank-badge">
                  <span class="material-symbols-outlined" aria-hidden="true" style={{ "font-size": "14px" }}>
                    emoji_events
                  </span>
                  {r()}
                </div>
              )}
            </Show>
          </DetailSection>
        )}
      </Show>

      {/* 2. Studios */}
      <Show when={mainStudios().length > 0}>
        <DetailSection label="Studio" icon="business">
          <div class="anime-studios">
            <For each={mainStudios()}>
              {(studio) => (
                <span class="anime-studio-chip">{studio.name}</span>
              )}
            </For>
          </div>
        </DetailSection>
      </Show>

      {/* 3. Characters & Voice Actors */}
      <Show when={props.settings().charactersStaff && characters().length > 0}>
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

      {/* 4. Relations */}
      <Show when={props.settings().relations && relations().length > 0}>
        <DetailSection label="Relations" icon="account_tree">
          <div class="anime-relations-grid">
            <For each={relations()}>
              {(edge) => (
                <div class="anime-relation-card">
                  <Show
                    when={edge.node.coverImage?.large || edge.node.coverImage?.medium}
                    fallback={
                      <div class="anime-relation-image-placeholder">
                        <span class="material-symbols-outlined" aria-hidden="true">
                          movie
                        </span>
                      </div>
                    }
                  >
                    {(img) => (
                      <img
                        src={img()}
                        alt=""
                        class="anime-relation-image"
                        loading="lazy"
                        aria-hidden="true"
                      />
                    )}
                  </Show>
                  <div class="anime-relation-info">
                    <div class="anime-relation-type">
                      {(edge.relationType || "").replace(/_/g, " ").toLowerCase()}
                    </div>
                    <div class="anime-relation-title">
                      {edge.node.title?.english ||
                        edge.node.title?.romaji ||
                        edge.node.title?.native ||
                        "Untitled"}
                    </div>
                  </div>
                </div>
              )}
            </For>
          </div>
        </DetailSection>
      </Show>

      {/* 5. Source Material */}
      <Show when={media()?.source}>
        <DetailSection label="Source Material" icon="book">
          <div class="anime-source">
            <span class="anime-source-chip">
              {SOURCE_LABELS[media()!.source as string] ?? media()!.source}
            </span>
            <Show when={media()?.siteUrl}>
              <a
                href={media()!.siteUrl!}
                target="_blank"
                rel="noopener noreferrer"
                class="anime-source-link"
              >
                View on AniList
                <span class="material-symbols-outlined" aria-hidden="true" style={{ "font-size": "14px" }}>
                  open_in_new
                </span>
              </a>
            </Show>
          </div>
        </DetailSection>
      </Show>

      {/* 6. Opening & Ending Themes */}
      <Show
        when={
          props.settings().openingEndingThemes &&
          (openings().length > 0 || endings().length > 0)
        }
      >
        <DetailSection label="Theme Songs" icon="music_note">
          <Show when={openings().length > 0}>
            <div class="anime-themes-group">
              <div class="anime-themes-group-label">Openings</div>
              <For each={openings()}>
                {(op) => (
                  <div class="anime-theme-entry">
                    <span class="anime-theme-text">{op.text || "Untitled"}</span>
                    <Show when={op.episodes}>
                      <span class="anime-theme-episodes">Eps {op.episodes}</span>
                    </Show>
                  </div>
                )}
              </For>
            </div>
          </Show>
          <Show when={endings().length > 0}>
            <div class="anime-themes-group">
              <div class="anime-themes-group-label">Endings</div>
              <For each={endings()}>
                {(ed) => (
                  <div class="anime-theme-entry">
                    <span class="anime-theme-text">{ed.text || "Untitled"}</span>
                    <Show when={ed.episodes}>
                      <span class="anime-theme-episodes">Eps {ed.episodes}</span>
                    </Show>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </DetailSection>
      </Show>

      {/* 7. Airing Schedule */}
      <Show when={props.settings().airingSchedule && nextAiring()}>
        {(na) => (
          <DetailSection label="Airing Schedule" icon="schedule">
            <div class="anime-airing-card">
              <div class="anime-airing-episode">
                Episode {na().episode}
              </div>
              <div class="anime-airing-date">
                {formatAiringDate(na().airingAt)}
              </div>
              <div class="anime-airing-countdown">
                {formatTimeUntil(na().airingAt)}
              </div>
            </div>
          </DetailSection>
        )}
      </Show>
    </>
  );
};

export default AnimeSections;
