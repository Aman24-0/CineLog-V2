// src/features/stats/components/ChartContainer.tsx
//
// ChartContainer — a thin wrapper around GlassCard that gives every
// chart on the Statistics page a consistent chrome:
//
//   • A header row with an icon, a title, and an optional subtitle
//   • A fixed-height responsive body that recharts ResponsiveContainer
//     fills
//   • An optional footer slot for legends or notes
//
// Centralising this layout here means the individual chart components
// (ActivityChart, GenreChart, ...) only have to worry about the
// recharts configuration.

import { Show, type Component, type JSX } from "solid-js";
import { GlassCard } from "~/shared/ui/glass";

interface ChartContainerProps {
  icon: string;
  title: string;
  subtitle?: string;
  /** Body height — accepts any CSS length. @default "300px" */
  height?: string;
  /** Optional footer (legend, note, action). */
  footer?: JSX.Element;
  /** Optional right-side header content (e.g. a toggle). */
  headerRight?: JSX.Element;
  /** Card padding override. */
  padding?: "none" | "compact" | "default" | "comfortable";
  /** Optional class passthrough. */
  class?: string;
  /** Children — the chart itself. */
  children: JSX.Element;
}

const ChartContainer: Component<ChartContainerProps> = (props) => {
  const height = (): string => props.height ?? "300px";
  return (
    <GlassCard class={`stats-chart-card ${props.class ?? ""}`} padding={props.padding ?? "default"}>
      <div class="stats-chart-header">
        <div class="stats-chart-header-left">
          <div class="stats-chart-icon" aria-hidden="true">
            <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">
              {props.icon}
            </span>
          </div>
          <div class="stats-chart-header-text">
            <h3 class="stats-chart-title">{props.title}</h3>
            <Show when={props.subtitle}>
              <p class="stats-chart-subtitle">{props.subtitle}</p>
            </Show>
          </div>
        </div>
        <Show when={props.headerRight}>
          <div class="stats-chart-header-right">{props.headerRight}</div>
        </Show>
      </div>
      <div class="stats-chart-body" style={{ height: height() }}>
        {props.children}
      </div>
      <Show when={props.footer}>
        <div class="stats-chart-footer">{props.footer}</div>
      </Show>
    </GlassCard>
  );
};

export default ChartContainer;
