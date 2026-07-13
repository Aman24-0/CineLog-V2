// src/features/profile/components/ProfileNavigation.tsx
//
// Settings section — quick links + single settings link + danger.
// Minimal utility at the bottom of the profile.
//
// Design:
//   • Quick links: horizontal row of 3 items (Statistics, History, Watchlist)
//   • Settings: single link to /settings (not a menu of individual items)
//   • Red hairline before danger
//   • Sign Out: ghost, quiet
//   • Delete Account: text link, not a button

import { type Component } from "solid-js";

interface ProfileNavigationProps {
  onSignOut: () => void;
}

const QUICK_LINKS = [
  { href: "/profile/stats", label: "Statistics", icon: "insights" },
  { href: "/profile/history", label: "History", icon: "history" },
  { href: "/watchlist", label: "Watchlist", icon: "video_library" },
] as const;

const ProfileNavigation: Component<ProfileNavigationProps> = (props) => {
  return (
    <section class="profile-section profile-settings" aria-label="Settings and navigation">
      {/* Quick links — horizontal row */}
      <div class="settings-quick-links" role="list" aria-label="Quick links">
        {QUICK_LINKS.map((link) => (
          <a
            href={link.href}
            class="settings-quick-link focus-ring"
            style={{ "text-decoration": "none" }}
            aria-label={link.label}
          >
            <span class="material-symbols-outlined settings-quick-link-icon" aria-hidden="true">
              {link.icon}
            </span>
            <span class="settings-quick-link-label">{link.label}</span>
          </a>
        ))}
      </div>

      {/* Single Settings link */}
      <a
        href="/settings"
        class="settings-main-link focus-ring"
        style={{ "text-decoration": "none" }}
        aria-label="Settings"
      >
        <span class="material-symbols-outlined" style={{ "font-size": "18px", "color": "var(--text-dim)" }} aria-hidden="true">
          settings
        </span>
        <span class="settings-main-link-label">Settings</span>
        <span class="material-symbols-outlined" style={{ "font-size": "16px", "color": "var(--text-dim)", "margin-left": "auto" }} aria-hidden="true">
          chevron_right
        </span>
      </a>

      {/* Red hairline */}
      <div class="settings-danger-divider" aria-hidden="true" />

      {/* Sign Out + Delete */}
      <div class="settings-danger">
        <button
          type="button"
          class="settings-sign-out focus-ring"
          onClick={props.onSignOut}
          aria-label="Sign out"
        >
          Sign Out
        </button>
        <a
          href="/settings/account"
          class="settings-delete-link"
          style={{ "text-decoration": "none" }}
          aria-label="Delete account"
        >
          Delete account
        </a>
      </div>
    </section>
  );
};

export default ProfileNavigation;
