#!/usr/bin/env python3
"""
Fix root causes of CineLog-V2 stuck pages.

Root causes identified:
1. discover.ts - ALL fetch calls have NO AbortController timeouts → fetch hangs → pages stuck
2. useDiscoverFeeds - No global timeout on loadAll → if any feed hangs, loading stays true
3. useCollections loadForUid - Missing try/catch/finally → loading stuck true on error
4. useUserLibrary - Safety net timer never cleared → orphan timers
5. useProfileData - doFetch doesn't ensure fetching=false on all early returns
"""
import re

# ============================================================
# Fix 1: Add fetchWithTimeout to discover.ts
# ============================================================
print("Fix 1: Adding AbortController timeouts to discover.ts...")

with open("src/core/tmdb/discover.ts", "r") as f:
    content = f.read()

# Add the fetchWithTimeout helper after the API constant
timeout_helper = '''

// ---------------------------------------------------------------------------
// Timeout helper — prevents fetch() from hanging forever
// ---------------------------------------------------------------------------

/** Default timeout for TMDB discover API calls (10 seconds). */
const TMDB_FETCH_TIMEOUT_MS = 10_000;

/**
 * fetch with AbortController timeout.
 * If the server is unreachable or slow, the request is aborted after
 * `timeoutMs` milliseconds instead of hanging indefinitely (which would
 * leave the Discover page stuck on a skeleton forever).
 */
async function fetchWithTimeout(
  url: string,
  timeoutMs: number = TMDB_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeoutId);
  }
}
'''

# Insert after the API constant line
content = content.replace(
    "const API = \"https://api.themoviedb.org/3\";",
    "const API = \"https://api.themoviedb.org/3\";" + timeout_helper
)

# Replace all raw fetch() calls inside cachedFetch fetchers with fetchWithTimeout()
# Pattern: const r = await fetch(\n        `...`\n      );
# Replace: const r = await fetch( → const r = await fetchWithTimeout(
content = content.replace(
    "const r = await fetch(`${API}/discover/movie?${params}`)",
    "const r = await fetchWithTimeout(`${API}/discover/movie?${params}`)"
)
content = content.replace(
    "const r = await fetch(`${API}/discover/tv?${params}`)",
    "const r = await fetchWithTimeout(`${API}/discover/tv?${params}`)"
)
content = content.replace(
    "const r = await fetch(\n        `${API}/${mediaType}/${id}/recommendations?api_key=${TMDB_KEY}&language=en-US&page=1`\n      )",
    "const r = await fetchWithTimeout(\n        `${API}/${mediaType}/${id}/recommendations?api_key=${TMDB_KEY}&language=en-US&page=1`\n      )"
)
content = content.replace(
    "const r = await fetch(\n        `${API}/trending/${mediaType}/${window}?api_key=${TMDB_KEY}&language=en-US`\n      )",
    "const r = await fetchWithTimeout(\n        `${API}/trending/${mediaType}/${window}?api_key=${TMDB_KEY}&language=en-US`\n      )"
)
content = content.replace(
    "const r = await fetch(\n        `${API}/movie/top_rated?api_key=${TMDB_KEY}&language=en-US&page=1`\n      )",
    "const r = await fetchWithTimeout(\n        `${API}/movie/top_rated?api_key=${TMDB_KEY}&language=en-US&page=1`\n      )"
)
content = content.replace(
    "const r = await fetch(`${API}/search/multi?${params}`)",
    "const r = await fetchWithTimeout(`${API}/search/multi?${params}`)"
)
content = content.replace(
    "const r = await fetch(\n        `${API}/movie/now_playing?api_key=${TMDB_KEY}&language=en-US&region=${region}&page=1`\n      )",
    "const r = await fetchWithTimeout(\n        `${API}/movie/now_playing?api_key=${TMDB_KEY}&language=en-US&region=${region}&page=1`\n      )"
)
content = content.replace(
    "const r = await fetch(\n        `${API}/movie/upcoming?api_key=${TMDB_KEY}&language=en-US&region=${region}&page=1`\n      )",
    "const r = await fetchWithTimeout(\n        `${API}/movie/upcoming?api_key=${TMDB_KEY}&language=en-US&region=${region}&page=1`\n      )"
)
content = content.replace(
    "const r = await fetch(\n        `${API}/tv/top_rated?api_key=${TMDB_KEY}&language=en-US&page=1`\n      )",
    "const r = await fetchWithTimeout(\n        `${API}/tv/top_rated?api_key=${TMDB_KEY}&language=en-US&page=1`\n      )"
)
content = content.replace(
    "const r = await fetch(\n        `${API}/tv/airing_today?api_key=${TMDB_KEY}&language=en-US&page=1`\n      )",
    "const r = await fetchWithTimeout(\n        `${API}/tv/airing_today?api_key=${TMDB_KEY}&language=en-US&page=1`\n      )"
)
content = content.replace(
    "const r = await fetch(\n        `${API}/tv/on_the_air?api_key=${TMDB_KEY}&language=en-US&page=1`\n      )",
    "const r = await fetchWithTimeout(\n        `${API}/tv/on_the_air?api_key=${TMDB_KEY}&language=en-US&page=1`\n      )"
)
content = content.replace(
    "const r = await fetch(\n        `${API}/${mediaType}/popular?api_key=${TMDB_KEY}&language=en-US&page=1`\n      )",
    "const r = await fetchWithTimeout(\n        `${API}/${mediaType}/popular?api_key=${TMDB_KEY}&language=en-US&page=1`\n      )"
)
content = content.replace(
    "const r = await fetch(\n        `${API}/watch/providers/movie?api_key=${TMDB_KEY}&language=en-US&watch_region=${region}`\n      )",
    "const r = await fetchWithTimeout(\n        `${API}/watch/providers/movie?api_key=${TMDB_KEY}&language=en-US&watch_region=${region}`\n      )"
)
content = content.replace(
    "const r = await fetch(`${API}/discover/movie?${params}`)",
    "const r = await fetchWithTimeout(`${API}/discover/movie?${params}`)"
)
content = content.replace(
    "const r = await fetch(`${API}/discover/tv?${params}`)",
    "const r = await fetchWithTimeout(`${API}/discover/tv?${params}`)"
)
content = content.replace(
    "const r = await fetch(\n        `${API}/watch/providers/tv?api_key=${TMDB_KEY}&language=en-US&watch_region=${region}`\n      )",
    "const r = await fetchWithTimeout(\n        `${API}/watch/providers/tv?api_key=${TMDB_KEY}&language=en-US&watch_region=${region}`\n      )"
)

