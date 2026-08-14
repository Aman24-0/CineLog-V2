// src/features/settings/components/StreamingProvidersSection.tsx
//
// CineLog V2 — JustWatch OTT Migration — Chunk 4
// ---------------------------------------------------------------------
// The new "Streaming Providers" subsection of the Content & Language
// settings panel. Replaces the old TMDB chip-grid with a JustWatch-
// backed search/add/remove/reorder UI.
//
// Behavior (per Stage 5 Chunk 4 spec):
//
//   1. EMPTY STATE:
//        STREAMING PROVIDERS
//        [search input: "Search streaming provider..."]
//        "No OTT apps selected"
//        "Search and add the streaming services you use."
//
//   2. SEARCH RESULTS (only when query is non-empty):
//        - Match against clearName, technicalName, shortName
//          (case-insensitive, whitespace-trimmed).
//        - Each result row: [logo] clearName  [ADD] / [ADDED]
//        - "No streaming providers found." when no match.
//
//   3. SELECTED PROVIDERS ("YOUR OTT APPS"):
//        - Each row: [logo] clearName  [REMOVE]
//        - Up/down arrow buttons to reorder (no external drag lib).
//        - Provider order persists in streamingProviders() signal +
//          prefs_json via preferencesSync.
//
//   4. COUNTRY-UNAVAILABLE PROVIDERS:
//        - If a selected provider (by technicalName) is NOT in the
//          current country catalog (s.providers()), show it visually
//          disabled with "Not available in your region" + REMOVE
//          button. NOT reorderable while disabled.
//
//   5. HINT:
//        "These providers are used only for Discover → New on OTT."
//
//   6. LOGO URL:
//        https://images.justwatch.com${icon}
//          .replace('{profile}', 's100')
//          .replace('{format}', 'png')
//        No TMDB logos. No hard-coded logo map.
//
// This component does NOT make any network calls itself — it reads
// `s.providers()` (loaded by useSettingsState's loadProviders) and the
// global `streamingProviders()` signal. All add/remove/reorder goes
// through the exported preference helpers (toggleStreamingProvider,
// removeStreamingProvider, moveStreamingProvider) so changes persist
// to localStorage + prefs_json immediately.

import { Show, For, createMemo, createSignal } from "solid-js";
import type { JustWatchProviderItem } from "~/core/preferences";
import {
  streamingProviders,
  addStreamingProvider,
  removeStreamingProvider,
  moveStreamingProvider
} from "~/core/preferences";

interface ProviderRow {
  provider: JustWatchProviderItem;
  selected: boolean;
  available: boolean;
}

interface SelectedRow {
  technicalName: string;
  provider: JustWatchProviderItem | null; // null = not in current country catalog
  index: number;
}

/**
 * Build the full JustWatch CDN logo URL from the icon template.
 *
 * The icon template from /api/ott/providers looks like:
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
 * Case-insensitive, whitespace-trimmed search match against the
 * provider's clearName, technicalName, and shortName.
 */
function matchesQuery(provider: JustWatchProviderItem, q: string): boolean {
  const query = q.trim().toLowerCase();
  if (!query) return false;
  const name = provider.clearName?.toLowerCase() ?? "";
  const tech = provider.technicalName?.toLowerCase() ?? "";
  const short = provider.shortName?.toLowerCase() ?? "";
  return (
    name.includes(query) ||
    tech.includes(query) ||
    short.includes(query)
  );
}

/**
 * A single search-result row. Shows [ADD] for not-yet-selected
 * providers, [ADDED] for already-selected ones.
 */
