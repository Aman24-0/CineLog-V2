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
// the critical `deferStream: true` for SSR-friendly OG tags, the
// setSelectedItem-directly pattern (avoids the modal reopen bug),
// and the close-to-navigate behavior.

import { createResource, Show, onMount, onCleanup, createEffect } from "solid-js";
import { useParams, useNavigate } from "@solidjs/router";
import { Title, Meta } from "@solidjs/meta";
import { fetchTmdbMetadata } from "~/core/tmdb/tmdb";
import { useModalState, setSelectedItem } from "~/shared/hooks/useModalState";
import { useVault } from "~/features/watchlist/useVault";
import { useAuth } from "~/shared/hooks/useAuth";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { getBaseUrl } from "~/shared/utils/share";
import { findInVault } from "~/shared/utils/vaultMatch";
import type { WatchlistItem } from "~/shared/types";

// DetailsModal is rendered by AppShell (not by this route) to avoid
// double-mounting. We don't import it here.

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
  const navigate = useNavigate();
  const { selectedItem } = useModalState();
  const { watchlist, loading: vaultLoading, isGuest } = useVault();
  const { isSignedIn, authReady } = useAuth();

  // `deferStream: true` makes SSR wait for this resource before
  // sending HTML — critical for chat-app scrapers that don't run JS.
  // Wrapped in try/catch to prevent unhandled rejections that crash
  // the SSR server when TMDB is unavailable.
  const [meta] = createResource(
    () => params.id,
    async (id: string) => {
      if (!id) return null;
      if (!/^\d+$/.test(id)) return null;
      try {
        return await fetchTmdbMetadata("tv", id);
      } catch (err) {
        console.warn(`[tv/[id]] TMDB fetch failed for ${id}:`, err);
        return null;
      }
    },
    { deferStream: true },
  );

  // ── Open the modal once BOTH conditions are met ──────────────────
  //
  // We call setSelectedItem() DIRECTLY (not openTitle) to avoid the
  // modal-reopen bug. See /movie/[id].tsx for the full rationale.
  let opened = false;
  onMount(() => {
    const tryOpen = () => {
      const m = meta();
      if (m && !opened && !vaultLoading() && authReady()) {
        opened = true;
        const baseItem = buildBaseItem(m);
        const vaultItem = findInVault(watchlist(), baseItem);
        setSelectedItem({
          baseItem: vaultItem ?? baseItem,
          vaultItem,
        });
      }
    };

    tryOpen();

    if (!opened) {
      const interval = setInterval(() => {
        tryOpen();
        if (opened) clearInterval(interval);
      }, 100);
      const stopTimer = setTimeout(() => clearInterval(interval), 10_000);

      onCleanup(() => {
        clearInterval(interval);
        clearTimeout(stopTimer);
      });
    }
  });

  // ── Re-update the modal's vaultItem when the vault loads later ────
  createEffect(() => {
    const m = meta();
    const current = selectedItem();
    if (!m || !current) return;
    if (current.baseItem.id !== String(m.id)) return;
    if (!isSignedIn()) return;

    const vaultItem = findInVault(watchlist(), current.baseItem);
    if (vaultItem?.id !== current.vaultItem?.id) {
      setSelectedItem({
        baseItem: vaultItem ?? current.baseItem,
        vaultItem,
      });
    }
  });

  // ── Navigate away when the modal closes ──────────────────────────
  createEffect(() => {
    const current = selectedItem();
    if (opened && !current && authReady()) {
      navigate(isGuest() ? "/discover" : "/watchlist", { replace: true });
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

      {/* The <main> landmark provides a WCAG 2.4.1-compliant main region. */}
      <main
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
      </main>
    </>
  );
}
