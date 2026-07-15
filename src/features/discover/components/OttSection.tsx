// src/features/discover/components/OttSection.tsx
//
// OttSection — "New on OTT" premium streaming carousel.
//
// OTT-only refinement:
//   • Provider chips mapped by TMDB provider ID (not name). Primary
//     order: Netflix, JioHotstar, Prime Video, SonyLIV, ZEE5, Crunchyroll.
//   • Providers NOT available in the user's region are HIDDEN (no empty
//     chip, no empty carousel).
//   • Movie + TV results merged via Promise.allSettled so a provider
//     that has TV content but no movie content (or vice versa) never
//     shows an empty state. Deduplicated by TMDB id.
//   • Alias merging: "Amazon Prime Video" + "Amazon Video" + "Prime
//     Video" collapse into one "Prime Video" chip.
//   • Per-provider + per-region cache. Switching back to an already-
//     loaded provider never hits TMDB again.
//   • Default provider = Netflix.
//   • Contextual subtitle per provider.
//   • "More" button opens a Play Store-style bottom sheet: 56-64px
//     circular logos with the provider name BELOW each logo (never
//     inside the circle). Responsive grid.
//   • Premium empty state with retry — ONLY shown when BOTH movie and
//     TV results are empty.
//

import {
  For, Show, createSignal, createMemo, onMount, onCleanup, createEffect, on,
  type Component,
} from "solid-js";
import { Portal } from "solid-js/web";
import { tmdbImage } from "~/core/tmdb/tmdb";
import {
  discoverMoviesWithProvider,
  discoverTvWithProvider,
  getWatchProviderList,
  getWatchProviderListTv,
} from "~/core/tmdb/discover";
import type { TMDBTitle } from "~/shared/types";
import { streamingProviders } from "~/core/preferences";
import PremiumEmptyState from "./PremiumEmptyState";
import {
  buildPrimaryProviders,
  buildMoreProviders,
  mergeProviders,
  canonicalForTmdbId,
  displayNameFor,
  subtitleFor,
  type MergedProvider,
  type TmdbProviderRow,
  type CanonicalProviderKey,
} from "./ottProviderRegistry";

interface OttSectionProps {
  onSelect: (title: TMDBTitle) => void;
  /** ISO 3166-1 region. Defaults to IN. */
  region?: string;
}

