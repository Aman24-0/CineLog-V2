// src/features/stats/components/StatsTooltip.tsx
//
// StatsTooltip — a custom recharts tooltip that matches the app's
// dark glass theme. The default recharts tooltip is a white card
// which looks jarring on the dark glass cards.
//
// Recharts calls the tooltip component with a single `props` argument
// containing `active`, `payload`, and `label`. We render a small
// frosted-glass card showing each payload entry's name + value.

import { Show, For, type Component } from "solid-js";

// Recharts' tooltip props are loosely typed — we accept a permissive
// shape and read fields defensively.
interface TooltipPayloadItem {
  name?: string | number;
  value?: string | number;
  color?: string;
  dataKey?: string | number;
  payload?: Record<string, unknown>;
}

interface StatsTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string | number;
  /** Optional formatter — e.g. (v) => `${v} titles` */
  valueFormatter?: (value: number | string, name: string) => string;
  /** Optional label formatter for the header. */
  labelFormatter?: (label: string | number) => string;
}

const StatsTooltip: Component<StatsTooltipProps> = (props) => {
  return (
    <Show when={props.active && props.payload && props.payload.length > 0}>
      <div class="stats-tooltip" role="status">
        <Show when={props.label !== undefined && props.label !== null && props.label !== ""}>
          <p class="stats-tooltip-label">
            {props.labelFormatter && props.label !== undefined
              ? props.labelFormatter(props.label)
              : String(props.label ?? "")}
          </p>
        </Show>
        <div class="stats-tooltip-rows">
          <For each={props.payload}>
            {(item) => {
              const name = String(item.name ?? item.dataKey ?? "");
              const value = item.value ?? 0;
              const formatted = props.valueFormatter
                ? props.valueFormatter(value, name)
                : String(value);
              return (
                <div class="stats-tooltip-row">
                  <Show when={item.color}>
                    <span class="stats-tooltip-dot" style={{ background: item.color }} aria-hidden="true" />
                  </Show>
                  <span class="stats-tooltip-name">{name}</span>
                  <span class="stats-tooltip-value">{formatted}</span>
                </div>
              );
            }}
          </For>
        </div>
      </div>
    </Show>
  );
};

export default StatsTooltip;
