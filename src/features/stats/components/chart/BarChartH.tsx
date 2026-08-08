// src/features/stats/components/chart/BarChartH.tsx
//
// BarChartH — horizontal bar chart primitive (SolidJS-native SVG).
//
// Extracted from SvgChart.tsx (Phase 8 Chunk 3).
//
// Used by the Genres chart (long category names — horizontal bars give
// the label more room than vertical bars would).
//
// Hover tooltips are driven by SolidJS signals so they remain fully
// reactive without any React bridge. Supports an optional onBarClick
// callback for clickable bars (e.g. filter the vault by genre).

import {
  For,
  createSignal,
  createMemo,
  type Component
} from "solid-js";
import {
  useChartTooltip,
  truncate,
  DEFAULT_CHART_WIDTH,
  type TooltipDatum,
  type TooltipRow
} from "./chartHelpers";
import { ChartTooltip } from "./ChartTooltip";

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
  const W = DEFAULT_CHART_WIDTH;
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
