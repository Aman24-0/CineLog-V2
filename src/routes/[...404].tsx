// src/routes/[...404].tsx
//
// Catch-all 404 route — SolidStart's file-based router matches any URL
// that doesn't correspond to a defined route (e.g. /nonexistent,
// /movie/invalid-id/extra-segment, /tyop) and renders this component.
//
// The user sees a friendly "Page Not Found" message with a link back
// to /discover (the app's default landing page since the Home/Dashboard
// page was removed). The page is wrapped in PageContainer for consistent
// spacing and uses a Title tag so the browser tab reads "Page Not Found
// · CineLog" instead of the previous behaviour where the title stayed
// as whatever the previous page had set (confusing for users who land
// here from a stale bookmark).
//
// STATUS CODE:
//   SolidStart automatically returns HTTP 404 for unmatched routes
//   when the catch-all is named `[...404].tsx` — no explicit
//   `setResponseStatus(404)` call is required. The `404` in the
//   filename is the convention that triggers this.

import { Title } from "@solidjs/meta";
import { useNavigate } from "@solidjs/router";
import { type Component } from "solid-js";
import PageContainer from "~/shared/ui/PageContainer";

const NotFoundPage: Component = () => {
  const navigate = useNavigate();

  return (
    <PageContainer width="narrow">
      <Title>Page Not Found · CineLog</Title>
      <div
        class="flex min-h-[60vh] flex-col items-center justify-center text-center"
        style={{ gap: "var(--sp-6)" }}
      >
        {/* Large 404 — uses the Bebas Neue headline font for a cinematic
            feel that matches the rest of the app's typography. */}
        <h1
          class="m-0"
          style={{
            "font-family": "'Bebas Neue', cursive",
            "font-size": "clamp(5rem, 18vw, 9rem)",
            "line-height": "1",
            "letter-spacing": "0.04em",
            color: "var(--text-strong)",
            "text-shadow": "0 0 32px var(--p-glow, rgba(232, 183, 74, 0.3))"
          }}
        >
          404
        </h1>

        <div class="flex flex-col items-center" style={{ gap: "var(--sp-2)" }}>
          <h2
            class="m-0"
            style={{
              "font-family": "'Outfit', sans-serif",
              "font-size": "1.5rem",
              "font-weight": 700,
              color: "var(--text-strong)"
            }}
          >
            Page not found
          </h2>
          <p
            class="m-0"
            style={{
              "font-family": "'Outfit', sans-serif",
              "font-size": "0.9375rem",
              color: "var(--text-muted)",
              "max-width": "32rem"
            }}
          >
            We couldn't find the page you were looking for. It may have been
            moved, deleted, or never existed. The link might also be stale —
            check the URL and try again, or head back to Discover to find
            something new to watch.
          </p>
        </div>

        <div class="flex flex-wrap items-center justify-center" style={{ gap: "var(--sp-3)" }}>
          <button
            type="button"
            class="btn-primary focus-ring"
            onClick={() => navigate("/discover")}
            style={{
              background: "var(--p)",
              color: "var(--void, #0a0a0a)",
              "font-weight": 700,
              "font-size": "0.9375rem",
              padding: "0.75rem 1.5rem",
              "border-radius": "var(--radius-lg)",
              border: "none",
              cursor: "pointer",
              "box-shadow": "0 0 20px var(--p-glow, rgba(232, 183, 74, 0.4))"
            }}
          >
            Back to Discover
          </button>
          <button
            type="button"
            class="btn-ghost focus-ring"
            onClick={() => {
              if (typeof window !== "undefined") window.history.back();
            }}
            style={{
              background: "transparent",
              color: "var(--text-muted)",
              "font-weight": 600,
              "font-size": "0.9375rem",
              padding: "0.75rem 1.25rem",
              "border-radius": "var(--radius-lg)",
              border: "1px solid var(--hairline)",
              cursor: "pointer"
            }}
          >
            Go back
          </button>
        </div>
      </div>
    </PageContainer>
  );
};

export default NotFoundPage;
