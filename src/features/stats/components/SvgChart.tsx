// src/features/stats/components/SvgChart.tsx
//
// SvgChart — tiny SolidJS-native SVG chart primitives.
//
// Replaced recharts (a React-only library) with these pure-SolidJS
// primitives so the Statistics page works inside the SolidJS rendering
// tree. recharts' React hooks (useState / useEffect / createContext)
// previously threw "e is not a function" because they were being called
// outside of React's rendering context.
//
// Every primitive here is a plain SolidJS component that renders SVG.
// They take data via props and emit clean <svg> markup that the
// existing stats.css file already styles.
//
// Exposed primitives:
//   • <BarChartV>   — vertical bar chart (Activity, Ratings, Decades)
//   • <BarChartH>   — horizontal bar chart (Genres)
//   • <DonutChart>  — donut/pie chart (Movies vs Series)
//   • <AreaChartV>  — area + line chart (Trends)
//
// All charts include hover tooltips driven by SolidJS signals so they
// remain fully reactive without any React bridge.

import {
  For,
  Show,
  createSignal,
  createMemo,
  type Component,
  type JSX
} from "solid-js";

// ---------------------------------------------------------------------------
// Shared tooltip helpers
// ---------------------------------------------------------------------------

export interface TooltipDatum {
  /** What the user sees in the tooltip header (e.g. "Jan" or "★ 8 / 10"). */
  label: string;
  /** Rows in the tooltip body. */
  rows: TooltipRow[];
}

export interface TooltipRow {
  name: string;
  value: string;
  color?: string;
}

export interface TooltipState {
  /** Position relative to the chart container, in pixels. */
  x: number;
  y: number;
  data: TooltipDatum | null;
}

/**
 * useChartTooltip — shared signal + helpers for hover-driven tooltips.
 *
 * Each chart calls `setHover({x, y, data})` on mouse enter / move and
 * `clearHover()` on mouse leave. The tooltip itself is rendered as a
 * sibling absolutely-positioned <div> so it can use the existing
 * `.stats-tooltip` styles.
 */
export function useChartTooltip() {
  const [hover, setHover] = createSignal<TooltipState | null>(null);
  const clearHover = () => setHover(null);
  return { hover, setHover, clearHover };
}

// ---------------------------------------------------------------------------
// BarChartV — vertical bars
// ---------------------------------------------------------------------------

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

const DEFAULT_HEIGHT = 240;

