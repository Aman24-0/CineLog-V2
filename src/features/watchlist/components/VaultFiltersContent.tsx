// src/features/watchlist/components/VaultFiltersContent.tsx
import { For, Show, createSignal, createEffect, batch, type Accessor } from "solid-js";
import Icon from "~/shared/ui/Icon";
import {
  RangeFilter,
  FilterChips,
  SortControl,
  GlassSelect
} from "./FilterControls";
import type { VaultFilters as FilterType } from "~/shared/types";
import type { FilterPreset } from "~/shared/types";
import { useVault } from "../useVault";
import { addTagDefinition, removeTagDefinition } from "../tagStore";
import type { PlatformFilterOption } from "../hooks/useWatchlistOttAvailability";

/**
 * VaultFiltersContent — the scrollable body of the filter drawer.
 *
 * v2 REDESIGN:
 *   - REMOVED Status filter (now handled by header status chips).
 *   - Type + Region converted from <select> dropdowns to horizontal
 *     selectable chip rows (FilterChips component).
 *   - Platform filter uses the JustWatch provider catalog derived
 *     from the user's watchlist availability in their profile country
 *     (passed via `uniquePlatforms: PlatformFilterOption[]`).
 *   - Metric inputs (IMDb, RT, Year, Runtime) use dark-theme polished
 *     numeric inputs (.filter-range-input class) instead of plain white
 *     text inputs.
 *
 * Chunk 6F Task 1 — ALWAYS-VISIBLE PLATFORM FILTER:
 *   The Platform dropdown was previously HIDDEN when `uniquePlatforms`
 *   was empty (loading / error / no offers). This caused the filter to
 *   "disappear" from the user's perspective, leading to confusion
 *   ("where did the Platform filter go?"). The dropdown is now ALWAYS
 *   rendered — when the catalog is empty it appears in a disabled,
 *   muted state with "All Platforms" as the only option and an
 *   optional muted note ("No platforms available"). This makes it
 *   clear to the user that the filter exists but has no data yet.
 *
 * v2.6.2 (Phase 6.2 Task 1a):
 *   - RE-ADDED Tags filter (was removed in v2 redesign because the
 *     feature wasn't backed by persistence). Now backed by the `tag`
 *     column on the vault table + a localStorage-managed tag vocabulary.
 *   - Added a "Manage Tags" subsection with an input + Add button to
 *     create new tag definitions, and a list with delete buttons to
 *     remove tags (clears from all items + removes from vocabulary).
 *
 * Sections:
 *   1. Content — Type (chips) / Region (chips) / Genre (dropdown) / Platform (dropdown) / Tag (dropdown)
 *   2. Tags Manager — input + list with delete buttons
 *   3. Ratings & Metrics — IMDb / RT / Year / Runtime range inputs (dark theme)
 *   4. Sort By — single dropdown with 9 sort options
 *   5. Presets — save/load/delete named filter presets
 */
