// src/features/details/components/WhereToWatch.tsx
//
// CineLog V2 — JustWatch OTT Migration — Chunk 5
// ---------------------------------------------------------------------
// "Where to Watch" section for the Details modal.
//
// PREVIOUSLY (Chunk ≤4): fetched TMDB watch providers via
// `fetchTitleWatchProviders(mediaType, id)` and rendered a horizontal
// grid of provider logo chips. All providers shared a single JustWatch
// deep link from TMDB's `countryData.link`.
//
// NOW (Chunk 5): fetches JustWatch offers from the new
// `/api/ott/availability/{tmdbId}?type={movie|tv}` route. The route
// resolves the caller's country from their profile (anonymous → "US")
// and returns `{ tmdbId, mediaType, country, justwatchNodeId?, offers }`.
//
// Offers are normalized into one row per JustWatch Package (grouping
// multiple monetization types — e.g. Netflix may offer both FLATRATE
// and RENT for the same title). Each row shows:
//   - Provider logo (JustWatch CDN)
//   - clearName
//   - Badges: Subscription / Free with ads / Rent / Buy
//   - "Watch Now" button (deeplinkURL) + "More Info" button (standardWebURL)
//   - "Available <date>" label if availableFromTime is in the future
//
// SECTION VISIBILITY:
//   - Hidden when `streaming_button` feature flag is false.
//   - Hidden while loading (skeleton would be too noisy in the modal —
//     we just don't render until we have data).
//   - Hidden when offers array is empty (title not available in region).
//   - Hidden on any fetch error (silent — no error UI).
//
// PLACEMENT:
//   Rendered between DetailsMetadata and DetailsSeasons in the
//   DetailsModal (unchanged from Chunk ≤4 — the parent <Show> gate
//   moved inside this component but the parent import site doesn't
//   need to change).

import {
  Show,
  For,
  createSignal,
  createMemo,
  createEffect,
  onCleanup,
  type Component
} from "solid-js";
import type { Accessor } from "solid-js";
import { useFeatureFlags } from "~/lib/featureFlags";
import { useDiscoverRegion } from "~/core/config/discoverRegion";
import type { WatchlistItem, TMDBDetails } from "~/shared/types";
import type { JustWatchOffer, JustWatchMonetizationType } from "~/shared/types/justwatch";
import DetailSection from "~/features/details/components/DetailSection";

interface WhereToWatchProps {
  baseItem: Accessor<WatchlistItem | null>;
  details: Accessor<TMDBDetails | null>;
}

// ─── Local types ────────────────────────────────────────────────────

/**
 * A normalized provider row — one per unique JustWatch Package.
 * Multiple offers from the same package (e.g. Netflix FLATRATE + RENT)
 * collapse into a single row with all monetization types listed as
 * badges.
 */
type ProviderRow = {
  packageId: string;
  clearName: string;
  technicalName: string;
  icon: string;
  monetizationTypes: Set<JustWatchMonetizationType>;
  watchNowUrl: string | null;
  moreInfoUrl: string | null;
  availableFromTime: string | null;
};

/**
 * API response shape from /api/ott/availability/[tmdbId].
 * Mirrors what the route returns (see src/routes/api/ott/availability/[tmdbId].ts).
 * `justwatchNodeId` is only present when offers is non-empty.
 */
interface AvailabilityApiResponse {
  tmdbId: number;
  mediaType: "movie" | "tv";
  country: string;
  justwatchNodeId?: string;
  offers: JustWatchOffer[];
}

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Build the full JustWatch CDN logo URL from the icon template.
 *
 * The icon template from the API looks like:
 *   "/icon/4982/{profile}/{technicalName}.{format}"
 *
 * We substitute {profile} → s100 and {format} → png, then prefix
 * with "https://images.justwatch.com".
 */
function buildLogoUrl(iconTemplate: string): string {
  if (!iconTemplate) return "";
  const path = iconTemplate
    .replace("{profile}", "s100")
    .replace("{format}", "png");
  return `https://images.justwatch.com${path}`;
}

