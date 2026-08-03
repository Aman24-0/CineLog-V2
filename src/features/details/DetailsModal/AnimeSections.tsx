// src/features/details/DetailsModal/AnimeSections.tsx
//
// AnimeSections — renders AniList-specific enrichment sections inside
// the Details modal.
//
// REFACTORED: Stats, Studio, and Characters sections have been MOVED
// out of this component:
//   - AniList Stats → merged into MetadataGrid (Popularity, Favourites, Ranking, Season, Format, Episodes cells)
//   - Studio → merged into MetadataGrid (Studio cell using AniList data)
//   - Characters & Voice Actors → moved to replace DetailsCast for anime (rendered by AnimeCharacters in DetailsModal)
//
// This component now only renders:
//   1. Relations — prequels, sequels, side stories, spin-offs
//   2. Source Material — Manga / Light Novel / Original + AniList link
//   3. Opening & Ending Themes — song list
//   4. Airing Schedule — next episode number, date, time
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

  return (
    <>
      {/* 1. Relations */}
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

      {/* 2. Source Material */}
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

      {/* 3. Opening & Ending Themes */}
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

      {/* 4. Airing Schedule */}
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
