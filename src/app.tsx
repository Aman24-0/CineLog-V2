// src/app.tsx
import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Suspense } from "solid-js";

import "./app/globals.css";
// Side-effect import: wires the theme module. Reading `theme()` here
// forces the createEffect in theme.ts to register, which applies
// `document.body.className = "theme-<name>"` on the client. Without
// this, no theme class is ever applied to <body>, so `--p`, `--p2`,
// `--active-bg`, `--active-text`, etc. all resolve to empty strings
// and every active-state control renders with no background color
// (the root cause of "active state visibility is still broken").
import { theme } from "./core/theme";
import AppShell from "./app/AppShell";
import { VaultProvider } from "~/features/watchlist/useVault";

// Read the signal so the createEffect is tracked. The return value is
// discarded — the effect is what matters.
void theme;

export default function App() {
  return (
    <VaultProvider>
      <Router
        root={(props) => (
          <AppShell>
            <Suspense fallback={<div>Loading...</div>}>
              {props.children}
            </Suspense>
          </AppShell>
        )}
      >
        <FileRoutes />
      </Router>
    </VaultProvider>
  );
}
