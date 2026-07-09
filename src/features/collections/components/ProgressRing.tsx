// src/features/collections/components/ProgressRing.tsx
import { createMemo, Show } from "solid-js";

interface ProgressRingProps {
  pct: number;
  size?: "sm" | "md" | "lg";
  accentColor?: string;
  showLabel?: boolean;
  class?: string;
}

/**
 * ProgressRing — reusable SVG progress ring.
 *
 * Replaces the 3+ duplicated CSS progress ring implementations
 * across CollectionsPage, CollectionDetailPage, and CollectionModal.
 */
export default function ProgressRing(props: ProgressRingProps) {
  const sizeMap = { sm: 40, md: 56, lg: 72 };
  const strokeMap = { sm: 3, md: 4, lg: 5 };
  const svgSize = () => sizeMap[props.size ?? "md"];
  const strokeWidth = () => strokeMap[props.size ?? "md"];
  const radius = createMemo(() => (svgSize() - strokeWidth()) / 2);
  const circumference = createMemo(() => 2 * Math.PI * radius());
  const offset = createMemo(() => circumference() - (props.pct / 100) * circumference());
  const fontSize = () => props.size === "sm" ? "10px" : props.size === "lg" ? "18px" : "14px";

  return (
    <div
      class={`progress-ring ${props.class ?? ""}`}
      style={{
        width: `${svgSize()}px`,
        height: `${svgSize()}px`,
        position: "relative",
        display: "inline-flex",
        "align-items": "center",
        "justify-content": "center",
        "flex-shrink": "0"
      }}
    >
      <svg
        width={svgSize()}
        height={svgSize()}
        viewBox={`0 0 ${svgSize()} ${svgSize()}`}
        style={{ transform: "rotate(-90deg)" }}
      >
        {/* Track */}
        <circle
          cx={svgSize() / 2}
          cy={svgSize() / 2}
          r={radius()}
          fill="none"
          stroke="var(--tier-3)"
          stroke-width={strokeWidth()}
        />
        {/* Fill */}
        <circle
          cx={svgSize() / 2}
          cy={svgSize() / 2}
          r={radius()}
          fill="none"
          stroke={props.accentColor ?? "var(--p)"}
          stroke-width={strokeWidth()}
          stroke-linecap="round"
          stroke-dasharray={String(circumference())}
          stroke-dashoffset={String(offset())}
          style={{
            transition: "stroke-dashoffset 0.8s var(--ease-smooth)"
          }}
        />
      </svg>
      <Show when={props.showLabel !== false}>
        <span
          class="progress-ring-label"
          style={{
            position: "absolute",
            "font-family": "var(--font-headline)",
            "font-size": fontSize(),
            "font-weight": "400",
            color: "var(--text-strong)",
            "line-height": "1"
          }}
        >
          {props.pct}%
        </span>
      </Show>
    </div>
  );
}
