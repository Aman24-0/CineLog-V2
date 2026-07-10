// src/features/profile/components/QuickLinks.tsx
import { For, type Component } from "solid-js";

interface QuickLinkDef {
  href: string;
  label: string;
  desc: string;
  icon: string;
}

const LINKS: QuickLinkDef[] = [
  { href: "/profile/stats", label: "Statistics", desc: "Your watching insights", icon: "insights" },
  { href: "/profile/history", label: "History", desc: "Your watch log", icon: "history" },
  { href: "/profile/achievements", label: "Achievements", desc: "Your milestones", icon: "emoji_events" },
  { href: "/settings", label: "Settings", desc: "Appearance, account, more", icon: "settings" },
];

/**
 * QuickLinks — elegant navigation rows.
 *
 * Replaces the old ghost-button pattern. Each row is a full-width
 * tappable surface with an icon tile, label, description, and chevron.
 * Opens its own dedicated page.
 */
const QuickLinks: Component = () => {
  return (
    <div class="quick-links">
      <For each={LINKS}>
        {(link) => (
          <a
            href={link.href}
            class="quick-link-row focus-ring"
            aria-label={`${link.label} — ${link.desc}`}
          >
            <div class="quick-link-icon" aria-hidden="true">
              <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">
                {link.icon}
              </span>
            </div>
            <div class="quick-link-text">
              <span class="quick-link-label">{link.label}</span>
              <span class="quick-link-desc">{link.desc}</span>
            </div>
            <span class="material-symbols-outlined quick-link-chevron" aria-hidden="true">
              chevron_right
            </span>
          </a>
        )}
      </For>
    </div>
  );
};

export default QuickLinks;
