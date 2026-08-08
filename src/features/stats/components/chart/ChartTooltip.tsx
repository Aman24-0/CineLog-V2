// src/features/stats/components/chart/ChartTooltip.tsx
//
// The hover tooltip rendered for any SVG chart primitive.
//
// Extracted from SvgChart.tsx (Phase 8 Chunk 3) so the tooltip rendering
// can be reused + tested in isolation.
//
// The tooltip is a sibling absolutely-positioned <div> that uses the
// existing `.stats-tooltip` styles from stats.css. It clamps its
// horizontal position so it doesn't overflow the chart container.

import { For, Show, createMemo, type Component } from "solid-js";
import type { TooltipState } from "./chartHelpers";

export const ChartTooltip: Component<{ hover: () => TooltipState | null }> = (
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