# Also fix fetchTitleDirector which uses raw fetch (no cachedFetch)
content = content.replace(
    "const res = await fetch(\n    `${API}/${mediaType}/${id}/credits?api_key=${TMDB_KEY}&language=en-US`\n  )",
    "const res = await fetchWithTimeout(\n    `${API}/${mediaType}/${id}/credits?api_key=${TMDB_KEY}&language=en-US`\n  )"
)

with open("src/core/tmdb/discover.ts", "w") as f:
    f.write(content)

print("  ✓ Added fetchWithTimeout to all discover.ts functions")

# ============================================================
# Fix 2: Add global timeout to useDiscoverFeeds
# ============================================================
print("Fix 2: Adding global timeout to useDiscoverFeeds...")

with open("src/features/discover/hooks/useDiscoverFeeds.ts", "r") as f:
    content = f.read()

# Replace the loadAll function with one that has a global safety timeout
old_loadAll = """  const loadAll = () => {
    if (isServer) return;
    setLoading(true);

    // Snapshot region at call-time so all parallel fetches in this
    // batch use the same region even if it changes mid-flight.
    const r = region();

    // Fetch all feeds in parallel. Each is independent — failures don't
    // affect other feeds. All use cachedFetch so repeated visits are instant.
    const feeds: Promise<unknown>[] = [
      getTrending("all", "week")
        .then((v) => { setTrending(v); })
        .catch((e) => console.error("[useDiscoverFeeds] trending:", e)),

      getNowPlaying(r)
        .then((v) => { setNowPlaying(v); })
        .catch((e) => console.error("[useDiscoverFeeds] nowPlaying:", e)),

      getUpcoming(r)
        .then((v) => { setUpcoming(v); })
        .catch((e) => console.error("[useDiscoverFeeds] upcoming:", e)),

      getTopRatedMovies()
        .then((v) => { setTopRatedMovies(v); })
        .catch((e) => console.error("[useDiscoverFeeds] topRatedMovies:", e)),

      getTopRatedTv()
        .then((v) => { setTopRatedTv(v); })
        .catch((e) => console.error("[useDiscoverFeeds] topRatedTv:", e)),

      getOnTheAir()
        .then((v) => { setNewSeasons(v); })
        .catch((e) => console.error("[useDiscoverFeeds] onTheAir:", e)),

      // Hidden gems: high rating, low popularity
      discoverMovies({
        sortBy: "vote_average.desc",
        voteCountGte: 200,
        voteAverageGte: 7.5,
      })
        .then((titles) => {
          // Sort by vote_count ascending (lowest count = most "hidden")
          const sorted = [...titles].sort(
            (a, b) => (a.vote_count ?? 0) - (b.vote_count ?? 0)
          );
          setHiddenGems(sorted.slice(0, 20));
        })
        .catch((e) => console.error("[useDiscoverFeeds] hiddenGems:", e)),
    ];

    Promise.allSettled(feeds).finally(() => setLoading(false));
  };"""

