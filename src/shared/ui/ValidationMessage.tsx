// src/shared/ui/ValidationMessage.tsx
//
// Small reusable component for displaying field-level validation errors.
// Used alongside useFormField to show error messages near form inputs.
//
// Usage:
//   <ValidationMessage error={email.error()} />

import { Show, type Component } from "solid-js";

export interface ValidationMessageProps {
  /** Error message string, or null if no error */
  error: string | null;
}

const ValidationMessage: Component<ValidationMessageProps> = (props) => {
  return (
    <Show when={props.error}>
      <p class="mt-1 text-xs text-red-400" role="alert">
        {props.error}
      </p>
    </Show>
  );
};

export { ValidationMessage };
export default ValidationMessage;