function ProviderSearchRow(props: { row: ProviderRow }) {
  // Destructure once at the top — `row` is a stable object reference
  // (the parent's searchResults memo produces a fresh array on each
  // read, but each row object inside is a stable reference within a
  // given render). Reading `row.provider.icon` etc. inside JSX would
  // otherwise trip the solid/reactivity lint rule (false positive —
  // `row` is not a reactive variable, it's a plain object).
  // eslint-disable-next-line solid/reactivity
  const row = props.row;
  const logoUrl = createMemo(() => buildLogoUrl(row.provider.icon));

  return (
    <div class="ott-search-row" data-selected={row.selected}>
      <div class="ott-search-row-logo" aria-hidden="true">
        <Show
          when={logoUrl()}
          fallback={
            <span class="ott-provider-letter">
              {row.provider.clearName.charAt(0)}
            </span>
          }
        >
          <img
            src={logoUrl()}
            class="ott-provider-logo"
            alt=""
            loading="lazy"
            decoding="async"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        </Show>
      </div>
      <span class="ott-search-row-name">{row.provider.clearName}</span>
      <Show
        when={!row.selected}
        fallback={
          <button
            type="button"
            class="ott-add-btn focus-ring"
            data-added="true"
            disabled
            aria-label={`${row.provider.clearName} already added`}
          >
            ADDED
          </button>
        }
      >
        <button
          type="button"
          class="ott-add-btn focus-ring"
          onClick={() => addStreamingProvider(row.provider.technicalName)}
          aria-label={`Add ${row.provider.clearName}`}
        >
          ADD
        </button>
      </Show>
    </div>
  );
}

/**
 * A single selected-provider row with reorder arrows + remove.
 * When `provider` is null (not in current country catalog), the row
 * is rendered disabled with "Not available in your region".
 */
