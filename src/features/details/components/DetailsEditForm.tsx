// src/features/details/components/DetailsEditForm.tsx
import { Show } from "solid-js";
import Icon from "~/shared/ui/Icon";

interface DetailsEditFormProps {
  form: () => {
    status: string;
    rating: string;
    watchDate: string;
    notes: string;
  };
  setForm: (key: string, value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
  isDirty: boolean;
}

export default function DetailsEditForm(props: DetailsEditFormProps) {
  return (
    <div
      class="glass-surface p-5 rounded-2xl space-y-5 animate-fade-in border mt-4 shadow-xl"
      style={{"border-color":"var(--border-active)"}}
      role="form"
      aria-label="Edit vault entry"
    >
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

      <div>
        <label for="edit-watchdate" class="type-label block mb-2" style={{"color":"var(--muted)"}}>Watch Date</label>
        <input
          id="edit-watchdate"
          type="date"
          value={props.form().watchDate}
          onInput={(e) => props.setForm("watchDate", e.currentTarget.value)}
          class="w-full bg-[#0c0e14] border border-white/10 p-3 rounded-xl type-metadata text-white outline-none focus:border-[var(--p)] focus:shadow-[0_0_0_3px_var(--p-dim)] transition-all [color-scheme:dark]"
        />
      </div>

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
