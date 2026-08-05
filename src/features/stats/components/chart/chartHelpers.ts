// src/features/stats/components/chart/chartHelpers.ts
//
// Shared types + tooltip hook + geometry helpers for the SVG chart
// primitives.
//
// Extracted from SvgChart.tsx (Phase 8 Chunk 3) so that:
//   - Types can be imported without pulling in any component code
//   - The tooltip hook + geometry helpers can be unit-tested in isolation
//   - Each chart component file can stay focused on its own SVG markup
//
// All chart components + the facade SvgChart.tsx re-export these types
// so existing imports (`import { type TooltipRow } from "./SvgChart"`)
// continue to work unchanged.

import { createSignal, type JSX } from "solid-js";

// ---------------------------------------------------------------------------
// Tooltip types + hook
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
// Geometry helpers
// ---------------------------------------------------------------------------

/**
 * donutPath — produces an SVG path string for a donut slice.
 *
 * Computes two arcs (outer + inner) connected by two straight lines.
 * Handles the edge case where a slice is 100% of the donut by drawing
 * two halves (otherwise the arc degenerates to a single point).
 *
 * Used by DonutChart.
 */
export function donutPath(
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

/** Convert polar coordinates to cartesian (used by donutPath). */
export function polarToCartesian(
  cx: number,
  cy: number,
  r: number,
  angle: number
) {
  return {
    x: cx + r * Math.cos(angle),
    y: cy + r * Math.sin(angle)
  };
}

/**
 * Truncate a string to `max` characters, appending an ellipsis if cut.
 * Used by BarChartH to fit long genre labels into the row's label area.
 */
export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

/** Default chart height in CSS pixels (the SVG viewBox height). */
export const DEFAULT_CHART_HEIGHT = 240;

/** Default SVG viewBox width for vertical + area charts. */
export const DEFAULT_CHART_WIDTH = 320;

/** Default SVG viewBox width for the donut chart (square-ish). */
export const DEFAULT_DONUT_WIDTH = 240;

/**
 * Convenience wrapper for callers that want to pass JSX children but
 * still need the chart primitives to compose. Currently unused but
 * kept here so future chart variants can reuse the same shape.
 */
export function _passthrough(children: JSX.Element): JSX.Element {
  return children;
}
