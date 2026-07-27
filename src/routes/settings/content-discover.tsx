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
// OTT PROVIDER SELECTOR (v2 redesign):
//   • For India (IN), shows ONLY the accurate curated list: Netflix,
//     Prime Video (119, not rent/buy 10), JioStar (122+220 combined),
//     Sony LIV (237), ZEE5 (232), Apple TV+ (350). Unavailable services
//     like Hulu/Max are hidden.
//   • For other regions, shows a global fallback list.
//   • Each toggle shows the provider's official TMDB logo (fetched from
//     /watch/providers/movie?watch_region={region}) alongside the name.

import { Title } from "@solidjs/meta";
import { For, Show, createMemo, createSignal, onMount, type Component } from "solid-js";
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
  getCuratedProvidersForRegion,
  isProviderActive,
  type CuratedProvider,
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

  // Curated provider list for the user's region (India → accurate list,
  // other regions → global fallback). Logos are fetched at runtime.
  const [providers, setProviders] = createSignal<CuratedProvider[]>([]);
  const [logosLoading, setLogosLoading] = createSignal(true);

  /** Fetch TMDB provider logos for the current region and merge them
   *  into the curated provider list. Falls back to a letter avatar
   *  (handled in the UI) when a logo can't be resolved. */
  const loadProviderLogos = async (reg: string) => {
    setLogosLoading(true);
    try {
      const [movieRes, tvRes] = await Promise.allSettled([
        getWatchProviderList(reg),
        getWatchProviderListTv(reg),
      ]);
      // Build an id → logoPath map from both lists (movie + TV).
      const logoMap = new Map<string, string>();
      for (const res of [movieRes, tvRes]) {
        if (res.status !== "fulfilled") continue;
        for (const row of res.value) {
          if (row.logoPath && !logoMap.has(String(row.providerId))) {
            logoMap.set(String(row.providerId), row.logoPath);
          }
        }
      }
      // Merge logos into the curated list. For alias-merged providers
      // (e.g. JioStar), prefer the canonical id's logo, then fall back
      // to the first alias logo that exists.
      const curated = getCuratedProvidersForRegion(reg);
      const merged = curated.map((p) => {
        let logo = logoMap.get(p.id) ?? null;
        if (!logo && p.aliasIds) {
          for (const alias of p.aliasIds) {
            const aliasLogo = logoMap.get(alias);
            if (aliasLogo) { logo = aliasLogo; break; }
          }
        }
        return { ...p, logoPath: logo };
      });
      setProviders(merged);
    } catch (err) {
      console.warn("[content-discover] Failed to load provider logos:", err);
      // Fall back to the curated list without logos (UI shows letter avatar).
      setProviders(getCuratedProvidersForRegion(reg));
    } finally {
      setLogosLoading(false);
    }
  };

  onMount(() => { void loadProviderLogos(region()); });

  const handleToggleProvider = (provider: CuratedProvider) => {
    toggleStreamingProvider(provider.id);
    const isActive = isProviderActive(provider, streamingProviders());
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

            {/* Streaming providers — curated per-region with official TMDB logos */}
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
                      const active = createMemo(() => isProviderActive(provider, streamingProviders()));
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
                  <Show when={logosLoading() && providers().length === 0}>
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
