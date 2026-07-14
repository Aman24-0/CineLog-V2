// src/features/details/components/DetailsEditForm.tsx
import { Show, For } from "solid-js";
import Icon from "~/shared/ui/Icon";

interface DetailsEditFormProps {
  form: () => {
    status: string;
    rating: string;
    watchDate: string;
    notes: string;
    rewatchCount: string;
    rewatchDates: string[];
  };
  setForm: (key: string, value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
  isDirty: boolean;
}

/**
 * DetailsEditForm — inline edit form for a vault item.
 *
 * v2.2 adds re-watch tracking:
 *   - A stepper (− / N / +) controls rewatchCount.
 *   - When rewatchCount > 0, the single "Watch Date" input is replaced
 *     by a stack of N+1 date inputs: "1st Watch", "Re-watch 1", …,
 *     "Re-watch N". Each input writes to rewatchDates[index] via the
 *     setForm("rewatchDates", JSON) protocol defined in useDetailsForm.
 *   - When rewatchCount = 0, the form falls back to the legacy single
 *     "Watch Date" input (which writes to both watchDate and
 *     rewatchDates[0] so the two never drift).
 *
 * The form is intentionally compact — every field uses the same dark
 * input treatment so the visual rhythm stays consistent.
 */
export default function DetailsEditForm(props: DetailsEditFormProps) {
  const rewatchCount = () => Number(props.form().rewatchCount) || 0;

  const incrementRewatch = () => {
    props.setForm("rewatchCount", String(rewatchCount() + 1));
  };
  const decrementRewatch = () => {
    if (rewatchCount() > 0) {
      props.setForm("rewatchCount", String(rewatchCount() - 1));
    }
  };

  /** Write a single date into the rewatchDates array at the given index. */
  const setRewatchDate = (index: number, date: string) => {
    props.setForm("rewatchDates", JSON.stringify({ index, date }));
  };

  /** Label for each date row. Index 0 = "1st Watch", 1 = "Re-watch 1", etc. */
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
                // Keep rewatchDates[0] in sync so the dates array stays
                // consistent even when the user only edits the legacy
                // single-date field.
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