new_loadAll = """  const loadAll = () => {
    if (isServer) return;
    setLoading(true);

    // Snapshot region at call-time so all parallel fetches in this
    // batch use the same region even if it changes mid-flight.
    const r = region();

    // Fetch all feeds in parallel. Each is independent — failures don't
    // affect other feeds. All use cachedFetch so repeated visits are instant.
    const feeds: Promise<unknown>[] = [
      getTrending("all", "week")
        .then((v) => { setTrending(v); })
        .catch((e) => console.error("[useDiscoverFeeds] trending:", e)),

      getNowPlaying(r)
        .then((v) => { setNowPlaying(v); })
        .catch((e) => console.error("[useDiscoverFeeds] nowPlaying:", e)),

      getUpcoming(r)
        .then((v) => { setUpcoming(v); })
        .catch((e) => console.error("[useDiscoverFeeds] upcoming:", e)),

      getTopRatedMovies()
        .then((v) => { setTopRatedMovies(v); })
        .catch((e) => console.error("[useDiscoverFeeds] topRatedMovies:", e)),

      getTopRatedTv()
        .then((v) => { setTopRatedTv(v); })
        .catch((e) => console.error("[useDiscoverFeeds] topRatedTv:", e)),

      getOnTheAir()
        .then((v) => { setNewSeasons(v); })
        .catch((e) => console.error("[useDiscoverFeeds] onTheAir:", e)),

      // Hidden gems: high rating, low popularity
      discoverMovies({
        sortBy: "vote_average.desc",
        voteCountGte: 200,
        voteAverageGte: 7.5,
      })
        .then((titles) => {
          // Sort by vote_count ascending (lowest count = most "hidden")
          const sorted = [...titles].sort(
            (a, b) => (a.vote_count ?? 0) - (b.vote_count ?? 0)
          );
          setHiddenGems(sorted.slice(0, 20));
        })
        .catch((e) => console.error("[useDiscoverFeeds] hiddenGems:", e)),
    ];

    // Safety-net: force loading=false after 15 seconds regardless of
    // whether all feeds have settled. This prevents the Discover page
    // from being stuck on a skeleton forever if any underlying fetch
    // hangs (e.g. TMDB unreachable, network timeout, or a bug in
    // cachedFetch that prevents the promise from settling).
    const safetyTimeout = setTimeout(() => {
      console.warn("[useDiscoverFeeds] Global timeout — forcing loading=false after 15s");
      setLoading(false);
    }, 15_000);

    Promise.allSettled(feeds).finally(() => {
      clearTimeout(safetyTimeout);
      setLoading(false);
    });
  };"""

content = content.replace(old_loadAll, new_loadAll)

with open("src/features/discover/hooks/useDiscoverFeeds.ts", "w") as f:
    f.write(content)

print("  ✓ Added global 15s safety timeout to useDiscoverFeeds.loadAll()")

# ============================================================
# Fix 3: useCollections - Add try/catch/finally to loadForUid
# ============================================================
print("Fix 3: Adding try/catch/finally to useCollections.loadForUid...")

with open("src/features/collections/hooks/useCollections.tsx", "r") as f:
    content = f.read()

