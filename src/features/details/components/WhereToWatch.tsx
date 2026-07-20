// src/features/details/components/WhereToWatch.tsx
import { Show, For, createSignal, createMemo, onMount, type Component } from "solid-js";
import type { Accessor } from "solid-js";
import { tmdbImage, fetchTitleWatchProviders } from "~/core/tmdb/tmdb";
import { useDiscoverRegion } from "~/core/config/discoverRegion";
import { useFeatureFlags } from "~/lib/featureFlags";
import {
  canonicalForTmdbId,
  displayNameFor,
} from "~/features/discover/components/ottProviderRegistry";
import type { WatchlistItem, TMDBDetails, TMDBWatchProvider } from "~/shared/types";
import DetailSection from "~/features/details/components/DetailSection";

interface WhereToWatchProps {
  baseItem: Accessor<WatchlistItem | null>;
  details: Accessor<TMDBDetails | null>;
}

/**
 * WhereToWatch — "Where to Watch" section for the Details modal.
 *
 * Shows the streaming/rent/buy platforms where the title is available in
 * the user's currently-set country (from Account settings → discoverRegion).
 *
 * KEY BEHAVIORS:
 *   - Country-filtered: only shows providers for the user's region. If the
 *     title isn't available in that region, the entire section is hidden.
 *   - Provider names are canonicalized via ottProviderRegistry so aliases
 *     (e.g. "Amazon Prime Video" + "Amazon Video") collapse to "Prime Video".
 *   - Deduplicated by canonical key — one chip per real-world service.
 *   - Ordered by access model: Streaming (flatrate) first, then Rent, Buy.
 *   - Each chip: circular logo + provider name beneath.
 *   - Section is hidden entirely when:
 *       • TMDB details aren't loaded yet
 *       • The title has no watch providers in the user's region
 *       • The fetch fails (silent — no error UI, just hidden)
 *
 * PLACEMENT:
 *   Rendered between DetailsMetadata and DetailsSeasons in the DetailsModal.
 */
const WhereToWatch: Component<WhereToWatchProps> = (props) => {
  const region = useDiscoverRegion();
  const featureFlags = useFeatureFlags();
  const [providers, setProviders] = createSignal<TMDBWatchProvider[] | null>(null);
  const [loaded, setLoaded] = createSignal(false);
  // Deep link to the title's page on the platform (country-specific).
  // TMDB returns ONE link per country that points to JustWatch's page
  // for the title in that region — clicking any provider opens it.
  const [deepLink, setDeepLink] = createSignal<string | null>(null);

  const mediaType = createMemo(() => {
    const b = props.baseItem();
    const d = props.details();
    return b?.media_type ?? d?.media_type ?? "movie";
  });

  const tmdbId = createMemo(() => {
    const b = props.baseItem();
    const d = props.details();
    return d?.id ?? (b?.id ? Number(b.id) : null);
  });

  const loadProviders = async () => {
    const id = tmdbId();
    const mt = mediaType();
    if (id === null || id === undefined) {
      setProviders(null);
      setDeepLink(null);
      setLoaded(true);
      return;
    }
    setLoaded(false);
    const results = await fetchTitleWatchProviders(mt as "movie" | "tv", id);
    if (!results) {
      setProviders(null);
      setDeepLink(null);
      setLoaded(true);
      return;
    }
    const countryData = results[region()];
    if (!countryData) {
      setProviders(null);
      setDeepLink(null);
      setLoaded(true);
      return;
    }
    // Capture the country-level deep link (JustWatch URL for this title
    // in this region) — clicking any provider card opens this in a new tab.
    setDeepLink(countryData.link ?? null);
    // Merge flatrate + rent + buy + free + ads, then dedupe by canonical key
    // so alias providers (Amazon Prime Video + Amazon Video) collapse to one.
    const all: TMDBWatchProvider[] = [
      ...(countryData.flatrate ?? []),
      ...(countryData.rent ?? []),
      ...(countryData.buy ?? []),
      ...(countryData.free ?? []),
      ...(countryData.ads ?? []),
    ];
    const seen = new Set<string>();
    const deduped: TMDBWatchProvider[] = [];
    for (const p of all) {
      const key = canonicalForTmdbId(p.provider_id);
      // For "other" canonical (unknown providers), dedupe by provider_id instead
      const dedupKey = key === "other" ? `id:${p.provider_id}` : key;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);
      deduped.push(p);
    }
    setProviders(deduped);
    setLoaded(true);
  };

  onMount(() => { void loadProviders(); });

  /** Display name — uses canonical name when known, falls back to TMDB name. */
  const displayName = (p: TMDBWatchProvider): string => {
    const canonical = canonicalForTmdbId(p.provider_id);
    return canonical === "other" ? p.provider_name : displayNameFor(canonical);
  };

  /** Sorted: streaming providers first (canonical !== "other"), then others. */
  const sortedProviders = createMemo(() => {
    const list = providers() ?? [];
    return [...list].sort((a, b) => {
      const ca = canonicalForTmdbId(a.provider_id);
      const cb = canonicalForTmdbId(b.provider_id);
      // "other" goes last
      if (ca === "other" && cb !== "other") return 1;
      if (ca !== "other" && cb === "other") return -1;
      return displayName(a).localeCompare(displayName(b));
    });
  });

  return (
    <Show when={featureFlags.isEnabled("streaming_button") && loaded() && sortedProviders().length > 0}>
      <DetailSection label="Where to Watch" icon="play_circle">
        <div class="wheretowatch-grid" role="list" aria-label={`Available on ${sortedProviders().length} platforms in ${region()}`}>
          <For each={sortedProviders()}>
            {(provider) => (
              <a
                class="wheretowatch-card"
                role="listitem"
                href={deepLink() ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                title={deepLink() ? `Open ${displayName(provider)} on a new tab` : displayName(provider)}
                aria-label={`Open ${displayName(provider)} in a new tab`}
              >
                <div class="wheretowatch-logo-wrap">
                  <Show
                    when={provider.logo_path}
                    fallback={
                      <div class="wheretowatch-logo-fallback" aria-hidden="true">
                        <span class="material-symbols-outlined" style={{ "font-size": "20px" }} aria-hidden="true">live_tv</span>
                      </div>
                    }
                  >
                    <img
                      src={tmdbImage(provider.logo_path, "w154")}
                      class="wheretowatch-logo"
                      loading="lazy"
                      decoding="async"
                      alt=""
                      aria-hidden="true"
                      onError={(e) => {
                        // Hide broken image, show fallback icon sibling
                        e.currentTarget.style.display = "none";
                        const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
                        if (fallback) fallback.style.display = "flex";
                      }}
                    />
                    <div class="wheretowatch-logo-fallback" style={{ display: "none" }} aria-hidden="true">
                      <span class="material-symbols-outlined" style={{ "font-size": "20px" }} aria-hidden="true">live_tv</span>
                    </div>
                  </Show>
                </div>
                <span class="wheretowatch-name">{displayName(provider)}</span>
              </a>
            )}
          </For>
        </div>
      </DetailSection>
    </Show>
  );
};

export default WhereToWatch;
