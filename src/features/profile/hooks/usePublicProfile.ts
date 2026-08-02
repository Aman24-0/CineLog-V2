// src/features/profile/hooks/usePublicProfile.ts
//
// usePublicProfile — fetches another user's PUBLIC profile + vault
// by username, for the /u/[username] route.
//
// Both reads go through SECURITY DEFINER functions:
//   • get_public_profile_by_username(text) → returns the profile row
//     only when is_public = true AND deleted_at IS NULL.
//   • get_public_vault_by_user(uuid) → returns the user's non-deleted
//     vault rows when their profile is public.
//
// Both functions are callable by anon + authenticated, so the route
// works for both logged-in and logged-out viewers.
//
// The vault rows are converted client-side to WatchlistItem shape
// (with TMDB enrichment for poster/title/runtime) so they can be
// passed to the existing ActivityFeed / AchievementsPreview components.
//
// Privacy model
// -------------
//   • Profile not found → status = "not_found"
//   • Profile is private (function returns no rows) → status = "private"
//   • Profile is public → status = "ready", data + vault populated
//
// The hook never reads private data — the SECURITY DEFINER functions
// are the single enforcement point.

import { createSignal, createEffect, onMount, onCleanup, type Accessor } from "solid-js";
import { isServer } from "solid-js/web";
import { getClient } from "~/lib/supabase/client";
import { fetchTmdbMetadataBatch } from "~/core/tmdb/tmdb";
import { STATUS_TO_UI } from "~/shared/utils/vaultStatus";
import type { WatchlistItem } from "~/shared/types";

// ---------------------------------------------------------------------------
// Types — mirror the SECURITY DEFINER function return shapes
// ---------------------------------------------------------------------------

/** Public-facing profile row returned by get_public_profile_by_username. */
export interface PublicProfile {
  id: string;
  username: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  banner_type: string;
  favorite_movie_id: string | null;
  favorite_series_id: string | null;
  favorite_director_id: string | null;
  social_links: Record<string, unknown>;
  is_public: boolean;
  created_at: string;
}

/** Public-facing vault row returned by get_public_vault_by_user. */
export interface PublicVaultRow {
  id: string;
  user_id: string;
  tmdb_id: number;
  media_type: "movie" | "tv";
  status: string;
  is_favorite: boolean;
  is_pinned: boolean;
  rating: number | null;
  notes: string | null;
  rewatch_count: number;
  progress_minutes: number | null;
  watched_on: string | null;
  started_at: string | null;
  completed_at: string | null;
  last_activity_at: string | null;
  created_at: string;
  updated_at: string;
  season_dates: Record<string, { start: string; end: string }> | null;
  season_rewatch_count: number;
  season_rewatch_dates: Record<string, { start: string; end: string }>[] | null;
}

export type PublicProfileStatus = "loading" | "not_found" | "private" | "ready";

export interface UsePublicProfileReturn {
  status: Accessor<PublicProfileStatus>;
  profile: Accessor<PublicProfile | null>;
  watchlist: Accessor<WatchlistItem[]>;
  /** Vault items flagged as favorites (is_favorite = true). Capped at 10. */
  favorites: Accessor<WatchlistItem[]>;
  /** Re-run the fetch (used by error retry buttons). */
  refetch: () => void;
  error: Accessor<string | null>;
}

// ---------------------------------------------------------------------------
// Cap — the public profile route caps the vault at 50 items so the
// TMDB batch enrichment doesn't fire hundreds of requests for power
// users. ActivityFeed already caps at 50 entries, so this matches.
// ---------------------------------------------------------------------------

