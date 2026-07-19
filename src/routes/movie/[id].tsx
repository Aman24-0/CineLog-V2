// src/routes/movie/[id].tsx
//
// Deep-link route for movies — /movie/{tmdb_id}
//
// This is the URL that gets shared when a user taps "Share" on a movie
// in the Details modal. The route:
//
//   1. Reads the TMDB id from the URL params
//   2. Fetches minimal TMDB metadata (title, poster, backdrop, etc.)
//      so the DetailsModal has a valid baseItem — with `deferStream`
//      so SSR WAITS for the data before sending the HTML (this is
//      critical for chat-app scrapers that don't run JS).
//   3. Constructs a WatchlistItem "baseItem" (TMDB identity only — no
//      user-owned state)
//   4. Calls openTitle(baseItem, watchlist) so the DetailsModal opens
//   5. Auth state decides what the modal renders:
//        - Logged in  → vaultItem is matched (status tabs, activity)
//        - Not logged → vaultItem is null (only + and Trailer)
//        - User taps + → useDetailsActions opens AuthModal
//
// SEO / OG TAGS — CRITICAL FOR CHAT-APP LINK PREVIEWS
// ----------------------------------------------------
// The <Meta> tags below are rendered SERVER-SIDE during SSR (because
// `deferStream: true` makes the route wait for the TMDB data before
// sending HTML). This means WhatsApp / iMessage / Telegram / Slack
// scrapers see the per-movie title, description, and poster image
// when they fetch the URL — NO JavaScript execution required.
//
// Without `deferStream`, the SSR would send the loading-state HTML
// (no Meta tags) and the scraper would see a generic preview.
//
// We ALSO removed the conflicting static og:title / og:description
// from src/entry-server.tsx so the per-route tags are the ONLY ones
// in the HTML head (otherwise scrapers pick the first one and ignore
// the per-movie tags).

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

/**
 * Build a minimal WatchlistItem baseItem from a TMDBTitle metadata
 * payload. The baseItem is the TMDB identity only — status/rating/etc.
 * are NOT set (they're user-owned and would be incorrect for a guest).
 *
 * `findInVault` (called inside openTitle) will match this baseItem
 * against the user's vault by id+media_type, so if the user IS logged
 * in AND has this title in their vault, vaultItem will be set.
 */
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
    media_type: "movie" as const,
    poster_path: meta.poster_path ?? null,
    backdrop_path: meta.backdrop_path ?? null,
    status: "Planned" as const,
    release_date: meta.release_date,
    first_air_date: meta.first_air_date,
    genresList: meta.genres,
  };
}

export default function MovieDeepLinkRoute() {
  const params = useParams();
  const { selectedItem } = useModalState();
  const { watchlist } = useVault();

  // Fetch TMDB metadata for the movie id in the URL.
  //
  // `deferStream: true` is CRITICAL — it makes SolidStart's SSR wait
  // for this resource to resolve BEFORE sending the HTML response.
  // Without it, the SSR would send the loading-state HTML (no Meta
  // tags), and WhatsApp / iMessage / Telegram scrapers (which don't
  // run JS) would see a generic preview instead of the movie poster.
  const [meta] = createResource(
    () => params.id,
    async (id: string) => {
      if (!id) return null;
      // Basic sanity check — TMDB ids are positive integers.
      if (!/^\d+$/.test(id)) return null;
      return fetchTmdbMetadata("movie", id);
    },
    { deferStream: true },
  );

  // Open the modal as soon as metadata resolves (client-only).
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

  // Compose OG metadata once we have the title data.
  // These strings are also used for the Twitter Card tags below.
  const ogTitle = () =>
    meta()?.title ? `${meta()!.title} — CineLog` : "CineLog";
  const ogDescription = () =>
    meta()?.overview ?? "Track your movies and shows on CineLog.";
  const ogImage = () =>
    meta()?.poster_path ? tmdbImage(meta()!.poster_path, "w500") : "";
  const ogUrl = () => `${getBaseUrl()}/movie/${params.id}`;

  return (
    <>
      <Title>{ogTitle()}</Title>
      <Meta name="description" content={ogDescription()} />

      {/* Open Graph meta tags — rendered SERVER-SIDE so chat-app
          scrapers (WhatsApp, iMessage, Telegram, Slack, Twitter)
          see the per-movie title + poster without running JS. */}
      <Meta property="og:title" content={ogTitle()} />
      <Meta property="og:type" content="video.movie" />
      <Meta property="og:description" content={ogDescription()} />
      <Meta property="og:url" content={ogUrl()} />
      <Show when={ogImage()}>
        <Meta property="og:image" content={ogImage()} />
        {/* og:image:alt — accessibility for screen readers + some
            scrapers use it as a fallback caption. */}
        <Meta
          property="og:image:alt"
          content={meta()?.title ? `${meta()!.title} movie poster` : "Movie poster"}
        />
      </Show>

      {/* Twitter Card tags — also picked up by some messengers. */}
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
          fallback={<div style={{ "text-align": "center" }}>Loading movie…</div>}
        >
          <Show
            when={meta()}
            fallback={
              <div style={{ "text-align": "center" }}>
                <div style={{ "font-size": "1.25rem", "margin-bottom": "0.5rem" }}>
                  Movie not found
                </div>
                <div style={{ "font-size": "0.875rem", opacity: 0.7 }}>
                  The link may be broken or the movie may have been removed from TMDB.
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
              Opening movie details…
            </div>
          </Show>
        </Show>
      </div>

      {/* The DetailsModal is rendered at the AppShell level when
          selectedItem() is set. But we ALSO render it here as a safety
          net — on direct deep-link navigation, the AppShell's Show when
          block should already cover this, but rendering here ensures
          the modal mounts even if there's a race with onMount. */}
      <Show when={selectedItem()}>
        <DetailsModal />
      </Show>
    </>
  );
}
