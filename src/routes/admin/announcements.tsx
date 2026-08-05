// src/routes/admin/announcements.tsx
//
// CineLog V2 — Legacy Admin Announcements route
// ---------------------------------------------------------------------
// Phase 9 Chunk 4: the canonical announcements page now lives at
// /admin/communication/announcements (Communication Hub). This file
// exists ONLY to redirect old bookmarks / sidebar links to the new
// URL. The redirect is server-side via a meta refresh + client-side
// navigation fallback so it works even without JS.
//
// This file can be removed once all internal links are confirmed to
// point at /admin/communication/announcements. For now it's a
// safety net.

import { Title } from "@solidjs/meta";
import { useNavigate } from "@solidjs/router";
import { onMount } from "solid-js";
import AdminShell from "~/features/admin/AdminShell";

export default function AdminAnnouncementsRedirect() {
  const navigate = useNavigate();
  onMount(() => {
    navigate("/admin/communication/announcements", { replace: true });
  });

  return (
    <AdminShell>
      <Title>CineLog Admin — Redirecting…</Title>
      {/* Fallback meta refresh for the no-JS case. */}
      <meta
        http-equiv="refresh"
        content="0; url=/admin/communication/announcements"
      />
      <div class="flex items-center justify-center py-12 text-sm text-text-muted">
        <span
          class="material-symbols-outlined mr-2 animate-spin"
          aria-hidden="true"
        >
          progress_activity
        </span>
        Redirecting to Communication Hub → Announcements…
      </div>
    </AdminShell>
  );
}