function SelectedProviderRow(props: {
  row: SelectedRow;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  // Destructure once at the top — see ProviderSearchRow for the
  // rationale (stable object reference, false-positive lint warning).
  // eslint-disable-next-line solid/reactivity
  const row = props.row;
  // eslint-disable-next-line solid/reactivity
  const total = props.total;
  // eslint-disable-next-line solid/reactivity
  const onMoveUp = props.onMoveUp;
  // eslint-disable-next-line solid/reactivity
  const onMoveDown = props.onMoveDown;
  const unavailable = row.provider === null;
  const logoUrl = createMemo(() =>
    row.provider ? buildLogoUrl(row.provider.icon) : ""
  );
  const displayName = createMemo(() =>
    row.provider ? row.provider.clearName : row.technicalName
  );

  return (
    <div class="ott-selected-row" data-unavailable={unavailable}>
      <div class="ott-selected-row-logo" aria-hidden="true">
        <Show
          when={logoUrl()}
          fallback={
            <span class="ott-provider-letter">
              {displayName().charAt(0)}
            </span>
          }
        >
          <img
            src={logoUrl()}
            class="ott-provider-logo"
            alt=""
            loading="lazy"
            decoding="async"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        </Show>
      </div>
      <div class="ott-selected-row-meta">
        <span class="ott-selected-row-name">{displayName()}</span>
        <Show when={unavailable}>
          <span class="ott-selected-row-unavailable">
            Not available in your region
          </span>
        </Show>
      </div>
      <div class="ott-selected-row-actions">
        <Show when={!unavailable}>
          <button
            type="button"
            class="ott-reorder-btn focus-ring"
            onClick={() => onMoveUp()}
            disabled={row.index === 0}
            aria-label={`Move ${displayName()} up`}
            title="Move up"
          >
            <span class="material-symbols-outlined" aria-hidden="true">
              arrow_upward
            </span>
          </button>
          <button
            type="button"
            class="ott-reorder-btn focus-ring"
            onClick={() => onMoveDown()}
            disabled={row.index === total - 1}
            aria-label={`Move ${displayName()} down`}
            title="Move down"
          >
            <span class="material-symbols-outlined" aria-hidden="true">
              arrow_downward
            </span>
          </button>
        </Show>
        <button
          type="button"
          class="ott-remove-btn focus-ring"
          onClick={() => removeStreamingProvider(row.technicalName)}
          aria-label={`Remove ${displayName()}`}
          title="Remove"
        >
          REMOVE
        </button>
      </div>
    </div>
  );
}

/**
 * The full "Streaming Providers" subsection. Receives the SettingsState
 * bag (for the providers catalog + loading state) and reads the global
 * streamingProviders signal directly for the selected list.
 */
export function StreamingProvidersSection(props: {
  providers: () => JustWatchProviderItem[];
  providersLoading: () => boolean;
  activeCount: () => number;
}) {
  const [searchQuery, setSearchQuery] = createSignal("");

  // Build a map of technicalName → JustWatchProviderItem for the
  // current country catalog, so we can look up selected providers that
  // may not be in the catalog (country change, stale prefs, etc.).
  const catalogByTechName = createMemo(() => {
    const map = new Map<string, JustWatchProviderItem>();
    for (const p of props.providers()) {
      map.set(p.technicalName, p);
    }
    return map;
  });

  // Selected rows: map the streamingProviders() string array into
  // SelectedRow objects. If a selected technicalName isn't in the
  // current catalog, provider is null (rendered as "unavailable").
  const selectedRows = createMemo<SelectedRow[]>(() => {
    const selected = streamingProviders();
    return selected.map((techName, idx) => ({
      technicalName: techName,
      provider: catalogByTechName().get(techName) ?? null,
      index: idx
    }));
  });

  // Search results: filter the country catalog by the query, mark each
  // as selected/not-selected for the [ADD]/[ADDED] button.
  const searchResults = createMemo<ProviderRow[]>(() => {
    const q = searchQuery();
    if (!q.trim()) return [];
    const selected = new Set(streamingProviders());
    return props.providers()
      .filter((p) => matchesQuery(p, q))
      .map((p) => ({
        provider: p,
        selected: selected.has(p.technicalName),
        available: true
      }));
  });

  const showSearchResults = createMemo(() => searchQuery().trim().length > 0);

  return (
    <div class="setting-subsection">
      <p class="setting-subsection-label">
        Streaming providers
        <Show when={props.activeCount() > 0}>
          <span
            style={{
              "margin-left": "var(--sp-2)",
              "font-size": "0.6875rem",
              color: "var(--p)",
              "font-weight": 700
            }}
          >
            {props.activeCount()} active
          </span>
        </Show>
      </p>
      <div
        class="setting-group"
        style={{ padding: "var(--sp-3) var(--sp-4)" }}
      >
        {/* Search input */}
        <div class="ott-search-wrapper">
          <span
            class="material-symbols-outlined ott-search-icon"
            aria-hidden="true"
          >
            search
          </span>
          <input
            type="search"
            class="ott-search-input focus-ring"
            placeholder="Search streaming provider..."
            value={searchQuery()}
            onInput={(e) => setSearchQuery(e.currentTarget.value)}
            aria-label="Search streaming provider"
          />
          <Show when={searchQuery().trim().length > 0}>
            <button
              type="button"
              class="ott-search-clear focus-ring"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
            >
              <span class="material-symbols-outlined" aria-hidden="true">
                close
              </span>
            </button>
          </Show>
        </div>

        {/* Search results OR empty state */}
        <Show
          when={showSearchResults()}
          fallback={
            <Show
              when={selectedRows().length > 0}
              fallback={
                <div class="ott-empty-state">
                  <p class="ott-empty-title">No OTT apps selected</p>
                  <p class="ott-empty-desc">
                    Search and add the streaming services you use.
                  </p>
                </div>
              }
            >
              {/* Selected providers are rendered below the search
                  results section, so in the fallback (no search query)
                  we show only the empty-state OR nothing here (the
                  selected list is rendered separately below). */}
              <div />
            </Show>
          }
        >
          <div class="ott-search-results">
            <Show
              when={searchResults().length > 0}
              fallback={
                <p class="ott-search-empty">
                  No streaming providers found.
                </p>
              }
            >
              <For each={searchResults()}>
                {(row) => <ProviderSearchRow row={row} />}
              </For>
            </Show>
          </div>
        </Show>

        {/* Selected providers */}
        <Show when={selectedRows().length > 0}>
          <div class="ott-selected-section">
            <p class="ott-selected-heading">YOUR OTT APPS</p>
            <For each={selectedRows()}>
              {(row) => (
                <SelectedProviderRow
                  row={row}
                  total={selectedRows().length}
                  onMoveUp={() =>
                    moveStreamingProvider(
                      row.technicalName,
                      row.index,
                      row.index - 1
                    )
                  }
                  onMoveDown={() =>
                    moveStreamingProvider(
                      row.technicalName,
                      row.index,
                      row.index + 1
                    )
                  }
                />
              )}
            </For>
          </div>
        </Show>

        {/* Hint */}
        <p class="setting-subsection-hint">
          These providers are used only for Discover → New on OTT.
        </p>

        {/* Loading state (only shown when catalog is empty AND we're
            still loading — avoids flashing "no providers found" during
            the initial fetch). */}
        <Show
          when={props.providersLoading() && props.providers().length === 0}
        >
          <div class="ott-loading">Loading providers…</div>
        </Show>
      </div>
    </div>
  );
}
