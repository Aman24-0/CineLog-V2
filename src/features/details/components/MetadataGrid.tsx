// src/features/details/components/MetadataGrid.tsx
import { For, Show, createMemo, createSignal } from "solid-js";
import { useDiscoverRegion } from "~/core/config/discoverRegion";
import { formatDateLong } from "~/shared/utils/format";
import type { WatchlistItem, TMDBDetails, OMDbRatings } from "~/shared/types";
import type { AniListMedia } from "~/lib/anilist";
import AudioLanguageModal from "./AudioLanguageModal";

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
  /** AniList data — null for non-anime titles. When present, anime-specific
   *  cells are added and TMDB duplicates are hidden. */
  anilist?: AniListMedia | null;
  /** Whether this title is anime. */
  isAnime?: boolean;
}

interface MetaCell {
  label: string;
  value: string;
  /**
   * Optional kind override — used to mark cells that need special
   * rendering (currently: "language" for the clickable audio-modal
   * trigger). When omitted, the cell renders as a plain div.
   */
  kind?: "language";
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
  SE: { code: "SEK", symbol: "kr ", rate: 10.5 }
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
function formatMoneyLocal(revenueUSD: number, region: string): string | null {
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

// ─── AniList helpers ─────────────────────────────────────────────────

/** Format AniList season + year as "Spring 2025" etc. */
function formatAniListSeason(season: string | null | undefined, year: number | null | undefined): string | null {
  if (!season && !year) return null;
  if (!season) return String(year);
  if (!year) return season.charAt(0) + season.slice(1).toLowerCase();
  return `${season.charAt(0) + season.slice(1).toLowerCase()} ${year}`;
}

/** Format large numbers with "k" suffix for ≥1000. */
function formatCompact(num: number | null | undefined): string | null {
  if (num == null) return null;
  return num >= 1000 ? `${(num / 1000).toFixed(1)}k` : String(num);
}

/** Get the top AniList ranking (all-time rated or popular). */
function getTopRank(anilist: AniListMedia): string | null {
  if (!anilist.rankings || anilist.rankings.length === 0) return null;
  const rated = anilist.rankings.filter((r) => r.type === "RATED" && r.allTime);
  if (rated.length > 0) {
    const top = rated.sort((a, b) => a.rank - b.rank)[0];
    return `#${top.rank} Highest Rated`;
  }
  const popular = anilist.rankings.filter((r) => r.type === "POPULAR" && r.allTime);
  if (popular.length > 0) {
    const top = popular.sort((a, b) => a.rank - b.rank)[0];
    return `#${top.rank} Most Popular`;
  }
  return null;
}

/** Get main animation studios from AniList. */
function getAniListStudios(anilist: AniListMedia): string | null {
  const edges = anilist.studios?.edges;
  if (!edges || edges.length === 0) return null;
  const names = edges
    .filter((e) => e.isMain && e.node?.isAnimationStudio)
    .map((e) => e.node.name);
  return names.length > 0 ? names.join(", ") : null;
}

/** Map AniList source enum to display label. */
const SOURCE_LABELS: Record<string, string> = {
  ORIGINAL: "Original",
  MANGA: "Manga",
  LIGHT_NOVEL: "Light Novel",
  VISUAL_NOVEL: "Visual Novel",
  VIDEO_GAME: "Video Game",
  OTHER: "Other",
  NOVEL: "Novel",
  DOUJINSHI: "Doujinshi",
  ANIME: "Anime",
  WEB_NOVEL: "Web Novel",
  LIVE_ACTION: "Live Action",
  GAME: "Game",
  COMIC: "Comic",
  MULTIMEDIA_PROJECT: "Multimedia Project",
  PICTURE_BOOK: "Picture Book"
};

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
 * CURRENCY TOGGLE (v2.6 — extended to Budget):
 *   Both the Budget cell and the Box Office cell are clickable to
 *   toggle between USD and the user's local currency. The two cells
 *   share a single `showLocalCurrency` signal — flipping one flips
 *   both, so the user sees a consistent currency view across the
 *   money cells. The ⇄ icon next to the label hints at the
 *   interactivity. Falls back to USD-only when the user's country
 *   has no currency mapping (in which case the cells render as
 *   non-interactive plain cells).
 *
 * TV SEASONS/EPISODES ORDERING (v2.6):
 *   For TV series, the Seasons and Episodes cells are pushed FIRST
 *   in the list (before Status) so they're guaranteed to land in
 *   row 1, columns 1 and 2 of the grid — adjacent and on the same
 *   row at every breakpoint. Previously Status was pushed first,
 *   which on the 2-col mobile layout pushed Episodes down to row 2
 *   and broke the natural "seasons × episodes" pairing.
 */
export default function MetadataGrid(props: MetadataGridProps) {
  const region = useDiscoverRegion();
  // Per-mount toggle — starts in USD mode, click flips to local.
  // Shared by both Budget and Box Office cells so the user sees a
  // consistent currency view across the money cells.
  const [showLocalCurrency, setShowLocalCurrency] = createSignal(false);

  // ── Audio-language modal state ──────────────────────────────────
  // Opened when the user taps the "Language" cell. The modal fetches
  // dubbed-audio data independently from /api/audio-languages/{tmdbId}.
  // Per spec STEP 22: this is a SEPARATE data section that does NOT
  // block the rest of the detail page.
  const [showLanguageModal, setShowLanguageModal] = createSignal(false);

  const cells = createMemo<MetaCell[]>(() => {
    const d = props.details;
    const b = props.baseItem;
    const o = props.omdb;
    const al = props.anilist;
    const isAnime = props.isAnime ?? false;
    const list: MetaCell[] = [];

    // Year, Type, and Runtime are intentionally NOT rendered here —
    // the Hero section's quick-meta pills already display them, so
    // duplicating them in the Details Grid was visual noise. See
    // HeroContentCluster.tsx for the source-of-truth rendering.

    const isTv = b?.media_type === "tv" || d?.media_type === "tv";

    // ── Anime: AniList-specific cells ──────────────────────────────
    // For anime, Format and Duration are NOT shown — they're already
    // displayed in the Hero's quick-meta pills. Episodes is hidden
    // for anime movies (always 1 episode) but shown for TV/OVA/ONA.
    if (isAnime && al) {
      // Format is already shown in Hero chips — skip
      // Duration is already shown beside Year in Hero — skip
      // Episodes: hide for anime movies (always 1), show for series
      const isAnimeMovie = al.format === "MOVIE";
      if (!isAnimeMovie && al.episodes != null) {
        list.push({ label: "Episodes", value: String(al.episodes) });
      }
    } else if (isAnime && !al) {
      // Anime without AniList data — still show TMDB episodes
      if (isTv) {
        if (d?.number_of_seasons) {
          list.push({ label: "Seasons", value: String(d.number_of_seasons) });
        }
      }
      if (d?.number_of_episodes) {
        list.push({ label: "Episodes", value: String(d.number_of_episodes) });
      }
    } else {
      // ── Non-anime: TV Seasons + Episodes ──────────────────────
      if (isTv) {
        if (d?.number_of_seasons) {
          list.push({ label: "Seasons", value: String(d.number_of_seasons) });
        }
        if (d?.number_of_episodes) {
          list.push({ label: "Episodes", value: String(d.number_of_episodes) });
        }
      }
    }

    // Status — for anime with AniList, use AniList status; otherwise TMDB.
    if (isAnime && al?.status) {
      // Map AniList status to a readable string
      const statusMap: Record<string, string> = {
        FINISHED: "Finished",
        RELEASING: "Airing",
        NOT_YET_RELEASED: "Not Yet Released",
        CANCELLED: "Cancelled",
        HIATUS: "Hiatus"
      };
      list.push({ label: "Status", value: statusMap[al.status] ?? al.status });
    } else if (d?.status) {
      list.push({ label: "Status", value: d.status });
    }

    // Release Date — TMDB for all titles (AniList dates are fuzzy).
    // For anime, still show TMDB release date.
    const releaseDateRaw =
      d?.release_date ||
      d?.first_air_date ||
      b?.release_date ||
      b?.first_air_date ||
      null;
    const releaseDateFormatted = formatDateLong(releaseDateRaw);
    if (releaseDateFormatted) {
      list.push({ label: "Release Date", value: releaseDateFormatted });
    }

    // Season (AniList) — e.g. "Spring 2025" — only for anime.
    if (isAnime && al) {
      const seasonStr = formatAniListSeason(al.season, al.seasonYear);
      if (seasonStr) {
        list.push({ label: "Season", value: seasonStr });
      }
    }

    // TV-specific: Network (TMDB)
    if (isTv) {
      if (d?.networks && d.networks.length > 0) {
        list.push({
          label: "Network",
          value: d.networks.map((n) => n.name).join(", ")
        });
      }
    }

    // Studio — for anime, use AniList (hide TMDB production_companies).
    // For movies/TV, use TMDB production_companies as before.
    if (isAnime && al) {
      const studioStr = getAniListStudios(al);
      if (studioStr) {
        list.push({ label: "Studio", value: studioStr });
      }
    } else if (!isTv && d?.production_companies && d.production_companies.length > 0) {
      list.push({
        label: "Studio",
        value: d.production_companies
          .slice(0, 2)
          .map((p) => p.name)
          .join(", ")
      });
    }

    // Duration is already shown in Hero chips — skip for anime.
    // For movies/TV, runtime is also in Hero — no Duration cell.

    // Budget & Box Office — always side-by-side in the same row.
    // Both are only shown for movies (not TV series). For anime movies,
    // they still appear if TMDB has the data. The two cells are always
    // added consecutively so they land in the same grid row.
    if (!isTv) {
      const budgetUSD = formatMoneyUSD(d?.budget);
      const boxOfficeUSD = formatMoneyUSD(d?.revenue);
      if (budgetUSD) {
        const localFormat = formatMoneyLocal(d?.budget ?? 0, region());
        const showLocal = showLocalCurrency() && localFormat !== null;
        list.push({
          label: "Budget",
          value: showLocal ? localFormat! : budgetUSD
        });
      }
      if (boxOfficeUSD) {
        const localFormat = formatMoneyLocal(d?.revenue ?? 0, region());
        const showLocal = showLocalCurrency() && localFormat !== null;
        list.push({
          label: "Box Office",
          value: showLocal ? localFormat! : boxOfficeUSD
        });
      }
    }

    // Certification / Age Rating (OMDb for non-anime, AniList for anime)
    if (isAnime && al?.isAdult != null) {
      list.push({ label: "Age Rating", value: al.isAdult ? "18+" : "PG" });
    } else if (o?.rated && o.rated !== "N/A") {
      list.push({ label: "Rated", value: o.rated });
    }

    // Source Material (AniList) — only for anime.
    if (isAnime && al?.source) {
      const sourceLabel = SOURCE_LABELS[al.source as string] ?? al.source;
      list.push({ label: "Source", value: sourceLabel });
    }

    // Language
    if (d?.spoken_languages && d.spoken_languages.length > 0) {
      const langs = d.spoken_languages
        .map((l) => l.english_name)
        .filter(Boolean);
      if (langs.length > 0) {
        // `kind: "language"` marks this cell as the clickable trigger
        // for the AudioLanguageModal. The render block in the JSX below
        // renders it as a <button> instead of a plain <div>.
        list.push({
          label: "Language",
          value: langs.slice(0, 2).join(", "),
          kind: "language"
        });
      }
    }

    // Country
    const countries =
      d?.origin_country || d?.production_countries?.map((c) => c.iso_3166_1);
    if (countries && countries.length > 0) {
      list.push({ label: "Country", value: countries.slice(0, 2).join(", ") });
    }

    // ── AniList Stats (merged into grid) ─────────────────────────
    // These were previously in the separate "AniList Stats" section.
    // Now they appear as normal Detail cards alongside TMDB data.
    if (isAnime && al) {
      const popularity = formatCompact(al.popularity);
      if (popularity) {
        list.push({ label: "Popularity", value: popularity });
      }
      const favourites = formatCompact(al.favourites);
      if (favourites) {
        list.push({ label: "Favourites", value: favourites });
      }
      const rank = getTopRank(al);
      if (rank) {
        list.push({ label: "Ranking", value: rank });
      }
    }

    return list;
  });

  /**
   * Whether the money cells (Budget + Box Office) are interactive
   * (clickable to toggle currency). True when:
   *   - The title is a movie (money cells only show for movies)
   *   - TMDB has a non-zero budget OR revenue (at least one cell
   *     renders — both flip together via the shared signal)
   *   - The user's country has a non-USD currency mapping
   *
   * If only one of Budget/Revenue is present, only that cell renders
   * as a button — but the canToggleCurrency gate is shared so the
   * memo stays simple. Per-cell interactivity is decided in the
   * render by checking the cell label against the toggleable labels.
   */
  const canToggleCurrency = createMemo(() => {
    const d = props.details;
    const b = props.baseItem;
    const isTv = b?.media_type === "tv" || d?.media_type === "tv";
    if (isTv) return false;
    // Anime movies may still have budget/box office from TMDB
    // Need at least one non-zero money field for any toggle to make sense.
    const hasBudget = !!d?.budget && d.budget > 0;
    const hasRevenue = !!d?.revenue && d.revenue > 0;
    if (!hasBudget && !hasRevenue) return false;
    const probeAmount = d?.revenue ?? d?.budget ?? 0;
    return formatMoneyLocal(probeAmount, region()) !== null;
  });

  /**
   * The set of cell labels that should render as toggle buttons
   * when `canToggleCurrency()` is true. Computed from the actual
   * cells list so only cells that are present become buttons.
   */
  const toggleableLabels = createMemo<Set<string>>(() => {
    if (!canToggleCurrency()) return new Set();
    const out = new Set<string>();
    for (const cell of cells()) {
      if (cell.label === "Budget" || cell.label === "Box Office") {
        out.add(cell.label);
      }
    }
    return out;
  });

  /** Click handler for any money cell — flips the shared toggle. */
  const handleMoneyCellClick = () => {
    if (!canToggleCurrency()) return;
    setShowLocalCurrency((v) => !v);
  };

  /**
   * The TMDB id + media_type for the open title, used by the
   * AudioLanguageModal to fetch dubbed-audio data. Derived from
   * baseItem so it's always the TMDB identity (not the vault id).
   */
  const audioTmdbId = createMemo(() => props.baseItem?.id ?? "");
  const audioType = createMemo<"movie" | "tv">(() =>
    props.baseItem?.media_type === "tv" ? "tv" : "movie"
  );

  return (
    <>
      <Show when={cells().length > 0}>
        <div class="metadata-grid">
          <For each={cells()}>
            {(cell) => {
              const isToggleable = () => toggleableLabels().has(cell.label);
              const isLanguage = () => cell.kind === "language";
              return (
                <Show
                  when={isToggleable()}
                  fallback={
                    <Show
                      when={isLanguage()}
                      fallback={
                        <div class="metadata-cell">
                          <span class="metadata-cell-label">{cell.label}</span>
                          <span class="metadata-cell-value">{cell.value}</span>
                        </div>
                      }
                    >
                      {/* Language cell — opens the AudioLanguageModal.
                          Per spec STEP 15: subtle visual indication
                          (cursor/pointer + hover/focus + arrow icon),
                          remains visually consistent with the existing
                          design. */}
                      <button
                        type="button"
                        class="metadata-cell metadata-cell-language"
                        onClick={() => setShowLanguageModal(true)}
                        aria-label={`${cell.label}: ${cell.value}. Tap to see dubbed audio languages.`}
                        title="Tap to see dubbed audio languages"
                      >
                        <span class="metadata-cell-label">
                          {cell.label}
                          <span
                            class="material-symbols-outlined metadata-cell-language-icon"
                            aria-hidden="true"
                          >
                            arrow_forward
                          </span>
                        </span>
                        <span class="metadata-cell-value">{cell.value}</span>
                      </button>
                    </Show>
                  }
                >
                  <button
                    type="button"
                    class="metadata-cell metadata-cell-button"
                    onClick={handleMoneyCellClick}
                    aria-label={`${cell.label}: ${cell.value}. Tap to switch currency.`}
                    title="Tap to switch currency"
                  >
                    <span class="metadata-cell-label">
                      {cell.label}
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
              );
            }}
          </For>
        </div>
      </Show>

      {/* Audio Language Modal — opens when the user taps the Language
          cell. Fetches dubbed-audio data from /api/audio-languages/{tmdbId}.
          Per spec STEP 22: a failure here does NOT break the detail
          page — the modal handles its own error/loading states. */}
      <AudioLanguageModal
        open={showLanguageModal()}
        onClose={() => setShowLanguageModal(false)}
        tmdbId={audioTmdbId()}
        type={audioType()}
        details={props.details}
        baseItem={props.baseItem}
      />
    </>
  );
}
