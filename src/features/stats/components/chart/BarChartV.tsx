// src/features/stats/components/chart/BarChartV.tsx
//
// BarChartV — vertical bar chart primitive (SolidJS-native SVG).
//
// Extracted from SvgChart.tsx (Phase 8 Chunk 3).
//
// Used by Activity, Ratings, and Decades charts. Supports an optional
// secondary bar (split mode) for showing two values side-by-side per
// category (e.g. movies vs series counts per month).
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

export interface BarVItem {
  /** X-axis label (e.g. "Jan", "8", "1990s"). */
  label: string;
  /** Primary bar value. */
  value: number;
  /** Optional secondary bar value (used by Activity's split toggle). */
  secondary?: number;
  /** Per-bar fill colour (overrides the default). */
  color?: string;
  /** Per-bar secondary fill colour. */
  secondaryColor?: string;
  /** Tooltip title; defaults to `label`. */
  tooltipLabel?: string;
  /** Tooltip rows; defaults to one row with the value. */
  tooltipRows?: TooltipRow[];
}

export interface BarChartVProps {
  items: BarVItem[];
  /** Y-axis max. Defaults to the largest item value. */
  yMax?: number;
  /** Default bar fill. */
  color?: string;
  /** When true, render the secondary bar alongside the primary bar. */
  split?: boolean;
  /** Chart height in CSS pixels (the SVG viewBox height). */
  height?: number;
  /** Y-axis tick formatter. */
  yTickFormat?: (v: number) => string;
  /** Tooltip datum builder (called per bar on hover). */
  buildTooltip?: (item: BarVItem, idx: number) => TooltipDatum;
  /** Rotate X-axis labels -45deg. Useful for long labels (months, decades). @default false */
  rotateLabels?: boolean;
  /** When true, bars scale up slightly on hover to indicate interactivity. @default true */
  hoverScale?: boolean;
}

