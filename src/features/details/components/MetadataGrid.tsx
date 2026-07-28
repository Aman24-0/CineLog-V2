// src/features/details/components/MetadataGrid.tsx
import { For, Show, createMemo, createSignal } from "solid-js";
import { useDiscoverRegion } from "~/core/config/discoverRegion";
import type { WatchlistItem, TMDBDetails, OMDbRatings } from "~/shared/types";

interface MetadataGridProps {
  /** TMDB identity — always present */
  baseItem: WatchlistItem | null;
  details: TMDBDetails | null;
  omdb: OMDbRatings | null;
  /**
   * User-owned vault item — null when the title is NOT in the vault.
   * The "Your Status" cell only renders when this is present.
   */
  vaultItem?: WatchlistItem | null;
}

interface MetaCell {
  label: string;
  value: string;
}

/**
 * Currency metadata for a country.
 * Maps ISO 3166-1 country code → { code, symbol, rate }.
 *
 * `rate` is USD → local currency (approximate, static).
 * We use static rates rather than a live FX API because:
 *   1. Box office is historical data — exact current FX doesn't matter
 *   2. Live FX requires a network call on every detail page open
 *   3. The user wants a quick "what does this look like in my currency"
 *      estimate, not an accounting-grade conversion
 *
 * Rates are reasonable ~2024 values. For countries not in this map,
 * the box office cell falls back to USD.
 */
interface CurrencyInfo {
  code: string;
  symbol: string;
  /** USD → local currency multiplier */
  rate: number;
}

const COUNTRY_CURRENCY: Record<string, CurrencyInfo> = {
  US: { code: "USD", symbol: "$", rate: 1 },
  IN: { code: "INR", symbol: "₹", rate: 83.5 },
  GB: { code: "GBP", symbol: "£", rate: 0.79 },
  CA: { code: "CAD", symbol: "C$", rate: 1.36 },
  AU: { code: "AUD", symbol: "A$", rate: 1.52 },
  DE: { code: "EUR", symbol: "€", rate: 0.92 },
  FR: { code: "EUR", symbol: "€", rate: 0.92 },
  ES: { code: "EUR", symbol: "€", rate: 0.92 },
  IT: { code: "EUR", symbol: "€", rate: 0.92 },
  NL: { code: "EUR", symbol: "€", rate: 0.92 },
  JP: { code: "JPY", symbol: "¥", rate: 150 },
  KR: { code: "KRW", symbol: "₩", rate: 1180 },
  CN: { code: "CNY", symbol: "¥", rate: 7.25 },
  BR: { code: "BRL", symbol: "R$", rate: 5.4 },
  MX: { code: "MXN", symbol: "$", rate: 17.2 },
  RU: { code: "RUB", symbol: "₽", rate: 92 },
  AE: { code: "AED", symbol: "AED ", rate: 3.67 },
  SA: { code: "SAR", symbol: "SAR ", rate: 3.75 },
  TR: { code: "TRY", symbol: "₺", rate: 32 },
  SE: { code: "SEK", symbol: "kr ", rate: 10.5 },
};

/**
 * Format a USD money amount as "$1.2 million" / "$1.2 billion".
 * Returns null when the value is missing or zero so the cell can be hidden.
 *
 * Shared by both Budget and Box Office cells — both come from TMDB as USD
 * integers and use the same compact formatting.
 */
function formatMoneyUSD(amount: number | undefined | null): string | null {
  if (!amount || amount <= 0) return null;
  const million = 1_000_000;
  const billion = 1_000_000_000;
  if (amount >= billion) {
    return `$${(amount / billion).toFixed(1)} billion`;
  }
  if (amount >= million) {
    return `$${(amount / million).toFixed(1)} million`;
  }
  // Sub-million amounts — show as raw $ figure (e.g. "$450,000")
  return `$${amount.toLocaleString("en-US")}`;
}

/**
 * Format a USD revenue amount in the user's local currency.
 *
 * Special case: Indian rupee uses the crore/lakh system
 * (₹16.32 crore, ₹8.50 lakh) which is the standard way Indian box-office
 * figures are reported. Other currencies use the international
 * million/billion compact format with the local symbol.
 *
 * Returns null if the country has no known currency mapping (caller
 * should fall back to USD).
 */
function formatMoneyLocal(
  revenueUSD: number,
  region: string,
): string | null {
  const info = COUNTRY_CURRENCY[region];
  if (!info || info.code === "USD") return null;

  const local = revenueUSD * info.rate;

  // Indian numbering system — crore (10M) and lakh (100K)
  if (info.code === "INR") {
    const crore = 10_000_000;
    const lakh = 100_000;
    if (local >= crore) return `₹${(local / crore).toFixed(2)} crore`;
    if (local >= lakh) return `₹${(local / lakh).toFixed(2)} lakh`;
    return `₹${Math.round(local).toLocaleString("en-IN")}`;
  }

  // Generic compact format — million/billion with local symbol
  const million = 1_000_000;
  const billion = 1_000_000_000;
  const sym = info.symbol;
  if (local >= billion) return `${sym}${(local / billion).toFixed(1)} billion`;
  if (local >= million) return `${sym}${(local / million).toFixed(1)} million`;
  return `${sym}${Math.round(local).toLocaleString("en-US")}`;
}

/**
 * MetadataGrid — responsive grid of metadata cells.
 *
 * Shows only fields that exist — missing data is hidden gracefully.
 * Grid: 2 columns on mobile, 3 columns on sm+.
 *
 * OWNERSHIP BOUNDARY:
 *   The "Your Status" cell is user-owned — it only renders when
 *   `vaultItem` is present. All other cells are TMDB-sourced and
 *   always allowed.
 *
 * BOX OFFICE CELL (v2.4):
 *   Default: USD compact format ($1.7 million).
 *   On click: toggles to the user's local currency using a static
 *   exchange-rate table (₹16.32 crore for India, £1.3 million for
 *   UK, etc.). Re-click to revert to USD. Falls back to USD-only
 *   when the user's country has no currency mapping.
 */
