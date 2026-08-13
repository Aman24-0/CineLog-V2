// src/features/details/components/WhereToWatch.tsx
import {
  Show,
  For,
  createSignal,
  createMemo,
  onMount,
  type Component
} from "solid-js";
import type { Accessor } from "solid-js";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { getWatchProviderList, getWatchProviderListTv } from "~/core/tmdb/discover";
import { mergeAndSortProviders } from "~/core/preferences/streamingProviders";
import { useDiscoverRegion } from "~/core/config/discoverRegion";
import { useFeatureFlags } from "~/lib/featureFlags";
import {
  canonicalForTmdbId,
  canonicalForJustWatchClearName,
  displayNameFor
} from "~/features/discover/components/ottProviderRegistry";
import type { WatchlistItem, TMDBDetails } from "~/shared/types";
import type { ProviderAvailabilityEntry } from "~/server/ott-providers/types";
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
 * DATA SOURCES:
 *   - Provider availability: JustWatch (via getProviderAvailability)
 *   - Provider logos: TMDB /watch/providers list (for logo_path only)
 *   - Provider names: JustWatch package.clearName, mapped to canonical names
 *
 * KEY BEHAVIORS:
 *   - Country-filtered: only shows providers for the user's region.
 *   - Provider names come from JustWatch; logos come from TMDB provider list.
 *   - Deduplicated by canonical key — one chip per real-world service.
 *   - Ordered by access model: Streaming (flatrate) first, then Rent, Buy.
 *   - Each chip: circular logo + provider name beneath.
 *   - Section is hidden entirely when:
 *       • TMDB details aren't loaded yet
 *       • The title has no watch providers in the user's region
 *       • The fetch fails (silent — no error UI, just hidden)
 */