const VAULT_CAP = 50;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePublicProfile(
  username: Accessor<string>
): UsePublicProfileReturn {
  const [status, setStatus] = createSignal<PublicProfileStatus>("loading");
  const [profile, setProfile] = createSignal<PublicProfile | null>(null);
  const [watchlist, setWatchlist] = createSignal<WatchlistItem[]>([]);
  const [favorites, setFavorites] = createSignal<WatchlistItem[]>([]);
  const [error, setError] = createSignal<string | null>(null);
  let fetching = false;
  let lastFetchedUsername: string | null = null;

  const doFetch = async () => {
    if (isServer) return;
    const uname = username();
    if (!uname) {
      setStatus("not_found");
      return;
    }
    if (fetching) return;
    fetching = true;
    lastFetchedUsername = uname;

    setStatus("loading");
    setError(null);
    setProfile(null);
    setWatchlist([]);
    setFavorites([]);

    try {
      const supabase = getClient();

      // 1. Fetch the public profile row. The function returns 0 rows
      //    when the profile is private OR soft-deleted OR doesn't exist.
      const { data: profileRows, error: profileErr } = await supabase.rpc(
        "get_public_profile_by_username",
        { p_username: uname }
      );

      if (profileErr) {
        console.error(
          "[usePublicProfile] get_public_profile_by_username RPC error:",
          profileErr.message
        );
        throw profileErr;
      }
      const profileRow = (profileRows as PublicProfile[] | null)?.[0] ?? null;

      if (!profileRow) {
        // We need to distinguish "doesn't exist" from "exists but private"
        // for the empty-state copy. We can't read profiles directly (RLS),
        // so we use the existing is_username_available SECURITY DEFINER
        // function: if it returns FALSE, the username exists (private).
        // If it returns TRUE, the username doesn't exist at all.
        // Note: is_username_available is authenticated-only — for anon
        // viewers we just show a generic "not found" state.
        try {
          const { data: available } = await supabase.rpc(
            "is_username_available",
            {
              p_username: uname
            }
          );
          if (available === false) {
            setStatus("private");
          } else {
            setStatus("not_found");
          }
        } catch (rpcErr) {
          // If is_username_available RPC fails (e.g. anon user), fall back
          // to "not_found" state — the user can't distinguish private from
          // non-existent without the RPC.
          console.warn(
            "[usePublicProfile] is_username_available RPC failed:",
            rpcErr instanceof Error ? rpcErr.message : rpcErr
          );
          setStatus("not_found");
        }
        return;
      }

      setProfile(profileRow);

      // 2. Fetch the user's public vault (capped at VAULT_CAP rows).
      const { data: vaultRows, error: vaultErr } = await supabase.rpc(
        "get_public_vault_by_user",
        { p_user_id: profileRow.id }
      );

      if (vaultErr) throw vaultErr;
      const rows = ((vaultRows as PublicVaultRow[] | null) ?? []).slice(
        0,
        VAULT_CAP
      );

      // 3. Convert to WatchlistItem shape (minimal — no TMDB yet).
      const items = rows.map(publicVaultRowToWatchlistItem);
      setWatchlist(items);

      // 3a. Populate the favorites list (is_favorite === true). Capped
      //     at 10 to match the FavoritesGrid component's behavior.
      const favItems = rows
        .filter((r) => r.is_favorite === true)
        .slice(0, 10)
        .map(publicVaultRowToWatchlistItem);
      setFavorites(favItems);

      // 4. Fire TMDB batch enrichment in the background. The UI will
      //    re-render with posters/titles/genres once it resolves. We
      //    DON'T await this — the page renders immediately with
      //    placeholder titles ("Untitled") and empty posters. We also
      //    re-derive the favorites list from the enriched items so
      //    their titles/posters populate too.
      void enrichWithTmdb(items).then((enriched) => {
        if (enriched.length > 0) {
          setWatchlist(enriched);
          const favIds = new Set(favItems.map((f) => f.id));
          setFavorites(enriched.filter((it) => favIds.has(it.id)).slice(0, 10));
        }
      });

      setStatus("ready");
    } catch (err) {
      console.error("[usePublicProfile] Fetch failed:", err);
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setStatus("not_found"); // graceful fallback
    } finally {
      fetching = false;
    }
  };

  // Initial fetch on mount. The createEffect below also runs on mount,
  // but we use a guard to prevent the double-fetch: the effect checks
  // if the username has already been fetched before triggering.

  onMount(() => {
    const uname = username();
    if (uname && !isServer) {
      lastFetchedUsername = uname;
      void doFetch();
    }
  });

  // Safety timeout: if the profile fetch takes more than 10 seconds,
  // set an error state so the user isn't stuck on a blank loading screen.
  // This can happen if the Supabase RPC function doesn't exist or the
  // network is down.
  let loadingTimeout: ReturnType<typeof setTimeout> | null = null;
  onMount(() => {
    loadingTimeout = setTimeout(() => {
      if (status() === "loading") {
        console.warn(
          "[usePublicProfile] Profile fetch timed out after 10s — showing error state"
        );
        setError("Profile load timed out. Please try again.");
        setStatus("not_found");
        fetching = false;
      }
    }, 10_000);
  });
  onCleanup(() => {
    if (loadingTimeout) {
      clearTimeout(loadingTimeout);
      loadingTimeout = null;
    }
  });

  // Refetch when the username in the URL changes (route param change).
  // Guard: skip if the username hasn't changed since the last fetch
  // (prevents the double-fetch that would happen because createEffect
  // runs on mount too, after onMount).
  createEffect(() => {
    const u = username();
    if (u && !isServer && u !== lastFetchedUsername) {
      lastFetchedUsername = u;
      void doFetch();
    }
  });

  return {
    status,
    profile,
    watchlist,
    favorites,
    refetch: () => void doFetch(),
    error
  };
}