const OttSection: Component<OttSectionProps> = (props) => {
  // Raw TMDB provider rows (movie + TV lists merged).
  const [rawProviders, setRawProviders] = createSignal<TmdbProviderRow[]>([]);
  const [selectedProviderId, setSelectedProviderId] = createSignal<number | null>(null);
  const [titles, setTitles] = createSignal<TMDBTitle[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<Error | null>(null);
  const [moreOpen, setMoreOpen] = createSignal(false);

  /**
   * In-component cache keyed by `${providerId}:${region}`. Layered on
   * top of the apiCache layer so re-selecting a previously-loaded
   * provider is synchronous (no network).
   */
  const [loadedCache, setLoadedCache] = createSignal<Record<string, TMDBTitle[]>>({});

  const region = () => props.region ?? "IN";

  // --- Merge movie + TV provider lists, then merge aliases ---
  const mergedProviders = createMemo<MergedProvider[]>(() =>
    mergeProviders(rawProviders())
  );

  // --- Available TMDB IDs (for region-availability filtering) ---
  const availableTmdbIds = createMemo<Set<number>>(() => {
    const s = new Set<number>();
    for (const r of rawProviders()) s.add(r.providerId);
    return s;
  });

  // --- Primary chips (hidden if not available in region) ---
  const primaryProviders = createMemo<MergedProvider[]>(() => {
    const available = availableTmdbIds();
    const primaries = buildPrimaryProviders(available);
    // Resolve logo paths from the raw TMDB list.
    return primaries.map((p) => ({
      ...p,
      logoPath: resolveLogo(p.allTmdbIds, rawProviders()),
    }));
  });

  // --- "More" sheet providers (all merged providers EXCEPT primaries) ---
  const primaryCanonicals = createMemo<Set<CanonicalProviderKey>>(() => {
    const s = new Set<CanonicalProviderKey>();
    for (const p of primaryProviders()) s.add(p.canonical);
    return s;
  });

  const moreProviders = createMemo<MergedProvider[]>(() => {
    const merged = mergedProviders();
    const primaries = primaryCanonicals();
    return buildMoreProviders(merged, primaries).map((p) => ({
      ...p,
      logoPath: p.logoPath ?? resolveLogo(p.allTmdbIds, rawProviders()),
    }));
  });

  /**
   * Fetch BOTH movie + TV provider lists for the given region, merge them.
   * This ensures a provider appears if it's in EITHER list (some
   * providers only appear in /tv, some only in /movie).
   *
   * Called on mount AND whenever the user changes their country in
   * Account settings — the reactive effect below triggers a refetch
   * and resets the per-region cache so we don't show stale data.
   */
  const fetchProviders = (r: string) => {
    let cancelled = false;
    Promise.allSettled([
      getWatchProviderList(r),
      getWatchProviderListTv(r),
    ]).then((results) => {
      if (cancelled) return;
      const combined: TmdbProviderRow[] = [];
      const seenIds = new Set<number>();
      for (const res of results) {
        if (res.status !== "fulfilled") continue;
        for (const row of res.value) {
          if (seenIds.has(row.providerId)) {
            // Same ID in both lists — keep the first logo we saw.
            continue;
          }
          seenIds.add(row.providerId);
          combined.push({
            providerId: row.providerId,
            providerName: row.providerName,
            logoPath: row.logoPath,
          });
        }
      }
      setRawProviders(combined);
    }).catch((e) => console.error("[OttSection] Provider list fetch:", e));
    onCleanup(() => { cancelled = true; });
  };

  onMount(() => fetchProviders(region()));

  // REACTIVE: when the user changes their country in Account settings,
  // refetch the provider list for the new region and reset the
  // per-provider cache (the cache is keyed by `${providerId}:${region}`
  // so old entries are stale). Also reset the selected provider so the
  // default-Netflix effect re-picks a provider that actually exists in
  // the new region.
  createEffect(on(region, (r) => {
    setLoadedCache({});
    setSelectedProviderId(null);
    setTitles([]);
    setError(null);
    fetchProviders(r);
  }, { defer: true }));

  // Default to Netflix on first mount (only if Netflix is available).
  // Falls back to the first available primary provider.
  //
  // WIRING (v2 settings redesign): If the user has selected streaming
  // providers in Content & Discover settings, prefer the FIRST one that
  // is available in the current region. This makes the OTT section start
  // on a provider the user actually subscribes to.
  createEffect(() => {
    if (selectedProviderId() !== null) return;
    const primaries = primaryProviders();
    if (primaries.length === 0) return;
    const userProviders = streamingProviders();
    if (userProviders.length > 0) {
      // Find the first user-subscribed provider that exists in this region
      const userPrimary = primaries.find((p) => userProviders.includes(String(p.primaryTmdbId)));
      if (userPrimary) {
        setSelectedProviderId(userPrimary.primaryTmdbId);
        return;
      }
    }
    // No user preference, or none of their providers are available — default to Netflix
    const netflix = primaries.find((p) => p.canonical === "netflix");
    setSelectedProviderId((netflix ?? primaries[0]).primaryTmdbId);
  });

  /**
   * Load titles for a provider — fetches BOTH movie and TV in parallel
   * via Promise.allSettled, merges results, dedupes by TMDB id.
   *
   * Empty state is ONLY shown when BOTH movie and TV return empty
   * (or both fail). A provider with TV content but no movie content
   * (e.g. a show-only platform) still shows its TV results.
   */
  const loadProvider = async (providerId: number) => {
    const cacheKey = `${providerId}:${region()}`;
    const cached = loadedCache()[cacheKey];
    if (cached) {
      setTitles(cached);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [movieRes, tvRes] = await Promise.allSettled([
        discoverMoviesWithProvider(providerId, region(), { sortBy: "popularity.desc" }),
        discoverTvWithProvider(providerId, region(), { sortBy: "popularity.desc" }),
      ]);
      const movies = movieRes.status === "fulfilled" ? movieRes.value : [];
      const tv = tvRes.status === "fulfilled" ? tvRes.value : [];
      // If both rejected, surface an error.
      if (movieRes.status === "rejected" && tvRes.status === "rejected") {
        throw movieRes.reason ?? tvRes.reason;
      }
      // Merge + dedupe by TMDB id. Movies first (popularity sort already
      // applied), then TV titles not already in the list.
      const seen = new Set<number>();
      const merged: TMDBTitle[] = [];
      for (const t of movies) {
        if (seen.has(t.id)) continue;
        seen.add(t.id);
        merged.push(t);
      }
      for (const t of tv) {
        if (seen.has(t.id)) continue;
        seen.add(t.id);
        merged.push(t);
      }
      const sliced = merged.slice(0, 20);
      setLoadedCache((prev) => ({ ...prev, [cacheKey]: sliced }));
      setTitles(sliced);
    } catch (e) {
      console.error("[OttSection] Provider titles fetch:", e);
      setError(e instanceof Error ? e : new Error(String(e)));
      setTitles([]);
    } finally {
      setLoading(false);
    }
  };

  // React to provider selection changes.
  let lastLoaded: number | null = null;
  createEffect(() => {
    const id = selectedProviderId();
    if (id === null) return;
    if (id === lastLoaded) return;
    lastLoaded = id;
    void loadProvider(id);
  });

  const handleSelectProvider = (providerId: number) => {
    if (providerId === selectedProviderId()) return;
    setSelectedProviderId(providerId);
    setMoreOpen(false);
  };

  // Bottom-sheet lifecycle: lock body scroll + ESC to close.
  createEffect(() => {
    if (!moreOpen()) return;
    if (typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("keydown", onKey);
    onCleanup(() => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    });
  });

  const handleRetry = () => {
    const id = selectedProviderId();
    if (id === null) return;
    const cacheKey = `${id}:${region()}`;
    setLoadedCache((prev) => {
      const next = { ...prev };
      delete next[cacheKey];
      return next;
    });
    void loadProvider(id);
  };

  // --- Selected provider display info (from registry, not names) ---
  const selectedMerged = createMemo<MergedProvider | null>(() => {
    const id = selectedProviderId();
    if (id === null) return null;
    // Check primary providers first.
    const fromPrimary = primaryProviders().find((p) => p.primaryTmdbId === id);
    if (fromPrimary) return fromPrimary;
    // Then more providers.
    const fromMore = moreProviders().find((p) => p.primaryTmdbId === id);
    if (fromMore) return fromMore;
    // Fallback — build from raw data.
    const raw = rawProviders().find((r) => r.providerId === id);
    if (raw) {
      const canonical = canonicalForTmdbId(id);
      return {
        canonical,
        primaryTmdbId: id,
        allTmdbIds: [id],
        displayName: canonical === "other" ? raw.providerName : displayNameFor(canonical),
        subtitle: subtitleFor(canonical),
        logoPath: raw.logoPath,
      };
    }
    return null;
  });

  return (
    <div class="ott-section">
      {/* Provider chips — primary row + More button */}
      <div class="ott-provider-bar" role="tablist" aria-label="Streaming providers">
        <For each={primaryProviders()}>
          {(provider) => (
            <ProviderChip
              provider={provider}
              active={selectedProviderId() === provider.primaryTmdbId}
              onSelect={handleSelectProvider}
            />
          )}
        </For>
        <button
          type="button"
          class="ott-provider-more focus-ring"
          data-active={moreOpen()}
          onClick={() => setMoreOpen((v) => !v)}
          aria-label="Show more providers"
          aria-expanded={moreOpen()}
          aria-controls="ott-more-sheet"
        >
          <span class="material-symbols-outlined" style={{ "font-size": "16px" }} aria-hidden="true">
            {moreOpen() ? "expand_less" : "more_horiz"}
          </span>
          <span class="ott-provider-more-label">More</span>
        </button>
      </div>

      {/* "More" bottom sheet — Play Store-style grid of provider cards.
          Each card: 56-64px circular logo with the provider name BELOW
          it (never inside the circle). Responsive grid. */}
      <Show when={moreOpen()}>
        <Portal>
          <div
            class="modal-backdrop fixed inset-0 z-[999999] flex items-end sm:items-center justify-center p-0 sm:p-4"
            style={{
              background: "rgba(0,0,0,0.85)",
              "backdrop-filter": "blur(8px)",
              "-webkit-backdrop-filter": "blur(8px)",
            }}
            onClick={() => setMoreOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label="More streaming providers"
          >
            <div
              class="modal-sheet-enter modal-surface ott-more-sheet-panel"
              onClick={(e) => e.stopPropagation()}
            >
              <div class="sheet-handle sm:hidden" aria-hidden="true" />
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                class="ott-more-close focus-ring"
                aria-label="Close more providers"
              >
                <span class="material-symbols-outlined" style={{ "font-size": "16px" }} aria-hidden="true">
                  close
                </span>
              </button>

              <div class="ott-more-header">
                <p class="ott-more-title">More Providers</p>
                <p class="ott-more-subtitle">Every streaming service in your region</p>
              </div>

              <Show
                when={moreProviders().length > 0}
                fallback={
                  <div class="ott-more-empty-wrap">
                    <PremiumEmptyState
                      icon="live_tv"
                      message="No additional providers in your region."
                    />
                  </div>
                }
              >
                <div class="ott-more-grid" role="list">
                  <For each={moreProviders()}>
                    {(provider) => (
                      <ProviderGridCard
                        provider={provider}
                        active={selectedProviderId() === provider.primaryTmdbId}
                        onSelect={handleSelectProvider}
                      />
                    )}
                  </For>
                </div>
              </Show>
            </div>
          </div>
        </Portal>
      </Show>

      {/* Provider name + dynamic contextual subtitle */}
      <Show when={selectedMerged()}>
        {(sp) => (
          <div class="ott-provider-heading">
            <p class="ott-provider-label">{sp().displayName}</p>
            <p class="ott-provider-subtitle">{sp().subtitle}</p>
          </div>
        )}
      </Show>

      {/* Titles carousel OR skeleton OR empty state */}
      <Show
        when={!loading()}
        fallback={
          <div class="search-rail">
            <For each={Array.from({ length: 6 })}>
              {() => (
                <div class="search-rail-card" style={{ cursor: "default" }}>
                  <div class="search-rail-poster skeleton-base" />
                </div>
              )}
            </For>
          </div>
        }
      >
        <Show
          when={titles().length > 0}
          fallback={
            <Show
              when={!error()}
              fallback={
                <PremiumEmptyState
                  icon="live_tv"
                  message="Nothing streaming on this provider right now."
                  hint="Try another provider from the chips above."
                  onRetry={handleRetry}
                />
              }
            >
              <PremiumEmptyState
                icon="live_tv"
                message="Nothing streaming on this provider right now."
                hint="Try another provider from the chips above."
              />
            </Show>
          }
        >
          <div class="search-rail" role="list">
            <For each={titles()}>
              {(title) => (
                <button
                  type="button"
                  class="search-rail-card focus-ring"
                  onClick={() => props.onSelect(title)}
                  role="listitem"
                  aria-label={`${title.title || title.name || "Untitled"}, ${(title.release_date || title.first_air_date || "").split("-")[0] || ""}`}
                >
                  <div class="search-rail-poster">
                    <Show
                      when={title.poster_path}
                      fallback={
                        <div class="search-rail-poster-fallback">
                          <span class="material-symbols-outlined" style={{ "font-size": "24px", color: "var(--text-dim)" }} aria-hidden="true">
                            movie
                          </span>
                        </div>
                      }
                    >
                      <img
                        src={tmdbImage(title.poster_path, "w185")}
                        class="search-rail-poster-img"
                        loading="lazy"
                        decoding="async"
                        alt=""
                        aria-hidden="true"
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                      />
                    </Show>
                  </div>
                  <p class="search-rail-title">{title.title || title.name || "Untitled"}</p>
                  <p class="search-rail-meta">
                    {(title.release_date || title.first_air_date || "").split("-")[0] || ""}
                    {title.vote_average ? ` · ★ ${title.vote_average.toFixed(1)}` : ""}
                  </p>
                </button>
              )}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Helper: resolve logo path from raw TMDB rows for a set of provider IDs.
// Returns the first non-null logo across all matching rows.
// ---------------------------------------------------------------------------
function resolveLogo(tmdbIds: number[], rows: TmdbProviderRow[]): string | null {
  for (const id of tmdbIds) {
    const row = rows.find((r) => r.providerId === id);
    if (row?.logoPath) return row.logoPath;
  }
  return null;
}

// ---------------------------------------------------------------------------
// ProviderChip — circular logo chip for the primary row (44px).
// Logo fills the circle; NO text inside the circle.
// ---------------------------------------------------------------------------

interface ProviderChipProps {
  provider: MergedProvider;
  active: boolean;
  onSelect: (id: number) => void;
}

const ProviderChip: Component<ProviderChipProps> = (props) => {
  const label = () => props.provider.displayName;
  return (
    <button
      type="button"
      class="ott-provider-chip focus-ring"
      data-active={props.active}
      onClick={() => props.onSelect(props.provider.primaryTmdbId)}
      role="tab"
      aria-selected={props.active}
      aria-label={label()}
      title={label()}
    >
      <ProviderLogo provider={props.provider} size="chip" />
    </button>
  );
};

// ---------------------------------------------------------------------------
// ProviderGridCard — Play Store-style card for the "More" sheet.
// 56-64px circular logo on top, provider name BELOW (max 2 lines, ellipsis).
// ---------------------------------------------------------------------------

interface ProviderGridCardProps {
  provider: MergedProvider;
  active: boolean;
  onSelect: (id: number) => void;
}

const ProviderGridCard: Component<ProviderGridCardProps> = (props) => {
  const label = () => props.provider.displayName;
  return (
    <button
      type="button"
      class="ott-provider-grid-card focus-ring"
      data-active={props.active}
      onClick={() => props.onSelect(props.provider.primaryTmdbId)}
      role="listitem"
      aria-label={label()}
      title={label()}
    >
      <div class="ott-provider-grid-logo-wrap">
        <ProviderLogo provider={props.provider} size="grid" />
      </div>
      <span class="ott-provider-grid-name">{label()}</span>
    </button>
  );
};

// ---------------------------------------------------------------------------
// ProviderLogo — renders the TMDB logo image, with graceful fallbacks.
//
// Fallback chain:
//   1. TMDB logo_path image (circular, object-fit: cover)
//   2. If image fails to load → generic streaming icon (live_tv) inside
//      a tinted circle. NEVER render cropped text inside the circle.
// ---------------------------------------------------------------------------

interface ProviderLogoProps {
  provider: MergedProvider;
  size: "chip" | "grid";
}

const ProviderLogo: Component<ProviderLogoProps> = (props) => {
  const [imgFailed, setImgFailed] = createSignal(false);
  // Reset failure state when the provider changes.
  let lastId = -1;
  createEffect(() => {
    const id = props.provider.primaryTmdbId;
    if (id !== lastId) {
      lastId = id;
      setImgFailed(false);
    }
  });
  return (
    <Show
      when={props.provider.logoPath && !imgFailed()}
      fallback={
        <div class={`ott-provider-fallback ott-provider-fallback-${props.size}`} aria-hidden="true">
          <span class="material-symbols-outlined" aria-hidden="true">live_tv</span>
        </div>
      }
    >
      <img
        src={tmdbImage(props.provider.logoPath!, "w154")}
        class={`ott-provider-logo ott-provider-logo-${props.size}`}
        loading="lazy"
        decoding="async"
        alt=""
        aria-hidden="true"
        onError={() => setImgFailed(true)}
      />
    </Show>
  );
};

export default OttSection;