export interface VaultFiltersContentProps {
  filters: FilterType;
  setFilters: (v: FilterType) => void;
  uniqueGenres: string[];
  /** Platform filter options derived from JustWatch availability of
   *  the watchlist items in the user's country. Empty while the
   *  batch-availability fetch is in flight, on error, or when no
   *  watchlist item has any JustWatch offer — in all three cases the
   *  Platform dropdown is now RENDERED IN A DISABLED STATE (Chunk 6F
   *  Task 1) rather than hidden, so the user can see the filter
   *  exists. The dropdown becomes interactive as soon as the catalog
   *  populates. */
  uniquePlatforms: PlatformFilterOption[];
  uniqueTags: string[];
  /** Union of tag vocabulary + tags in use. Drives the Tag filter dropdown
   *  and the Manage Tags list. Phase 6.2 Task 1a. */
  uniqueTagsPlus: string[];
  /** Bump to force re-read of tag vocabulary from localStorage. */
  refreshTagVocab: () => void;
  /** CHUNK 6N Task 3 — TEMPORARY debug prop. True while the JustWatch
   *  batch-availability fetch is in flight. Surfaced in the visible
   *  debug line below the Platform dropdown so the user can see the
   *  fetch state without opening the browser console.
   *  Will be removed alongside the other Chunk 6E-6M diagnostic logs. */
  ottLoading: boolean;
  /** CHUNK 6N Task 3 — TEMPORARY debug prop. First 3 raw batch-response
   *  keys as a JSON string (e.g. `["movie:2668","t v:105248"]`). Empty
   *  string before the first fetch completes. Surfaced in the visible
   *  debug line below the Platform dropdown so the user can see the
   *  EXACT shape of the server's response keys without opening the
   *  browser console — this is what the Chunk 6N root cause is about.
   *  Will be removed alongside the other Chunk 6E-6M diagnostic logs. */
  debugRawKeys: string;
  /** CHUNK 6N Task 3 — TEMPORARY debug prop. Number of items in the
   *  user's watchlist. Surfaced in the visible debug line so the user
   *  can verify the watchlist actually loaded (vs. an empty list, which
   *  would correctly produce an empty catalog). Will be removed
   *  alongside the other Chunk 6E-6M diagnostic logs. */
  watchlistSize: number;
  /** CHUNK 6O Task 1 — TEMPORARY debug prop. Coarse-grained OTT fetch
   *  state machine (`'idle' | 'loading' | 'success' | 'error'`).
   *  Surfaced in the visible debug line so the user can tell whether
   *  the fetch never started, is in flight, completed successfully, or
   *  failed — without opening the browser console. Will be removed
   *  alongside the other Chunk 6E-6N diagnostic logs. */
  fetchState: "idle" | "loading" | "success" | "error";
  /** CHUNK 6O Task 1 — TEMPORARY debug prop. Human-readable error
   *  message from the most recent OTT fetch attempt. Empty string
   *  unless `fetchState` is `'error'`. Will be removed alongside the
   *  other Chunk 6E-6N diagnostic logs. */
  fetchError: string;
  /** CHUNK 6P Task 1 — TEMPORARY debug prop. Monotonic counter that
   *  bumps every time the OTT fetch effect actually starts a fetch
   *  (cache-miss path). Surfaced in the visible debug line so the
   *  user can distinguish "stuck on a single run" (runId stable,
   *  state=loading, progress=0/N forever) from "restarting in a
   *  loop" (runId keeps climbing while state=loading). Will be
   *  removed alongside the other Chunk 6E-6O diagnostic logs. */
  effectRunId: number;
  /** CHUNK 6P Task 1 — TEMPORARY debug prop. `${done}/${total}`
   *  progress string updated as each chunk in the OTT batch
   *  resolves. Stays at `0/${total}` until the first wave of
   *  MAX_CONCURRENT_CHUNKS requests completes. Surfaced in the
   *  visible debug line so the user can see whether ANY chunks are
   *  landing (vs. the very first wave hanging). Will be removed
   *  alongside the other Chunk 6E-6O diagnostic logs. */
  chunkProgress: string;
  /** CHUNK 6R Task 5 — TEMPORARY debug prop. Indicates WHERE the
   *  Platform filter's data is coming from: `'local'` (localStorage
   *  cache), `'live'` (network fetch), `'mixed'` (both, during
   *  fetch), or `'none'` (no data available). Surfaced in the
   *  visible debug line as `cache=...`. Will be removed alongside
   *  the other Chunk 6E-6P diagnostic logs. */
  cacheSource: "local" | "live" | "mixed" | "none";
  presets: Accessor<FilterPreset[]>;
  onSavePreset: (name: string) => Promise<void>;
  onDeletePreset: (id: string) => void;
}

