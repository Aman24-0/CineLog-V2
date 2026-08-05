// src/features/stats/components/chart/AreaChartV.tsx
//
// AreaChartV — area + line chart primitive (SolidJS-native SVG).
//
// Extracted from SvgChart.tsx (Phase 8 Chunk 3).
//
// Used by the Trends chart (cumulative watch count over time). Renders
// a filled area under a line, with hover dots + tooltips at each data
// point.
//
// Hover tooltips are driven by SolidJS signals so they remain fully
// reactive without any React bridge.

import {
  For,
  Show,
  createSignal,
  createMemo,
  type Component
} from "solid-js";
import {
  useChartTooltip,
  DEFAULT_CHART_HEIGHT,
  DEFAULT_CHART_WIDTH,
  type TooltipDatum,
  type TooltipRow
} from "./chartHelpers";
import { ChartTooltip } from "./ChartTooltip";

export interface AreaVPoint {
  label: string;
  value: number;
  tooltipLabel?: string;
  tooltipRows?: TooltipRow[];
}

export interface AreaChartVProps {
  points: AreaVPoint[];
  color?: string;
  height?: number;
  buildTooltip?: (point: AreaVPoint, idx: number) => TooltipDatum;
}

export const AreaChartV: Component<AreaChartVProps> = (props) => {
  const W = DEFAULT_CHART_WIDTH;
  const H = (): number => props.height ?? DEFAULT_CHART_HEIGHT;
  const padding = { top: 12, right: 12, bottom: 28, left: 36 };
  const innerW = (): number => W - padding.left - padding.right;
  const innerH = (): number => H() - padding.top - padding.bottom;
  const color = (): string => props.color ?? "#f5c518";

  const yMax = createMemo(() => {
    const m = Math.max(1, ...props.points.map((p) => p.value));
    if (m <= 4) return m;
    if (m <= 10) return 10;
    if (m <= 20) return 20;
    return Math.ceil(m / 10) * 10;
  });

  const yTicks = createMemo<number[]>(() => {
    const m = yMax();
    if (m <= 4) return Array.from({ length: m + 1 }, (_, i) => i);
    if (m <= 10) return [0, 2, 4, 6, 8, 10];
    return [
      0,
      Math.round(m / 4),
      Math.round(m / 2),
      Math.round((3 * m) / 4),
      m
    ];
  });

  const xForIdx = (idx: number): number => {
    const n = Math.max(1, props.points.length - 1);
    return padding.left + (idx / n) * innerW();
  };

  const yForValue = (v: number): number =>
    padding.top + innerH() - (v / yMax()) * innerH();

  const linePath = createMemo(() => {
    const pts = props.points;
    if (pts.length === 0) return "";
    return pts
      .map(
        (p, i) =>
          `${i === 0 ? "M" : "L"} ${xForIdx(i).toFixed(2)} ${yForValue(p.value).toFixed(2)}`
      )
      .join(" ");
  });

  const areaPath = createMemo(() => {
    const pts = props.points;
    if (pts.length === 0) return "";
    const top = pts
      .map(
        (p, i) =>
          `${i === 0 ? "M" : "L"} ${xForIdx(i).toFixed(2)} ${yForValue(p.value).toFixed(2)}`
      )
      .join(" ");
    const baseY = padding.top + innerH();
    const lastX = xForIdx(pts.length - 1);
    const firstX = xForIdx(0);
    return `${top} L ${lastX.toFixed(2)} ${baseY.toFixed(2)} L ${firstX.toFixed(2)} ${baseY.toFixed(2)} Z`;
  });

  const { hover, setHover, clearHover } = useChartTooltip();
  const [hoverIdx, setHoverIdx] = createSignal<number | null>(null);

  const handleEnter = (point: AreaVPoint, idx: number, evt: MouseEvent) => {
    const target = evt.currentTarget as SVGCircleElement;
    const ctm = target.getBoundingClientRect();
    const container = target.ownerSVGElement?.getBoundingClientRect();
    if (!container) return;
    setHoverIdx(idx);
    const datum = props.buildTooltip
      ? props.buildTooltip(point, idx)
      : {
          label: point.tooltipLabel ?? point.label,
          rows: [{ name: "Total", value: String(point.value), color: color() }]
        };
    setHover({
      x: ctm.left - container.left,
      y: ctm.top - container.top,
      data: datum
    });
  };

  return (
    <div
      class="stats-svg-chart"
      style={{ position: "relative", height: `${H()}px` }}
    >
      <svg
        viewBox={`0 0 ${W} ${H()}`}
        width="100%"
        height={H()}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="statsTrendArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color={color()} stop-opacity="0.45" />
            <stop offset="100%" stop-color={color()} stop-opacity="0" />
          </linearGradient>
        </defs>

        {/* Gridlines */}
        <For each={yTicks()}>
          {(tick) => {
            const y = yForValue(tick);
            return (
              <g>
                <line
                  x1={padding.left}
                  x2={W - padding.right}
                  y1={y}
                  y2={y}
                  stroke="rgba(255,255,255,0.06)"
                  stroke-dasharray="3 3"
                />
                <text
                  x={padding.left - 6}
                  y={y + 3}
                  text-anchor="end"
                  font-size="10"
                  font-family="'Azeret Mono', monospace"
                  fill="rgba(255,255,255,0.4)"
                >
                  {tick}
                </text>
              </g>
            );
          }}
        </For>

        {/* Area fill */}
        <Show when={areaPath()}>
          <path d={areaPath()} fill="url(#statsTrendArea)" stroke="none" />
        </Show>

        {/* Line */}
        <Show when={linePath()}>
          <path
            d={linePath()}
            fill="none"
            stroke={color()}
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </Show>

        {/* X-axis labels + dots */}
        <For each={props.points}>
          {(point, _idx) => {
            // ESLint: see Bars <For> above — _idx is the <For> Accessor.
            // eslint-disable-next-line solid/reactivity
            const x = xForIdx(_idx());
            const y = yForValue(point.value);
            // eslint-disable-next-line solid/reactivity
            const isHover = hoverIdx() === _idx();
            return (
              <g>
                <circle
                  cx={x}
                  cy={y}
                  r={isHover ? 5 : 3}
                  fill={color()}
                  stroke="var(--bg, #0a0a0f)"
                  stroke-width={isHover ? 2 : 0}
                  onMouseEnter={(e) => handleEnter(point, _idx(), e)}
                  onMouseMove={(e) => handleEnter(point, _idx(), e)}
                  onMouseLeave={() => {
                    clearHover();
                    setHoverIdx(null);
                  }}
                  style={{ cursor: "pointer", transition: "r 120ms ease" }}
                />
                <text
                  x={x}
                  y={H() - padding.bottom + 18}
                  text-anchor="middle"
                  font-size="10"
                  font-family="'Azeret Mono', monospace"
                  fill="rgba(255,255,255,0.6)"
                >
                  {point.label}
                </text>
              </g>
            );
          }}
        </For>
      </svg>

      <ChartTooltip hover={hover} />
    </div>
  );
};
