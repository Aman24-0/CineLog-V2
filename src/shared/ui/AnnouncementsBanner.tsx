// src/shared/ui/AnnouncementsBanner.tsx
//
// CineLog V2 — Top-of-page banner announcements
// ---------------------------------------------------------------------
// Renders active banner-type announcements just below the AppHeader.
// Multiple banners stack vertically. Each banner:
//   - Shows severity-colored left border + icon
//   - Title + body (truncated)
//   - Optional CTA link
//   - Dismiss button (X) if is_dismissible=true
//
// Toast and modal announcements are NOT handled here — they go in
// separate components (toasts are handled by ToastContainer; modals
// will be a future addition).
//
// Dismissal is persisted per-id in localStorage for 24h (see lib/announcements.ts).

import { For, Show, type Component } from "solid-js";
import { useAnnouncements, type Announcement } from "~/lib/announcements";

const SEVERITY_STYLES: Record<
  Announcement["severity"],
  { bg: string; border: string; fg: string; icon: string }
> = {
  info: {
    bg: "rgba(59, 130, 246, 0.12)",
    border: "rgb(59, 130, 246)",
    fg: "rgb(191, 219, 254)",
    icon: "ℹ️",
  },
  success: {
    bg: "rgba(34, 197, 94, 0.12)",
    border: "rgb(34, 197, 94)",
    fg: "rgb(187, 247, 208)",
    icon: "✅",
  },
  warning: {
    bg: "rgba(245, 158, 11, 0.12)",
    border: "rgb(245, 158, 11)",
    fg: "rgb(253, 230, 138)",
    icon: "⚠️",
  },
  error: {
    bg: "rgba(239, 68, 68, 0.12)",
    border: "rgb(239, 68, 68)",
    fg: "rgb(254, 202, 202)",
    icon: "🛑",
  },
};

const AnnouncementsBanner: Component = () => {
  const { visibleBanners, dismiss } = useAnnouncements();

  return (
    <Show when={visibleBanners().length > 0}>
      <div
        role="region"
        aria-label="Announcements"
        style={{
          display: "flex",
          "flex-direction": "column",
          gap: "0",
        }}
      >
        <For each={visibleBanners()}>
          {(a) => {
            const s = SEVERITY_STYLES[a.severity];
            return (
              <div
                role="status"
                style={{
                  background: s.bg,
                  "border-left": `3px solid ${s.border}`,
                  color: s.fg,
                  padding: "var(--sp-2) var(--sp-3)",
                  display: "flex",
                  "align-items": "center",
                  gap: "var(--sp-2)",
                  "font-size": "0.85rem",
                }}
              >
                <span style={{ "flex-shrink": 0, "font-size": "0.95rem" }}>{s.icon}</span>
                <div style={{ flex: 1, "min-width": 0 }}>
                  <span style={{ "font-weight": "600", "margin-right": "var(--sp-2)" }}>
                    {a.title}
                  </span>
                  <Show when={a.body}>
                    <span style={{ opacity: 0.9 }}>{a.body}</span>
                  </Show>
                  <Show when={a.cta_label && a.cta_href}>
                    <a
                      href={a.cta_href!}
                      style={{
                        "margin-left": "var(--sp-2)",
                        color: s.fg,
                        "text-decoration": "underline",
                        "font-weight": "600",
                      }}
                    >
                      {a.cta_label} →
                    </a>
                  </Show>
                </div>
                <Show when={a.is_dismissible}>
                  <button
                    type="button"
                    onClick={() => dismiss(a.id)}
                    aria-label="Dismiss announcement"
                    style={{
                      background: "transparent",
                      border: "none",
                      color: s.fg,
                      cursor: "pointer",
                      padding: "2px 6px",
                      "font-size": "1rem",
                      "line-height": "1",
                      opacity: 0.7,
                      "border-radius": "var(--radius-sm)",
                    }}
                    title="Dismiss"
                  >
                    ×
                  </button>
                </Show>
              </div>
            );
          }}
        </For>
      </div>
    </Show>
  );
};

export default AnnouncementsBanner;