/**
 * Normalize a flat list of JustWatch offers into one ProviderRow per
 * unique Package, collapsing multiple monetization types into a single
 * row's badge set.
 *
 * Rules (per Chunk 5 spec):
 *   - Group by `offer.package.id`.
 *   - For each group:
 *       packageId         = package.id
 *       clearName         = package.clearName
 *       technicalName     = package.technicalName
 *       icon              = package.icon
 *       monetizationTypes = unique set of offer.monetizationType
 *       watchNowUrl       = first non-null offer.deeplinkURL
 *       moreInfoUrl       = first non-null offer.standardWebURL
 *       availableFromTime = earliest non-null availableFromTime
 *                           (if all null, null)
 *   - Sort:
 *       1. Subscription (FLATRATE) or free ad-supported (FAST) first,
 *          then rent/buy.
 *       2. Within same group, alphabetically by clearName.
 *   - No duplicate package rows.
 *   - No filtering by user-selected providers.
 */
function normalizeOffers(offers: JustWatchOffer[]): ProviderRow[] {
  if (!offers || offers.length === 0) return [];

  const groups = new Map<string, ProviderRow>();

  for (const offer of offers) {
    const pkg = offer.package;
    if (!pkg || !pkg.id) continue;

    let row = groups.get(pkg.id);
    if (!row) {
      row = {
        packageId: pkg.id,
        clearName: pkg.clearName ?? "",
        technicalName: pkg.technicalName ?? "",
        icon: pkg.icon ?? "",
        monetizationTypes: new Set<JustWatchMonetizationType>(),
        watchNowUrl: null,
        moreInfoUrl: null,
        availableFromTime: null
      };
      groups.set(pkg.id, row);
    }

    // Track monetization type (defensive — the type is already a union,
    // but JustWatch schema drift could send unknown values).
    if (
      offer.monetizationType === "FLATRATE" ||
      offer.monetizationType === "RENT" ||
      offer.monetizationType === "BUY" ||
      offer.monetizationType === "FAST"
    ) {
      row.monetizationTypes.add(offer.monetizationType);
    }

    // First non-null deeplinkURL wins
    if (row.watchNowUrl === null && offer.deeplinkURL) {
      row.watchNowUrl = offer.deeplinkURL;
    }
    // First non-null standardWebURL wins
    if (row.moreInfoUrl === null && offer.standardWebURL) {
      row.moreInfoUrl = offer.standardWebURL;
    }

    // Earliest non-null availableFromTime wins
    if (offer.availableFromTime) {
      if (
        row.availableFromTime === null ||
        offer.availableFromTime < row.availableFromTime
      ) {
        row.availableFromTime = offer.availableFromTime;
      }
    }
  }

  const rows = Array.from(groups.values());

  // Sort: subscription/free-first, then rent/buy. Within the same
  // group, alphabetical by clearName.
  const rankFor = (r: ProviderRow): number => {
    if (r.monetizationTypes.has("FLATRATE") || r.monetizationTypes.has("FAST")) {
      return 0;
    }
    return 1; // RENT / BUY / unknown
  };

  rows.sort((a, b) => {
    const ra = rankFor(a);
    const rb = rankFor(b);
    if (ra !== rb) return ra - rb;
    return a.clearName.localeCompare(b.clearName);
  });

  return rows;
}

/**
 * Format an ISO date string as "Sep 1, 2026" — no external library.
 * Returns an empty string if the input is null or unparseable.
 */
function formatAvailabilityDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  // toLocaleDateString with en-US gives "Sep 1, 2026"
  try {
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  } catch {
    // Fall back to a manual format if the locale is unavailable
    return d.toISOString().slice(0, 10);
  }
}

/**
 * Returns true if the ISO date is in the future (used to decide
 * whether to show the "Available <date>" label).
 */
function isFutureDate(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return false;
  return d.getTime() > Date.now();
}

