// src/features/discover/components/OttSection.tsx
import { For, Show, createSignal, createMemo, type Component } from "solid-js";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { discoverMoviesWithProvider, getWatchProviderList } from "~/core/tmdb/discover";
import type { TMDBTitle } from "~/shared/types";

interface OttSectionProps {
  onSelect: (title: TMDBTitle) => void;
  region?: string;
}

interface Provider {
  providerId: number;
  providerName: string;
  logoPath: string | null;
}

// Known provider IDs for India (TMDB watch provider IDs)
// These are the most popular streaming providers in the IN region.
const KNOWN_PROVIDERS: Record<string, number> = {
  "Netflix": 8,
  "Amazon Prime Video": 9,
  "Disney Plus": 337,
  "Apple TV Plus": 350,
  "JioHotstar": 554,
  "Crunchyroll": 283,
  "MUBI": 11,
  "SonyLIV": 543,
  "ZEE5": 567,
  "Lionsgate Play": 698,
};

/**
 * OttSection — "New on OTT" with provider chips and lazy-loaded carousels.
 *
 * Shows provider logos as circular chips. Selecting a provider instantly
 * loads its carousel (lazy — only fetches on first selection). Results
 * are cached via the existing apiCache layer.
 *
 * Default: Netflix selected.
 */
const OttSection: Component<OttSectionProps> = (props) => {
  const [providers, setProviders] = createSignal<Provider[]>([]);
  const [selectedProvider, setSelectedProvider] = createSignal<number | null>(null);
  const [titles, setTitles] = createSignal<TMDBTitle[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [loadedProviders, setLoadedProviders] = createSignal<Set<number>>(new Set());

  // Fetch provider list on mount
  createMemo(() => {
    if (providers().length > 0) return;
    getWatchProviderList(props.region ?? "IN")
      .then((list) => {
        // Filter to only known providers that exist in this region
        const filtered = list.filter((p) =>
          Object.values(KNOWN_PROVIDERS).includes(p.providerId)
        );
        // Sort by our preferred order
        const ordered = Object.entries(KNOWN_PROVIDERS)
          .map(([name, id]) => filtered.find((p) => p.providerId === id))
          .filter((p): p is Provider => p !== undefined)
          .map((p) => ({ ...p, providerName: Object.entries(KNOWN_PROVIDERS).find(([, id]) => id === p.providerId)?.[0] ?? p.providerName }));
        setProviders(ordered);
        // Default to Netflix
        if (ordered.length > 0) {
          setSelectedProvider(ordered[0].providerId);
        }
      })
      .catch((e) => console.error("[OttSection] Provider list fetch:", e));
  });

  // Load titles when provider changes
  createMemo(() => {
    const providerId = selectedProvider();
    if (providerId === null) return;
    if (loadedProviders().has(providerId)) return; // already loaded

    setLoading(true);
    discoverMoviesWithProvider(providerId, props.region ?? "IN", { sortBy: "popularity.desc" })
      .then((result) => {
        setTitles(result.slice(0, 20));
        setLoadedProviders((prev) => new Set(prev).add(providerId));
      })
      .catch((e) => {
        console.error("[OttSection] Provider titles fetch:", e);
        setTitles([]);
      })
      .finally(() => setLoading(false));
  });

  const handleSelectProvider = (providerId: number) => {
    if (providerId === selectedProvider()) return;
    setSelectedProvider(providerId);
    // If already loaded, show cached titles
    if (loadedProviders().has(providerId)) {
      setLoading(true);
      discoverMoviesWithProvider(providerId, props.region ?? "IN", { sortBy: "popularity.desc" })
        .then((result) => setTitles(result.slice(0, 20)))
        .catch(() => setTitles([]))
        .finally(() => setLoading(false));
    }
  };

  return (
    <div class="ott-section">
      {/* Provider chips */}
      <div class="ott-provider-bar">
        <For each={providers()}>
          {(provider) => (
            <button
              type="button"
              class="ott-provider-chip focus-ring"
              data-active={selectedProvider() === provider.providerId}
              onClick={() => handleSelectProvider(provider.providerId)}
              aria-label={provider.providerName}
              aria-pressed={selectedProvider() === provider.providerId}
            >
              <Show
                when={provider.logoPath}
                fallback={
                  <span class="ott-provider-initial">
                    {provider.providerName.charAt(0)}
                  </span>
                }
              >
                <img
                  src={tmdbImage(provider.logoPath, "w92")}
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
                  {provider.providerName.charAt(0)}
                </span>
              </Show>
            </button>
          )}
        </For>
      </div>

      {/* Provider name label */}
      <Show when={selectedProvider() !== null}>
        <p class="ott-provider-label">
          {Object.entries(KNOWN_PROVIDERS).find(([, id]) => id === selectedProvider())?.[0] ?? "Streaming"}
        </p>
      </Show>

      {/* Titles carousel */}
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
            <p class="type-body-soft" style={{ "text-align": "center", padding: "var(--sp-4)" }}>
              No titles available on this provider.
            </p>
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

export default OttSection;