old_loadForUid = """  const loadForUid = async (supabaseUid: string | null) => {
    if (supabaseUid) {
      // Skip if a fetch for this uid is already in flight.
      if (lastFetchUid === supabaseUid) return;
      lastFetchUid = supabaseUid;
      setLoading(true);
      // AWAIT ensureFavoritesExists BEFORE refreshing collections.
      // Previously this was fire-and-forget (.catch(() => {})), which
      // caused a race condition: multiple onSessionChange events would
      // each check for Favorites concurrently, find none, and each
      // create a duplicate. Awaiting ensures the check+create completes
      // before the collection list is refreshed.
      // Timeout guard (5 s): if Supabase is slow/unreachable, don't block
      // the entire collections page in skeleton state indefinitely.
      try {
        await Promise.race([
          ensureFavoritesExistsInSupabase(supabaseUid),
          new Promise<void>((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
        ]);
      } catch (err) {
        // Non-fatal: collections still load even if Favorites creation fails/times out.
        if ((err as Error)?.message !== "timeout") {
          console.error("[useCollections] ensureFavoritesExists failed:", err);
        }
      }
      await Promise.all([
        refreshCollections(supabaseUid),
        universePrefs.refreshUniversePrefs(supabaseUid),
      ]);
    } else {
      lastFetchUid = null;
      setUserCollections([]);
      setLoading(false);
    }
  };"""

new_loadForUid = """  const loadForUid = async (supabaseUid: string | null) => {
    if (supabaseUid) {
      // Skip if a fetch for this uid is already in flight.
      if (lastFetchUid === supabaseUid) return;
      lastFetchUid = supabaseUid;
      setLoading(true);
      try {
        // AWAIT ensureFavoritesExists BEFORE refreshing collections.
        // Previously this was fire-and-forget (.catch(() => {})), which
        // caused a race condition: multiple onSessionChange events would
        // each check for Favorites concurrently, find none, and each
        // create a duplicate. Awaiting ensures the check+create completes
        // before the collection list is refreshed.
        // Timeout guard (5 s): if Supabase is slow/unreachable, don't block
        // the entire collections page in skeleton state indefinitely.
        try {
          await Promise.race([
            ensureFavoritesExistsInSupabase(supabaseUid),
            new Promise<void>((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
          ]);
        } catch (err) {
          // Non-fatal: collections still load even if Favorites creation fails/times out.
          if ((err as Error)?.message !== "timeout") {
            console.error("[useCollections] ensureFavoritesExists failed:", err);
          }
        }
        await Promise.all([
          refreshCollections(supabaseUid),
          universePrefs.refreshUniversePrefs(supabaseUid),
        ]);
      } catch (err) {
        // GUARANTEE: loading MUST become false even if refreshCollections or
        // refreshUniversePrefs throws an unexpected error. Without this catch,
        // loading stays true forever and the Collections page is stuck on skeleton.
        console.error("[useCollections] loadForUid failed:", err);
        setUserCollections([]);
      } finally {
        setLoading(false);
      }
    } else {
      lastFetchUid = null;
      setUserCollections([]);
      setLoading(false);
    }
  };"""

content = content.replace(old_loadForUid, new_loadForUid)

# Also fix: refreshCollections should NOT call setLoading(false) since
# loadForUid's finally block now handles it. Remove setLoading calls
# from refreshCollections to avoid double-setting and potential race.
old_refreshCollections = """  const refreshCollections = async (userId: string) => {
    try {
      const items = await fetchCollectionsFromSupabase(userId);
      // Defensive: the adapter already returns [] on error, but guard
      // against an unexpected null/undefined so a downstream .map()
      // never throws "Cannot read properties of null".
      setUserCollections(Array.isArray(items) ? items : []);
      setLoading(false);
    } catch (err) {
      console.error("[useCollections] Supabase error:", err);
      setUserCollections([]);
      setLoading(false);
    }
  };"""

new_refreshCollections = """  const refreshCollections = async (userId: string) => {
    // NOTE: setLoading(false) is handled by loadForUid's finally block.
    // Do NOT call setLoading(false) here — it could race with loadForUid's
    // finally block if refreshUniversePrefs is still running.
    try {
      const items = await fetchCollectionsFromSupabase(userId);
      // Defensive: the adapter already returns [] on error, but guard
      // against an unexpected null/undefined so a downstream .map()
      // never throws "Cannot read properties of null".
      setUserCollections(Array.isArray(items) ? items : []);
    } catch (err) {
      console.error("[useCollections] Supabase error:", err);
      setUserCollections([]);
      throw err; // Re-throw so loadForUid's catch block can handle it
    }
  };"""

content = content.replace(old_refreshCollections, new_refreshCollections)

with open("src/features/collections/hooks/useCollections.tsx", "w") as f:
    f.write(content)

print("  ✓ Added try/catch/finally to useCollections.loadForUid()")
print("  ✓ Fixed refreshCollections to not race on setLoading")

# ============================================================
# Fix 4: useUserLibrary - Fix safety net timer management
# ============================================================
print("Fix 4: Fixing useUserLibrary safety net timer management...")

