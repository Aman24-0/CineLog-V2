// src/routes/settings/content-discover.tsx
//
// Content & Discover — controls what shows up in Discover and how it's filtered.
//
// Controls:
//   • Adult content filter (toggle) + content rating cap (dropdown)
//   • Hide spoilers (moved here from Appearance)
//   • Streaming provider subscriptions (multi-select with LOGOS)
//   • Default Discover tab (Movies / Series / All)
//   • Rating scale (5-star / 10-star / thumbs)
//
// All preferences are persisted via src/core/preferences.
//
// OTT PROVIDER SELECTOR (v3 — fully dynamic):
//   NO hardcoded provider lists. The page fetches ALL official streaming
//   providers for the user's country directly from TMDB's
//   /watch/providers/{movie,tv}?watch_region={country} endpoints,
//   merges them, deduplicates by provider_id, and sorts by TMDB's
//   display_priority ascending (so Netflix/Prime appear at the top).
//   Every provider TMDB returns is shown — no curation, no alias
//   merging, no hidden services.

import { Title } from "@solidjs/meta";
import { For, Show, createMemo, createSignal, onMount, createEffect, type Component } from "solid-js";
import PageContainer from "~/shared/ui/PageContainer";
import ScrollToTop from "~/shared/ui/ScrollToTop";
import { ControlRow, Segmented, ToggleRow, SelectRow } from "~/features/settings/sharedControls";
import { useToast } from "~/shared/hooks/useToast";
import {
  adultContentFilter,
  setAdultContentFilter,
  contentRatingCap,
  setContentRatingCap,
  hideSpoilers,
  setHideSpoilers,
  streamingProviders,
  toggleStreamingProvider,
  defaultDiscoverTab,
  setDefaultDiscoverTab,
  ratingScale,
  setRatingScale,
  mergeAndSortProviders,
  type TmdbProvider,
  type DiscoverTab,
  type RatingScale,
} from "~/core/preferences";
import { useDiscoverRegion } from "~/core/config/discoverRegion";
import { getWatchProviderList, getWatchProviderListTv } from "~/core/tmdb/discover";
import { tmdbImage } from "~/core/tmdb/tmdb";

const DISCOVER_TAB_OPTIONS: { id: DiscoverTab; label: string }[] = [
  { id: "all",   label: "All" },
  { id: "movie", label: "Movies" },
  { id: "tv",    label: "Series" },
];

const RATING_SCALE_OPTIONS: { id: RatingScale; label: string }[] = [
  { id: "10star", label: "10-star" },
  { id: "5star",  label: "5-star" },
  { id: "thumbs", label: "Thumbs" },
];

/**
 * Content rating options — depends on country. We show a union of US + India
 * ratings since those are the two most-used regions for CineLog. The cap is
 * applied client-side: titles with a higher rating are filtered out.
 */
const RATING_CAP_OPTIONS = [
  { value: "",        label: "No cap — show everything" },
  { value: "G",       label: "G (US) / U (IN) — General" },
  { value: "PG",      label: "PG (US) / U/A — Parental Guidance" },
  { value: "PG-13",   label: "PG-13 (US) / U/A 13+ — Teens" },
  { value: "UA-16",   label: "U/A 16+ (IN) — Older Teens" },
  { value: "R",       label: "R (US) / A (IN) — Adult" },
];

