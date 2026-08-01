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

import { Title } from "@solidjs/meta";
import {
  For,
  Show,
  createMemo,
  createSignal,
  onMount,
  createEffect,
  type Component
} from "solid-js";
import PageContainer from "~/shared/ui/PageContainer";
import ScrollToTop from "~/shared/ui/ScrollToTop";
import {
  ControlRow,
  Segmented,
  ToggleRow,
  SelectRow
} from "~/features/settings/sharedControls";
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
  type TmdbProvider
} from "~/core/preferences";
import {
  DISCOVER_TAB_OPTIONS,
  RATING_SCALE_OPTIONS,
  RATING_CAP_OPTIONS
} from "~/shared/constants/settings";
import { useDiscoverRegion } from "~/core/config/discoverRegion";
import {
  getWatchProviderList,
  getWatchProviderListTv
} from "~/core/tmdb/discover";
import { tmdbImage } from "~/core/tmdb/tmdb";

const ContentDiscoverRoute: Component = () => {
  const { showToast } = useToast();
  const region = useDiscoverRegion();

  // Dynamic provider list — fetched on mount + when the region changes.
  const [providers, setProviders] = createSignal<TmdbProvider[]>([]);
  const [providersLoading, setProvidersLoading] = createSignal(true);

  /**
   * Fetch all streaming providers for the given region.
   * Merges the movie + TV lists, deduplicates by provider_id, and
   * sorts by display priority.
   */
  const loadProviders = async (reg: string) => {
    setProvidersLoading(true);
    try {
      const [movieRes, tvRes] = await Promise.allSettled([
        getWatchProviderList(reg),
        getWatchProviderListTv(reg)
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

  onMount(() => {
    void loadProviders(region());
  });
  // Refetch when the region changes (user switched country in settings).
  createEffect(() => {
    const r = region();
    void loadProviders(r);
  });

  const handleToggleProvider = (provider: TmdbProvider) => {
    toggleStreamingProvider(provider.id);
    const isActive = streamingProviders().includes(provider.id);
    showToast(
      isActive ? "Provider added to your subscriptions" : "Provider removed",
      "info",
      1200
    );
  };

  const activeProviderCount = createMemo(() => streamingProviders().length);

  return (
    <>
      <Title>CineLog — Content & Discover</Title>
      <PageContainer width="narrow" paddingTop="0" paddingBottom="var(--sp-12)">
        <ScrollToTop />
        <div class="sec-page sec-fade-in">
          <div class="sec-header">
            <a
              href="/settings"
              class="sec-back focus-ring"
              aria-label="Back to settings"
            >
              <span
                class="material-symbols-outlined"
                style={{ "font-size": "14px" }}
                aria-hidden="true"
              >
                arrow_back
              </span>
              Settings
            </a>
            <p class="sec-eyebrow">Settings</p>
            <h1 class="sec-title">Content & Discover</h1>
            <p class="sec-subtitle">
              Control what shows in Discover, which streaming providers you use,
              and how ratings are displayed.
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
                  desc="Hide adult titles from Discover and search."
                  current={adultContentFilter}
                  onChange={(v) => {
                    setAdultContentFilter(v);
                    showToast(
                      v ? "Adult content hidden" : "Adult content visible",
                      "info",
                      1200
                    );
                  }}
                />
                <SelectRow
                  icon="family_restroom"
                  label="Rating cap"
                  desc="Hide titles rated above this."
                  value={contentRatingCap}
                  onChange={(v) => {
                    setContentRatingCap(v);
                    showToast(
                      v ? `Rating cap set to ${v}` : "Rating cap removed",
                      "info",
                      1200
                    );
                  }}
                  options={RATING_CAP_OPTIONS}
                />
              </div>
            </section>

            {/* Hide spoilers */}
            <section class="sec-section">
              <p class="sec-section-label">Spoilers</p>
              <div class="setting-group">
                <ToggleRow
                  icon="visibility_off"
                  label="Hide spoilers"
                  desc="Blur plot details until you tap to reveal."
                  current={hideSpoilers}
                  onChange={setHideSpoilers}
                />
              </div>
            </section>

            {/* Streaming providers */}
            <section class="sec-section">
              <p class="sec-section-label">
                Streaming Providers
                <Show when={activeProviderCount() > 0}>
                  <span
                    style={{
                      "margin-left": "var(--sp-2)",
                      "font-size": "0.6875rem",
                      color: "var(--p)",
                      "font-weight": 700
                    }}
                  >
                    {activeProviderCount()} active
                  </span>
                </Show>
              </p>
              <div
                class="setting-group"
                style={{ padding: "var(--sp-4) var(--sp-5)" }}
              >
                <p
                  style={{
                    "font-size": "0.8125rem",
                    color: "var(--text-muted)",
                    margin: 0,
                    "margin-bottom": "var(--sp-2)"
                  }}
                >
                  Tap the providers you subscribe to.
                </p>
                <div class="provider-chip-grid">
                  <For each={providers()}>
                    {(provider) => {
                      const active = createMemo(() =>
                        streamingProviders().includes(provider.id)
                      );
                      const logoUrl = createMemo(() =>
                        provider.logoPath
                          ? tmdbImage(provider.logoPath, "w92")
                          : ""
                      );
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
                            <Show
                              when={logoUrl()}
                              fallback={
                                <span class="provider-chip-icon-letter">
                                  {provider.name.charAt(0)}
                                </span>
                              }
                            >
                              <img
                                src={logoUrl()}
                                class="provider-chip-logo"
                                alt=""
                                loading="lazy"
                                decoding="async"
                                onError={(e) => {
                                  e.currentTarget.style.display = "none";
                                }}
                              />
                            </Show>
                          </div>
                          <span class="provider-chip-name">
                            {provider.name}
                          </span>
                          <span
                            class="material-symbols-outlined provider-chip-check"
                            aria-hidden="true"
                          >
                            check_circle
                          </span>
                        </button>
                      );
                    }}
                  </For>
                  <Show when={providersLoading() && providers().length === 0}>
                    <div class="provider-chip-loading">Loading providers…</div>
                  </Show>
                </div>
              </div>
            </section>

            {/* Default Discover tab */}
            <section class="sec-section">
              <p class="sec-section-label">Default Discover Tab</p>
              <div class="setting-group">
                <ControlRow
                  icon="tab"
                  label="Which tab Discover opens to"
                  desc="Choose whether Discover starts on All, Movies, or Series."
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
                  desc="Choose how ratings appear across the app."
                >
                  <Segmented
                    options={RATING_SCALE_OPTIONS}
                    current={ratingScale}
                    onChange={(id) => setRatingScale(id)}
                    name="Rating scale"
                  />
                </ControlRow>
              </div>
            </section>
          </div>
        </div>
      </PageContainer>
    </>
  );
};

export default ContentDiscoverRoute;