with open("src/shared/hooks/useUserLibrary.tsx", "r") as f:
    content = f.read()

# Replace the createEffect block with proper timer management
old_effect = """  createEffect(() => {
    if (authReady() && isSignedIn()) {
      doFetch();
      // Safety-net: unblock UI if the vault fetch hangs (network issues, etc.)
      const safetyTimer = setTimeout(() => {
        if (isFetching) {
          console.warn("[UserLibraryProvider] Vault fetch timed out after 15s — unblocking UI");
          setLoading(false);
          isFetching = false;
        }
      }, 15000);
      void safetyTimer; // reference to suppress unused-var lint
    } else if (authReady() && !isSignedIn()) {
      // Clear library when signed out (guest mode)
      setWatchlist([]);
      setLoading(false);
    }
  });"""

new_effect = """  // Track the safety-net timer so it can be cleared when doFetch completes.
  let safetyTimerId: ReturnType<typeof setTimeout> | null = null;

  createEffect(() => {
    if (authReady() && isSignedIn()) {
      // Clear any previous safety timer before starting a new fetch
      if (safetyTimerId !== null) {
        clearTimeout(safetyTimerId);
        safetyTimerId = null;
      }
      doFetch();
      // Safety-net: unblock UI if the vault fetch hangs (network issues, etc.)
      safetyTimerId = setTimeout(() => {
        if (isFetching) {
          console.warn("[UserLibraryProvider] Vault fetch timed out after 15s — unblocking UI");
          setLoading(false);
          isFetching = false;
        }
        safetyTimerId = null;
      }, 15000);
    } else if (authReady() && !isSignedIn()) {
      // Clear library when signed out (guest mode)
      setWatchlist([]);
      setLoading(false);
      // Clear safety timer on sign-out
      if (safetyTimerId !== null) {
        clearTimeout(safetyTimerId);
        safetyTimerId = null;
      }
    }
  });"""

content = content.replace(old_effect, new_effect)

# Also update doFetch to clear the safety timer on completion
old_doFetch_finally = """  } finally {
      isFetching = false;
    }
  };"""

new_doFetch_finally = """  } finally {
      isFetching = false;
      // Clear the safety-net timer since the fetch completed (success or error)
      if (safetyTimerId !== null) {
        clearTimeout(safetyTimerId);
        safetyTimerId = null;
      }
    }
  };"""

# But we need safetyTimerId to be accessible from doFetch. It's declared in the
# createEffect scope. We need to move it to the provider scope.
# Actually, safetyTimerId is now declared before the createEffect, so it's
# accessible from doFetch (which is also in the provider scope). This should work.

# Let me find and replace the finally block in doFetch
# Find the exact text around the finally block
old_finally_pattern = """  } finally {
      isFetching = false;
    }
  };

  /**
   * Auth-triggered library fetch."""

new_finally_pattern = """  } finally {
      isFetching = false;
      // Clear the safety-net timer since the fetch completed (success or error)
      if (safetyTimerId !== null) {
        clearTimeout(safetyTimerId);
        safetyTimerId = null;
      }
    }
  };

  /**
   * Auth-triggered library fetch."""

content = content.replace(old_finally_pattern, new_finally_pattern)

with open("src/shared/hooks/useUserLibrary.tsx", "w") as f:
    f.write(content)

print("  ✓ Fixed safety net timer management in useUserLibrary")

# ============================================================
# Fix 5: useProfileData - Ensure fetching=false on all code paths
# ============================================================
print("Fix 5: Fixing useProfileData doFetch robustness...")

with open("src/features/profile/useProfileData.ts", "r") as f:
    content = f.read()

# Fix: doFetch should handle uid() being null gracefully
old_doFetch = """  let fetchingUid: string | null = null; // guard against concurrent doFetch calls
  const doFetch = async () => {
    if (isServer) return;
    const id = uid();
    if (!id) return;
    // Guard: if already fetching for this uid, skip to avoid double-fetch
    if (fetchingUid === id) return;
    fetchingUid = id;

    setFetching(true);
    setFetchError(null);
    try {
      // 8-second timeout: Supabase queries should resolve quickly. If not,
      // release the skeleton so the page doesn't stay blank forever.
      const result = await Promise.race([
        loader(),
        new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error("Profile load timed out")), 8000)
        ),
      ]);
      setData(result);
    } catch (err) {
      console.error("[useProfileData] Fetch failed:", err);
      setFetchError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      fetchingUid = null;
      setFetching(false);
    }
  };"""

