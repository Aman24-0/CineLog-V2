// src/features/details/components/WhereToWatch.tsx
//
// CineLog V2 — JustWatch availability for the Details modal
// --------------------------------------------------------------
// Offers are normalized into one row per provider package. Each provider
// remains visible in a compact four-column logo grid; a logo is clickable
// when JustWatch supplies a deeplink or standard web URL, with the deeplink
// preferred and the standard URL used as a fallback. Providers without a
// URL remain visible as non-clickable tiles.
//
// SECTION VISIBILITY:
//   - Hidden when `streaming_button` feature flag is false.
//   - Hidden while loading (skeleton would be too noisy in the modal —
//     we just don't render until we have data).
//   - Hidden when offers array is empty (title not available in region).
//   - Hidden on any fetch error (silent — no error UI).

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
import type { JustWatchOffer } from "~/shared/types/justwatch";
import DetailSection from "~/features/details/components/DetailSection";

interface WhereToWatchProps {
  baseItem: Accessor<WatchlistItem | null>;
  details: Accessor<TMDBDetails | null>;
}

// ─── Local types ────────────────────────────────────────────────────

/**
 * A normalized provider row — one per unique JustWatch Package.
 * Multiple offers from the same package (e.g. Netflix FLATRATE + RENT)
 * collapse into a single row.
 *
 * The row stores only provider identity and the two redirect candidates
 * needed by the clickable logo. The `clearName` is kept for the logo's
 * title/aria-label (accessibility).
 */
type ProviderRow = {
  packageId: string;
  clearName: string;
  technicalName: string;
  icon: string;
  /** First non-null `offer.deeplinkURL` across all offers in this package. */
  deepLinkUrl: string | null;
  /** First non-null `offer.standardWebURL` — used as fallback for the logo link. */
  webUrl: string | null;
  /** True if ANY offer for this package has monetizationType === "CINEMA". */
  isCinema: boolean;
  /** True if ANY offer for this package has a non-CINEMA monetization type. */
  isStreaming: boolean;
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
 * unique Package.
 *
 * The helper tracks provider identity and redirect candidates only;
 * monetization badges and availability dates are intentionally not rendered.
 *
 * Rules:
 *   - Group by `offer.package.id`.
 *   - For each group:
 *       packageId     = package.id
 *       clearName     = package.clearName
 *       technicalName = package.technicalName
 *       icon          = package.icon
 *       watchNowUrl   = first non-null offer.deeplinkURL
 *       moreInfoUrl   = first non-null offer.standardWebURL
 *   - Sort: alphabetical by clearName (deterministic order).
 *   - No duplicate package rows.
 *   - No filtering by user-selected providers.
 */
export function normalizeOffers(offers: JustWatchOffer[]): ProviderRow[] {
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
        deepLinkUrl: null,
        webUrl: null,
        isCinema: false,
        isStreaming: false
      };
      groups.set(pkg.id, row);
    }

    // First non-null deeplinkURL wins.
    if (row.deepLinkUrl === null && offer.deeplinkURL) {
      row.deepLinkUrl = offer.deeplinkURL;
    }
    // First non-null standardWebURL wins as the web fallback.
    if (row.webUrl === null && offer.standardWebURL) {
      row.webUrl = offer.standardWebURL;
    }
    // Track cinema vs streaming at the package level.
    if (offer.monetizationType === "CINEMA") {
      row.isCinema = true;
    } else {
      row.isStreaming = true;
    }
  }

  const rows = Array.from(groups.values());

  // Sort: alphabetical by clearName (deterministic order; badges that
  // used to drive subscription-first sorting are gone in Chunk 6G).
  rows.sort((a, b) => a.clearName.localeCompare(b.clearName));

  return rows;
}

/**
 * Determine the section heading based on the cinema/streaming mix of ALL
 * provider rows.
 *
 * Rules:
 *   - At least one offer AND every relevant offer is CINEMA → "Book Tickets"
 *   - Both CINEMA and non-CINEMA offers exist → "Where to Watch & Book"
 *   - No CINEMA offers → "Where to Watch"
 */
export function getSectionLabel(rows: ProviderRow[]): string {
  if (rows.length === 0) return "Where to Watch";
  const hasCinema = rows.some((r) => r.isCinema);
  const hasStreaming = rows.some((r) => r.isStreaming);
  if (hasCinema && !hasStreaming) return "Book Tickets";
  if (hasCinema && hasStreaming) return "Where to Watch & Book";
  return "Where to Watch";
}

/** Resolve the provider deep link, with a standard web fallback. */
export function getProviderWatchUrl(row: Pick<ProviderRow, "deepLinkUrl" | "webUrl">): string | null {
  return row.deepLinkUrl ?? row.webUrl ?? null;
}

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
      <DetailSection label={getSectionLabel(visibleRows())} icon="play_circle">
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
              // The logo uses the exact same redirect precedence as the
              // provider deeplink first, then the standard web URL. Providers without either URL remain
              // visible but are intentionally non-clickable.
              const providerHref = createMemo(() => getProviderWatchUrl(row));
              const logoContent = () => (
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
                          style={{ "font-size": "22px" }}
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
              );
              return (
                <div class="wheretowatch-row" role="listitem">
                  <Show when={providerHref()} fallback={logoContent()}>
                    <a
                      class="wheretowatch-logo-link focus-ring"
                      href={providerHref() ?? undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Watch now on ${row.clearName}`}
                    >
                      {logoContent()}
                    </a>
                  </Show>
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
