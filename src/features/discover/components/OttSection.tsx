// src/features/discover/components/OttSection.tsx
//
// OttSection — "New on OTT" premium streaming carousel.
//
// Production polish (final Discover update):
//   • New provider order — Netflix, JioHotstar, Prime Video, SonyLIV,
//     ZEE5, Crunchyroll, then a "More" button that opens a horizontal
//     expandable sheet listing every remaining TMDB provider.
//   • Active provider highlighted in CineLog yellow with a soft glow
//     and a small scale animation.
//   • Smooth provider switching — preserves scroll position (the rail
//     is keyed on providerId, but the page scroll is left untouched).
//   • Lazy load provider movies — only fetches on first selection.
//   • Cache every provider individually via apiCache (already provided
//     by discoverMoviesWithProvider). Loaded providers also live in an
//     in-component cache so switching back is instant.
//   • Default provider = Netflix.
//   • Dynamic contextual subtitle per provider ("Trending on Netflix",
//     "Recently Added", "Popular in India", "Watch this Weekend",
//     "Indian Favourites", "Top Anime", …).
//   • Premium empty states with Retry on network failure.
//   • Below-the-fold safe: parent LazyMount wraps this section.
//   • Fully region-aware — reads `region` prop (threaded from the
//     DiscoverPage root, which in turn reads discoverRegion).
//

import {
  For, Show, createSignal, createMemo, onMount, onCleanup, createEffect, type Component,
} from "solid-js";
import { Portal } from "solid-js/web";
import { tmdbImage } from "~/core/tmdb/tmdb";
import {
  discoverMoviesWithProvider, getWatchProviderList,
} from "~/core/tmdb/discover";
import type { TMDBTitle } from "~/shared/types";
import PremiumEmptyState from "./PremiumEmptyState";

interface OttSectionProps {
  onSelect: (title: TMDBTitle) => void;
  /** ISO 3166-1 region. Defaults to the discoverRegion signal. */
  region?: string;
}

interface Provider {
  providerId: number;
  providerName: string;
  logoPath: string | null;
}

/**
 * Primary provider order — the chips that are always visible above the
 * "More" button. IDs are TMDB watch-provider IDs (stable across regions
 * for the major streamers).
 */
const PRIMARY_PROVIDER_ORDER: Array<{ id: number; name: string }> = [
  { id: 8,   name: "Netflix" },
  { id: 554, name: "JioHotstar" },
  { id: 9,   name: "Prime Video" },
  { id: 543, name: "SonyLIV" },
  { id: 567, name: "ZEE5" },
  { id: 283, name: "Crunchyroll" },
];

/**
 * Contextual subtitle per provider. Falls back to "Streaming now" for
 * unknown providers. Subtitle changes dynamically when the user
 * switches chips.
 */
const PROVIDER_SUBTITLE: Record<string, string> = {
  "Netflix": "Trending on Netflix",
  "JioHotstar": "Popular in India",
  "Prime Video": "Recently Added",
  "SonyLIV": "Watch this Weekend",
  "ZEE5": "Indian Favourites",
  "Crunchyroll": "Top Anime",
  "Apple TV Plus": "Critically Acclaimed",
  "MUBI": "Curated Cinema",
  "Lionsgate Play": "Blockbuster Picks",
  "Disney Plus": "Family Favourites",
};

/**
 * OttSection — see file header.
 */
