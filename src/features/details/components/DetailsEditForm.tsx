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
 * v2.6 — SEGMENTED RATING CONTROL:
 *   The "My Rating" input is now a horizontal button group with 10
 *   buttons (1–10) instead of a number input. Clicking a button sets
 *   the rating to that value; the active button is highlighted with
 *   the accent color. A separate "Clear" button (visible only when a
 *   rating is selected) resets the rating to 0/unrated. The segmented
 *   control is more tactile and discoverable than a number input —
 *   the user sees the full scale at a glance and taps the desired
 *   score, no typing required. The control wraps on narrow viewports
 *   and is keyboard-accessible (each button is a real <button>).
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

  /**
   * The current rating as a number (0 when unset/non-numeric).
   * Used to highlight the active segment button.
   */
  const ratingValue = () => {
    const n = Number(props.form().rating);
    return Number.isFinite(n) ? n : 0;
  };

  /** Set the rating to a specific integer 1–10. */
  const setRating = (n: number) => {
    props.setForm("rating", String(n));
  };

  /** Clear the rating back to 0 (unrated). */
  const clearRating = () => {
    props.setForm("rating", "0");
  };

  const MAX_REWATCH_COUNT = 99;
  const incrementRewatch = () => {
    if (rewatchCount() < MAX_REWATCH_COUNT) {
      props.setForm("rewatchCount", String(rewatchCount() + 1));
    }
  };
  const decrementRewatch = () => {
    if (rewatchCount() > 0) {
      props.setForm("rewatchCount", String(rewatchCount() - 1));
    }
  };

  const incrementSeasonRewatch = () => {
    if (seasonRewatchCount() < MAX_REWATCH_COUNT) {
      props.setForm("seasonRewatchCount", String(seasonRewatchCount() + 1));
    }
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
  const setSeasonDate = (
    season: number,
    field: "start" | "end",
    date: string
  ) => {
    props.setForm(
      "seasonDates",
      JSON.stringify({ season: String(season), field, date })
    );
  };

  /** Write a per-season start/end date for a series re-watch pass. */
  const setSeasonRewatchDate = (
    rewatchIndex: number,
    season: number,
    field: "start" | "end",
    date: string
  ) => {
    props.setForm(
      "seasonRewatchDates",
      JSON.stringify({ rewatchIndex, season: String(season), field, date })
    );
  };

  /** Label for each movie date row. Index 0 = "1st Watch", 1 = "Re-watch 1", etc. */
  const dateLabel = (index: number): string =>
    index === 0 ? "1st Watch" : `Re-watch ${index}`;

  return (
    <div
      class="glass-surface animate-fade-in mt-4 space-y-5 rounded-2xl border p-5 shadow-xl"
      style={{ "border-color": "var(--border-active)" }}
      role="form"
      aria-label="Edit watchlist entry"
    >
      {/* My Rating — segmented control (v2.6).
          Replaces the old <input type="number">. Ten buttons (1–10) in
          a flex-wrap row; clicking sets the rating; the active button
          is highlighted with the accent color. A "Clear" button appears
          only when a rating is selected, letting the user reset to 0.

          The Status dropdown was removed from this form (v2.5): status
          is the ActionDock's primary control (4 dedicated buttons that
          set the status directly via handleSetStatus). Letting the user
          set it again here caused confusion when the two controls
          disagreed. Status can still be changed at any time via the
          ActionDock, which remains visible above the edit form. */}
      <div>
        <div class="mb-2 flex items-center justify-between">
          <label class="type-label block" style={{ color: "var(--muted)" }}>
            My Rating
          </label>
          <Show when={ratingValue() > 0}>
            <button
              type="button"
              class="rating-segmented-clear"
              onClick={clearRating}
              aria-label="Clear rating"
            >
              Clear
            </button>
          </Show>
        </div>
        <div
          class="rating-segmented-control"
          role="radiogroup"
          aria-label="My rating from 1 to 10"
        >
          <For each={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}>
            {(n) => {
              const isSelected = () => ratingValue() === n;
              return (
                <button
                  type="button"
                  class="rating-segmented-btn"
                  classList={{ "rating-segmented-btn-active": isSelected() }}
                  role="radio"
                  aria-checked={isSelected()}
                  aria-label={`Rate ${n} out of 10`}
                  onClick={() => setRating(n)}
                >
                  {n}
                </button>
              );
            }}
          </For>
        </div>
      </div>

      {/* ── MOVIE re-watch tracking (flat list of dates) ── */}
      <Show when={!isSeries()}>
        {/* Re-watch stepper — minus button | count | plus button */}
        <div>
          <label
            class="type-label mb-2 block"
            style={{ color: "var(--muted)" }}
          >
            Re-watches
          </label>
          <div class="flex items-center gap-3">
            <button
              type="button"
              onClick={decrementRewatch}
              disabled={rewatchCount() === 0}
              aria-label="Decrease re-watch count"
              class="rewatch-stepper-btn"
            >
              <span
                class="material-symbols-outlined"
                style={{ "font-size": "20px" }}
                aria-hidden="true"
              >
                remove
              </span>
            </button>
            <div class="rewatch-stepper-value" aria-live="polite">
              {rewatchCount()}
            </div>
            <button
              type="button"
              onClick={incrementRewatch}
              disabled={rewatchCount() >= MAX_REWATCH_COUNT}
              aria-label="Increase re-watch count"
              class="rewatch-stepper-btn rewatch-stepper-btn-plus"
            >
              <span
                class="material-symbols-outlined"
                style={{ "font-size": "20px" }}
                aria-hidden="true"
              >
                add
              </span>
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
              <label
                for="edit-watchdate"
                class="type-label mb-2 block"
                style={{ color: "var(--muted)" }}
              >
                Watch Date
              </label>
              <input
                id="edit-watchdate"
                type="date"
                value={props.form().watchDate}
                onInput={(e) => {
                  props.setForm("watchDate", e.currentTarget.value);
                  setRewatchDate(0, e.currentTarget.value);
                }}
                class="type-metadata w-full rounded-xl border border-white/10 bg-[var(--tier-1)] p-3 text-white outline-none transition-all [color-scheme:dark] focus:border-[var(--p)] focus:shadow-[0_0_0_3px_var(--p-dim)]"
              />
            </div>
          }
        >
          <div>
            <label
              class="type-label mb-2 block"
              style={{ color: "var(--muted)" }}
            >
              Watch Dates
            </label>
            <div class="space-y-2.5">
              <For each={props.form().rewatchDates}>
                {(date, index) => (
                  <div class="rewatch-date-row">
                    <span class="rewatch-date-label">{dateLabel(index())}</span>
                    <input
                      type="date"
                      value={date}
                      onInput={(e) =>
                        setRewatchDate(index(), e.currentTarget.value)
                      }
                      class="type-metadata flex-1 rounded-lg border border-white/10 bg-[var(--tier-1)] p-2.5 text-white outline-none transition-all [color-scheme:dark] focus:border-[var(--p)] focus:shadow-[0_0_0_3px_var(--p-dim)]"
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
          <label
            class="type-label mb-2 block"
            style={{ color: "var(--muted)" }}
          >
            Season Watch Dates
          </label>
          <p class="rewatch-stepper-hint" style={{ "margin-bottom": "0.5rem" }}>
            Set the start and end date for each season you watched.
          </p>
          <div class="space-y-3">
            <For each={seasons()}>
              {(seasonNum) => {
                const entry = () =>
                  props.form().seasonDates[String(seasonNum)] ?? {
                    start: "",
                    end: ""
                  };
                return (
                  <div class="season-date-row">
                    <div class="season-date-label">Season {seasonNum}</div>
                    <div class="season-date-inputs">
                      <input
                        type="date"
                        value={entry().start}
                        onInput={(e) =>
                          setSeasonDate(
                            seasonNum,
                            "start",
                            e.currentTarget.value
                          )
                        }
                        class="season-date-input"
                        aria-label={`Season ${seasonNum} start date`}
                      />
                      <span class="season-date-sep" aria-hidden="true">
                        →
                      </span>
                      <input
                        type="date"
                        value={entry().end}
                        onInput={(e) =>
                          setSeasonDate(seasonNum, "end", e.currentTarget.value)
                        }
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
          <label
            class="type-label mb-2 block"
            style={{ color: "var(--muted)" }}
          >
            Series Re-watches
          </label>
          <div class="flex items-center gap-3">
            <button
              type="button"
              onClick={decrementSeasonRewatch}
              disabled={seasonRewatchCount() === 0}
              aria-label="Decrease series re-watch count"
              class="rewatch-stepper-btn"
            >
              <span
                class="material-symbols-outlined"
                style={{ "font-size": "20px" }}
                aria-hidden="true"
              >
                remove
              </span>
            </button>
            <div class="rewatch-stepper-value" aria-live="polite">
              {seasonRewatchCount()}
            </div>
            <button
              type="button"
              onClick={incrementSeasonRewatch}
              disabled={seasonRewatchCount() >= MAX_REWATCH_COUNT}
              aria-label="Increase series re-watch count"
              class="rewatch-stepper-btn rewatch-stepper-btn-plus"
            >
              <span
                class="material-symbols-outlined"
                style={{ "font-size": "20px" }}
                aria-hidden="true"
              >
                add
              </span>
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
            <label
              class="type-label mb-2 block"
              style={{ color: "var(--muted)" }}
            >
              Re-watch Dates
            </label>
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
                            return (
                              m[String(seasonNum)] ?? { start: "", end: "" }
                            );
                          };
                          return (
                            <div class="season-date-row season-date-row-compact">
                              <div class="season-date-label season-date-label-compact">
                                S{seasonNum}
                              </div>
                              <div class="season-date-inputs">
                                <input
                                  type="date"
                                  value={entry().start}
                                  onInput={(e) =>
                                    setSeasonRewatchDate(
                                      rewatchIndex(),
                                      seasonNum,
                                      "start",
                                      e.currentTarget.value
                                    )
                                  }
                                  class="season-date-input"
                                  aria-label={`Re-watch ${rewatchIndex() + 1} season ${seasonNum} start`}
                                />
                                <span
                                  class="season-date-sep"
                                  aria-hidden="true"
                                >
                                  →
                                </span>
                                <input
                                  type="date"
                                  value={entry().end}
                                  onInput={(e) =>
                                    setSeasonRewatchDate(
                                      rewatchIndex(),
                                      seasonNum,
                                      "end",
                                      e.currentTarget.value
                                    )
                                  }
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
        <label
          for="edit-notes"
          class="type-label mb-2 block"
          style={{ color: "var(--muted)" }}
        >
          My Notes
        </label>
        <textarea
          id="edit-notes"
          value={props.form().notes}
          onInput={(e) => props.setForm("notes", e.currentTarget.value)}
          class="type-metadata w-full resize-none rounded-xl border border-white/10 bg-[var(--tier-1)] p-3 text-white outline-none transition-all focus:border-[var(--p)] focus:shadow-[0_0_0_3px_var(--p-dim)]"
          rows="3"
          placeholder="Write your thoughts, reactions, memorable quotes…"
          style={{ resize: "vertical", "min-height": "80px" }}
        />
      </div>

      <div class="flex gap-3 pt-2">
        <button
          onClick={() => props.onCancel()}
          class="type-button flex-1 rounded-xl border py-3 transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
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
          onClick={() => props.onSave()}
          class="type-button flex flex-[2] items-center justify-center gap-2 rounded-xl py-3 transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            background: "var(--p)",
            color: "var(--active-text)",
            "box-shadow": "0 0 24px var(--p-glow)"
          }}
          disabled={!props.isDirty || props.isSaving}
        >
          <Show
            when={!props.isSaving}
            fallback={<Icon name="progress_activity" class="animate-spin" />}
          >
            <Icon name="save" class="text-base" aria-hidden="true" />
          </Show>
          {props.isSaving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