/**
 * Map a JustWatch monetization type to the badge label per the
 * finalized wireframe:
 *   FLATRATE → "Subscription"
 *   FAST     → "Free with ads"
 *   RENT     → "Rent"
 *   BUY      → "Buy"
 */
function monetizationLabel(type: JustWatchMonetizationType): string {
  switch (type) {
    case "FLATRATE":
      return "Subscription";
    case "FAST":
      return "Free with ads";
    case "RENT":
      return "Rent";
    case "BUY":
      return "Buy";
    default:
      return type;
  }
}

/**
 * Ordered list of monetization types for badge rendering, so badges
 * always appear in a consistent order regardless of the Set iteration
 * order. Subscription first, then free-with-ads, then rent, then buy.
 */
const MONETIZATION_ORDER: JustWatchMonetizationType[] = [
  "FLATRATE",
  "FAST",
  "RENT",
  "BUY"
];

// ─── Component ──────────────────────────────────────────────────────

const WhereToWatch: Component<WhereToWatchProps> = (props) => {
  const featureFlags = useFeatureFlags();
  // Chunk 6D: read the global Discover region (kept in sync with
  // `profiles.country` via `setDiscoverRegion()`) so we can pass it to
  // the OTT API route as a `region` query param. This is the same
  // source of truth the Settings page uses — see `useSettingsState`.
  // Falls back to the default region ("IN") when no user override is
  // set, which is the correct behavior for the JustWatch API.
  const region = useDiscoverRegion();
  const [rows, setRows] = createSignal<ProviderRow[] | null>(null);
  const [loaded, setLoaded] = createSignal(false);
  // Chunk 6E: retry counter for transient JustWatch failures.
  // Bounded to MAX_RETRIES=2 — avoids infinite loops. Reset whenever
  // the props/country key changes (so a new title always starts fresh).
  const MAX_RETRIES = 2;
  const RETRY_DELAY_MS = 2000;
  const [retryCount, setRetryCount] = createSignal(0);
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  onCleanup(() => {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  });

  const mediaType = createMemo<"movie" | "tv" | null>(() => {
    const b = props.baseItem();
    const d = props.details();
    const mt = b?.media_type ?? d?.media_type ?? null;
    if (mt === "movie" || mt === "tv") return mt;
    return null;
  });

  const tmdbId = createMemo<number | null>(() => {
    const b = props.baseItem();
    const d = props.details();
    if (d?.id != null) return d.id;
    if (b?.id != null) {
      const n = Number(b.id);
      return Number.isFinite(n) && n > 0 ? n : null;
    }
    return null;
  });

  /**
   * Extract a display title from the TMDB details / base item, for
   * passing to the API route as the `title` query param. This helps
   * the JustWatch resolver find the right node on a cache miss.
   */
  const titleForLookup = createMemo<string | null>(() => {
    const d = props.details();
    const b = props.baseItem();
    return (
      d?.title ??
      d?.name ??
      d?.original_title ??
      d?.original_name ??
      b?.title ??
      null
    );
  });

  /**
   * Extract a release year (number) from TMDB details, for the
   * `year` query param. Helps disambiguate title collisions.
   */
  const yearForLookup = createMemo<number | null>(() => {
    const d = props.details();
    const dateStr = d?.release_date ?? d?.first_air_date;
    if (!dateStr || typeof dateStr !== "string") return null;
    const year = parseInt(dateStr.slice(0, 4), 10);
    return Number.isFinite(year) && year > 1800 ? year : null;
  });

  const loadProviders = async () => {
    const id = tmdbId();
    const mt = mediaType();
    if (id === null || mt === null) {
      setRows(null);
      setLoaded(true);
      return;
    }

    setLoaded(false);
    try {
      const params = new URLSearchParams({ type: mt });
      const title = titleForLookup();
      if (title) params.set("title", title);
      const year = yearForLookup();
      if (year !== null) params.set("year", String(year));
      // Chunk 6D: pass the user's Discover region so the route uses
      // the user's profile country (e.g. "IN") instead of falling back
      // to "US" on the serverless function. The route validates this
      // as a 2-letter code; an invalid value is dropped server-side.
      const reg = region();
      if (reg && /^[A-Za-z]{2}$/.test(reg)) {
        params.set("region", reg.toUpperCase());
      }

      const url = `/api/ott/availability/${id}?${params.toString()}`;
      const res = await fetch(url, { method: "GET" });
      if (!res.ok) {
        setRows(null);
        setLoaded(true);
        // Chunk 6E: schedule a single retry on HTTP error. Bounded by
        // MAX_RETRIES so we don't loop forever.
        scheduleRetry();
        return;
      }
      const body = (await res.json()) as AvailabilityApiResponse;
      if (!body || !Array.isArray(body.offers)) {
        setRows(null);
        setLoaded(true);
        scheduleRetry();
        return;
      }
      // Chunk 6E: if offers came back empty, schedule a retry — the
      // JustWatch resolution may have failed transiently (rate limit,
      // search index lag, etc.) and a retry after 2s often succeeds.
      // The server no longer caches empty results (Chunk 6E Task 1),
      // so the retry will hit JustWatch again rather than returning
      // the same empty cache row.
      if (body.offers.length === 0) {
        setRows(null);
        setLoaded(true);
        scheduleRetry();
        return;
      }
      setRows(normalizeOffers(body.offers));
      setLoaded(true);
    } catch (err) {
      // Silent — hide the section on any error.
      console.warn(
        "[WhereToWatch] failed to load JustWatch offers:",
        err instanceof Error ? err.message : String(err)
      );
      setRows(null);
      setLoaded(true);
      scheduleRetry();
    }
  };

  /**
   * Schedule a single retry after RETRY_DELAY_MS, up to MAX_RETRIES
   * total. The retry only fires if the component is still mounted
   * (cleanup clears the timer) and the props/country key hasn't
   * changed (the effect resets retryCount when the key changes).
   */
  const scheduleRetry = () => {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    if (retryCount() >= MAX_RETRIES) return;
    const next = retryCount() + 1;
    retryTimer = setTimeout(() => {
      setRetryCount(next);
      void loadProviders();
    }, RETRY_DELAY_MS);
  };

  // CHUNK 6B FIX: Changed from `onMount` to `createEffect` watching
  // `tmdbId()` + `mediaType()`. The original `onMount` fired ONCE on
  // component mount — if `baseItem()` or `details()` were still null
  // (async loading), the fetch never fired when they became available.
  // `createEffect` re-runs whenever its dependencies change, so the
  // fetch fires as soon as both values are non-null, AND re-fires if
  // the user navigates to a different title within the same modal
  // (which reuses the component with new props).
  //
  // CHUNK 6D: also depend on `region()` so the section re-fetches if
  // the user changes their country in Settings while the modal is
  // open. The `lastFetchedKey` now includes the region so a country
  // change is treated as a new fetch (not deduped).
  //
  // We guard against duplicate fetches by checking `lastFetchedKey` —
  // if a fetch is already in progress for the current
  // `tmdbId`/`mediaType`/`region`, the effect's first run sets
  // `loaded(false)` then the async callback sets `loaded(true)`. The
  // effect re-runs only when the key actually changes value (SolidJS
  // dedupes signal reads).
  let lastFetchedKey = "";
  createEffect(() => {
    const id = tmdbId();
    const mt = mediaType();
    const reg = region();
    if (id === null || mt === null) {
      setRows(null);
      setLoaded(false);
      lastFetchedKey = "";
      // Chunk 6E: reset retry counter when props change.
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      setRetryCount(0);
      return;
    }
    const key = `${mt}:${id}:${reg}`;
    if (key === lastFetchedKey) return; // already fetched for this title+region
    lastFetchedKey = key;
    // Chunk 6E: reset retry counter when the key changes (new title or
    // new region → fresh retry budget).
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    setRetryCount(0);
    void loadProviders();
  });

  const visibleRows = createMemo(() => rows() ?? []);

  return (
    <Show
      when={
        featureFlags.isEnabled("streaming_button") &&
        loaded() &&
        visibleRows().length > 0
      }
    >
      <DetailSection label="Where to Watch" icon="play_circle">
        <div
          class="wheretowatch-list"
          role="list"
          aria-label={`Available on ${visibleRows().length} platforms`}
        >
          <For each={visibleRows()}>
            {(row) => {
              const logoUrl = buildLogoUrl(row.icon);
              // CHUNK 6B FIX: Track image load errors so the fallback
              // icon appears when the logo URL is broken (previously
              // onError just hid the <img>, leaving an empty box).
              const [imgError, setImgError] = createSignal(false);
              const showLogo = createMemo(
                () => logoUrl !== "" && !imgError()
              );
              const availabilityDate = createMemo(() =>
                isFutureDate(row.availableFromTime)
                  ? formatAvailabilityDate(row.availableFromTime)
                  : ""
              );
              return (
                <div class="wheretowatch-row" role="listitem">
                  {/* Provider logo — Chunk 6F Task 3: the provider name
                      is no longer rendered as visible text (it took
                      too much vertical space). Instead, the logo carries
                      `title`, `aria-label`, and `alt` attributes so
                      hover-tooltip + screen readers still announce the
                      provider name. Accessibility is preserved without
                      the visual bloat. */}
                  <div
                    class="wheretowatch-row-logo"
                    title={row.clearName}
                    aria-label={row.clearName}
                    role="img"
                  >
                    <Show
                      when={showLogo()}
                      fallback={
                        <div class="wheretowatch-row-logo-fallback">
                          <span
                            class="material-symbols-outlined"
                            style={{ "font-size": "16px" }}
                            aria-hidden="true"
                          >
                            live_tv
                          </span>
                        </div>
                      }
                    >
                      <img
                        src={logoUrl}
                        class="wheretowatch-row-logo-img"
                        loading="lazy"
                        decoding="async"
                        alt={row.clearName}
                        onError={() => setImgError(true)}
                      />
                    </Show>
                  </div>

                  {/* Meta — badges + future availability date.
                      Chunk 6F Task 2: collapsed into a single compact
                      horizontal row alongside the logo and buttons.
                      The provider name is intentionally NOT rendered
                      here (it's available via the logo's title/aria). */}
                  <div class="wheretowatch-row-meta">
                    <div class="wheretowatch-badges">
                      <For each={MONETIZATION_ORDER}>
                        {(mt) => (
                          <Show when={row.monetizationTypes.has(mt)}>
                            <span
                              class="wheretowatch-badge"
                              data-monetization={mt}
                            >
                              {monetizationLabel(mt)}
                            </span>
                          </Show>
                        )}
                      </For>
                    </div>
                    <Show when={availabilityDate()}>
                      <span class="wheretowatch-row-date">
                        Available {availabilityDate()}
                      </span>
                    </Show>
                  </div>

                  {/* Actions — Chunk 6F Task 2: compact inline buttons
                      on the same row as the logo + badges. Buttons
                      are no longer full-width; they wrap cleanly on
                      narrow viewports via the row's flex-wrap. */}
                  <div class="wheretowatch-row-actions">
                    <Show when={row.watchNowUrl}>
                      <a
                        class="wheretowatch-btn wheretowatch-btn-primary focus-ring"
                        href={row.watchNowUrl ?? "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Watch now on ${row.clearName}`}
                      >
                        Watch Now
                      </a>
                    </Show>
                    <Show when={row.moreInfoUrl}>
                      <a
                        class="wheretowatch-btn wheretowatch-btn-secondary focus-ring"
                        href={row.moreInfoUrl ?? "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`More info about ${row.clearName}`}
                      >
                        More Info
                      </a>
                    </Show>
                  </div>
                </div>
              );
            }}
          </For>
        </div>
      </DetailSection>
    </Show>
  );
};

export default WhereToWatch;
