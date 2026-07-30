/**
 * CineLog V2 — Global Error Boundary
 * ---------------------------------------------------------------------
 * Production-grade error boundary that prevents white-screen crashes.
 * Wraps the entire application below the providers. Any uncaught
 * runtime error in any component displays a friendly fallback UI
 * with a retry button and a "Back to Home" link.
 *
 * IMPORTANT: The fallback uses window.location (NOT useNavigate) so it
 * works even if the error occurs outside or before the Router context
 * is established (e.g. during provider initialization).
 *
 * Polished:
 *  - Uses design tokens (--tier-2, --hairline, --p) instead of bare
 *    Tailwind classes so the fallback matches the cinematic identity.
 *  - The error icon sits in a circular badge with an accent-tinted
 *    background — same visual language as the LoadingScreen mark.
 *  - Heading uses Bebas Neue (font-headline) for consistency with the
 *    rest of the app's headings.
 *  - Retry button shows a spinner state and disables while retrying.
 *  - The dev-only stack trace uses Azeret Mono and a subtle tinted
 *    background so it reads like a diagnostic, not a crash.
 *  - In production, the error message is shown in a quiet mono caption
 *    so users can screenshot / report it without seeing the stack.
 */

import { ErrorBoundary, Show, type JSX, createSignal } from "solid-js";

interface GlobalErrorFallbackProps {
  error: Error;
  reset: () => void;
}

function GlobalErrorFallback(props: GlobalErrorFallbackProps): JSX.Element {
  const [retrying, setRetrying] = createSignal(false);

  const handleRetry = () => {
    setRetrying(true);
    props.reset();
  };

  const handleHome = () => {
    // Use window.location instead of useNavigate() so the fallback
    // works even if the Router context isn't available yet.
    if (typeof window !== "undefined") {
      window.location.href = "/";
    }
    props.reset();
  };

  return (
    <div
      style={{
        "min-height": "100dvh",
        display: "flex",
        "flex-direction": "column",
        "align-items": "center",
        "justify-content": "center",
        padding: "var(--sp-6)",
        "text-align": "center",
        background: "var(--void)",
        color: "var(--text-strong)"
      }}
    >
      {/* Icon badge — same visual language as LoadingScreen */}
      <div
        style={{
          display: "flex",
          "align-items": "center",
          "justify-content": "center",
          width: "5rem",
          height: "5rem",
          "border-radius": "1.5rem",
          background: "var(--tier-2)",
          border: "1px solid var(--hairline-2)",
          "box-shadow":
            "var(--shadow-elevated), 0 0 24px rgba(248,113,113,0.18)",
          "margin-bottom": "var(--sp-5)"
        }}
        aria-hidden="true"
      >
        <span
          class="material-symbols-outlined"
          style={{
            "font-size": "2.5rem",
            color: "#f87171",
            "font-variation-settings":
              "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 40"
          }}
        >
          error
        </span>
      </div>

      <h2
        style={{
          "font-family": "'Bebas Neue', cursive",
          "font-size": "2rem",
          "line-height": "1",
          "letter-spacing": "0.03em",
          margin: "0 0 var(--sp-2)",
          color: "var(--text-strong)"
        }}
      >
        Something went wrong
      </h2>

      <p
        style={{
          "max-width": "360px",
          color: "var(--text-soft)",
          margin: "0 0 var(--sp-6)",
          "font-family": "'Outfit', sans-serif",
          "font-size": "0.9375rem",
          "line-height": "1.55"
        }}
      >
        An unexpected error occurred. Your data is safe — try again or return
        home.
      </p>

      <div
        style={{
          display: "flex",
          gap: "var(--sp-3)",
          "flex-wrap": "wrap",
          "justify-content": "center"
        }}
      >
        <button
          class="btn-primary focus-ring"
          onClick={handleRetry}
          disabled={retrying()}
          style={{
            display: "inline-flex",
            "align-items": "center",
            gap: "var(--sp-1)"
          }}
        >
          <span
            class="material-symbols-outlined"
            style={{
              "font-size": "16px",
              animation: retrying()
                ? "softPulse 1s ease-in-out infinite"
                : "none"
            }}
            aria-hidden="true"
          >
            {retrying() ? "progress_activity" : "refresh"}
          </span>
          {retrying() ? "Retrying…" : "Retry"}
        </button>
        <button
          class="btn-ghost focus-ring"
          onClick={handleHome}
          style={{
            display: "inline-flex",
            "align-items": "center",
            gap: "var(--sp-1)"
          }}
        >
          <span
            class="material-symbols-outlined"
            style={{ "font-size": "16px" }}
            aria-hidden="true"
          >
            home
          </span>
          Back to Home
        </button>
      </div>

      <Show when={import.meta.env.DEV}>
        <pre
          style={{
            "margin-top": "var(--sp-6)",
            "max-width": "600px",
            overflow: "auto",
            "font-size": "11px",
            color: "var(--text-muted)",
            "text-align": "left",
            "white-space": "pre-wrap",
            "font-family": "'Azeret Mono', monospace",
            background: "var(--tier-2)",
            border: "1px solid var(--hairline)",
            "border-radius": "var(--radius-md)",
            padding: "var(--sp-3)"
          }}
        >
          {props.error.message}
          {props.error.stack ? `\n\n${props.error.stack}` : ""}
        </pre>
      </Show>

      {/* Also show the error message in production so the user can
          report what went wrong. The full stack is dev-only. */}
      <Show when={!import.meta.env.DEV}>
        <p
          style={{
            "margin-top": "var(--sp-4)",
            "max-width": "500px",
            "font-size": "11px",
            color: "var(--text-dim)",
            "font-family": "'Azeret Mono', monospace",
            "word-break": "break-word",
            opacity: "0.7",
            "line-height": "1.5"
          }}
        >
          {props.error.message}
        </p>
      </Show>
    </div>
  );
}

/**
 * GlobalErrorBoundary — wraps the entire app. Any uncaught error
 * in any component displays the fallback UI instead of white-screening.
 */
export function GlobalErrorBoundary(props: {
  children: JSX.Element;
}): JSX.Element {
  return (
    <ErrorBoundary
      fallback={(error, reset) => (
        <GlobalErrorFallback error={error} reset={reset} />
      )}
    >
      {props.children}
    </ErrorBoundary>
  );
}
