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
    <div class="global-error-boundary" style={{
      "min-height": "100dvh",
      display: "flex",
      "flex-direction": "column",
      "align-items": "center",
      "justify-content": "center",
      "padding": "var(--sp-6)",
      "text-align": "center",
      "background": "var(--bg)",
      "color": "var(--text)",
    }}>
      <span
        class="material-symbols-outlined"
        style={{ "font-size": "48px", "margin-bottom": "var(--sp-4)", "color": "var(--tier-3)" }}
        aria-hidden="true"
      >
        error
      </span>
      <h2 style={{ "font-family": "Bebas Neue, sans-serif", "font-size": "28px", "margin-bottom": "var(--sp-2)" }}>
        Something went wrong
      </h2>
      <p style={{ "max-width": "360px", "color": "var(--text-soft)", "margin-bottom": "var(--sp-6)" }}>
        An unexpected error occurred. Your data is safe — try again or return home.
      </p>
      <div style={{ display: "flex", "gap": "var(--sp-3)" }}>
        <button
          class="btn-primary"
          onClick={handleRetry}
          disabled={retrying()}
          style={{ display: "flex", "align-items": "center", "gap": "var(--sp-1)" }}
        >
          <span class="material-symbols-outlined" style={{ "font-size": "16px" }} aria-hidden="true">
            refresh
          </span>
          {retrying() ? "Retrying…" : "Retry"}
        </button>
        <button
          class="btn-ghost"
          onClick={handleHome}
          style={{ display: "flex", "align-items": "center", "gap": "var(--sp-1)" }}
        >
          <span class="material-symbols-outlined" style={{ "font-size": "16px" }} aria-hidden="true">
            home
          </span>
          Back to Home
        </button>
      </div>
      <Show when={import.meta.env.DEV}>
        <pre style={{
          "margin-top": "var(--sp-6)",
          "max-width": "600px",
          "overflow": "auto",
          "font-size": "11px",
          "color": "var(--tier-3)",
          "text-align": "left",
          "white-space": "pre-wrap",
        }}>
          {props.error.message}
          {props.error.stack ? `\n\n${props.error.stack}` : ""}
        </pre>
      </Show>

      {/* Also show the error message in production so the user can
          report what went wrong. The full stack is dev-only. */}
      <Show when={!import.meta.env.DEV}>
        <p style={{
          "margin-top": "var(--sp-4)",
          "max-width": "500px",
          "font-size": "12px",
          "color": "var(--text-dim)",
          "font-family": "'Azeret Mono', monospace",
          "word-break": "break-word",
          "opacity": 0.6,
        }}>
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
export function GlobalErrorBoundary(props: { children: JSX.Element }): JSX.Element {
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
