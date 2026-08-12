// src/routes/index.tsx
//
// Phase 11 — Landing Page & Marketing Site
// ----------------------------------------
// The root route `/` now renders the new <LandingPage /> for logged-out
// users. Logged-in users are redirected to `/discover` (the app's main
// serendipitous entry point — answers "what should I watch next?").
//
// Auth-state handling:
//   - During SSR: `useAuth()` returns `isSignedIn() === false` and
//     `authReady() === false` (signals are module-level and resolve
//     on the client). The LandingPage is server-rendered so the page
//     has full SEO/OG content.
//   - After hydration: `checkInitialSession()` resolves. If a session
//     is found, `isSignedIn()` flips to true and the <Navigate> wins,
//     redirecting to `/discover`. There may be a brief flash of the
//     LandingPage for signed-in users, but this is the standard SSR
//     pattern and is acceptable for a marketing page.
//
// Note: the AppShell detects `location.pathname === "/"` and skips the
// consumer chrome (AppHeader, BottomNavigation, DesktopSidebar,
// AnnouncementsBanner) so the LandingPage has a clean canvas. AuthModal
// and ToastContainer remain mounted so the "Get Started" / "Login"
// CTAs work and auth toasts can fire.

import { lazy, Suspense, Show } from "solid-js";
import { Navigate } from "@solidjs/router";
import { Title, Link, Meta } from "@solidjs/meta";
import { useAuth } from "~/shared/hooks/useAuth";
import { GlassSkeleton } from "~/shared/ui/glass";

const LandingPage = lazy(() => import("~/features/landing/LandingPage"));

function LandingRouteFallback() {
  return (
    <div
      class="page-enter"
      style={{
        "min-height": "100vh",
        display: "flex",
        "align-items": "center",
        "justify-content": "center"
      }}
      aria-busy="true"
      aria-live="polite"
    >
      <GlassSkeleton class="h-96 w-full max-w-3xl rounded-lg" />
    </div>
  );
}

export default function HomeRoute() {
  const { isSignedIn } = useAuth();

  return (
    <>
      <Title>CineLog — Your Cinematic Universe, Perfected</Title>
      <Link rel="canonical" href="https://cinelog.app/" />
      <Meta name="description" content="CineLog — track your movies and TV shows, discover new favorites, and build curated collections. A modern watchlist app for cinephiles." />
      <Suspense fallback={<LandingRouteFallback />}>
        <Show when={isSignedIn()} fallback={<LandingPage />}>
          <Navigate href="/discover" />
        </Show>
      </Suspense>
    </>
  );
}
