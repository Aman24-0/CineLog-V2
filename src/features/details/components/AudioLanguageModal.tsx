// src/features/details/components/AudioLanguageModal.tsx
//
// CineLog V2 — Audio Language Modal
// ---------------------------------------------------------------------
// Opens when the user taps the "Language" cell in the MetadataGrid.
// Shows:
//   1. ORIGINAL / SPOKEN languages (from TMDB spoken_languages — passed
//      in as `originalLanguages` from the parent, no API call needed).
//   2. DUBBED AUDIO languages (from the audio-language worker — fetched
//      lazily from /api/audio-languages/{tmdbId}).
//   3. Source/confidence indicator per dubbed language ("Verified" /
//      "Detected").
//   4. Loading / error / no-data / unknown states.
//
// STATES (per spec STEP 17):
//
//   loading  → "Loading audio languages..." with skeleton.
//   success  → lists original + dubbed (if any dubbed found).
//   noData   → "No reliable dubbed-audio data found." (NOT "no dubs exist")
//   error    → "Unable to retrieve audio-language information. Try again later."
//
// The modal NEVER breaks the underlying detail page — it's a separate
// data section with its own error handling.

import { createResource, createSignal, For, Show, onMount, onCleanup } from "solid-js";
import { GlassModal } from "~/shared/ui/glass";
import type { TMDBDetails, TMDBSpokenLanguage, WatchlistItem } from "~/shared/types";

// ─── API types (mirrors src/server/audio-language/types.ts) ───────────

interface NormalizedLanguageApi {
  code: string;
  name: string;
}

interface DubbedLanguageApi {
  code: string;
  name: string;
  confidence: "high" | "medium" | "low";
  sources: string[];
}

interface AudioLanguageApiResponse {
  tmdbId: number;
  type: "movie" | "tv";
  originalLanguages: NormalizedLanguageApi[];
  dubbedLanguages: DubbedLanguageApi[];
  status: "success" | "unknown" | "error";
  checkedAt: string;
  region: string;
  noData: boolean;
  error: boolean;
  message?: string;
  seasonAvailability?: Record<string, string[]>;
  sourceCount: number;
  fromCache: boolean;
  stale?: boolean;
}

// ─── Props ────────────────────────────────────────────────────────────

