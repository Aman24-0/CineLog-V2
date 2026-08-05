// src/features/stats/components/SvgChart.tsx
//
// SvgChart — tiny SolidJS-native SVG chart primitives.
//
// ─────────────────────────────────────────────────────────────────────
// PHASE 8 CHUNK 3 — FILE SPLIT
// ─────────────────────────────────────────────────────────────────────
// This file was previously 975 LOC. As of Phase 8 Chunk 3 it has been
// split into focused sub-modules and is now a PUBLIC FACADE that
// re-exports the public API. Consumers can keep importing from
// "./SvgChart" unchanged — all existing exports continue to work:
//
//   • Types + tooltip hook + helpers → ./chart/chartHelpers.ts
//   • <ChartTooltip>                 → ./chart/ChartTooltip.tsx
//   • <BarChartV>                    → ./chart/BarChartV.tsx
//   • <BarChartH>                    → ./chart/BarChartH.tsx
//   • <DonutChart>                   → ./chart/DonutChart.tsx
//   • <AreaChartV>                   → ./chart/AreaChartV.tsx
//
// Why: each chart primitive had its own ~150-300 LOC of SVG markup + hover
// state logic; the file also bundled shared types + the tooltip hook +
// the geometry helpers. Splitting them makes each chart independently
// reviewable, testable, and tree-shakeable.
// ─────────────────────────────────────────────────────────────────────
//
// Replaced recharts (a React-only library) with these pure-SolidJS
// primitives so the Statistics page works inside the SolidJS rendering
// tree. recharts' React hooks (useState / useEffect / createContext)
// previously threw "e is not a function" because they were being called
// outside of React's rendering context.
//
// Exposed primitives (re-exported below):
//   • <BarChartV>   — vertical bar chart (Activity, Ratings, Decades)
//   • <BarChartH>   — horizontal bar chart (Genres)
//   • <DonutChart>  — donut/pie chart (Movies vs Series)
//   • <AreaChartV>  — area + line chart (Trends)
//

// ── Shared types + tooltip hook + helpers ────────────────────────────
export {
  useChartTooltip,
  donutPath,
  polarToCartesian,
  truncate,
  _passthrough,
  DEFAULT_CHART_HEIGHT,
  DEFAULT_CHART_WIDTH,
  DEFAULT_DONUT_WIDTH,
  type TooltipDatum,
  type TooltipRow,
  type TooltipState
} from "./chart/chartHelpers";

// ── Tooltip component ────────────────────────────────────────────────
export { ChartTooltip } from "./chart/ChartTooltip";

// ── BarChartV (vertical bars) ────────────────────────────────────────
export { BarChartV, type BarVItem, type BarChartVProps } from "./chart/BarChartV";

// ── BarChartH (horizontal bars) ──────────────────────────────────────
export { BarChartH, type BarHItem, type BarChartHProps } from "./chart/BarChartH";

// ── DonutChart ───────────────────────────────────────────────────────
export { DonutChart, type DonutSlice, type DonutChartProps } from "./chart/DonutChart";

// ── AreaChartV (area + line) ─────────────────────────────────────────
export { AreaChartV, type AreaVPoint, type AreaChartVProps } from "./chart/AreaChartV";
