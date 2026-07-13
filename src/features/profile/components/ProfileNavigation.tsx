// src/features/profile/components/ProfileNavigation.tsx
//
// Sprint 2C — Final Implementation.
// Merged navigation — Settings + Danger.
// "The ending credits."
//
// Design:
//   • No group labels for settings (self-explanatory items)
//   • Red hairline divider before danger actions
//   • @username and "Member since" shown subtly at top
//   • Each row: icon + title + description + chevron
//   • Danger: no dramatic red card, just red-tinted icon

import { For, Show, type Component } from "solid-js";
import { PremiumListItem } from "~/shared/ui/premium";

// ── Link Definitions ─────────────────────────────────────────────

interface NavLink {
  href: string;
  label: string;
  desc: string;
  icon: string;
  danger?: boolean;
}

interface ProfileNavigationProps {
  username?: string;
  memberSince?: string;
  onSignOut: () => void;
}

const NAV_LINKS: NavLink[] = [
  { href: "/profile/stats", label: "Statistics", desc: "Your watching insights", icon: "insights" },
  { href: "/profile/history", label: "History", desc: "Your watch log", icon: "history" },
  { href: "/watchlist", label: "Watchlist", desc: "Your collection", icon: "video_library" },
  { href: "/settings/appearance", label: "Appearance", desc: "Themes & display", icon: "palette" },
  { href: "/settings/notifications", label: "Notifications", desc: "Manage alerts", icon: "notifications" },
  { href: "/settings/privacy", label: "Privacy", desc: "Data & visibility", icon: "shield" },
  { href: "/settings/account", label: "Account", desc: "Email & security", icon: "person" },
];

const ProfileNavigation: Component<ProfileNavigationProps> = (props) => {
  return (
    <section class="profile-navigation" aria-label="Settings and navigation">
      {/* Subtle metadata: @username, Member since */}
      <Show when={props.username || props.memberSince}>
        <div class="profile-nav-meta">
          <Show when={props.username}>
            <span class="profile-nav-meta-item">@{props.username}</span>
          </Show>
          <Show when={props.username && props.memberSince}>
            <span class="profile-nav-meta-sep" aria-hidden="true">·</span>
          </Show>
          <Show when={props.memberSince}>
            <span class="profile-nav-meta-item">Since {props.memberSince}</span>
          </Show>
        </div>
      </Show>

      {/* Navigation links */}
      <div class="profile-nav-rows" role="list" aria-label="Settings links">
        <For each={NAV_LINKS}>
          {(link) => (
            <a
              href={link.href}
              class="profile-nav-row focus-ring"
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
                  <span class="material-symbols-outlined profile-nav-chevron" style={{ color: "var(--text-dim)", "font-size": "18px" }} aria-hidden="true">
                    chevron_right
                  </span>
                }
              />
            </a>
          )}
        </For>
      </div>

      {/* Red hairline divider */}
      <div class="profile-nav-danger-divider" aria-hidden="true" />

      {/* Danger zone */}
      <div class="profile-nav-rows" role="list" aria-label="Account actions">
        <button
          type="button"
          class="profile-nav-row profile-nav-row-interactive focus-ring"
          onClick={props.onSignOut}
          aria-label="Sign out of your account"
        >
          <PremiumListItem
            title="Sign Out"
            subtitle="Sign out of your account"
            icon="logout"
            size="comfortable"
            variant="subtle"
          />
        </button>
        <a
          href="/settings/account"
          class="profile-nav-row focus-ring"
          style={{ "text-decoration": "none" }}
          aria-label="Delete account — permanent action"
        >
          <PremiumListItem
            title="Delete Account"
            subtitle="Permanently delete your account and data"
            icon="delete_forever"
            size="comfortable"
            variant="subtle"
            trailing={
              <span class="material-symbols-outlined" style={{ color: "var(--color-danger, #f87171)", "font-size": "18px" }} aria-hidden="true">
                warning
              </span>
            }
          />
        </a>
      </div>
    </section>
  );
};

export default ProfileNavigation;
