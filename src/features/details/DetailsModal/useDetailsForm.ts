// src/features/details/DetailsModal/useDetailsForm.ts
import { createSignal, createEffect, createMemo } from "solid-js";
import type { Accessor } from "solid-js";
import type { WatchlistItem } from "~/shared/types";
import type { DetailsFormState } from "./types";

/**
 * useDetailsForm — owns the inline edit-form state for the Details modal.
 *
 * The form reflects the vaultItem's user-owned fields (status, rating,
 * watchDate, notes). When vaultItem changes (e.g. user navigates to a
 * related title, or adds a non-vault title to the vault), the form
 * resets to the new vaultItem's values — or to defaults when the title
 * is not in the vault.
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
  });

  const resetTo = (v: WatchlistItem | null) => {
    if (v) {
      setFormState({
        status: v.status || "Planned",
        rating: v.rating?.toString() || "",
        watchDate: v.watchDate || "",
        notes: v.notes || "",
      });
    } else {
      // Non-vault title — reset the form to defaults (no user-owned state)
      setFormState({ status: "Planned", rating: "", watchDate: "", notes: "" });
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
    return (
      form().status !== (v.status || "Planned") ||
      currentRating !== itemRating ||
      form().notes !== (v.notes || "") ||
      form().watchDate !== (v.watchDate || "")
    );
  });

  const setForm = (key: string, value: string) => {
    setFormState((prev) => ({ ...prev, [key]: value }));
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
