// src/app.tsx
import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Suspense } from "solid-js";
import { MetaProvider } from "@solidjs/meta";

import "./app/globals.css";

// ─── Self-hosted fonts (Phase 5 Task 3) ──────────────────────────────
//
// Previously these fonts were loaded via render-blocking <link> tags to
// fonts.googleapis.com in entry-server.tsx. Self-hosting via @fontsource
// eliminates the external DNS lookup + TLS handshake to Google's CDN,
// removes the render-blocking CSS request, and gives us full control
// over which weights are bundled (so we don't ship weights the app
// never uses).
//
// The imports are placed in app.tsx (the root component) rather than
// entry-client.tsx so the @fontsource CSS is included in the SSR
// rendered HTML — the browser starts fetching the woff2 files as soon
// as the HTML arrives, before JS hydration. This keeps LCP fast.
//
// Weights match the original Google Fonts request exactly:
//   Outfit:       300, 400, 500, 600, 700, 900
//   Bebas Neue:   400 (only weight)
//   Azeret Mono:  300, 400, 500, 700
//
// Material Symbols Outlined uses the variable font (full.css includes
// all four axes: FILL, GRAD, opsz, wght) so the existing
// font-variation-settings rules in base.css continue to work.
import "@fontsource/outfit/300.css";
import "@fontsource/outfit/400.css";
import "@fontsource/outfit/500.css";
import "@fontsource/outfit/600.css";
import "@fontsource/outfit/700.css";
import "@fontsource/outfit/900.css";
import "@fontsource/bebas-neue/400.css";
import "@fontsource/azeret-mono/300.css";
import "@fontsource/azeret-mono/400.css";
import "@fontsource/azeret-mono/500.css";
import "@fontsource/azeret-mono/700.css";
import "@fontsource-variable/material-symbols-outlined/full.css";

// Global appearance is derived from the signed-in user's profile banner.
// The controller is mounted by AppShell so the environment persists across
// consumer route changes; the dedicated Detail route keeps its own stack.
// Side-effect import: wires the preferences module — applies data-attributes
// to <html> for density, font-size, hide-spoilers, reduced-motion,
// high-contrast, and persists all preferences to localStorage. Reading
// the signals forces the createEffects to register.
import {
  density,
  fontSize,
  hideSpoilers,
  reducedMotion,
  highContrast,
  posterQuality
} from "./core/preferences";
import AppShell from "./app/AppShell";
import { GlobalErrorBoundary } from "~/shared/ui/GlobalErrorBoundary";
import { OfflineBanner } from "~/shared/ui/OfflineBanner";
import { UserLibraryProvider } from "~/shared/hooks/useUserLibrary";
import { VaultProvider } from "~/features/watchlist/useVault";
import { CollectionsProvider } from "~/features/collections/hooks/useCollections";
import { CuratedUniversesProvider } from "~/features/collections/hooks/useCuratedUniverses";
import { SearchProvider } from "~/shared/contexts/SearchContext";
import { GlassLoadingState } from "~/shared/ui/glass";

// Read the signals so the createEffects are tracked. The return values are
// discarded — the effects are what matter.
void density;
void fontSize;
void hideSpoilers;
void reducedMotion;
void highContrast;
void posterQuality;

export default function App() {
  return (
    <Router
      root={(props) => (
        <MetaProvider>
          <GlobalErrorBoundary>
            <OfflineBanner />
            <UserLibraryProvider>
              <VaultProvider>
                <CollectionsProvider>
                  <CuratedUniversesProvider>
                    <SearchProvider>
                      <AppShell>
                        <Suspense
                          fallback={
                            <GlassLoadingState fullHeight message="Loading" />
                          }
                        >
                          {props.children}
                        </Suspense>
                      </AppShell>
                    </SearchProvider>
                  </CuratedUniversesProvider>
                </CollectionsProvider>
              </VaultProvider>
            </UserLibraryProvider>
          </GlobalErrorBoundary>
        </MetaProvider>
      )}
    >
      <FileRoutes />
    </Router>
  );
}
