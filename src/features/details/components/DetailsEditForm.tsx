// src/features/details/components/DetailsEditForm.tsx
import { Show, For, createMemo } from "solid-js";
import type { Accessor } from "solid-js";
import Icon from "~/shared/ui/Icon";
import type { TMDBDetails } from "~/shared/types";

interface DetailsEditFormProps {
  form: Accessor<{
    status: string;
    rating: string;
    watchDate: string;
    notes: string;
    rewatchCount: string;
    rewatchDates: string[];
    seasonDates: Record<string, { start: string; end: string }>;
    seasonRewatchCount: string;
    seasonRewatchDates: Record<string, { start: string; end: string }>[];
  }>;
  setForm: (key: string, value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
  isDirty: boolean;
  /** TMDB details — used to render the per-season structure for series. */
  details?: Accessor<TMDBDetails | null>;
  /** Base item — used to detect series vs movie. */
  isSeries?: Accessor<boolean>;
}

/**
 * DetailsEditForm — inline edit form for a vault item.
 *
 * v2.2 added movie re-watch tracking (stepper + N+1 date inputs).
 *
 * v2.3 adds SERIES per-season tracking:
 *   - For series, the form shows per-season start/end date inputs for
 *     the ORIGINAL watch (one row per season, fetched from TMDB).
 *   - A separate stepper controls seasonRewatchCount (number of re-watch
 *     passes through the series).
 *   - When seasonRewatchCount > 0, N additional sets of per-season
 *     start/end inputs appear (one set per re-watch pass).
 *
 * For movies, the form uses the existing flat rewatchDates array.
 *
 * The form is intentionally compact — every field uses the same dark
 * input treatment so the visual rhythm stays consistent.
 */
export default function DetailsEditForm(props: DetailsEditFormProps) {
  const rewatchCount = () => Number(props.form().rewatchCount) || 0;
  const isSeries = () => props.isSeries?.() ?? false;
  const seasonRewatchCount = () => Number(props.form().seasonRewatchCount) || 0;

  /** Sorted list of season numbers (1-indexed, excludes specials/season 0). */
  const seasons = createMemo<number[]>(() => {
    const d = props.details?.();
    if (!d?.seasons) return [1]; // default to season 1 if no details
    return d.seasons
      .filter((s) => s.season_number > 0)
      .map((s) => s.season_number)
      .sort((a, b) => a - b);
  });

  const incrementRewatch = () => {
    props.setForm("rewatchCount", String(rewatchCount() + 1));
  };
  const decrementRewatch = () => {
    if (rewatchCount() > 0) {
      props.setForm("rewatchCount", String(rewatchCount() - 1));
    }
  };

  const incrementSeasonRewatch = () => {
    props.setForm("seasonRewatchCount", String(seasonRewatchCount() + 1));
  };
  const decrementSeasonRewatch = () => {
    if (seasonRewatchCount() > 0) {
      props.setForm("seasonRewatchCount", String(seasonRewatchCount() - 1));
    }
  };

  /** Write a single date into the rewatchDates array at the given index. */
  const setRewatchDate = (index: number, date: string) => {
    props.setForm("rewatchDates", JSON.stringify({ index, date }));
  };

  /** Write a per-season start/end date for the original series watch. */
  const setSeasonDate = (season: number, field: "start" | "end", date: string) => {
    props.setForm("seasonDates", JSON.stringify({ season: String(season), field, date }));
  };

  /** Write a per-season start/end date for a series re-watch pass. */
  const setSeasonRewatchDate = (
    rewatchIndex: number,
    season: number,
    field: "start" | "end",
    date: string,
  ) => {
    props.setForm(
      "seasonRewatchDates",
      JSON.stringify({ rewatchIndex, season: String(season), field, date }),
    );
  };

  /** Label for each movie date row. Index 0 = "1st Watch", 1 = "Re-watch 1", etc. */
  const dateLabel = (index: number): string =>
    index === 0 ? "1st Watch" : `Re-watch ${index}`;

  return (
    <div
      class="glass-surface p-5 rounded-2xl space-y-5 animate-fade-in border mt-4 shadow-xl"
      style={{"border-color":"var(--border-active)"}}
      role="form"
      aria-label="Edit watchlist entry"
    >
      {/* Status + Rating */}
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label for="edit-status" class="type-label block mb-2" style={{"color":"var(--muted)"}}>Status</label>
          <select
            id="edit-status"
            value={props.form().status}
            onChange={(e) => props.setForm("status", e.currentTarget.value)}
            class="w-full bg-[#0c0e14] border border-white/10 p-3 rounded-xl type-metadata text-white outline-none focus:border-[var(--p)] focus:shadow-[0_0_0_3px_var(--p-dim)] transition-all"
          >
            <option value="Planned">Planned</option>
            <option value="Watching">Watching</option>
            <option value="Completed">Completed</option>
            <option value="Dropped">Dropped</option>
          </select>
        </div>
        <div>
          <label for="edit-rating" class="type-label block mb-2" style={{"color":"var(--muted)"}}>My Rating</label>
          <input
            id="edit-rating"
            type="number"
            step="0.1"
            min="0"
            max="10"
            placeholder="0–10"
            value={props.form().rating}
            onInput={(e) => props.setForm("rating", e.currentTarget.value)}
            class="w-full bg-[#0c0e14] border border-white/10 p-3 rounded-xl type-metadata text-white outline-none focus:border-[var(--p)] focus:shadow-[0_0_0_3px_var(--p-dim)] transition-all"
          />
        </div>
      </div>

      {/* ── MOVIE re-watch tracking (flat list of dates) ── */}
      <Show when={!isSeries()}>
        {/* Re-watch stepper — minus button | count | plus button */}
        <div>
          <label class="type-label block mb-2" style={{"color":"var(--muted)"}}>Re-watches</label>
          <div class="flex items-center gap-3">
            <button
              type="button"
              onClick={decrementRewatch}
              disabled={rewatchCount() === 0}
              aria-label="Decrease re-watch count"
              class="rewatch-stepper-btn"
            >
              <span class="material-symbols-outlined" style={{"font-size":"20px"}} aria-hidden="true">remove</span>
            </button>
            <div class="rewatch-stepper-value" aria-live="polite">
              {rewatchCount()}
            </div>
            <button
              type="button"
              onClick={incrementRewatch}
              aria-label="Increase re-watch count"
              class="rewatch-stepper-btn rewatch-stepper-btn-plus"
            >
              <span class="material-symbols-outlined" style={{"font-size":"20px"}} aria-hidden="true">add</span>
            </button>
            <span class="rewatch-stepper-hint">
              {rewatchCount() === 0
                ? "Watched once"
                : `Watched ${rewatchCount() + 1}× total`}
            </span>
          </div>
        </div>

        {/* Watch dates — single input when count=0, stack of N+1 when > 0 */}
        <Show
          when={rewatchCount() > 0}
          fallback={
            <div>
              <label for="edit-watchdate" class="type-label block mb-2" style={{"color":"var(--muted)"}}>Watch Date</label>
              <input
                id="edit-watchdate"
                type="date"
                value={props.form().watchDate}
                onInput={(e) => {
                  props.setForm("watchDate", e.currentTarget.value);
                  setRewatchDate(0, e.currentTarget.value);
                }}
                class="w-full bg-[#0c0e14] border border-white/10 p-3 rounded-xl type-metadata text-white outline-none focus:border-[var(--p)] focus:shadow-[0_0_0_3px_var(--p-dim)] transition-all [color-scheme:dark]"
              />
            </div>
          }
        >
          <div>
            <label class="type-label block mb-2" style={{"color":"var(--muted)"}}>Watch Dates</label>
            <div class="space-y-2.5">
              <For each={props.form().rewatchDates}>
                {(date, index) => (
                  <div class="rewatch-date-row">
                    <span class="rewatch-date-label">{dateLabel(index())}</span>
                    <input
                      type="date"
                      value={date}
                      onInput={(e) => setRewatchDate(index(), e.currentTarget.value)}
                      class="flex-1 bg-[#0c0e14] border border-white/10 p-2.5 rounded-lg type-metadata text-white outline-none focus:border-[var(--p)] focus:shadow-[0_0_0_3px_var(--p-dim)] transition-all [color-scheme:dark]"
                      aria-label={dateLabel(index())}
                    />
                  </div>
                )}
              </For>
            </div>
          </div>
        </Show>
      </Show>

      {/* ── SERIES per-season watch dates (original watch) ── */}
      <Show when={isSeries()}>
        <div>
          <label class="type-label block mb-2" style={{"color":"var(--muted)"}}>
            Season Watch Dates
          </label>
          <p class="rewatch-stepper-hint" style={{"margin-bottom":"0.5rem"}}>
            Set the start and end date for each season you watched.
          </p>
          <div class="space-y-3">
            <For each={seasons()}>
              {(seasonNum) => {
                const entry = () => props.form().seasonDates[String(seasonNum)] ?? { start: "", end: "" };
                return (
                  <div class="season-date-row">
                    <div class="season-date-label">Season {seasonNum}</div>
                    <div class="season-date-inputs">
                      <input
                        type="date"
                        value={entry().start}
                        onInput={(e) => setSeasonDate(seasonNum, "start", e.currentTarget.value)}
                        class="season-date-input"
                        aria-label={`Season ${seasonNum} start date`}
                      />
                      <span class="season-date-sep" aria-hidden="true">→</span>
                      <input
                        type="date"
                        value={entry().end}
                        onInput={(e) => setSeasonDate(seasonNum, "end", e.currentTarget.value)}
                        class="season-date-input"
                        aria-label={`Season ${seasonNum} end date`}
                      />
                    </div>
                  </div>
                );
              }}
            </For>
          </div>
        </div>

        {/* Series re-watch stepper */}
        <div>
          <label class="type-label block mb-2" style={{"color":"var(--muted)"}}>Series Re-watches</label>
          <div class="flex items-center gap-3">
            <button
              type="button"
              onClick={decrementSeasonRewatch}
              disabled={seasonRewatchCount() === 0}
              aria-label="Decrease series re-watch count"
              class="rewatch-stepper-btn"
            >
              <span class="material-symbols-outlined" style={{"font-size":"20px"}} aria-hidden="true">remove</span>
            </button>
            <div class="rewatch-stepper-value" aria-live="polite">
              {seasonRewatchCount()}
            </div>
            <button
              type="button"
              onClick={incrementSeasonRewatch}
              aria-label="Increase series re-watch count"
              class="rewatch-stepper-btn rewatch-stepper-btn-plus"
            >
              <span class="material-symbols-outlined" style={{"font-size":"20px"}} aria-hidden="true">add</span>
            </button>
            <span class="rewatch-stepper-hint">
              {seasonRewatchCount() === 0
                ? "Watched once"
                : `Re-watched ${seasonRewatchCount()}× total`}
            </span>
          </div>
        </div>

        {/* Per-re-watch per-season date sets — one block per re-watch pass */}
        <Show when={seasonRewatchCount() > 0}>
          <div>
            <label class="type-label block mb-2" style={{"color":"var(--muted)"}}>Re-watch Dates</label>
            <div class="space-y-4">
              <For each={props.form().seasonRewatchDates}>
                {(_seasonMap, rewatchIndex) => (
                  <div class="season-rewatch-block">
                    <div class="season-rewatch-block-header">
                      Re-watch {rewatchIndex() + 1}
                    </div>
                    <div class="space-y-2.5">
                      <For each={seasons()}>
                        {(seasonNum) => {
                          const entry = () => {
                            const arr = props.form().seasonRewatchDates;
                            const m = arr[rewatchIndex()] ?? {};
                            return m[String(seasonNum)] ?? { start: "", end: "" };
                          };
                          return (
                            <div class="season-date-row season-date-row-compact">
                              <div class="season-date-label season-date-label-compact">S{seasonNum}</div>
                              <div class="season-date-inputs">
                                <input
                                  type="date"
                                  value={entry().start}
                                  onInput={(e) => setSeasonRewatchDate(rewatchIndex(), seasonNum, "start", e.currentTarget.value)}
                                  class="season-date-input"
                                  aria-label={`Re-watch ${rewatchIndex() + 1} season ${seasonNum} start`}
                                />
                                <span class="season-date-sep" aria-hidden="true">→</span>
                                <input
                                  type="date"
                                  value={entry().end}
                                  onInput={(e) => setSeasonRewatchDate(rewatchIndex(), seasonNum, "end", e.currentTarget.value)}
                                  class="season-date-input"
                                  aria-label={`Re-watch ${rewatchIndex() + 1} season ${seasonNum} end`}
                                />
                              </div>
                            </div>
                          );
                        }}
                      </For>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </div>
        </Show>
      </Show>

      {/* Notes */}
      <div>
        <label for="edit-notes" class="type-label block mb-2" style={{"color":"var(--muted)"}}>My Notes</label>
        <textarea
          id="edit-notes"
          value={props.form().notes}
          onInput={(e) => props.setForm("notes", e.currentTarget.value)}
          class="w-full bg-[#0c0e14] border border-white/10 p-3 rounded-xl type-metadata text-white outline-none focus:border-[var(--p)] focus:shadow-[0_0_0_3px_var(--p-dim)] transition-all resize-none"
          rows="3"
          placeholder="Write your thoughts, reactions, memorable quotes…"
          style={{"resize":"vertical","min-height":"80px"}}
        />
      </div>

      <div class="flex gap-3 pt-2">
        <button
          onClick={props.onCancel}
          class="flex-1 type-button py-3 rounded-xl border transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: "var(--raised)",
            color: "rgba(232,234,240,0.85)",
            "border-color": "var(--border-active)"
          }}
          disabled={props.isSaving}
        >
          Cancel
        </button>
        <button
          onClick={props.onSave}
          class="flex-[2] type-button py-3 rounded-xl transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: "var(--p)",
            color: "var(--active-text)",
            "box-shadow": "0 0 24px var(--p-glow)"
          }}
          disabled={!props.isDirty || props.isSaving}
        >
          <Show when={!props.isSaving} fallback={<Icon name="progress_activity" class="animate-spin" />}>
            <Icon name="save" class="text-base" aria-hidden="true" />
          </Show>
          {props.isSaving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
