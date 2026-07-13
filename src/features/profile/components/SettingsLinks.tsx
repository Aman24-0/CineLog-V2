// src/features/profile/components/SettingsLinks.tsx
//
// Sprint 2C — NEW FILE.
// Settings navigation rows, separated from Quick Actions.
// Each row uses PremiumListItem for consistent icon + title + description + chevron.

import { For, type Component } from "solid-js";
import { PremiumListItem } from "~/shared/ui/premium";

interface SettingsLinkDef {
  href: string;
  label: string;
  desc: string;
  icon: string;
}

const SETTINGS_LINKS: SettingsLinkDef[] = [
  { href: "/settings/appearance", label: "Appearance", desc: "Themes, display, colors", icon: "palette" },
  { href: "/settings/notifications", label: "Notifications", desc: "Manage alerts", icon: "notifications" },
  { href: "/settings/privacy", label: "Privacy", desc: "Data & visibility", icon: "shield" },
  { href: "/settings/account", label: "Account", desc: "Email, password, security", icon: "person" },
];

/**
 * SettingsLinks — separated settings navigation rows.
 *
 * Uses PremiumListItem for consistent icon alignment, spacing,
 * and trailing content. Each row links to its dedicated settings page.
 */
const SettingsLinks: Component = () => {
  return (
    <div class="settings-links" role="list" aria-label="Settings links">
      <For each={SETTINGS_LINKS}>
        {(link) => (
          <a
            href={link.href}
            class="settings-link-row focus-ring"
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
                <span class="material-symbols-outlined settings-link-chevron" style={{ color: "var(--text-dim)", "font-size": "18px" }} aria-hidden="true">
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

export default SettingsLinks;
