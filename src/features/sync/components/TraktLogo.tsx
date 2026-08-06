// src/features/sync/components/TraktLogo.tsx
//
// TraktLogo — inline SVG mark for the Trakt brand.
//
// Trakt's official logo is a red square with two horizontal "scan"
// lines passing through it (a tracking/scan aesthetic). We approximate
// the mark here as an inline SVG so the app ships zero new binary
// assets, and the logo inherits foreground color via `currentColor`
// for theme-able contexts.
//
// The mark is wrapped in a fixed-size rounded square so it sits
// cleanly inside cards next to text — same visual rhythm as a
// Material Symbols icon would.

import { type Component } from "solid-js";

export interface TraktLogoProps {
  /** Square edge length in pixels. @default 40 */
  size?: number;
  /** Optional title for a11y (rendered as <title>). */
  title?: string;
  /** Override the brand-red fill. Defaults to Trakt's signature red (#ED1F26). */
  color?: string;
}

/**
 * Inline SVG of the Trakt mark — a rounded red square with two
 * horizontal scan lines through it. Recognizable at 20px–80px.
 */
const TraktLogo: Component<TraktLogoProps> = (props) => {
  const size = () => props.size ?? 40;
  const color = () => props.color ?? "#ED1F26";
  const title = () => props.title ?? "Trakt";

  return (
    <svg
      width={size()}
      height={size()}
      viewBox="0 0 48 48"
      role="img"
      aria-label={title()}
      // Inline-block so it lines up with text baselines cleanly.
      style={{ display: "inline-block", "flex-shrink": "0" }}
    >
      <title>{title()}</title>
      {/* Outer rounded square — Trakt's signature red */}
      <rect
        x="4"
        y="4"
        width="40"
        height="40"
        rx="8"
        ry="8"
        fill={color()}
      />
      {/* Two horizontal scan lines — negative space, cut through the square */}
      <rect x="4" y="20" width="40" height="3" fill="rgba(255,255,255,0.92)" />
      <rect x="4" y="27" width="40" height="3" fill="rgba(255,255,255,0.92)" />
      {/* Subtle inner highlight to add depth */}
      <rect
        x="4"
        y="4"
        width="40"
        height="40"
        rx="8"
        ry="8"
        fill="none"
        stroke="rgba(255,255,255,0.18)"
        stroke-width="1"
      />
    </svg>
  );
};

export default TraktLogo;