// ---------------------------------------------------------------------------
// Row converter — minimal WatchlistItem without TMDB enrichment
// ---------------------------------------------------------------------------

function publicVaultRowToWatchlistItem(row: PublicVaultRow): WatchlistItem {
  const isTV = row.media_type === "tv";
  const watchDate = isTV
    ? (row.completed_at ?? row.started_at ?? undefined)
    : (row.watched_on ?? undefined);

  return {
    id: String(row.tmdb_id),
    media_type: row.media_type,
    status: STATUS_TO_UI[row.status] ?? "Planned",
    rating: row.rating ?? undefined,
    notes: row.notes ?? undefined,
    watchDate,
    addedAt: row.created_at,
    updatedAt: row.updated_at,
    rewatchCount: row.rewatch_count ?? 0,
    rewatchDates: [],
    seasonDates: row.season_dates ?? {},
    seasonRewatchCount: row.season_rewatch_count ?? 0,
    seasonRewatchDates: row.season_rewatch_dates ?? []
    // Title / poster / genres / runtime are filled in by the
    // background TMDB enrichment step (enrichWithTmdb below).
  };
}

// ---------------------------------------------------------------------------
// TMDB enrichment — fetch posters + titles + genres in a single batch
// ---------------------------------------------------------------------------

async function enrichWithTmdb(
  items: WatchlistItem[]
): Promise<WatchlistItem[]> {
  if (items.length === 0) return items;

  const fetchArgs = items.map((it) => ({
    mediaType: it.media_type,
    tmdbId: it.id
  }));

  try {
    const tmdbMap = await fetchTmdbMetadataBatch(fetchArgs);
    return items.map((it) => {
      const tmdb = tmdbMap.get(`${it.media_type}/${it.id}`);
      if (!tmdb) return it;
      return {
        ...it,
        title: tmdb.title,
        name: tmdb.name,
        poster_path: tmdb.poster_path ?? undefined,
        backdrop_path: tmdb.backdrop_path ?? undefined,
        release_date: tmdb.release_date,
        first_air_date: tmdb.first_air_date,
        genresList: Array.isArray(tmdb.genres) ? tmdb.genres : undefined,
        runtime: tmdb.runtime ?? it.runtime,
        director: tmdb.director,
        castList: Array.isArray(tmdb.castList) ? tmdb.castList : undefined
      };
    });
  } catch (err) {
    console.warn("[usePublicProfile] TMDB enrichment failed:", err);
    return items; // return un-enriched items on failure
  }
}