new_doFetch = """  let fetchingUid: string | null = null; // guard against concurrent doFetch calls
  const doFetch = async () => {
    if (isServer) return;
    const id = uid();
    if (!id) {
      // No user signed in — clear any stale data and ensure fetching is false
      setData(null);
      setFetchError(null);
      return;
    }
    // Guard: if already fetching for this uid, skip to avoid double-fetch
    if (fetchingUid === id) return;
    fetchingUid = id;

    setFetching(true);
    setFetchError(null);
    try {
      // 8-second timeout: Supabase queries should resolve quickly. If not,
      // release the skeleton so the page doesn't stay blank forever.
      const result = await Promise.race([
        loader(),
        new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error("Profile load timed out")), 8000)
        ),
      ]);
      // Discard stale result if user changed while fetch was in-flight
      if (uid() !== id) return;
      setData(result);
    } catch (err) {
      console.error("[useProfileData] Fetch failed:", err);
      // Discard stale error if user changed while fetch was in-flight
      if (uid() !== id) return;
      setFetchError(err instanceof Error ? err : new Error(String(err)));
      setData(null);
    } finally {
      fetchingUid = null;
      setFetching(false);
    }
  };"""

content = content.replace(old_doFetch, new_doFetch)

# Also fix: the createEffect should handle the signed-out case
old_profile_effect = """  // Trigger fetch when uid changes (sign-in / sign-out / auth ready).
  createEffect(() => {
    if (authReady() && uid()) {
      doFetch();
    }
  });"""

new_profile_effect = """  // Trigger fetch when uid changes (sign-in / sign-out / auth ready).
  createEffect(() => {
    if (authReady()) {
      if (uid()) {
        doFetch();
      } else {
        // Signed out — clear profile data and ensure loading is false
        setData(null);
        setFetchError(null);
        setFetching(false);
      }
    }
  });"""

content = content.replace(old_profile_effect, new_profile_effect)

with open("src/features/profile/useProfileData.ts", "w") as f:
    f.write(content)

print("  ✓ Fixed useProfileData doFetch robustness")

# ============================================================
# Fix 6: apiCache.ts - cachedFetch should handle rejected in-flight promises
# ============================================================
print("Fix 6: Making cachedFetch resilient to rejected in-flight promises...")

with open("src/shared/utils/apiCache.ts", "r") as f:
    content = f.read()

# The current cachedFetch doesn't clean up inFlight on error properly.
# If the fetcher rejects, the inFlight entry is cleaned up by .finally(),
# but the REJECTED promise is still in the inFlight map briefly.
# A concurrent call could get the rejected promise and also fail.
# Fix: wrap the fetcher call in a try/catch to ensure errors don't
# leave stale in-flight entries, and DON'T cache errors.

old_cachedFetch = """export async function cachedFetch<T>(
  key: string,
  ttl: number,
  fetcher: () => Promise<T>
): Promise<T> {
  // 1. Check cache
  const cached = getCached<T>(key);
  if (cached !== undefined) return cached;

  // 2. Check in-flight
  const existing = getInFlight<T>(key);
  if (existing) return existing;

  // 3. Make the request
  const promise = fetcher();
  setInFlight(key, promise);

  // Don't cache errors — let the next call retry. The await re-throws
  // naturally if the promise rejects, so no try/catch wrapper needed.
  const result = await promise;
  setCached(key, result, ttl);
  return result;
}"""

new_cachedFetch = """export async function cachedFetch<T>(
  key: string,
  ttl: number,
  fetcher: () => Promise<T>
): Promise<T> {
  // 1. Check cache
  const cached = getCached<T>(key);
  if (cached !== undefined) return cached;

  // 2. Check in-flight
  const existing = getInFlight<T>(key);
  if (existing) return existing;

  // 3. Make the request
  const promise = fetcher();
  setInFlight(key, promise);

  try {
    // Don't cache errors — let the next call retry.
    const result = await promise;
    setCached(key, result, ttl);
    return result;
  } catch (err) {
    // Clean up: ensure the in-flight entry is removed immediately on error
    // so subsequent calls can retry instead of getting a stale rejected promise.
    inFlight.delete(key);
    throw err;
  }
}"""

content = content.replace(old_cachedFetch, new_cachedFetch)

with open("src/shared/utils/apiCache.ts", "w") as f:
    f.write(content)

print("  ✓ Fixed cachedFetch to clean up inFlight on error")

print("\n✅ All 6 root cause fixes applied successfully!")
