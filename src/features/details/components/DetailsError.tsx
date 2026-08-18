// src/features/details/components/DetailsError.tsx
import { Show } from "solid-js";
import Icon from "~/shared/ui/Icon";

interface DetailsErrorProps {
  /** Optional error object or message string */
  error?: Error | string;
  /** When true, shows a timeout-specific message with hourglass icon */
  isTimeout?: boolean;
  /** When true, shows a not-found message instead of generic failure */
  isNotFound?: boolean;
  /** Retry callback */
  onRetry: () => void;
}

export default function DetailsError(props: DetailsErrorProps) {
  // Derive the error message string from the error prop
  const errorMsg = () => {
    if (!props.error) return undefined;
    return typeof props.error === "string" ? props.error : props.error.message;
  };

  // Choose icon, title, and description based on state
  const iconName = () =>
    props.isNotFound ? "search_off"
    : props.isTimeout ? "hourglass_top"
    : "cloud_off";

  const title = () =>
    props.isNotFound ? "Content Not Found"
    : props.isTimeout ? "Taking Longer Than Expected"
    : "Failed to Load";

  const description = () => {
    if (props.isNotFound)
      return "This movie or show may have been removed.";
    if (props.isTimeout)
      return "The request is taking longer than usual. Check your connection or try again.";
    return errorMsg() ?? "Could not fetch details. Check your connection.";
  };

  const iconColor = () =>
    props.isNotFound ? "text-gray-400"
    : props.isTimeout ? "text-amber-400"
    : "text-red-500";

  const retryLabel = () =>
    props.isTimeout ? "Try Again" : "Retry";

  return (
    <div
      class="flex w-full max-w-xl flex-col items-center justify-center rounded-t-[2.5rem] border border-white/10 bg-[#08090b]/80 p-10 text-center backdrop-blur-3xl sm:rounded-[2.5rem]"
      role="alert"
      aria-live="assertive"
    >
      <Icon
        name={iconName()}
        class={`mb-4 text-5xl ${iconColor()}`}
        aria-hidden="true"
      />
      <h3 class="mb-2 text-xl font-bold text-white">{title()}</h3>
      <p class="mb-6 text-sm text-gray-400">
        {description()}
      </p>
      <Show when={!props.isNotFound}>
        <button
          onClick={() => props.onRetry()}
          class="rounded-full bg-white/10 px-6 py-2 font-bold text-white transition-transform active:scale-95"
        >
          {retryLabel()}
        </button>
      </Show>
    </div>
  );
}
