// src/features/watchlist/components/VaultFiltersContent.tsx
import { For, Show, createSignal, batch, type Accessor } from "solid-js";
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

/**
 * VaultFiltersContent — the scrollable body of the filter drawer.
 *
 * v2 REDESIGN:
 *   - REMOVED Status filter (now handled by header status chips).
 *   - Type + Region converted from <select> dropdowns to horizontal
 *     selectable chip rows (FilterChips component).
 *   - Platform filter uses the dynamic TMDB provider list from
 *     streamingProviders preference (passed via uniquePlatforms).
 *   - Metric inputs (IMDb, RT, Year, Runtime) use dark-theme polished
 *     numeric inputs (.filter-range-input class) instead of plain white
 *     text inputs.
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
  uniquePlatforms: string[];
  uniqueTags: string[];
  /** Union of tag vocabulary + tags in use. Drives the Tag filter dropdown
   *  and the Manage Tags list. Phase 6.2 Task 1a. */
  uniqueTagsPlus: string[];
  /** Bump to force re-read of tag vocabulary from localStorage. */
  refreshTagVocab: () => void;
  presets: Accessor<FilterPreset[]>;
  onSavePreset: (name: string) => Promise<void>;
  onDeletePreset: (id: string) => void;
}

export default function VaultFiltersContent(props: VaultFiltersContentProps) {
  const [presetName, setPresetName] = createSignal("");
  const [newTagName, setNewTagName] = createSignal("");
  const [pendingDeleteTag, setPendingDeleteTag] = createSignal<string | null>(null);
  const vault = useVault();

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
          {/* Platform — custom dark-glass dropdown populated from the user's
              vault platformsList data (uniquePlatforms from useVaultFiltering).
              Same GlassSelect pattern as Genre above. */}
          <GlassSelect
            label="Platform"
            val={props.filters.platform}
            set={(v) => batchedSet({ platform: v })}
            opts={[
              { l: "All Platforms", v: "all" },
              ...props.uniquePlatforms.map((p) => ({ l: p, v: p }))
            ]}
          />
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
