// src/features/details/DetailsModal/useDetailsForm.ts
import { createSignal, createEffect, createMemo } from "solid-js";
import type { Accessor } from "solid-js";
import type { WatchlistItem } from "~/shared/types";
import type { DetailsFormState } from "./types";

/**
 * useDetailsForm — owns the inline edit-form state for the Details modal.
 *
 * The form reflects the vaultItem's user-owned fields (status, rating,
 * watchDate, notes, rewatchCount, rewatchDates). When vaultItem changes
 * (e.g. user navigates to a related title, or adds a non-vault title to
 * the vault), the form resets to the new vaultItem's values — or to
 * defaults when the title is not in the vault.
 *
 * Re-watch field normalisation:
 *   - rewatchCount is stored as a string in the form (stepper writes
 *     strings) but persisted as a number.
 *   - rewatchDates is always an array of length rewatchCount + 1.
 *     When the user increments the stepper, a new empty string is
 *     pushed. When decremented, the last entry is popped.
 *   - watchDate (the legacy single-date field) is kept in sync with
 *     rewatchDates[0] so the existing display + save logic still works.
 *
 * Returns:
 *   - form: accessor for the current form state
 *   - setForm: setter for a single field (key/value)
 *   - isDirty: whether the form has unsaved changes vs the vaultItem
 *   - resetTo: manually reset the form to a specific vaultItem
 *   - setIsEditing: signal setter for the edit/view toggle
 *   - isEditing: signal accessor for the edit/view toggle
 */
export interface UseDetailsFormResult {
  form: Accessor<DetailsFormState>;
  setForm: (key: string, value: string) => void;
  isDirty: Accessor<boolean>;
  resetTo: (vaultItem: WatchlistItem | null) => void;
  isEditing: Accessor<boolean>;
  setIsEditing: (v: boolean) => void;
}

export function useDetailsForm(
  vaultItem: Accessor<WatchlistItem | null>,
): UseDetailsFormResult {
  const [isEditing, setIsEditing] = createSignal(false);
  const [form, setFormState] = createSignal<DetailsFormState>({
    status: "Planned",
    rating: "",
    watchDate: "",
    notes: "",
    rewatchCount: "0",
    rewatchDates: [],
  });

  const resetTo = (v: WatchlistItem | null) => {
    if (v) {
      const count = v.rewatchCount ?? 0;
      // Build the dates array. If rewatchDates is missing or the wrong
      // length, rebuild it from watchDate + padding so the form is
      // always internally consistent.
      let dates: string[];
      if (v.rewatchDates && v.rewatchDates.length === count + 1) {
        dates = [...v.rewatchDates];
      } else if (v.rewatchDates && v.rewatchDates.length > 0) {
        // Use what we have, pad/truncate to count + 1.
        dates = [...v.rewatchDates];
        while (dates.length < count + 1) dates.push("");
        if (dates.length > count + 1) dates = dates.slice(0, count + 1);
      } else {
        // No stored rewatch dates — seed index 0 with watchDate.
        dates = new Array(count + 1).fill("");
        dates[0] = v.watchDate ?? "";
      }
      setFormState({
        status: v.status || "Planned",
        rating: v.rating?.toString() || "",
        watchDate: v.watchDate ?? "",
        notes: v.notes || "",
        rewatchCount: String(count),
        rewatchDates: dates,
      });
    } else {
      // Non-vault title — reset the form to defaults (no user-owned state)
      setFormState({
        status: "Planned",
        rating: "",
        watchDate: "",
        notes: "",
        rewatchCount: "0",
        rewatchDates: [],
      });
    }
    setIsEditing(false);
  };

  // Sync form whenever the vaultItem changes (navigation, add-to-vault, etc.)
  createEffect(() => {
    const v = vaultItem();
    resetTo(v);
  });

  const isDirty = createMemo(() => {
    const v = vaultItem();
    if (!v) return false;
    const currentRating = Number(form().rating);
    const itemRating = v.rating || 0;
    const currentCount = Number(form().rewatchCount) || 0;
    const itemCount = v.rewatchCount ?? 0;
    // Compare dates array (shallow — strings).
    const itemDates = v.rewatchDates ?? [];
    const formDates = form().rewatchDates;
    const datesEqual =
      itemDates.length === formDates.length &&
      itemDates.every((d, i) => d === formDates[i]);
    return (
      form().status !== (v.status || "Planned") ||
      currentRating !== itemRating ||
      form().notes !== (v.notes || "") ||
      form().watchDate !== (v.watchDate || "") ||
      currentCount !== itemCount ||
      !datesEqual
    );
  });

  /**
   * Set a single form field. For rewatchCount, the value is a string
   * ("0", "1", "2", …). The rewatchDates array is resized to match:
   *   - Incrementing pushes an empty string.
   *   - Decrementing pops the last entry.
   *   - Setting to a specific number pads or truncates accordingly.
   *
   * For rewatchDates, the key is `rewatchDates` and the value is a
   * JSON-stringified {index, date} pair (the edit form serialises it
   * this way because setForm only takes string values).
   */
  const setForm = (key: string, value: string) => {
    setFormState((prev) => {
      if (key === "rewatchCount") {
        const newCount = Math.max(0, Number(value) || 0);
        let newDates = [...prev.rewatchDates];
        // Resize the dates array to match newCount + 1.
        while (newDates.length < newCount + 1) newDates.push("");
        if (newDates.length > newCount + 1) {
          newDates = newDates.slice(0, newCount + 1);
        }
        // Keep watchDate in sync with rewatchDates[0].
        return {
          ...prev,
          rewatchCount: String(newCount),
          rewatchDates: newDates,
          watchDate: newDates[0] ?? "",
        };
      }
      if (key === "rewatchDates") {
        // value is JSON: {"index":N,"date":"YYYY-MM-DD"}
        try {
          const parsed = JSON.parse(value) as { index: number; date: string };
          const newDates = [...prev.rewatchDates];
          // Ensure the array is long enough.
          while (newDates.length <= parsed.index) newDates.push("");
          newDates[parsed.index] = parsed.date;
          // Keep watchDate in sync with index 0.
          const newWatchDate = parsed.index === 0 ? parsed.date : prev.watchDate;
          return {
            ...prev,
            rewatchDates: newDates,
            watchDate: newWatchDate,
          };
        } catch {
          return prev; // ignore malformed input
        }
      }
      // Default: simple string field.
      return { ...prev, [key]: value };
    });
  };

  return {
    form,
    setForm,
    isDirty,
    resetTo,
    isEditing,
    setIsEditing,
  };
}
