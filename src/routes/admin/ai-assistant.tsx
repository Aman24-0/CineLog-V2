// src/routes/admin/ai-assistant.tsx
//
// CineLog V2 — Admin AI Assistant route (/admin/ai-assistant)
// ---------------------------------------------------------------------
// Phase 16 Chunk 2 — AI Integration (Groq).
//
// Thin route wrapper that mounts the AdminShell layout and lazy-loads
// the AdminAiAssistantPage feature component. Mirrors the pattern used
// by /admin/ai and other admin routes.

import { Title } from "@solidjs/meta";
import { lazy } from "solid-js";
import AdminShell from "~/features/admin/AdminShell";

const AdminAiAssistantPage = lazy(
  () => import("~/features/admin/AdminAiAssistantPage")
);

export default function AdminAiAssistantRoute() {
  return (
    <AdminShell>
      <Title>CineLog Admin — AI Assistant</Title>
      <AdminAiAssistantPage />
    </AdminShell>
  );
}