export default function VaultFiltersContent(props: VaultFiltersContentProps) {
  const [presetName, setPresetName] = createSignal("");
  const [newTagName, setNewTagName] = createSignal("");
  const [pendingDeleteTag, setPendingDeleteTag] = createSignal<string | null>(null);
  const vault = useVault();

  // Chunk 6F Task 4 — temporary diagnostic log to help diagnose why
  // the Platform filter catalog might be empty. Tracks the unique
  // platforms count and the current platform filter value. Will be
  // removed in a later cleanup chunk alongside the OTT server logs
  // added in Chunk 6E. Logs only counts (no PII / no titles).
  createEffect(() => {
    console.log(
      "[VaultFiltersContent] uniquePlatforms count=" +
        props.uniquePlatforms.length +
        " platformFilter=" +
        props.filters.platform
    );
  });

  /** Batched setFilters — wraps each filter update in batch() so the
      filtered memo re-computes ONCE instead of triggering cascading
      micro-renders. */
  const batchedSet = (patch: Partial<FilterType>) => {
    batch(() => props.setFilters({ ...props.filters, ...patch }));
  };

  const handleSavePreset = async () => {
    if (!presetName().trim()) return;
    await props.onSavePreset(presetName().trim());
    setPresetName("");
  };

  // ── Tag CRUD handlers (Phase 6.2 Task 1a) ───────────────────────────
  //
  // Add: writes the new tag name to localStorage (tagStore.addTagDefinition)
  //   and bumps refreshTagVocab so the dropdown + list update immediately.
  //   If the tag already exists (case-insensitive), addTagDefinition is a
  //   no-op — we still refresh so the UI is consistent.
  //
  // Delete: two-step. First tap shows a confirm state (pendingDeleteTag).
  //   Second tap calls vault.clearTagFromAllItems (SQL UPDATE on the vault
  //   table clearing `tag` where it equals tagName) + removeTagDefinition
  //   (localStorage). The local watchlist signal is updated optimistically
  //   inside clearTagFromAllItems, so the Tags filter dropdown re-renders
  //   with the tag gone. We also reset the active tag filter to "all" if
  //   the user just deleted the currently-selected tag.
  const handleAddTag = () => {
    const name = newTagName().trim();
    if (!name) return;
    addTagDefinition(name);
    props.refreshTagVocab();
    setNewTagName("");
  };

  const handleDeleteTag = async (tagName: string) => {
    // Second tap: confirmed — actually delete.
    try {
      await vault.clearTagFromAllItems(tagName);
      removeTagDefinition(tagName);
      props.refreshTagVocab();
      // If the deleted tag was the active filter, reset to "all".
      if (props.filters.tag === tagName) {
        batchedSet({ tag: "all" });
      }
    } catch {
      // clearTagFromAllItems already shows an error toast on failure.
      // Just clear the pending state so the user can retry.
    } finally {
      setPendingDeleteTag(null);
    }
  };

  const handleTagDeleteClick = (tagName: string) => {
    // First tap: enter confirm state. Second tap within 3s: actually delete.
    if (pendingDeleteTag() === tagName) {
      void handleDeleteTag(tagName);
    } else {
      setPendingDeleteTag(tagName);
      // Auto-clear the confirm state after 3s so a stray tap doesn't
      // leave a delete button looking "armed".
      setTimeout(() => {
        setPendingDeleteTag((cur) => (cur === tagName ? null : cur));
      }, 3000);
    }
  };

  return (
    <div
      class="hide-scrollbar flex-1 space-y-4 overflow-y-auto px-6 py-4"
      style={{
        "overscroll-behavior": "contain"
      }}
    >
      {/* CONTENT section — Status REMOVED. Type/Region are chips.
          Tag filter RE-ADDED in Phase 6.2 Task 1a (was removed in v2). */}
      <div>
        <p class="filter-section-title">Content</p>
        <div class="space-y-3">
          {/* Type — chip selector (was a dropdown) */}
          <FilterChips
            label="Type"
            val={props.filters.type}
            set={(v) => batchedSet({ type: v })}
            opts={[
              { l: "All", v: "all" },
              { l: "Movies", v: "movie" },
              { l: "Series", v: "tv" }
            ]}
          />
          {/* Region — chip selector (was a dropdown) */}
          <FilterChips
            label="Region"
            val={props.filters.region}
            set={(v) => batchedSet({ region: v })}
            opts={[
              { l: "All", v: "all" },
              { l: "Indian", v: "Indian" },
              { l: "International", v: "International" }
            ]}
          />
          {/* Genre — custom dark-glass dropdown (was native <select>, which
              opened an OS-default modal that broke the dark theme on mobile).
              Long list, so chips would overflow — a dropdown is the right
              pattern. Opens DOWNWARDS (top-full mt-2) because the Content
              section is at the top of the drawer. */}
          <GlassSelect
            label="Genre"
            val={props.filters.genre}
            set={(v) => batchedSet({ genre: v })}
            opts={[
              { l: "All Genres", v: "all" },
              ...props.uniqueGenres.map((g) => ({ l: g, v: g }))
            ]}
          />
          {/* Platform — JustWatch provider catalog (Chunk 6).
              Each option's value is the JustWatch `technicalName` (what
              `matchesPlatform` compares against `m.justwatchProviders`);
              the label is the human-readable `clearName`.

              Chunk 6F Task 1 — ALWAYS VISIBLE (was previously hidden
              when the catalog was empty). The dropdown now renders in
              ALL states:
                1. Catalog populated → normal interactive dropdown with
                   "All Platforms" + provider options.
                2. Catalog empty (loading / fetch error / no offers in
                   country) → DISABLED dropdown showing only "All
                   Platforms" + a muted "No platforms available" note.
              This makes it clear to the user that the filter EXISTS —
              previously they reported "Platform filter is missing"
              because the dropdown was simply hidden whenever the
              JustWatch fetch hadn't yet returned usable data.

              If a Platform filter was already active when the catalog
              becomes empty (e.g. user removed all watchlist items),
              the filter value remains "all" or resets via the user's
              own clear action — we do NOT forcibly reset it here
              because the catalog may be transiently empty during a
              refetch and we don't want to wipe the user's selection. */}
          <GlassSelect
            label="Platform"
            val={props.filters.platform}
            set={(v) => batchedSet({ platform: v })}
            disabled={props.uniquePlatforms.length === 0}
            opts={[
              { l: "All Platforms", v: "all" },
              ...props.uniquePlatforms.map((p) => ({
                // CHUNK 6K Task 5 — defensive: prefer clearName, fall
                // back to technicalName. The providerCatalog memo
                // already guarantees clearName is non-empty (falls
                // back to technicalName when packageMeta is missing),
                // but this `||` makes the contract explicit and
                // protects against any future regression.
                l: p.clearName || p.technicalName,
                v: p.technicalName
              }))
            ]}
          />
          <Show when={props.uniquePlatforms.length === 0}>
            <p
              class="type-body-soft"
              style={{
                "font-size": "0.625rem",
                "margin-top": "-0.25rem",
                "margin-left": "0.125rem",
                opacity: "0.7"
              }}
            >
              No platforms available
            </p>
          </Show>
          {/* CHUNK 6N Task 3 — TEMPORARY visible debug line.
              Rendered unconditionally (regardless of catalog state) so
              the user can see the EXACT runtime state of the OTT fetch
              without opening the browser DevTools console (which is
              hard on a phone). Shows:
                - watchlist size (verifies the watchlist actually loaded)
                - OTT loading state (true while a fetch is in flight)
                - provider catalog size (0 means no providers reached
                  the dropdown — the bug we're chasing)
                - first 3 raw batch-response keys (the EXACT shape of
                  the server's response keys, including any stray
                  whitespace that would cause a key-mismatch)
              Will be removed alongside the other Chunk 6E-6M logs.
              CHUNK 6O Task 4 — EXTENDED to also show:
                - fetchState ('idle' | 'loading' | 'success' | 'error')
                  so the user can tell whether the fetch never started,
                  is in flight, completed, or failed. This is the key
                  diagnostic that was missing in Chunk 6N — the user
                  saw `loading=true` forever with no indication of
                  whether the fetch was actually progressing, stuck in
                  a retry loop, or had failed silently.
                - fetchError (human-readable error message) so the user
                  can see WHY the fetch failed (e.g. "all chunks
                  returned empty", "runBatch threw: ...") without
                  opening the console.
              CHUNK 6P Task 5 — EXTENDED to also show:
                - effectRunId (monotonic counter) so the user can tell
                  whether the effect is stuck on a single run (runId
                  stable, state=loading forever) or restarting in a
                  loop (runId keeps climbing while state=loading).
                - chunkProgress (`${done}/${total}`) so the user can
                  see whether ANY chunks are landing (vs. the very
                  first wave hanging — progress stays at 0/N).
                - The 20s hard timeout (Task 4) will also flip state
                  to `error` with `timeout after 20000ms; progress=…`
                  if the fetch hangs, which will surface in the
                  `error=` field. */}
          <p
            style={{
              "font-size": "11px",
              "color": "#ff8c00",
              "padding": "6px 8px",
              "background": "rgba(255,140,0,0.06)",
              "border-radius": "6px",
              "margin-top": "0.25rem",
              "margin-left": "0.125rem",
              "white-space": "pre-wrap",
              "word-break": "break-all",
              "line-height": "1.5",
              "font-family": "ui-monospace, SFMono-Regular, Menlo, monospace"
            }}
          >
            {`DEBUG:
watchlist=${props.watchlistSize}
state=${props.fetchState}
loading=${props.ottLoading ? "true" : "false"}
catalog=${props.uniquePlatforms.length}
run=${props.effectRunId}
progress=${props.chunkProgress || "(none yet)"}
keys=${props.debugRawKeys || "(none yet)"}
cache=${props.cacheSource}
error=${props.fetchError || "none"}`}
          </p>
          {/* Tag — RE-ADDED in Phase 6.2 Task 1a.
              Shows the union of (tag vocabulary in localStorage) ∪ (tags
              currently in use on vault items). When the user picks a tag,
              the filter narrows to items with that tag value. */}
          <GlassSelect
            label="Tag"
            val={props.filters.tag}
            set={(v) => batchedSet({ tag: v })}
            opts={[
              { l: "All Tags", v: "all" },
              ...props.uniqueTagsPlus.map((t) => ({ l: t, v: t }))
            ]}
          />
        </div>
      </div>

      {/* TAGS MANAGER — Phase 6.2 Task 1a.
          Lets the user create new tag definitions (saved to localStorage)
          and remove existing tags (clears from all vault items + removes
          from the vocabulary). Deleting is a two-tap action: first tap
          arms the delete button (shows "Confirm?"), second tap executes. */}
      <div>
        <p class="filter-section-title">Manage Tags</p>
        <div class="space-y-3">
          {/* Add new tag — input + Add button. Enter key also submits. */}
          <div class="flex gap-2">
            <input
              value={newTagName()}
              onInput={(e) => setNewTagName(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddTag();
              }}
              placeholder="New tag name (e.g. Weekend Watch)"
              class="filter-range-input"
              style={{ flex: 1 }}
              maxLength={40}
            />
            <button
              onClick={handleAddTag}
              disabled={!newTagName().trim()}
              class="type-meta rounded-xl px-3 py-2 transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              style={{
                background: "var(--p)",
                color: "var(--active-text)",
                "font-size": "0.5625rem",
                "font-weight": 800
              }}
            >
              Add
            </button>
          </div>
          {/* List of existing tags with delete buttons.
              Empty state is shown when the user has no tags defined AND
              no items have tags set. */}
          <Show
            when={props.uniqueTagsPlus.length > 0}
            fallback={
              <p
                class="type-body-soft"
                style={{
                  "font-size": "0.75rem",
                  "text-align": "center",
                  padding: "var(--sp-3)"
                }}
              >
                No tags yet. Create one above.
              </p>
            }
          >
            <div
              class="hide-scrollbar max-h-40 space-y-2 overflow-y-auto"
              style={{ "overscroll-behavior": "contain" }}
            >
              <For each={props.uniqueTagsPlus}>
                {(tag) => {
                  // Show a small dot indicator if the tag is currently
                  // applied to at least one item (vs. just a definition).
                  const inUse = () => props.uniqueTags.includes(tag);
                  const isPending = () => pendingDeleteTag() === tag;
                  return (
                    <div
                      class="flex items-center justify-between gap-2 rounded-xl p-2.5 transition-all"
                      style={{
                        background: "var(--glass-bg-strong)",
                        border: "1px solid var(--hairline)"
                      }}
                    >
                      <div class="flex min-w-0 flex-1 items-center gap-2">
                        <Icon
                          name="bookmark"
                          style={{
                            "font-size": "14px",
                            color: inUse() ? "var(--p)" : "var(--text-soft)"
                          }}
                          aria-hidden="true"
                        />
                        <span class="truncate text-sm text-white">{tag}</span>
                        <Show when={inUse()}>
                          <span
                            class="type-meta shrink-0 rounded-full px-1.5 py-0.5"
                            style={{
                              "font-size": "0.5rem",
                              background: "var(--p)",
                              color: "var(--active-text)",
                              opacity: 0.7
                            }}
                          >
                            IN USE
                          </span>
                        </Show>
                      </div>
                      <button
                        onClick={() => handleTagDeleteClick(tag)}
                        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors"
                        style={{
                          background: isPending()
                            ? "rgba(239,68,68,0.15)"
                            : "transparent",
                          color: isPending() ? "#ef4444" : "#9ca3af"
                        }}
                        onMouseEnter={(e) => {
                          if (!isPending()) {
                            e.currentTarget.style.background =
                              "rgba(239,68,68,0.1)";
                            e.currentTarget.style.color = "#ef4444";
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isPending()) {
                            e.currentTarget.style.background = "transparent";
                            e.currentTarget.style.color = "#9ca3af";
                          }
                        }}
                        aria-label={
                          isPending()
                            ? `Confirm delete tag ${tag}`
                            : `Delete tag ${tag}`
                        }
                        title={
                          isPending() ? "Tap again to confirm" : "Delete tag"
                        }
                      >
                        <Icon
                          name={isPending() ? "delete" : "delete"}
                          style={{ "font-size": "14px" }}
                          aria-hidden="true"
                        />
                      </button>
                    </div>
                  );
                }}
              </For>
            </div>
          </Show>
        </div>
      </div>

      {/* RATINGS & METRICS section — dark-theme polished inputs */}
      <div>
        <p class="filter-section-title">Ratings & Metrics</p>
        <div class="space-y-3">
          <RangeFilter
            label="IMDb"
            min={props.filters.imdbMin}
            max={props.filters.imdbMax}
            setMin={(v) => batchedSet({ imdbMin: v })}
            setMax={(v) => batchedSet({ imdbMax: v })}
            minPlaceholder="0"
            maxPlaceholder="10"
          />
          <RangeFilter
            label="Rotten Tomatoes %"
            min={props.filters.rtMin}
            max={props.filters.rtMax}
            setMin={(v) => batchedSet({ rtMin: v })}
            setMax={(v) => batchedSet({ rtMax: v })}
            minPlaceholder="0"
            maxPlaceholder="100"
          />
          <RangeFilter
            label="Year"
            min={props.filters.yearMin}
            max={props.filters.yearMax}
            setMin={(v) => batchedSet({ yearMin: v })}
            setMax={(v) => batchedSet({ yearMax: v })}
            minPlaceholder="1990"
            maxPlaceholder="2026"
          />
          <RangeFilter
            label="Runtime (min)"
            min={props.filters.runtimeMin}
            max={props.filters.runtimeMax}
            setMin={(v) => batchedSet({ runtimeMin: v })}
            setMax={(v) => batchedSet({ runtimeMax: v })}
            minPlaceholder="Min"
            maxPlaceholder="Max"
          />
        </div>
      </div>

      {/* SORT section — v2.9 redesign.
          SortControl now takes the full `filters` object + an `onChange`
          callback (replacing the previous field/direction/setField/
          setDirection quad). The control owns nothing — the parent stays
          the single source of truth. `onChange` receives a partial
          `{ sortField, sortDirection }` slice which `batchedSet` merges
          into the filter store in a single batched update. */}
      <div>
        <p class="filter-section-title">Sort By</p>
        <SortControl
          filters={props.filters}
          onChange={(next) => batchedSet(next)}
        />
      </div>

      {/* PRESETS section */}
      <div>
        <p class="filter-section-title">Presets</p>
        <div class="mb-3 flex gap-2">
          <input
            value={presetName()}
            onInput={(e) => setPresetName(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSavePreset();
            }}
            placeholder="New preset name"
            class="filter-range-input"
            style={{ flex: 1 }}
          />
          <button
            onClick={handleSavePreset}
            disabled={!presetName().trim()}
            class="type-meta rounded-xl px-3 py-2 transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              background: "var(--p)",
              color: "var(--active-text)",
              "font-size": "0.5625rem",
              "font-weight": 800
            }}
          >
            Save
          </button>
        </div>
        <div
          class="hide-scrollbar max-h-40 space-y-2 overflow-y-auto"
          style={{ "overscroll-behavior": "contain" }}
        >
          <Show
            when={props.presets().length > 0}
            fallback={
              <p
                class="type-body-soft"
                style={{
                  "font-size": "0.75rem",
                  "text-align": "center",
                  padding: "var(--sp-3)"
                }}
              >
                No presets saved yet
              </p>
            }
          >
            <For each={props.presets()}>
              {(preset) => (
                <div
                  class="flex items-center justify-between gap-2 rounded-xl p-2.5 transition-all"
                  style={{
                    background: "var(--glass-bg-strong)",
                    border: "1px solid var(--hairline)"
                  }}
                >
                  <button
                    class="flex flex-1 items-center gap-2 truncate px-1 text-left text-sm text-white transition-colors hover:text-[var(--p)]"
                    onClick={() =>
                      batch(() => props.setFilters(preset.filters))
                    }
                  >
                    <Icon
                      name="bookmark"
                      style={{ "font-size": "14px", color: "var(--p)" }}
                      aria-hidden="true"
                    />
                    <span class="truncate">{preset.name}</span>
                  </button>
                  <button
                    onClick={() => props.onDeletePreset(preset.id)}
                    class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-red-400 transition-colors hover:bg-red-500/10"
                    aria-label={`Delete ${preset.name}`}
                  >
                    <Icon
                      name="delete"
                      style={{ "font-size": "14px" }}
                      aria-hidden="true"
                    />
                  </button>
                </div>
              )}
            </For>
          </Show>
        </div>
      </div>
    </div>
  );
}
