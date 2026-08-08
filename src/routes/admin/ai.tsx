// src/routes/admin/ai.tsx
//
// CineLog V2 — Admin AI Control Center route (/admin/ai)
// ---------------------------------------------------------------------
// Phase 16 Chunk 1 — AI Integration (Groq).
//
// Thin route wrapper that mounts the AdminShell layout and lazy-loads
// the AdminAiPage feature component. Mirrors the pattern used by
// /admin/feature-flags and other admin routes.

import { Title } from "@solidjs/meta";
import { lazy } from "solid-js";
import AdminShell from "~/features/admin/AdminShell";

const AdminAiPage = lazy(() => import("~/features/admin/AdminAiPage"));

export default function AdminAiRoute() {
  return (
    <AdminShell>
      <Title>CineLog Admin — AI Control Center</Title>
      <AdminAiPage />
    </AdminShell>
  );
}
