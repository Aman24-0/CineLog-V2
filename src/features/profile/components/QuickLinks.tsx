// src/features/profile/components/QuickLinks.tsx
//
// Sprint 2B — Migrated to PremiumListItem for consistent
// icon alignment, spacing, and trailing content.
// Zero changes to navigation functionality.

import { For, type Component } from "solid-js";
import { PremiumListItem } from "~/shared/ui/premium";

interface QuickLinkDef {
  href: string;
  label: string;
  desc: string;
  icon: string;
}

const LINKS: QuickLinkDef[] = [
  { href: "/profile/stats", label: "Statistics", desc: "Your watching insights", icon: "insights" },
  { href: "/profile/history", label: "History", desc: "Your watch log", icon: "history" },
  { href: "/profile/achievements", label: "Achievements", desc: "Your milestones", icon: "emoji_event" },
  { href: "/settings", label: "Settings", desc: "Appearance, account, more", icon: "settings" },
];

/**
 * QuickLinks — elegant navigation rows using PremiumListItem.
 *
 * Each row uses PremiumListItem with icon, title, subtitle,
 * and a trailing chevron for consistent alignment and spacing.
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
            style={{ "text-decoration": "none" }}
            aria-label={`${link.label} — ${link.desc}`}
          >
            <PremiumListItem
              title={link.label}
              subtitle={link.desc}
              icon={link.icon}
              iconFill
              size="comfortable"
              variant="subtle"
              trailing={
                <span class="material-symbols-outlined" style={{ color: "var(--text-dim)", "font-size": "18px" }} aria-hidden="true">
                  chevron_right
                </span>
              }
            />
          </a>
        )}
      </For>
    </div>
  );
};

export default QuickLinks;