export const BarChartV: Component<BarChartVProps> = (props) => {
  const height = (): number => props.height ?? DEFAULT_HEIGHT;
  const padding = { top: 12, right: 8, bottom: 32, left: 36 };
  const W = 320;
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

// ---------------------------------------------------------------------------
// BarChartH — horizontal bars (for genres with long names)
// ---------------------------------------------------------------------------

export interface BarHItem {
  label: string;
  value: number;
  color?: string;
  tooltipLabel?: string;
  tooltipRows?: TooltipRow[];
}

export interface BarChartHProps {
  items: BarHItem[];
  color?: string;
  height?: number;
  /** Row height in CSS pixels. Smaller = more compact bars. @default 28 */
  rowHeight?: number;
  /** Called when the user clicks a bar. */
  onBarClick?: (item: BarHItem, idx: number) => void;
  buildTooltip?: (item: BarHItem, idx: number) => TooltipDatum;
}

export const BarChartH: Component<BarChartHProps> = (props) => {
  const W = 320;
  const rowH = (): number => props.rowHeight ?? 28;
  const padding = { top: 6, right: 36, bottom: 6, left: 108 };
  const H = (): number =>
    Math.max(120, props.items.length * rowH() + padding.top + padding.bottom);
  const innerW = (): number => W - padding.left - padding.right;
  const max = createMemo(() => Math.max(1, ...props.items.map((i) => i.value)));

  const { hover, setHover, clearHover } = useChartTooltip();
  const [hoverIdx, setHoverIdx] = createSignal<number | null>(null);

  const handleEnter = (item: BarHItem, idx: number, evt: MouseEvent) => {
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
            { name: "Titles", value: String(item.value), color: item.color }
          ]
        };
    setHover({
      x: ctm.left - container.left + ctm.width,
      y: ctm.top - container.top + ctm.height / 2,
      data: datum
    });
  };

  const handleLeave = () => {
    clearHover();
    setHoverIdx(null);
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
        <For each={props.items}>
          {(item, _idx) => {
            // ESLint: see Bars <For> above — _idx is the <For> Accessor.
            // eslint-disable-next-line solid/reactivity
            const y = padding.top + _idx() * rowH();
            const barH = Math.max(14, rowH() - 8);
            const barY = y + (rowH() - barH) / 2;
            const w = (item.value / max()) * innerW();
            const color = item.color ?? "#f5c518";
            // eslint-disable-next-line solid/reactivity
            const isHover = hoverIdx() === _idx();
            const dimmed = hoverIdx() !== null && !isHover;
            return (
              <g
                style={{
                  opacity: dimmed ? 0.55 : 1,
                  transition: "opacity 160ms ease"
                }}
              >
                {/* Label */}
                <text
                  x={padding.left - 10}
                  y={barY + barH / 2 + 4}
                  text-anchor="end"
                  font-size="11"
                  font-family="'Outfit', sans-serif"
                  fill={
                    isHover
                      ? "rgba(255,255,255,0.95)"
                      : "rgba(255,255,255,0.78)"
                  }
                  style={{ transition: "fill 160ms ease" }}
                >
                  {truncate(item.label, 16)}
                </text>
                {/* Bar track */}
                <rect
                  x={padding.left}
                  y={barY}
                  width={Math.max(2, innerW())}
                  height={barH}
                  rx={4}
                  ry={4}
                  fill="rgba(255,255,255,0.04)"
                />
                {/* Bar fill */}
                <rect
                  x={padding.left}
                  y={barY}
                  width={Math.max(0, w)}
                  height={barH}
                  rx={4}
                  ry={4}
                  fill={color}
                  onMouseEnter={(e) => handleEnter(item, _idx(), e)}
                  onMouseMove={(e) => handleEnter(item, _idx(), e)}
                  onMouseLeave={handleLeave}
                  onClick={() => props.onBarClick?.(item, _idx())}
                  style={{
                    cursor: props.onBarClick ? "pointer" : "default",
                    transition:
                      "width 400ms var(--ease-smooth, ease), filter 160ms ease",
                    filter: isHover ? "brightness(1.15)" : "none"
                  }}
                />
                {/* Value label at the right of the bar */}
                <text
                  x={padding.left + w + 6}
                  y={barY + barH / 2 + 4}
                  font-size="11"
                  font-family="'Azeret Mono', monospace"
                  font-weight="600"
                  fill={
                    isHover ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.7)"
                  }
                  style={{ transition: "fill 160ms ease" }}
                >
                  {item.value}
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

// ---------------------------------------------------------------------------
// DonutChart — movies vs series
// ---------------------------------------------------------------------------

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
  const W = 240;
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

/**
 * donutPath — produces an SVG path string for a donut slice.
 *
 * Computes two arcs (outer + inner) connected by two straight lines.
 * Handles the edge case where a slice is 100% of the donut by drawing
 * two halves (otherwise the arc degenerates to a single point).
 */
function donutPath(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  startAngle: number,
  endAngle: number
): string {
  // If the slice covers the full circle, split into two semicircle paths
  // to avoid the degenerate single-point arc.
  const fullCircle = Math.abs(endAngle - startAngle) >= Math.PI * 2 - 0.001;
  if (fullCircle) {
    return [
      donutPath(cx, cy, innerR, outerR, startAngle, startAngle + Math.PI),
      donutPath(cx, cy, innerR, outerR, startAngle + Math.PI, endAngle)
    ].join(" ");
  }

  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;

  const outerStart = polarToCartesian(cx, cy, outerR, startAngle);
  const outerEnd = polarToCartesian(cx, cy, outerR, endAngle);
  const innerStart = polarToCartesian(cx, cy, innerR, endAngle);
  const innerEnd = polarToCartesian(cx, cy, innerR, startAngle);

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerStart.x} ${innerStart.y}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${innerEnd.x} ${innerEnd.y}`,
    "Z"
  ].join(" ");
}

function polarToCartesian(cx: number, cy: number, r: number, angle: number) {
  return {
    x: cx + r * Math.cos(angle),
    y: cy + r * Math.sin(angle)
  };
}

// ---------------------------------------------------------------------------
// AreaChartV — area + line for cumulative trends
// ---------------------------------------------------------------------------

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
  const W = 320;
  const H = (): number => props.height ?? 240;
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

// ---------------------------------------------------------------------------
// ChartTooltip — the actual hover tooltip rendered for any chart
// ---------------------------------------------------------------------------

const ChartTooltip: Component<{ hover: () => TooltipState | null }> = (
  props
) => {
  const positioned = createMemo(() => {
    const h = props.hover();
    if (!h || !h.data) return null;
    // Clamp horizontal position so the tooltip doesn't overflow.
    const x = Math.max(8, Math.min(312, h.x));
    return { ...h, x };
  });

  return (
    <Show when={positioned()}>
      {(state) => (
        <div
          class="stats-tooltip stats-tooltip-floating"
          style={{
            position: "absolute",
            left: `${state().x}px`,
            top: `${state().y}px`,
            transform: "translate(-50%, -100%)",
            "z-index": "10"
          }}
          role="status"
        >
          <p class="stats-tooltip-label">{state().data!.label}</p>
          <div class="stats-tooltip-rows">
            <For each={state().data!.rows}>
              {(row) => (
                <div class="stats-tooltip-row">
                  <Show when={row.color}>
                    <span
                      class="stats-tooltip-dot"
                      style={{ background: row.color }}
                      aria-hidden="true"
                    />
                  </Show>
                  <span class="stats-tooltip-name">{row.name}</span>
                  <span class="stats-tooltip-value">{row.value}</span>
                </div>
              )}
            </For>
          </div>
        </div>
      )}
    </Show>
  );
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

/**
 * Convenience wrapper for callers that want to pass JSX children but
 * still need the chart primitives to compose. Currently unused but
 * kept here so future chart variants can reuse the same shape.
 */
export function _passthrough(children: JSX.Element): JSX.Element {
  return children;
}
