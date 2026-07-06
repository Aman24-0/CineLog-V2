// src/app.tsx
import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Suspense } from "solid-js";

import "./app/globals.css";
import AppShell from "./app/AppShell";
import { VaultProvider } from "~/features/watchlist/useVault";

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