const WhereToWatch: Component<WhereToWatchProps> = (props) => {
  const region = useDiscoverRegion();
  const featureFlags = useFeatureFlags();
  const [providers, setProviders] = createSignal<
    Array<{ name: string; monetizationType: string; logoPath: string | null }>
  >([]);
  const [loaded, setLoaded] = createSignal(false);
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

  const title = createMemo(() => {
    const d = props.details();
    return d?.title ?? d?.name ?? d?.original_title ?? d?.original_name ?? "";
  });

  /** Load TMDB provider list for logo resolution (cached, cheap). */
  const loadLogoMap = async (reg: string): Promise<Map<string, string | null>> => {
    const [movieRows, tvRows] = await Promise.allSettled([
      getWatchProviderList(reg),
      getWatchProviderListTv(reg)
    ]);
    const movie = movieRows.status === "fulfilled" ? movieRows.value : [];
    const tv = tvRows.status === "fulfilled" ? tvRows.value : [];
    const merged = mergeAndSortProviders(movie, tv);
    const logoMap = new Map<string, string | null>();
    for (const p of merged) {
      // Map by canonical key for JustWatch-resolved providers.
      const canonical = canonicalForTmdbId(Number(p.id));
      if (!logoMap.has(canonical)) {
        logoMap.set(canonical, p.logoPath);
      }
      // Also map by TMDB ID string for direct lookups.
      if (!logoMap.has(p.id)) {
        logoMap.set(p.id, p.logoPath);
      }
      // Map by display name (case-insensitive) for JustWatch clearName lookups.
      const nameKey = p.name.toLowerCase();
      if (!logoMap.has(nameKey)) {
        logoMap.set(nameKey, p.logoPath);
      }
    }
    return logoMap;
  };

  const loadProviders = async () => {
    const id = tmdbId();
    const mt = mediaType();
    const titleStr = title();
    if (id === null || id === undefined || !titleStr) {
      setProviders([]);
      setDeepLink(null);
      setLoaded(true);
      return;
    }
    setLoaded(false);

    try {
      // Fetch JustWatch availability (via API route) + TMDB provider logos in parallel.
      const [fetchResult, logoMap] = await Promise.allSettled([
        fetch(`/api/ott-providers/${id}?type=${mt}&title=${encodeURIComponent(titleStr)}`),
        loadLogoMap(region())
      ]);

      const logos = logoMap.status === "fulfilled" ? logoMap.value : new Map();

      if (fetchResult.status === "rejected" || !fetchResult.value.ok) {
        setProviders([]);
        setDeepLink(null);
        setLoaded(true);
        return;
      }

      const jw = await fetchResult.value.json();
      if (!jw.providers || jw.providers.length === 0) {
        setProviders([]);
        setDeepLink(null);
        setLoaded(true);
        return;
      }

      // Map JustWatch providers to display format.
      const mapped = jw.providers.map((p: ProviderAvailabilityEntry) => {
        const canonical = canonicalForJustWatchClearName(p.providerName);
        const logoPath = logos.get(canonical) ??
          logos.get(p.providerName.toLowerCase()) ??
          logos.get(p.providerName) ??
          null;
        return {
          name: displayNameFor(canonical),
          monetizationType: p.monetizationType,
          logoPath
        };
      });

      // Sort: flatrate/streaming first, then rent, buy, free, ads.
      const order = (m: string) => {
        switch (m) {
          case "flatrate": return 0;
          case "free": return 1;
          case "ads": return 2;
          case "rent": return 3;
          case "buy": return 4;
          default: return 5;
        }
      };
      mapped.sort((a: typeof mapped[0], b: typeof mapped[0]) => order(a.monetizationType) - order(b.monetizationType));

      setProviders(mapped);

      // Build a JustWatch search deep link as fallback.
      const jwNodeId = jw.justWatchNodeId;
      if (jwNodeId) {
        setDeepLink(`https://www.justwatch.com/in/title/${jwNodeId}`);
      } else {
        setDeepLink(null);
      }
    } catch (err) {
      console.warn("[WhereToWatch] Failed to load providers:", err);
      setProviders([]);
      setDeepLink(null);
    } finally {
      setLoaded(true);
    }
  };

  onMount(() => {
    void loadProviders();
  });

  /** Sorted: streaming providers first (flatrate/free/ads), then others. */
  const sortedProviders = createMemo(() => {
    const list = providers() ?? [];
    return [...list].sort((a, b) => {
      const order: Record<string, number> = {
        flatrate: 0, free: 1, ads: 2, rent: 3, buy: 4
      };
      const oa = order[a.monetizationType] ?? 5;
      const ob = order[b.monetizationType] ?? 5;
      if (oa !== ob) return oa - ob;
      return a.name.localeCompare(b.name);
    });
  });

  return (
    <Show
      when={
        featureFlags.isEnabled("streaming_button") &&
        loaded() &&
        sortedProviders().length > 0
      }
    >
      <DetailSection label="Where to Watch" icon="play_circle">
        <div
          class="wheretowatch-grid"
          role="list"
          aria-label={`Available on ${sortedProviders().length} platforms in ${region()}`}
        >
          <For each={sortedProviders()}>
            {(provider) => (
              <a
                class="wheretowatch-card"
                role="listitem"
                href={deepLink() ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                title={
                  deepLink()
                    ? `Open ${provider.name} on a new tab`
                    : provider.name
                }
                aria-label={`Open ${provider.name} in a new tab`}
              >
                <div class="wheretowatch-logo-wrap">
                  <Show
                    when={provider.logoPath}
                    fallback={
                      <div
                        class="wheretowatch-logo-fallback"
                        aria-hidden="true"
                      >
                        <span
                          class="material-symbols-outlined"
                          style={{ "font-size": "20px" }}
                          aria-hidden="true"
                        >
                          live_tv
                        </span>
                      </div>
                    }
                  >
                    <img
                      src={tmdbImage(provider.logoPath, "w154")}
                      class="wheretowatch-logo"
                      loading="lazy"
                      decoding="async"
                      width={154}
                      height={103}
                      alt=""
                      aria-hidden="true"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                        const fallback = e.currentTarget
                          .nextElementSibling as HTMLElement | null;
                        if (fallback) fallback.style.display = "flex";
                      }}
                    />
                    <div
                      class="wheretowatch-logo-fallback"
                      style={{ display: "none" }}
                      aria-hidden="true"
                    >
                      <span
                        class="material-symbols-outlined"
                        style={{ "font-size": "20px" }}
                        aria-hidden="true"
                      >
                        live_tv
                      </span>
                    </div>
                  </Show>
                </div>
                <span class="wheretowatch-name">{provider.name}</span>
              </a>
            )}
          </For>
        </div>
      </DetailSection>
    </Show>
  );
};

export default WhereToWatch;
