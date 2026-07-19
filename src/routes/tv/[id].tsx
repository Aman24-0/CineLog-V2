// src/routes/tv/[id].tsx
//
// Deep-link route for TV series — /tv/{tmdb_id}
//
// Mirror of /movie/[id].tsx but for series. The only differences:
//   - media_type is "tv" (so findInVault matches the TV namespace)
//   - OG type is "video.episode" (closer to "video.other" but
//     distinct from movies)
//   - Uses series title field (`name`, not `title`)
//
// See /movie/[id].tsx for the full architecture comment, including
// the critical `deferStream: true` for SSR-friendly OG tags.

import { lazy, createResource, Show, onMount } from "solid-js";
import { useParams } from "@solidjs/router";
import { Title, Meta } from "@solidjs/meta";
import { fetchTmdbMetadata } from "~/core/tmdb/tmdb";
import { openTitle, useModalState } from "~/shared/hooks/useModalState";
import { useVault } from "~/features/watchlist/useVault";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { getBaseUrl } from "~/shared/utils/share";
import type { WatchlistItem } from "~/shared/types";

const DetailsModal = lazy(() => import("~/features/details/DetailsModal"));

function buildBaseItem(meta: {
  id: number;
  title?: string;
  name?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  genres?: string[];
  overview?: string;
}): WatchlistItem {
  return {
    id: String(meta.id),
    title: meta.title,
    name: meta.name,
    media_type: "tv" as const,
    poster_path: meta.poster_path ?? null,
    backdrop_path: meta.backdrop_path ?? null,
    status: "Planned" as const,
    release_date: meta.release_date,
    first_air_date: meta.first_air_date,
    genresList: meta.genres,
  };
}

export default function TvDeepLinkRoute() {
  const params = useParams();
  const { selectedItem } = useModalState();
  const { watchlist } = useVault();

  // `deferStream: true` makes SSR wait for this resource before
  // sending HTML — critical for chat-app scrapers that don't run JS.
  const [meta] = createResource(
    () => params.id,
    async (id: string) => {
      if (!id) return null;
      if (!/^\d+$/.test(id)) return null;
      return fetchTmdbMetadata("tv", id);
    },
    { deferStream: true },
  );

  onMount(() => {
    let opened = false;
    const check = () => {
      const m = meta();
      if (m && !opened) {
        opened = true;
        const baseItem = buildBaseItem(m);
        openTitle(baseItem, watchlist());
      }
    };
    check();
    if (!opened) {
      const interval = setInterval(() => {
        check();
        if (opened) clearInterval(interval);
      }, 100);
      setTimeout(() => clearInterval(interval), 10_000);
    }
  });

  const ogTitle = () =>
    meta()?.name ? `${meta()!.name} — CineLog` : "CineLog";
  const ogDescription = () =>
    meta()?.overview ?? "Track your movies and shows on CineLog.";
  const ogImage = () =>
    meta()?.poster_path ? tmdbImage(meta()!.poster_path, "w500") : "";
  const ogUrl = () => `${getBaseUrl()}/tv/${params.id}`;

  return (
    <>
      <Title>{ogTitle()}</Title>
      <Meta name="description" content={ogDescription()} />

      {/* Open Graph — server-rendered for chat-app scrapers */}
      <Meta property="og:title" content={ogTitle()} />
      <Meta property="og:type" content="video.episode" />
      <Meta property="og:description" content={ogDescription()} />
      <Meta property="og:url" content={ogUrl()} />
      <Show when={ogImage()}>
        <Meta property="og:image" content={ogImage()} />
        <Meta
          property="og:image:alt"
          content={meta()?.name ? `${meta()!.name} series poster` : "Series poster"}
        />
      </Show>

      {/* Twitter Card tags */}
      <Meta name="twitter:title" content={ogTitle()} />
      <Meta name="twitter:description" content={ogDescription()} />
      <Show when={ogImage()}>
        <Meta name="twitter:image" content={ogImage()} />
      </Show>

      <div
        style={{
          "min-height": "100vh",
          display: "flex",
          "align-items": "center",
          "justify-content": "center",
          "padding": "2rem",
          background: "var(--void)",
          color: "var(--text-soft)",
        }}
      >
        <Show
          when={!meta.loading}
          fallback={<div style={{ "text-align": "center" }}>Loading series…</div>}
        >
          <Show
            when={meta()}
            fallback={
              <div style={{ "text-align": "center" }}>
                <div style={{ "font-size": "1.25rem", "margin-bottom": "0.5rem" }}>
                  Series not found
                </div>
                <div style={{ "font-size": "0.875rem", opacity: 0.7 }}>
                  The link may be broken or the series may have been removed from TMDB.
                </div>
                <a
                  href="/discover"
                  style={{
                    display: "inline-block",
                    "margin-top": "1.5rem",
                    padding: "0.625rem 1.25rem",
                    background: "var(--p)",
                    color: "white",
                    "border-radius": "9999px",
                    "text-decoration": "none",
                    "font-weight": 600,
                  }}
                >
                  Go to Discover
                </a>
              </div>
            }
          >
            <div style={{ "text-align": "center", opacity: 0.7 }}>
              Opening series details…
            </div>
          </Show>
        </Show>
      </div>

      <Show when={selectedItem()}>
        <DetailsModal />
      </Show>
    </>
  );
}
