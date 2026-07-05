import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Suspense } from "solid-js";

import "./app/globals.css";
import AppShell from "./app/AppShell";

export default function App() {
  return (
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
  );
}