export interface AudioLanguageModalProps {
  /** Whether the modal is open. */
  open: boolean;
  /** Called when the user dismisses the modal. */
  onClose: () => void;
  /** TMDB id of the open title. */
  tmdbId: string | number;
  /** "movie" | "tv". */
  type: "movie" | "tv";
  /**
   * TMDB details — used to read `spoken_languages` + `original_language`
   * for the ORIGINAL / SPOKEN section, so we don't need an extra API
   * call for that part.
   */
  details: TMDBDetails | null;
  /**
   * Optional base item — used to read `original_title` for the modal
   * header (purely cosmetic).
   */
  baseItem?: WatchlistItem | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────

/**
 * Build the ORIGINAL / SPOKEN list from TMDB spoken_languages.
 * Falls back to TMDB `original_language` when spoken_languages is empty
 * (matches the resolver's behavior so the UI is consistent with the
 * worker's notion of "original").
 */
function buildOriginalLanguages(
  details: TMDBDetails | null
): NormalizedLanguageApi[] {
  if (!details) return [];
  const out: NormalizedLanguageApi[] = [];
  if (details.spoken_languages && details.spoken_languages.length > 0) {
    for (const sl of details.spoken_languages as TMDBSpokenLanguage[]) {
      if (!sl.iso_639_1) continue;
      out.push({
        code: sl.iso_639_1,
        name: sl.english_name || sl.name || sl.iso_639_1
      });
    }
  }
  if (out.length === 0 && details.original_language) {
    out.push({
      code: details.original_language,
      name: details.original_language.toUpperCase()
    });
  }
  return out;
}

/** Format an ISO timestamp as a relative-time string ("2 days ago"). */
function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "recently";
  const diffMs = Date.now() - then;
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} day${day === 1 ? "" : "s"} ago`;
  const month = Math.floor(day / 30);
  if (month < 12) return `${month} month${month === 1 ? "" : "s"} ago`;
  const year = Math.floor(month / 12);
  return `${year} year${year === 1 ? "" : "s"} ago`;
}

/** Map a confidence level to a display label + color. */
function confidenceMeta(c: DubbedLanguageApi["confidence"]): {
  label: string;
  cls: string;
  icon: string;
} {
  switch (c) {
    case "high":
      return { label: "Verified", cls: "audio-lang-verified", icon: "check_circle" };
    case "medium":
      return { label: "Confirmed", cls: "audio-lang-confirmed", icon: "check" };
    case "low":
      return { label: "Detected", cls: "audio-lang-detected", icon: "sensors" };
  }
}

/** Region code → flag emoji (cosmetic only — uses regional indicator symbols). */
function regionFlag(code: string): string {
  if (!code || code.length !== 2) return "";
  const A = 0x1f1e6;
  const base = "A".charCodeAt(0);
  return String.fromCodePoint(
    A + (code.charCodeAt(0) - base),
    A + (code.charCodeAt(1) - base)
  );
}

// ─── Component ────────────────────────────────────────────────────────

export default function AudioLanguageModal(props: AudioLanguageModalProps) {
  // We fetch on demand — only when the modal is open. The resource is
  // keyed on (tmdbId, type) so opening a different title re-fetches.
  const [retryTick, setRetryTick] = createSignal(0);

  const fetcher = async (): Promise<AudioLanguageApiResponse | null> => {
    if (!props.open) return null;
    const id = props.tmdbId;
    if (!id) return null;
    // Force type=movie for non-tv to keep TS happy — the route also
    // defaults to movie.
    const type = props.type === "tv" ? "tv" : "movie";
    const url = `/api/audio-languages/${encodeURIComponent(String(id))}?type=${type}&region=IN&_r=${retryTick()}`;
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" }
      });
      if (!res.ok) {
        // Surface as an error result — the worker returns 200 even on
        // worker-internal errors, so a non-200 is a real HTTP failure.
        return {
          tmdbId: Number(id),
          type,
          originalLanguages: [],
          dubbedLanguages: [],
          status: "error",
          checkedAt: new Date().toISOString(),
          region: "IN",
          noData: false,
          error: true,
          message: `HTTP ${res.status}`,
          sourceCount: 0,
          fromCache: false
        };
      }
      const json = (await res.json()) as AudioLanguageApiResponse;
      return json;
    } catch (err) {
      return {
        tmdbId: Number(id),
        type,
        originalLanguages: [],
        dubbedLanguages: [],
        status: "error",
        checkedAt: new Date().toISOString(),
        region: "IN",
        noData: false,
        error: true,
        message: err instanceof Error ? err.message : String(err),
        sourceCount: 0,
        fromCache: false
      };
    }
  };

  // Key the resource on open + retryTick + tmdbId so it re-fetches
  // when any of those change.
  const source = () =>
    props.open ? `${props.tmdbId}-${props.type}-${retryTick()}` : null;

  const [data] = createResource(source, fetcher);

  // Original languages come from TMDB details (already in the parent
  // context — no API call needed). Per spec STEP 22, the original-
  // languages section is rendered immediately while the dubbed-audio
  // worker loads in the background.
  const originalLanguages = () => buildOriginalLanguages(props.details);

  // ESC to close (extra safety net on top of GlassModal's built-in ESC).
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && props.open) props.onClose();
  };
  onMount(() => {
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", onKey);
    }
  });
  onCleanup(() => {
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", onKey);
    }
  });

  const titleName = () =>
    props.baseItem?.title ||
    props.baseItem?.name ||
    props.details?.title ||
    props.details?.name ||
    "Title";

  const isMovie = () => props.type === "movie";

  // ─── Render ─────────────────────────────────────────────────────────

  return (
    <GlassModal
      open={props.open}
      onClose={props.onClose}
      title="Language"
      icon="language"
      size="md"
      showCloseButton
      id="audio-language-modal"
    >
      <div class="audio-lang-modal-body">
        {/* ─── ORIGINAL / SPOKEN ─────────────────────────────────── */}
        <section class="audio-lang-section">
          <header class="audio-lang-section-header">
            <h3 class="audio-lang-section-title">Original / Spoken</h3>
            <span class="audio-lang-section-subtitle">
              From TMDB metadata
            </span>
          </header>
          <Show
            when={originalLanguages().length > 0}
            fallback={
              <p class="audio-lang-empty">
                {isMovie() ? "Movie" : "Series"} original language not
                available.
              </p>
            }
          >
            <ul class="audio-lang-list">
              <For each={originalLanguages()}>
                {(lang) => (
                  <li class="audio-lang-item audio-lang-item-original">
                    <span class="audio-lang-item-name">{lang.name}</span>
                    <span class="audio-lang-item-code">{lang.code}</span>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </section>

        {/* ─── DUBBED AUDIO ──────────────────────────────────────── */}
        <section class="audio-lang-section audio-lang-section-dubbed">
          <header class="audio-lang-section-header">
            <h3 class="audio-lang-section-title">Dubbed Audio</h3>
            <Show when={data()}>
              <span class="audio-lang-section-subtitle">
                {data()!.region ? `${regionFlag(data()!.region)} ${data()!.region}` : ""}
                {" · "}
                {data()!.sourceCount} source{data()!.sourceCount === 1 ? "" : "s"}
              </span>
            </Show>
          </header>

          {/* Loading state — show skeleton rows */}
          <Show when={!data() && data.loading}>
            <ul class="audio-lang-list">
              <For each={[1, 2, 3]}>
                {() => (
                  <li class="audio-lang-item audio-lang-item-skeleton">
                    <div class="audio-lang-skeleton-name" />
                    <div class="audio-lang-skeleton-meta" />
                  </li>
                )}
              </For>
            </ul>
            <p class="audio-lang-loading-text">Loading audio languages…</p>
          </Show>

          {/* Error state — never breaks the modal */}
          <Show when={data()?.error}>
            <div class="audio-lang-state audio-lang-state-error">
              <span
                class="material-symbols-outlined audio-lang-state-icon"
                aria-hidden="true"
              >
                error
              </span>
              <div class="audio-lang-state-text">
                <p class="audio-lang-state-title">
                  Unable to retrieve audio-language information.
                </p>
                <p class="audio-lang-state-hint">
                  Try again later. The {isMovie() ? "movie" : "series"}{" "}
                  details are unaffected.
                </p>
                <button
                  type="button"
                  class="audio-lang-retry"
                  onClick={() => setRetryTick((t) => t + 1)}
                >
                  Retry
                </button>
              </div>
            </div>
          </Show>

          {/* No-data state — per spec STEP 10, NOT "no dubs exist" */}
          <Show when={data() && !data()!.error && data()!.noData}>
            <div class="audio-lang-state audio-lang-state-nodata">
              <span
                class="material-symbols-outlined audio-lang-state-icon"
                aria-hidden="true"
              >
                help
              </span>
              <div class="audio-lang-state-text">
                <p class="audio-lang-state-title">
                  No reliable dubbed-audio data found.
                </p>
                <p class="audio-lang-state-hint">
                  None of the available sources reported audio-track
                  information for this title in the {data()?.region ?? "IN"}{" "}
                  region. This does not mean no dubs exist — just that we
                  can't confirm any.
                </p>
              </div>
            </div>
          </Show>

          {/* Success with dubbed languages */}
          <Show
            when={
              data() &&
              !data()!.error &&
              !data()!.noData &&
              data()!.dubbedLanguages.length > 0
            }
          >
            <ul class="audio-lang-list">
              <For each={data()!.dubbedLanguages}>
                {(lang) => {
                  const meta = () => confidenceMeta(lang.confidence);
                  return (
                    <li class="audio-lang-item audio-lang-item-dubbed">
                      <span class="audio-lang-item-name">{lang.name}</span>
                      <span class={`audio-lang-confidence ${meta().cls}`}>
                        <span
                          class="material-symbols-outlined audio-lang-confidence-icon"
                          aria-hidden="true"
                        >
                          {meta().icon}
                        </span>
                        <span class="audio-lang-confidence-label">
                          {meta().label}
                        </span>
                      </span>
                    </li>
                  );
                }}
              </For>
            </ul>
            {/* Series — show season availability if present */}
            <Show
              when={
                !isMovie() &&
                data()?.seasonAvailability &&
                Object.keys(data()!.seasonAvailability!).length > 0
              }
            >
              <details class="audio-lang-seasons">
                <summary class="audio-lang-seasons-summary">
                  Per-season availability
                </summary>
                <ul class="audio-lang-seasons-list">
                  <For
                    each={Object.entries(data()!.seasonAvailability!).sort(
                      ([a], [b]) => Number(a) - Number(b)
                    )}
                  >
                    {([season, codes]) => (
                      <li class="audio-lang-seasons-item">
                        <span class="audio-lang-seasons-label">
                          Season {season}
                        </span>
                        <span class="audio-lang-seasons-codes">
                          {codes.join(", ")}
                        </span>
                      </li>
                    )}
                  </For>
                </ul>
              </details>
            </Show>
          </Show>

          {/* Success with zero dubs found (after subtraction) — distinct from noData */}
          <Show
            when={
              data() &&
              !data()!.error &&
              !data()!.noData &&
              data()!.dubbedLanguages.length === 0
            }
          >
            <div class="audio-lang-state audio-lang-state-nodata">
              <span
                class="material-symbols-outlined audio-lang-state-icon"
                aria-hidden="true"
              >
                info
              </span>
              <div class="audio-lang-state-text">
                <p class="audio-lang-state-title">
                  No dubbed audio tracks detected.
                </p>
                <p class="audio-lang-state-hint">
                  Sources reported audio languages that all match the
                  original/spoken languages — no additional dubs were
                  found.
                </p>
              </div>
            </div>
          </Show>
        </section>

        {/* ─── Footer ───────────────────────────────────────────── */}
        <Show when={data() && !data()!.error}>
          <footer class="audio-lang-footer">
            <span class="audio-lang-footer-text">
              {data()?.fromCache ? "Cached" : "Checked"}{" "}
              {formatRelativeTime(data()!.checkedAt)}
              {data()?.stale ? " · refreshing…" : ""}
            </span>
            <span class="audio-lang-footer-region">
              {regionFlag(data()?.region ?? "IN")} {data()?.region ?? "IN"}
            </span>
          </footer>
        </Show>
      </div>
    </GlassModal>
  );
}