const ContentDiscoverRoute: Component = () => {
  const { showToast } = useToast();
  const region = useDiscoverRegion();

  // Dynamic provider list — fetched from TMDB on mount + when the
  // region changes. Contains EVERY official provider for the user's
  // country, sorted by display_priority.
  const [providers, setProviders] = createSignal<TmdbProvider[]>([]);
  const [providersLoading, setProvidersLoading] = createSignal(true);

  /**
   * Fetch ALL streaming providers for the given region from TMDB.
   * Merges the movie + TV lists, deduplicates by provider_id, and
   * sorts by display_priority ascending. The result is the complete
   * set of official providers for the user's country — no hardcoded
   * filtering, no alias merging.
   */
  const loadProviders = async (reg: string) => {
    setProvidersLoading(true);
    try {
      const [movieRes, tvRes] = await Promise.allSettled([
        getWatchProviderList(reg),
        getWatchProviderListTv(reg),
      ]);
      const movieRows = movieRes.status === "fulfilled" ? movieRes.value : [];
      const tvRows = tvRes.status === "fulfilled" ? tvRes.value : [];
      // mergeAndSortProviders handles dedup + sort by display_priority.
      setProviders(mergeAndSortProviders(movieRows, tvRows));
    } catch (err) {
      console.warn("[content-discover] Failed to load providers:", err);
      setProviders([]);
    } finally {
      setProvidersLoading(false);
    }
  };

  onMount(() => { void loadProviders(region()); });
  // Refetch when the region changes (user switched country in settings).
  createEffect(() => {
    const r = region();
    void loadProviders(r);
  });

  const handleToggleProvider = (provider: TmdbProvider) => {
    toggleStreamingProvider(provider.id);
    const isActive = streamingProviders().includes(provider.id);
    showToast(isActive ? "Provider added to your subscriptions" : "Provider removed", "info", 1200);
  };

  const activeProviderCount = createMemo(() => streamingProviders().length);

  return (
    <>
      <Title>CineLog — Content & Discover</Title>
      <PageContainer width="narrow" paddingTop="0" paddingBottom="var(--sp-12)">
        <ScrollToTop />
        <div class="sec-page sec-fade-in">
          <div class="sec-header">
            <a href="/settings" class="sec-back focus-ring" aria-label="Back to settings">
              <span class="material-symbols-outlined" style={{ "font-size": "14px" }} aria-hidden="true">arrow_back</span>
              Settings
            </a>
            <p class="sec-eyebrow">Settings</p>
            <h1 class="sec-title">Content & Discover</h1>
            <p class="sec-subtitle">
              Control what shows in Discover, which streaming providers you use, and how ratings are displayed.
            </p>
          </div>

          <div class="sec-body">
            {/* Adult content filter */}
            <section class="sec-section" style={{ "margin-top": "0" }}>
              <p class="sec-section-label">Content Filter</p>
              <div class="setting-group">
                <ToggleRow
                  icon="no_adult_content"
                  label="Adult content filter"
                  desc="Hide titles marked as adult by TMDB. Recommended for family-friendly browsing."
                  current={adultContentFilter}
                  onChange={(v) => {
                    setAdultContentFilter(v);
                    showToast(v ? "Adult content hidden" : "Adult content visible", "info", 1200);
                  }}
                />
                <SelectRow
                  icon="family_restroom"
                  label="Rating cap"
                  desc="Hide titles rated above this. Applied on top of the adult filter for fine-grained control."
                  value={contentRatingCap}
                  onChange={(v) => {
                    setContentRatingCap(v);
                    showToast(v ? `Rating cap set to ${v}` : "Rating cap removed", "info", 1200);
                  }}
                  options={RATING_CAP_OPTIONS}
                />
              </div>
              <div class="info-callout" style={{ "margin-top": "var(--sp-3)" }}>
                <span class="material-symbols-outlined info-callout-icon" style={{ "font-size": "16px" }} aria-hidden="true">info</span>
                <p class="info-callout-body">
                  <strong>Real effect:</strong> When the adult filter is on, CineLog passes <code>include_adult=false</code> to TMDB API calls AND filters out any titles with <code>adult: true</code> client-side as a safety net. The rating cap filters by certification on the title's release_dates.
                </p>
              </div>
            </section>

            {/* Hide spoilers */}
            <section class="sec-section">
              <p class="sec-section-label">Spoilers</p>
              <div class="setting-group">
                <ToggleRow
                  icon="visibility_off"
                  label="Hide spoilers"
                  desc="Blur synopses, season descriptions, and plot details until you tap to reveal."
                  current={hideSpoilers}
                  onChange={setHideSpoilers}
                />
              </div>
            </section>

            {/* Streaming providers — fully dynamic from TMDB, with official logos */}
            <section class="sec-section">
              <p class="sec-section-label">
                Streaming Providers
                <Show when={activeProviderCount() > 0}>
                  <span style={{ "margin-left": "var(--sp-2)", "font-size": "0.6875rem", color: "var(--p)", "font-weight": 700 }}>
                    {activeProviderCount()} active
                  </span>
                </Show>
              </p>
              <div class="setting-group" style={{ padding: "var(--sp-4) var(--sp-5)" }}>
                <p style={{ "font-size": "0.8125rem", color: "var(--text-muted)", margin: 0, "margin-bottom": "var(--sp-2)" }}>
                  Tap the providers you subscribe to. Discover will prioritize titles available on your services, and Where-to-watch will only show your providers.
                </p>
                <div class="provider-chip-grid">
                  <For each={providers()}>
                    {(provider) => {
                      const active = createMemo(() => streamingProviders().includes(provider.id));
                      const logoUrl = createMemo(() => provider.logoPath ? tmdbImage(provider.logoPath, "w92") : "");
                      return (
                        <button
                          type="button"
                          class="provider-chip focus-ring"
                          data-active={active()}
                          onClick={() => handleToggleProvider(provider)}
                          aria-label={`${active() ? "Remove" : "Add"} ${provider.name}`}
                          aria-pressed={active()}
                        >
                          <div class="provider-chip-icon" aria-hidden="true">
                            <Show when={logoUrl()} fallback={
                              <span class="provider-chip-icon-letter">{provider.name.charAt(0)}</span>
                            }>
                              <img
                                src={logoUrl()}
                                class="provider-chip-logo"
                                alt=""
                                loading="lazy"
                                decoding="async"
                                onError={(e) => {
                                  // Hide the broken image so the letter fallback shows.
                                  e.currentTarget.style.display = "none";
                                }}
                              />
                            </Show>
                          </div>
                          <span class="provider-chip-name">{provider.name}</span>
                          <span class="material-symbols-outlined provider-chip-check" aria-hidden="true">check_circle</span>
                        </button>
                      );
                    }}
                  </For>
                  <Show when={providersLoading() && providers().length === 0}>
                    <div class="provider-chip-loading">Loading providers…</div>
                  </Show>
                </div>
              </div>
              <div class="info-callout" style={{ "margin-top": "var(--sp-3)" }}>
                <span class="material-symbols-outlined info-callout-icon" style={{ "font-size": "16px" }} aria-hidden="true">info</span>
                <p class="info-callout-body">
                  <strong>Real effect:</strong> The Discover "New on OTT" section and any Where-to-watch badges on Detail pages will only show providers you've selected. If no providers are selected, CineLog shows all available providers (default behavior).
                </p>
              </div>
            </section>

            {/* Default Discover tab */}
            <section class="sec-section">
              <p class="sec-section-label">Default Discover Tab</p>
              <div class="setting-group">
                <ControlRow
                  icon="tab"
                  label="Which tab Discover opens to"
                  desc="Choose whether Discover starts on All, Movies, or Series when you open the app."
                >
                  <Segmented
                    options={DISCOVER_TAB_OPTIONS}
                    current={defaultDiscoverTab}
                    onChange={(id) => setDefaultDiscoverTab(id)}
                    name="Default Discover tab"
                  />
                </ControlRow>
              </div>
            </section>

            {/* Rating scale */}
            <section class="sec-section">
              <p class="sec-section-label">Rating Scale</p>
              <div class="setting-group">
                <ControlRow
                  icon="grade"
                  label="How ratings are displayed"
                  desc="TMDB returns ratings on a 0-10 scale. Choose how CineLog shows them to you."
                >
                  <Segmented
                    options={RATING_SCALE_OPTIONS}
                    current={ratingScale}
                    onChange={(id) => setRatingScale(id)}
                    name="Rating scale"
                  />
                </ControlRow>
              </div>
              <div class="info-callout" style={{ "margin-top": "var(--sp-3)" }}>
                <span class="material-symbols-outlined info-callout-icon" style={{ "font-size": "16px" }} aria-hidden="true">info</span>
                <p class="info-callout-body">
                  <strong>Example:</strong> A 7.5/10 TMDB rating displays as:
                  <br />
                  • 10-star → "7.5/10"
                  <br />
                  • 5-star → "3.8★"
                  <br />
                  • Thumbs → "👍" (7.0+ thumbs up, 5.0+ okay, below 👎)
                </p>
              </div>
            </section>
          </div>
        </div>
      </PageContainer>
    </>
  );
};

export default ContentDiscoverRoute;