export default function MetadataGrid(props: MetadataGridProps) {
  const region = useDiscoverRegion();
  // Per-mount toggle — starts in USD mode, click flips to local.
  const [showLocalCurrency, setShowLocalCurrency] = createSignal(false);

  const cells = createMemo<MetaCell[]>(() => {
    const d = props.details;
    const b = props.baseItem;
    const o = props.omdb;
    const list: MetaCell[] = [];

    // Year, Type, and Runtime are intentionally NOT rendered here —
    // the Hero section's quick-meta pills already display them, so
    // duplicating them in the Details Grid was visual noise. See
    // HeroContentCluster.tsx for the source-of-truth rendering.

    const isTv = b?.media_type === "tv" || d?.media_type === "tv";

    // Status (TMDB)
    if (d?.status) {
      list.push({ label: "Status", value: d.status });
    }

    // TV-specific
    if (isTv) {
      if (d?.number_of_seasons) {
        list.push({ label: "Seasons", value: String(d.number_of_seasons) });
      }
      if (d?.number_of_episodes) {
        list.push({ label: "Episodes", value: String(d.number_of_episodes) });
      }
      if (d?.networks && d.networks.length > 0) {
        list.push({ label: "Network", value: d.networks.map((n) => n.name).join(", ") });
      }
    }

    // Movie-specific
    if (!isTv && d?.production_companies && d.production_companies.length > 0) {
      list.push({ label: "Studio", value: d.production_companies.slice(0, 2).map((p) => p.name).join(", ") });
    }

    // Budget (Movie only) — TMDB reports production budget in USD.
    // Hidden when 0 or unavailable (TMDB doesn't always have it,
    // and many indie films report $0 budget).
    if (!isTv) {
      const budgetUSD = formatMoneyUSD(d?.budget);
      if (budgetUSD) {
        list.push({ label: "Budget", value: budgetUSD });
      }
    }

    // Box Office / Revenue (Movie only) — from TMDB revenue.
    // Hidden when revenue is 0 or unavailable.
    // Tap-to-toggle currency conversion (USD ⇄ local) is preserved.
    if (!isTv) {
      const boxOfficeUSD = formatMoneyUSD(d?.revenue);
      if (boxOfficeUSD) {
        // When toggled on AND a local format exists, show local; else USD.
        const localFormat = formatMoneyLocal(d?.revenue ?? 0, region());
        const showLocal = showLocalCurrency() && localFormat !== null;
        list.push({
          label: "Box Office",
          value: showLocal ? localFormat! : boxOfficeUSD,
        });
      }
    }

    // Certification (OMDb)
    if (o?.rated && o.rated !== "N/A") {
      list.push({ label: "Rated", value: o.rated });
    }

    // Language
    if (d?.spoken_languages && d.spoken_languages.length > 0) {
      const langs = d.spoken_languages.map((l) => l.english_name).filter(Boolean);
      if (langs.length > 0) {
        list.push({ label: "Language", value: langs.slice(0, 2).join(", ") });
      }
    }

    // Country
    const countries = d?.origin_country || d?.production_countries?.map((c) => c.iso_3166_1);
    if (countries && countries.length > 0) {
      list.push({ label: "Country", value: countries.slice(0, 2).join(", ") });
    }

    return list;
  });

  /**
   * Whether the Box Office cell is interactive (clickable to toggle
   * currency). Only true when:
   *   - The title is a movie (box office only shows for movies)
   *   - TMDB has a non-zero revenue
   *   - The user's country has a non-USD currency mapping
   */
  const canToggleCurrency = createMemo(() => {
    const d = props.details;
    const b = props.baseItem;
    const isTv = b?.media_type === "tv" || d?.media_type === "tv";
    if (isTv) return false;
    if (!d?.revenue || d.revenue <= 0) return false;
    return formatMoneyLocal(d.revenue, region()) !== null;
  });

  /** Click handler for the Box Office cell — flips the toggle. */
  const handleBoxOfficeClick = () => {
    if (!canToggleCurrency()) return;
    setShowLocalCurrency((v) => !v);
  };

  // Find the index of the Box Office cell so we can render it as a button.
  const boxOfficeIndex = createMemo(() =>
    cells().findIndex((c) => c.label === "Box Office"),
  );

  return (
    <Show when={cells().length > 0}>
      <div class="metadata-grid">
        <For each={cells()}>
          {(cell, i) => (
            <Show
              when={i() === boxOfficeIndex() && canToggleCurrency()}
              fallback={
                <div class="metadata-cell">
                  <span class="metadata-cell-label">{cell.label}</span>
                  <span class="metadata-cell-value">{cell.value}</span>
                </div>
              }
            >
              <button
                type="button"
                class="metadata-cell metadata-cell-button"
                onClick={handleBoxOfficeClick}
                aria-label={`Box office: ${cell.value}. Tap to switch currency.`}
                title="Tap to switch currency"
              >
                <span class="metadata-cell-label">
                  Box Office
                  <span
                    class="material-symbols-outlined metadata-cell-currency-icon"
                    style={{ "font-size": "11px" }}
                    aria-hidden="true"
                  >
                    swap_horiz
                  </span>
                </span>
                <span class="metadata-cell-value">{cell.value}</span>
              </button>
            </Show>
          )}
        </For>
      </div>
    </Show>
  );
}
