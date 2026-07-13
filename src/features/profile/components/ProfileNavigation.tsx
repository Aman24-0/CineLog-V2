// src/features/profile/components/ProfileNavigation.tsx
//
// Settings section — action row + sign-out.
//
// New design (per user request):
//   • Action row: 3 buttons (Statistics, Upcoming, Settings)
//     - History removed (replaced by Upcoming)
//     - Watchlist removed (it's already in the bottom nav)
//   • No separate "Settings" link below the row (it's now in the row)
//   • Sign Out button — full width, quiet
//   • Delete Account removed (per user request)
//
// Design:
//   • Quick links: horizontal row of 3 items, glass surface
//   • Sign Out: ghost, quiet, full-width below the row
//   • No red hairline, no danger zone (delete is gone)

import { type Component } from "solid-js";

interface ProfileNavigationProps {
  onSignOut: () => void;
}

const ACTIONS = [
  { href: "/profile/stats", label: "Statistics", icon: "insights" },
  { href: "/profile/upcoming", label: "Upcoming", icon: "upcoming" },
  { href: "/settings", label: "Settings", icon: "settings" },
] as const;

const ProfileNavigation: Component<ProfileNavigationProps> = (props) => {
  return (
    <section class="profile-section profile-settings" aria-label="Settings and navigation">
      {/* Action row — horizontal, 3 items */}
      <div class="settings-quick-links" role="list" aria-label="Quick actions">
        {ACTIONS.map((link) => (
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

      {/* Sign Out — full width, quiet */}
      <button
        type="button"
        class="settings-sign-out-button focus-ring"
        onClick={() => props.onSignOut()}
        aria-label="Sign out"
      >
        <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">
          logout
        </span>
        Sign Out
      </button>
    </section>
  );
};

export default ProfileNavigation;