const OttSection: Component<OttSectionProps> = (props) => {
  const [allProviders, setAllProviders] = createSignal<Provider[]>([]);
  const [selectedProvider, setSelectedProvider] = createSignal<number | null>(null);
  const [titles, setTitles] = createSignal<TMDBTitle[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<Error | null>(null);
  const [moreOpen, setMoreOpen] = createSignal(false);
  /**
   * In-component cache: providerId → titles. We keep this on top of the
   * apiCache layer so re-selecting a previously-loaded provider is
   * synchronous (no Promise, no loading shimmer). The apiCache layer
   * still dedupes network requests across mounts.
   */
  const [loadedCache, setLoadedCache] = createSignal<Record<number, TMDBTitle[]>>({});

  const region = () => props.region ?? "IN";

  // Build the primary provider list — always shown in the chip bar.
  // We don't need to wait for the TMDB provider-list fetch because
  // PRIMARY_PROVIDER_ORDER already encodes the IDs + display names.
  // We DO still fetch the TMDB provider list to resolve logo paths and
  // to populate the "More" sheet with every remaining provider.
  const primaryProviders = createMemo<Provider[]>(() =>
    PRIMARY_PROVIDER_ORDER.map((p) => {
      const found = allProviders().find((ap) => ap.providerId === p.id);
      return {
        providerId: p.id,
        providerName: p.name,
        logoPath: found?.logoPath ?? null,
      };
    })
  );

  // "More" providers — every TMDB provider for this region EXCEPT the
  // ones already in PRIMARY_PROVIDER_ORDER. Sorted alphabetically.
  const moreProviders = createMemo<Provider[]>(() => {
    const primaryIds = new Set(PRIMARY_PROVIDER_ORDER.map((p) => p.id));
    return allProviders()
      .filter((p) => !primaryIds.has(p.providerId))
      .sort((a, b) => a.providerName.localeCompare(b.providerName));
  });

  // Fetch provider list on mount (best-effort — primary chips work
  // even before this resolves thanks to PRIMARY_PROVIDER_ORDER).
  onMount(() => {
    let cancelled = false;
    getWatchProviderList(region())
      .then((list) => {
        if (cancelled) return;
        setAllProviders(
          list.map((p) => ({
            providerId: p.providerId,
            providerName: p.providerName,
            logoPath: p.logoPath,
          }))
        );
      })
      .catch((e) => console.error("[OttSection] Provider list fetch:", e));
    onCleanup(() => { cancelled = true; });
  });

  // Default to Netflix on first mount.
  onMount(() => {
    if (selectedProvider() === null) {
      setSelectedProvider(PRIMARY_PROVIDER_ORDER[0].id);
    }
  });

  const loadProvider = async (providerId: number) => {
    // Synchronous cache hit — no loading shimmer, no network.
    const cached = loadedCache()[providerId];
    if (cached) {
      setTitles(cached);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await discoverMoviesWithProvider(providerId, region(), {
        sortBy: "popularity.desc",
      });
      const sliced = result.slice(0, 20);
      setLoadedCache((prev) => ({ ...prev, [providerId]: sliced }));
      setTitles(sliced);
    } catch (e) {
      console.error("[OttSection] Provider titles fetch:", e);
      setError(e instanceof Error ? e : new Error(String(e)));
      setTitles([]);
    } finally {
      setLoading(false);
    }
  };

  // React to provider selection changes — fetch on first selection.
  // Side-effect, so use createEffect (not createMemo).
  let lastLoaded: number | null = null;
  createEffect(() => {
    const id = selectedProvider();
    if (id === null) return;
    if (id === lastLoaded) return;
    lastLoaded = id;
    void loadProvider(id);
  });

  const handleSelectProvider = (providerId: number) => {
    if (providerId === selectedProvider()) return;
    setSelectedProvider(providerId);
    setMoreOpen(false);
  };

  // Bottom-sheet lifecycle: lock body scroll while open + ESC to close.
  // Re-runs when `moreOpen` flips. SSR-safe (no window on server).
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

  // Retry handler — re-runs the current provider's fetch.
  const handleRetry = () => {
    const id = selectedProvider();
    if (id === null) return;
    // Bypass the in-component cache on explicit retry.
    setLoadedCache((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    void loadProvider(id);
  };

  const selectedDisplayName = createMemo(() => {
    const id = selectedProvider();
    if (id === null) return "";
    const primary = PRIMARY_PROVIDER_ORDER.find((p) => p.id === id);
    if (primary) return primary.name;
    const ap = allProviders().find((p) => p.providerId === id);
    return ap?.providerName ?? "Streaming";
  });

  const selectedSubtitle = createMemo(() => {
    const name = selectedDisplayName();
    return PROVIDER_SUBTITLE[name] ?? "Streaming now";
  });

  return (
    <div class="ott-section">
      {/* Provider chips — primary row + More button */}
      <div class="ott-provider-bar" role="tablist" aria-label="Streaming providers">
        <For each={primaryProviders()}>
          {(provider) => (
            <ProviderChip
              provider={provider}
              active={selectedProvider() === provider.providerId}
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

      {/* "More" bottom sheet — Portal-rendered modal that slides up from
          the bottom of the viewport on mobile and centers on desktop.
          Contains every remaining TMDB provider for the region as a
          scrollable grid of compact logo+name chips. */}
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
              {/* Drag handle (mobile affordance) */}
              <div class="sheet-handle sm:hidden" aria-hidden="true" />

              {/* Close button */}
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

              {/* Header */}
              <div class="ott-more-header">
                <p class="ott-more-title">More Providers</p>
                <p class="ott-more-subtitle">Every streaming service in your region</p>
              </div>

              {/* Provider grid — scrollable */}
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
                      <ProviderChip
                        provider={provider}
                        active={selectedProvider() === provider.providerId}
                        onSelect={handleSelectProvider}
                        compact
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
      <Show when={selectedProvider() !== null}>
        <div class="ott-provider-heading">
          <p class="ott-provider-label">{selectedDisplayName()}</p>
          <p class="ott-provider-subtitle">{selectedSubtitle()}</p>
        </div>
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
// ProviderChip — circular logo chip with active-state animation
// ---------------------------------------------------------------------------

interface ProviderChipProps {
  provider: Provider;
  active: boolean;
  onSelect: (id: number) => void;
  compact?: boolean;
}

const ProviderChip: Component<ProviderChipProps> = (props) => {
  const label = () => props.provider.providerName;
  return (
    <button
      type="button"
      class="ott-provider-chip focus-ring"
      classList={{ "ott-provider-chip-compact": !!props.compact }}
      data-active={props.active}
      onClick={() => props.onSelect(props.provider.providerId)}
      role="tab"
      aria-selected={props.active}
      aria-label={label()}
      title={label()}
    >
      <Show
        when={props.provider.logoPath}
        fallback={
          <span class="ott-provider-initial">{label().charAt(0)}</span>
        }
      >
        <img
          src={tmdbImage(props.provider.logoPath, "w92")}
          class="ott-provider-logo"
          loading="lazy"
          decoding="async"
          alt=""
          aria-hidden="true"
          onError={(e) => {
            e.currentTarget.style.display = "none";
            const next = e.currentTarget.nextElementSibling as HTMLElement | null;
            if (next) next.style.display = "flex";
          }}
        />
        <span class="ott-provider-initial" style={{ display: "none" }}>
          {label().charAt(0)}
        </span>
      </Show>
      <Show when={props.compact}>
        <span class="ott-provider-chip-name">{label()}</span>
      </Show>
    </button>
  );
};

export default OttSection;