export const BarChartV: Component<BarChartVProps> = (props) => {
  const height = (): number => props.height ?? DEFAULT_CHART_HEIGHT;
  const padding = { top: 12, right: 8, bottom: 32, left: 36 };
  const W = DEFAULT_CHART_WIDTH;
  const H = (): number => height();
  const innerW = (): number => W - padding.left - padding.right;
  const innerH = (): number => H() - padding.top - padding.bottom;

  const yMax = createMemo(() => {
    if (props.yMax !== undefined && props.yMax > 0) return props.yMax;
    const max = Math.max(
      1,
      ...props.items.map((i) => Math.max(i.value, i.secondary ?? 0))
    );
    // Round up to a clean number so gridlines look stable.
    if (max <= 4) return max;
    if (max <= 10) return 10;
    if (max <= 20) return 20;
    return Math.ceil(max / 10) * 10;
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

  const barAreaW = (): number => innerW() / Math.max(1, props.items.length);
  const barW = (): number => Math.min(36, barAreaW() * 0.6);
  const secondaryBarW = (): number => Math.min(18, barAreaW() * 0.32);

  const { hover, setHover, clearHover } = useChartTooltip();
  const [hoverIdx, setHoverIdx] = createSignal<number | null>(null);

  const xForBar = (idx: number): number =>
    padding.left + barAreaW() * idx + barAreaW() / 2;

  const yForValue = (v: number): number =>
    padding.top + innerH() - (v / yMax()) * innerH();

  const handleEnter = (item: BarVItem, idx: number, evt: MouseEvent) => {
    const target = evt.currentTarget as SVGRectElement;
    const ctm = target.getBoundingClientRect();
    const container = target.ownerSVGElement?.getBoundingClientRect();
    if (!container) return;
    setHoverIdx(idx);
    const datum = props.buildTooltip
      ? props.buildTooltip(item, idx)
      : {
          label: item.tooltipLabel ?? item.label,
          rows: [
            { name: "Count", value: String(item.value), color: item.color }
          ]
        };
    setHover({
      x: ctm.left - container.left + ctm.width / 2,
      y: ctm.top - container.top,
      data: datum
    });
  };

  const handleLeave = () => {
    clearHover();
    setHoverIdx(null);
  };

  const labelY = (): number => H() - padding.bottom + 16;
  const shouldRotate = (): boolean =>
    !!props.rotateLabels && props.items.length > 6;

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
                  {props.yTickFormat ? props.yTickFormat(tick) : tick}
                </text>
              </g>
            );
          }}
        </For>

        {/* Bars */}
        <For each={props.items}>
          {(item, _idx) => {
            // ESLint: _idx is the Accessor<number> from <For>. The render
            // function of <For> IS reactive (re-runs when the array
            // changes), but the lint rule doesn't recognize it as a
            // tracked scope. The index is stable per render — we read it
            // once into locals below for clarity. Suppress per-line.
            // eslint-disable-next-line solid/reactivity
            const cx = xForBar(_idx());
            const top = yForValue(item.value);
            const h = padding.top + innerH() - top;
            const color = item.color ?? props.color ?? "#f5c518";
            const secondary = item.secondary ?? 0;
            const secondaryTop = yForValue(secondary);
            const secondaryH = padding.top + innerH() - secondaryTop;
            const secondaryColor = item.secondaryColor ?? "#7c8cff";
            const halfW = props.split ? secondaryBarW() / 2 : barW() / 2;
            // eslint-disable-next-line solid/reactivity
            const isHover = hoverIdx() === _idx();
            const hoverOpacity =
              props.hoverScale === false
                ? 1
                : isHover
                  ? 1
                  : hoverIdx() === null
                    ? 1
                    : 0.55;
            const hoverTransform =
              props.hoverScale === false || !isHover
                ? "translate(0,0) scale(1)"
                : "translate(0,-2) scale(1.04)";
            return (
              <g
                style={{
                  transform: hoverTransform,
                  "transform-origin": `${cx}px ${padding.top + innerH()}px`,
                  "transform-box": "fill-box",
                  transition:
                    "transform 160ms var(--ease-smooth, ease), opacity 160ms ease",
                  opacity: hoverOpacity
                }}
              >
                {/* Bar (or split bars) */}
                <Show
                  when={props.split}
                  fallback={
                    <rect
                      x={cx - halfW}
                      y={top}
                      width={barW()}
                      height={Math.max(0, h)}
                      rx={4}
                      ry={4}
                      fill={color}
                      opacity={item.value > 0 ? 1 : 0.18}
                      onMouseEnter={(e) => handleEnter(item, _idx(), e)}
                      onMouseMove={(e) => handleEnter(item, _idx(), e)}
                      onMouseLeave={handleLeave}
                      style={{ cursor: "pointer" }}
                    />
                  }
                >
                  <rect
                    x={cx - halfW * 2 - 1}
                    y={secondaryTop}
                    width={halfW * 2}
                    height={Math.max(0, secondaryH)}
                    rx={3}
                    ry={3}
                    fill={color}
                    opacity={item.value > 0 ? 1 : 0.18}
                    onMouseEnter={(e) => handleEnter(item, _idx(), e)}
                    onMouseMove={(e) => handleEnter(item, _idx(), e)}
                    onMouseLeave={handleLeave}
                    style={{ cursor: "pointer" }}
                  />
                  <rect
                    x={cx + 1}
                    y={secondaryTop}
                    width={halfW * 2}
                    height={Math.max(0, secondaryH)}
                    rx={3}
                    ry={3}
                    fill={secondaryColor}
                    opacity={secondary > 0 ? 1 : 0.18}
                    onMouseEnter={(e) => handleEnter(item, _idx(), e)}
                    onMouseMove={(e) => handleEnter(item, _idx(), e)}
                    onMouseLeave={handleLeave}
                    style={{ cursor: "pointer" }}
                  />
                </Show>

                {/* X-axis label */}
                <text
                  x={cx}
                  y={labelY()}
                  text-anchor={shouldRotate() ? "end" : "middle"}
                  font-size="10"
                  font-family="'Azeret Mono', monospace"
                  fill="rgba(255,255,255,0.6)"
                  transform={
                    shouldRotate()
                      ? `rotate(-45, ${cx}, ${labelY()})`
                      : undefined
                  }
                >
                  {item.label}
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
