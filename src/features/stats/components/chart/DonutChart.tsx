// src/features/stats/components/chart/DonutChart.tsx
//
// DonutChart — donut/pie chart primitive (SolidJS-native SVG).
//
// Extracted from SvgChart.tsx (Phase 8 Chunk 3).
//
// Used by the Movies vs Series pie chart. Renders a donut with optional
// centre value/label (e.g. total count). Hover tooltips are driven by
// SolidJS signals.
//
// The slice arcs are built via `donutPath()` from chartHelpers — which
// handles the edge case where a slice covers the full circle by drawing
// two semicircle paths (otherwise the arc degenerates to a single point).

import {
  For,
  Show,
  createMemo,
  type Component
} from "solid-js";
import {
  useChartTooltip,
  donutPath,
  DEFAULT_DONUT_WIDTH,
  type TooltipDatum,
  type TooltipRow
} from "./chartHelpers";
import { ChartTooltip } from "./ChartTooltip";

export interface DonutSlice {
  name: string;
  value: number;
  color: string;
  tooltipLabel?: string;
  tooltipRows?: TooltipRow[];
}

export interface DonutChartProps {
  slices: DonutSlice[];
  /** Centre number / label. */
  centreValue?: string | number;
  centreLabel?: string;
  height?: number;
  buildTooltip?: (slice: DonutSlice, idx: number) => TooltipDatum;
}

export const DonutChart: Component<DonutChartProps> = (props) => {
  const W = DEFAULT_DONUT_WIDTH;
  const H = (): number => props.height ?? 200;
  const cx = W / 2;
  const cy = (): number => H() / 2;
  const outerR = (): number => Math.min(W, H()) / 2 - 8;
  const innerR = (): number => outerR() * 0.62;

  const total = createMemo(() =>
    props.slices.reduce((s, sl) => s + sl.value, 0)
  );

  // Build the slice arcs as SVG path data.
  const arcs = createMemo(() => {
    const t = total();
    if (t <= 0) return [];
    let angle = -Math.PI / 2; // start at top
    return props.slices.map((slice) => {
      const sweep = (slice.value / t) * Math.PI * 2;
      const start = angle;
      const end = angle + sweep;
      angle = end;
      const path = donutPath(cx, cy(), innerR(), outerR(), start, end);
      return { slice, path };
    });
  });

  const { hover, setHover, clearHover } = useChartTooltip();

  const handleEnter = (slice: DonutSlice, idx: number, evt: MouseEvent) => {
    const target = evt.currentTarget as SVGPathElement;
    const ctm = target.getBoundingClientRect();
    const container = target.ownerSVGElement?.getBoundingClientRect();
    if (!container) return;
    const datum = props.buildTooltip
      ? props.buildTooltip(slice, idx)
      : {
          label: slice.tooltipLabel ?? slice.name,
          rows: [
            { name: slice.name, value: String(slice.value), color: slice.color }
          ]
        };
    setHover({
      x: ctm.left - container.left + ctm.width / 2,
      y: ctm.top - container.top,
      data: datum
    });
  };

  return (
    <div
      class="stats-svg-chart stats-donut-wrap"
      style={{
        position: "relative",
        height: `${H()}px`,
        display: "flex",
        "align-items": "center",
        "justify-content": "center"
      }}
    >
      <svg
        viewBox={`0 0 ${W} ${H()}`}
        width="100%"
        height={H()}
        preserveAspectRatio="xMidYMid meet"
      >
        <Show
          when={total() > 0}
          fallback={
            <circle
              cx={cx}
              cy={cy()}
              r={(outerR() + innerR()) / 2}
              fill="none"
              stroke="rgba(255,255,255,0.06)"
              stroke-width={outerR() - innerR()}
            />
          }
        >
          <For each={arcs()}>
            {(arc, idx) => (
              <path
                d={arc.path}
                fill={arc.slice.color}
                stroke="var(--bg, #0a0a0f)"
                stroke-width={2}
                onMouseEnter={(e) => handleEnter(arc.slice, idx(), e)}
                onMouseMove={(e) => handleEnter(arc.slice, idx(), e)}
                onMouseLeave={clearHover}
                style={{ cursor: "pointer", transition: "opacity 120ms ease" }}
              />
            )}
          </For>
        </Show>
      </svg>

      <Show when={props.centreValue !== undefined}>
        <div class="stats-pie-centre">
          <p class="stats-pie-centre-value">{props.centreValue}</p>
          <Show when={props.centreLabel}>
            <p class="stats-pie-centre-label">{props.centreLabel}</p>
          </Show>
        </div>
      </Show>

      <ChartTooltip hover={hover} />
    </div>
  );
};
