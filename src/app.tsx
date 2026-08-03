// src/app.tsx
import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Suspense } from "solid-js";
import { MetaProvider } from "@solidjs/meta";

import "./app/globals.css";
// Side-effect import: wires the theme module. Reading `theme()` here
// forces the createEffect in theme.ts to register, which applies
// `document.body.className = "theme-<name>"` on the client. Without
// this, no theme class is ever applied to <body>, so `--p`, `--p2`,
// `--active-bg`, `--active-text`, etc. all resolve to empty strings
// and every active-state control renders with no background color
// (the root cause of "active state visibility is still broken").
import { theme } from "./core/theme";
// Side-effect import: wires the preferences module — applies data-attributes
// to <html> for theme mode (dark/light/system), density, font-size, hide-
// spoilers, reduced-motion, high-contrast, and persists all preferences to
// localStorage. Reading the signals forces the createEffects to register.
import {
  themeMode,
  density,
  fontSize,
  hideSpoilers,
  reducedMotion,
  highContrast,
  customAccent,
  posterQuality
} from "./core/preferences";
import AppShell from "./app/AppShell";
import { GlobalErrorBoundary } from "~/shared/ui/GlobalErrorBoundary";
import { OfflineBanner } from "~/shared/ui/OfflineBanner";
import { UserLibraryProvider } from "~/shared/hooks/useUserLibrary";
import { VaultProvider } from "~/features/watchlist/useVault";
import { CollectionsProvider } from "~/features/collections/hooks/useCollections";
import { SearchProvider } from "~/shared/contexts/SearchContext";
import { GlassLoadingState } from "~/shared/ui/glass";

// Read the signals so the createEffects are tracked. The return values are
// discarded — the effects are what matter.
void theme;
void themeMode;
void density;
void fontSize;
void hideSpoilers;
void reducedMotion;
void highContrast;
void customAccent;
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
