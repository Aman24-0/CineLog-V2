// src/shared/ui/LoadingScreen.tsx
import { Component } from "solid-js";

/**
 * LoadingScreen — premium initial-load experience.
 *
 * Shown during SSR hydration / initial route resolution. Uses the
 * design-system tokens (no Tailwind utilities) so it matches the
 * cinematic identity from the very first paint.
 *
 * The mark is a circular badge with the movie_filter icon, gently
 * pulsing on the accent glow. Below it sits the wordmark with the
 * accent suffix, then a small mono caption.
 *
 * SSR-safe: pure markup, no client-only APIs.
 */
const LoadingScreen: Component = () => {
  return (
    <div
      style={{
        "min-height": "100dvh",
        display: "flex",
        "flex-direction": "column",
        "align-items": "center",
        "justify-content": "center",
        background: "var(--void)",
        color: "var(--text-strong)",
        padding: "var(--sp-6)",
        "text-align": "center",
      }}
    >
      {/* Ambient glow — same radial used across pages */}
      <div
        style={{
          position: "absolute",
          top: "30%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "60vw",
          height: "30vh",
          background: "radial-gradient(ellipse at center, var(--p-glow) 0%, transparent 60%)",
          opacity: "0.5",
          "pointer-events": "none",
        }}
        aria-hidden="true"
      />

      {/* Mark — circular badge with pulsing accent glow */}
      <div
        style={{
          position: "relative",
          display: "flex",
          "align-items": "center",
          "justify-content": "center",
          width: "5rem",
          height: "5rem",
          "border-radius": "1.5rem",
          background: "var(--tier-2)",
          border: "1px solid var(--hairline-2)",
          "box-shadow": "var(--shadow-elevated), 0 0 32px var(--p-glow)",
          "margin-bottom": "var(--sp-5)",
          animation: "softPulse 2s ease-in-out infinite",
        }}
        aria-hidden="true"
      >
        <span
          class="material-symbols-outlined"
          style={{
            "font-size": "2.5rem",
            color: "var(--p)",
            "font-variation-settings": "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 40",
          }}
        >
          movie_filter
        </span>
      </div>

      {/* Wordmark — Inter, bold, consistent with AppHeader */}
      <h1
        style={{
          "font-family": "'Inter', 'Outfit', sans-serif",
          "font-size": "2rem",
          "line-height": "1",
          "font-weight": "800",
          "letter-spacing": "-0.02em",
          margin: "0",
          color: "var(--text-strong)",
        }}
      >
        CINE<span style={{ color: "var(--p)" }}>LOG</span>
      </h1>

      {/* Caption */}
      <p
        style={{
          "font-family": "'Azeret Mono', 'Inter', monospace",
          "font-size": "0.625rem",
          "font-weight": "700",
          "letter-spacing": "0.18em",
          "text-transform": "uppercase",
          color: "var(--text-muted)",
          margin: "var(--sp-3) 0 0",
        }}
      >
        Initializing Vault
      </p>
    </div>
  );
};

export default LoadingScreen;
