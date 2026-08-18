// src/shared/hooks/useFormField.ts
//
// Reusable field-level validation hook for SolidJS forms.
//
// Tracks value, validation error, and status (untouched → editing → valid/invalid).
// Supports validate-on-change and validate-on-blur/submit patterns.
//
// Usage:
//   const email = useFormField({
//     initialValue: "",
//     validate: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : "Invalid email",
//   });
//
//   // In JSX:
//   <input
//     value={email.value()}
//     onInput={(e) => email.setValue(e.currentTarget.value)}
//     onBlur={() => email.touch()}
//   />
//   <Show when={email.error()}><p>{email.error()}</p></Show>
//
//   // On submit:
//   if (!email.validate()) return;  // shows error if invalid

import { createSignal } from "solid-js";

export type ValidationStatus = "untouched" | "editing" | "valid" | "invalid";

export interface UseFormFieldOptions<T> {
  /** Initial value */
  initialValue: T;
  /** Validate function. Return error message string or null if valid */
  validate: (value: T) => string | null;
  /** Whether to validate on every change (vs only on blur/submit) */
  validateOnChange?: boolean;
}

export interface UseFormFieldReturn<T> {
  value: () => T;
  setValue: (v: T) => void;
  error: () => string | null;
  status: () => ValidationStatus;
  isUntouched: () => boolean;
  isValid: () => boolean;
  isInvalid: () => boolean;
  /** Mark as touched (e.g., on blur) and validate */
  touch: () => void;
  /** Force validation (e.g., on submit attempt) */
  validate: () => boolean;  // returns true if valid
  /** Reset to initial state */
  reset: () => void;
}

export function useFormField<T>(options: UseFormFieldOptions<T>): UseFormFieldReturn<T> {
  const { initialValue, validate: validateFn, validateOnChange = false } = options;

  const [value, setValueInternal] = createSignal<T>(initialValue);
  const [error, setError] = createSignal<string | null>(null);
  const [status, setStatus] = createSignal<ValidationStatus>("untouched");

  function runValidate(): boolean {
    const err = validateFn(value());
    setError(err);
    if (err === null) {
      setStatus("valid");
      return true;
    } else {
      setStatus("invalid");
      return false;
    }
  }

  function setValue(v: T) {
    setValueInternal(() => v);
    if (validateOnChange) {
      runValidate();
    } else if (status() !== "untouched") {
      // If already touched, re-validate on change so the user gets
      // immediate feedback while editing (but not before first touch).
      runValidate();
    }
  }

  function touch() {
    if (status() === "untouched") {
      setStatus("editing");
    }
    runValidate();
  }

  function reset() {
    setValueInternal(() => initialValue);
    setError(null);
    setStatus("untouched");
  }

  const isUntouched = () => status() === "untouched";
  const isValid = () => status() === "valid";
  const isInvalid = () => status() === "invalid";

  return {
    value,
    setValue,
    error,
    status,
    isUntouched,
    isValid,
    isInvalid,
    touch,
    validate: runValidate,
    reset,
  };
}
