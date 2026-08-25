import { Show, type Accessor, type Component } from "solid-js";
import { hapticTap } from "~/shared/utils/haptic";
import { formatRuntime, RUNTIME_FORMAT_LABELS } from "../utils/timeFormatter";

export interface RuntimeValueProps {
  seconds: number;
  formatState: Accessor<number>;
  onCycle: () => void;
  category: string;
}

const RuntimeValue: Component<RuntimeValueProps> = (props) => {
  const formatted = () => formatRuntime(props.seconds, props.formatState());
  const formatLabel = () =>
    RUNTIME_FORMAT_LABELS[props.formatState()] ?? RUNTIME_FORMAT_LABELS[3];

  const handleClick = () => {
    hapticTap();
    props.onCycle();
  };

  return (
    <button
      type="button"
      class="profile-runtime-value focus-ring"
      onClick={handleClick}
      aria-label={`${props.category} runtime: ${formatted()}. Tap to show ${
        RUNTIME_FORMAT_LABELS[
          (props.formatState() + 1) % RUNTIME_FORMAT_LABELS.length
        ]
      }`}
      title={`Showing ${formatLabel()}. Click to change.`}
    >
      <span class="profile-runtime-value-main" aria-live="polite">
        <Show when={formatted()} keyed>
          {(value) => (
            <span class="profile-runtime-value-animated">{value}</span>
          )}
        </Show>
      </span>
      <span class="profile-runtime-value-hint" aria-hidden="true">
        tap to change
      </span>
    </button>
  );
};

export default RuntimeValue;
