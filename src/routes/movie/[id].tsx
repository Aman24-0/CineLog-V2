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
//      — BUT only after the vault has finished loading, so logged-in
//      users see their watchlist state (status, rating, etc.) instead
//      of the guest "Add to Vault" state.
//   5. Auth state decides what the modal renders:
//        - Logged in  → vaultItem is matched (status tabs, activity)
//        - Not logged → vaultItem is null (only + and Trailer)
//        - User taps + → useDetailsActions opens AuthModal
//   6. When the modal closes, navigate to the Watchlist (logged-in)
//      or Discover (guest) page so the user doesn't see the "Opening
//      movie details..." loading state forever.
//
// SEO / OG TAGS — CRITICAL FOR CHAT-APP LINK PREVIEWS
// ----------------------------------------------------
// The <Meta> tags below are rendered SERVER-SIDE during SSR (because
// `deferStream: true` makes the route wait for the TMDB data before
// sending HTML). This means WhatsApp / iMessage / Telegram / Slack
// scrapers see the per-movie title, description, and poster image
// when they fetch the URL — NO JavaScript execution required.

import { lazy, createResource, Show, onMount, onCleanup, createEffect } from "solid-js";
import { useParams, useNavigate } from "@solidjs/router";
import { Title, Meta } from "@solidjs/meta";
import { fetchTmdbMetadata } from "~/core/tmdb/tmdb";
import { openTitle, useModalState, setSelectedItem } from "~/shared/hooks/useModalState";
import { useVault } from "~/features/watchlist/useVault";
import { useAuth } from "~/shared/hooks/useAuth";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { getBaseUrl } from "~/shared/utils/share";
import { findInVault } from "~/shared/utils/vaultMatch";
import type { WatchlistItem } from "~/shared/types";

const DetailsModal = lazy(() => import("~/features/details/DetailsModal"));

/**
 * Build a minimal WatchlistItem baseItem from a TMDBTitle metadata
 * payload. The baseItem is the TMDB identity only — status/rating/etc.
 * are NOT set (they're user-owned and would be incorrect for a guest).
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
  const navigate = useNavigate();
  const { selectedItem } = useModalState();
  const { watchlist, loading: vaultLoading, isGuest } = useVault();
  const { isSignedIn, authReady } = useAuth();

  // Fetch TMDB metadata for the movie id in the URL.
  // `deferStream: true` makes SSR wait for this resource before
  // sending HTML — critical for chat-app scrapers that don't run JS.
  const [meta] = createResource(
    () => params.id,
    async (id: string) => {
      if (!id) return null;
      if (!/^\d+$/.test(id)) return null;
      return fetchTmdbMetadata("movie", id);
    },
    { deferStream: true },
  );

  // ── Open the modal once BOTH conditions are met ──────────────────
  //
  // 1. TMDB metadata has resolved (meta() !== null)
  // 2. The vault has finished loading (vaultLoading() === false)
  //
  // Previously we called openTitle() as soon as meta() resolved, which
  // meant the watchlist() was still empty (still loading from Supabase).
  // findInVault returned null, so vaultItem was null, and logged-in
  // users saw the guest "Add to Vault" state instead of their actual
  // watchlist state (status tabs, activity panel, etc.).
  //
  // By waiting for vaultLoading() to be false, we ensure watchlist()
  // is fully populated before we try to match the title against it.
  //
  // For guests (not signed in), vaultLoading becomes false immediately
  // (the provider clears the library and sets loading=false), so there
  // is no extra delay for guests.
  let opened = false;
  onMount(() => {
    const tryOpen = () => {
      const m = meta();
      // Wait for BOTH meta and vault to be ready.
      if (m && !opened && !vaultLoading() && authReady()) {
        opened = true;
        const baseItem = buildBaseItem(m);
        openTitle(baseItem, watchlist());
      }
    };

    // Check immediately (in case both are already resolved).
    tryOpen();

    // If not ready yet, poll every 100ms (max 10s) until both resolve.
    // We use polling instead of createEffect because we only want to
    // open ONCE — createEffect would re-fire when watchlist() changes
    // later (e.g., when the user adds/removes items), which would
    // re-open the modal or re-trigger findInVault unexpectedly.
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
  //
  // Even with the polling above, there's a case where the vault loads
  // AFTER the modal is already open:
  //   - meta() resolves fast (cached TMDB data)
  //   - vaultLoading() is false (provider initialized)
  //   - BUT the vault is actually empty because the user just signed in
  //     and the fetch is still in-flight
  //
  // To handle this, we watch the watchlist() signal. If the modal is
  // open and the title appears in the vault later, we update the
  // modal's vaultItem so the UI switches from "Add to Vault" to the
  // status tabs / activity panel.
  createEffect(() => {
    const m = meta();
    const current = selectedItem();
    // Only re-update if:
    //   - We have TMDB metadata
    //   - The modal is currently open
    //   - The modal's baseItem matches this route's title
    //   - The user is signed in (guests have no vaultItem)
    if (!m || !current) return;
    if (current.baseItem.id !== String(m.id)) return;
    if (!isSignedIn()) return;

    const vaultItem = findInVault(watchlist(), current.baseItem);
    // Only update if the vaultItem changed — avoids infinite loops.
    if (vaultItem?.id !== current.vaultItem?.id) {
      setSelectedItem({
        baseItem: vaultItem ?? current.baseItem,
        vaultItem,
      });
    }
  });

  // ── Navigate away when the modal closes ──────────────────────────
  //
  // When the user closes the Details modal (X button, ESC, or Back),
  // the route component is still mounted and would show "Opening
  // movie details..." forever. Instead, navigate to:
  //   - /watchlist if the user is signed in
  //   - /discover if the user is a guest
  //
  // We watch selectedItem() — when it becomes null (modal closed) and
  // we had previously opened it, we navigate.
  createEffect(() => {
    const current = selectedItem();
    if (opened && !current && authReady()) {
      // Modal was open and is now closed — navigate away.
      navigate(isGuest() ? "/discover" : "/watchlist", { replace: true });
    }
  });

  // Compose OG metadata once we have the title data.
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
          selectedItem() is set. We also render it here as a safety
          net for direct deep-link navigation. */}
      <Show when={selectedItem()}>
        <DetailsModal />
      </Show>
    </>
  );
}
