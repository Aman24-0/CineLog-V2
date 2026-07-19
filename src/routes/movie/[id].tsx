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
//   4. Calls setSelectedItem() DIRECTLY (NOT openTitle) so the modal
//      opens WITHOUT pushing a browser history entry. This is critical
//      for the close behavior — see "MODAL CLOSE BUG" below.
//   5. Auth state decides what the modal renders:
//        - Logged in  → vaultItem is matched (status tabs, activity)
//        - Not logged → vaultItem is null (only + and Trailer)
//        - User taps + → useDetailsActions opens AuthModal
//   6. When the modal closes, navigate to the Watchlist (logged-in)
//      or Discover (guest) page so the user doesn't see the "Opening
//      movie details..." loading state forever.
//
// MODAL CLOSE BUG (Issue 2 from user feedback)
// --------------------------------------------
// Previously, the route called openTitle() which:
//   a) pushes a history entry via window.history.pushState()
//   b) sets historyEntryOurs = true
//
// When the user closed the modal, closeTitle() saw historyEntryOurs
// was true and called window.history.back(). Meanwhile, our
// close-navigate effect called navigate('/watchlist', { replace: true }).
// The popstate from history.back() fired AFTER the navigate(), causing
// the router to bounce back to /movie/{id}, which remounted the route,
// which re-ran onMount, which re-opened the modal. The symptom was
// "fade for 1 sec then reopen."
//
// Fix: Call setSelectedItem() directly instead of openTitle(). This
// sets historyEntryOurs = false (it's never set to true), so
// closeTitle() does NOT call history.back(). The only navigation
// that happens is our explicit navigate('/watchlist'), which is clean
// and race-free.
//
// SEO / OG TAGS — CRITICAL FOR CHAT-APP LINK PREVIEWS
// ----------------------------------------------------
// The <Meta> tags below are rendered SERVER-SIDE during SSR (because
// `deferStream: true` makes the route wait for the TMDB data before
// sending HTML). This means WhatsApp / iMessage / Telegram / Slack
// scrapers see the per-movie title, description, and poster image
// when they fetch the URL — NO JavaScript execution required.

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
  // 3. Auth is ready (authReady() === true)
  //
  // We call setSelectedItem() DIRECTLY instead of openTitle() to avoid
  // pushing a browser history entry. See "MODAL CLOSE BUG" in the file
  // header for the full rationale.
  let opened = false;
  onMount(() => {
    const tryOpen = () => {
      const m = meta();
      if (m && !opened && !vaultLoading() && authReady()) {
        opened = true;
        const baseItem = buildBaseItem(m);
        // Find the title in the user's vault (if logged in). For guests,
        // watchlist() is empty so vaultItem will be null.
        const vaultItem = findInVault(watchlist(), baseItem);
        // Set the modal state DIRECTLY — do NOT call openTitle() because
        // openTitle pushes a history entry that conflicts with our
        // close-navigate logic (causes the modal to reopen after close).
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
  //
  // Handles the edge case where the vault loads AFTER the modal is
  // already open (e.g., the user just signed in and the fetch is still
  // in-flight when the modal opens). When the vault arrives, we update
  // the modal's vaultItem so the UI switches from "Add to Vault" to
  // the status tabs / activity panel.
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
  //
  // When the user closes the Details modal (X button, ESC, or Back),
  // the route component is still mounted and would show "Opening
  // movie details..." forever. Instead, navigate to:
  //   - /watchlist if the user is signed in
  //   - /discover if the user is a guest
  //
  // We watch selectedItem() — when it becomes null (modal closed) and
  // we had previously opened it, we navigate. Using replace: true so
  // the deep-link URL is replaced in the history stack (Back button
  // doesn't return to the loading screen).
  //
  // This is now race-free because we call setSelectedItem() directly
  // (not openTitle), so closeTitle() does NOT call history.back().
  // The only navigation that happens is this explicit navigate() call.
  createEffect(() => {
    const current = selectedItem();
    if (opened && !current && authReady()) {
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
          selectedItem() is set. We don't render it here to avoid
          double-mounting (AppShell already has a Show for it). */}
    </>
  );
}
