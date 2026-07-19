// src/routes/movie/[id].tsx
//
// Deep-link route for movies — /movie/{tmdb_id}
//
// This is the URL that gets shared when a user taps "Share" on a movie
// in the Details modal. The route:
//
//   1. Reads the TMDB id from the URL params
//   2. Fetches minimal TMDB metadata (title, poster, backdrop, etc.)
//      so the DetailsModal has a valid baseItem
//   3. Constructs a WatchlistItem "baseItem" (TMDB identity only — no
//      user-owned state)
//   4. Calls openTitle(baseItem, watchlist) so the DetailsModal opens
//   5. Auth state decides what the modal renders:
//        - Logged in  → vaultItem is matched (status tabs, activity)
//        - Not logged → vaultItem is null (only + and Trailer)
//        - User taps + → useDetailsActions opens AuthModal
//
// The page itself is mostly empty — the modal renders above it via
// Portal. We render a small "Loading" state while TMDB metadata is
// being fetched, and a fallback "Not found" if the fetch fails.
//
// SEO: this page is the OG-image source for shared movie links.
// WhatsApp / Telegram / iMessage will scrape the meta tags here and
// show a link preview with the movie poster. The meta tags are set
// via @solidjs/meta.

import { lazy, createResource, Show, onMount } from "solid-js";
import { useParams } from "@solidjs/router";
import { Title, Meta } from "@solidjs/meta";
import { fetchTmdbMetadata } from "~/core/tmdb/tmdb";
import { openTitle, useModalState } from "~/shared/hooks/useModalState";
import { useVault } from "~/features/watchlist/useVault";
import { tmdbImage } from "~/core/tmdb/tmdb";
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
  // createResource handles the loading state and suspends on the
  // server for SSR.
  const [meta] = createResource(
    () => params.id,
    async (id: string) => {
      if (!id) return null;
      // Basic sanity check — TMDB ids are positive integers.
      if (!/^\d+$/.test(id)) return null;
      return fetchTmdbMetadata("movie", id);
    },
  );

  // Open the modal as soon as metadata resolves. We use onMount +
  // createResource so this only runs on the client (the modal uses
  // document.body and other browser-only APIs).
  onMount(() => {
    // Watch the resource — when it resolves with data, open the modal.
    // (We don't use createEffect here because we only want to open
    // once per route mount, not re-open if watchlist changes.)
    let opened = false;
    const check = () => {
      const m = meta();
      if (m && !opened) {
        opened = true;
        const baseItem = buildBaseItem(m);
        openTitle(baseItem, watchlist());
      }
    };
    // Poll a few times until the resource resolves. createResource
    // returns a function that re-runs its callers when the value
    // changes, but inside onMount we need to manually check.
    check();
    if (!opened) {
      const interval = setInterval(() => {
        check();
        if (opened) clearInterval(interval);
      }, 100);
      // Safety: stop polling after 10s regardless.
      setTimeout(() => clearInterval(interval), 10_000);
    }
  });

  return (
    <>
      <Title>{meta()?.title ? `${meta()!.title} — CineLog` : "CineLog"}</Title>
      <Show when={meta()}>
        {(m) => (
          <>
            {/* Open Graph meta tags for WhatsApp / iMessage / social previews */}
            <Meta property="og:title" content={`${m().title} — CineLog`} />
            <Meta property="og:type" content="video.movie" />
            <Meta
              property="og:description"
              content={m().overview ?? "Track your movies and shows on CineLog."}
            />
            <Show when={m().poster_path}>
              <Meta
                property="og:image"
                content={tmdbImage(m().poster_path, "w500")}
              />
            </Show>
            <Meta property="og:url" content={`https://cinelogv2.vercel.app/movie/${m().id}`} />
            {/* Twitter Card tags (also used by some messengers) */}
            <Meta name="twitter:card" content="summary_large_image" />
            <Meta name="twitter:title" content={`${m().title} — CineLog`} />
            <Meta name="twitter:description" content={m().overview ?? "Track your movies and shows on CineLog."} />
            <Show when={m().poster_path}>
              <Meta name="twitter:image" content={tmdbImage(m().poster_path, "w500")} />
            </Show>
          </>
        )}
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
