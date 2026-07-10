// src/features/settings/SettingsPage.tsx
//
// SettingsPage — the settings hub.
//
// Settings is NOT inside Profile. The Profile only has a navigation
// row that links here. This keeps the Profile a portrait, not a
// control panel.
//
// Structure:
//   • Header (eyebrow + title + back button)
//   • Preferences section: Appearance, Notifications, Privacy
//   • Data section: Sync
//   • Advanced section: Developer
//   • Account section: Account, Sign Out (LAST — always last)
//
// Sign Out is the LAST option in the Account section. It is NEVER
// placed on the avatar — the avatar navigates to /profile.

import { type Component } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { signOut } from "~/shared/hooks/useAuthActions";
import PageContainer from "~/shared/ui/PageContainer";

interface SettingsRowDef {
  href?: string;
  label: string;
  desc: string;
  icon: string;
  danger?: boolean;
  onClick?: () => void;
}

const SettingsPage: Component = () => {
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/discover");
  };

  const preferencesRows: SettingsRowDef[] = [
    { href: "/settings/appearance", label: "Appearance", desc: "Theme, accent, density", icon: "palette" },
    { href: "/settings/notifications", label: "Notifications", desc: "Push preferences", icon: "notifications" },
    { href: "/settings/privacy", label: "Privacy", desc: "Data visibility", icon: "lock" },
  ];

  const dataRows: SettingsRowDef[] = [
    { href: "/settings/sync", label: "Sync", desc: "Supabase, import / export", icon: "sync" },
  ];

  const advancedRows: SettingsRowDef[] = [
    { href: "/settings/developer", label: "Developer", desc: "Debug options", icon: "code" },
  ];

  const accountRows: SettingsRowDef[] = [
    { href: "/settings/account", label: "Account", desc: "Email, password, delete", icon: "manage_accounts" },
    { label: "Sign Out", desc: "End your session", icon: "logout", danger: true, onClick: handleSignOut },
  ];

  const renderRow = (row: SettingsRowDef) => {
    const content = (
      <>
        <div class={`settings-row-icon${row.danger ? "" : ""}`} aria-hidden="true">
          <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">
            {row.icon}
          </span>
        </div>
        <div class="settings-row-text">
          <span class="settings-row-label">{row.label}</span>
          <span class="settings-row-desc">{row.desc}</span>
        </div>
        <span class="material-symbols-outlined settings-row-chevron" aria-hidden="true">
          {row.onClick ? "logout" : "chevron_right"}
        </span>
      </>
    );

    if (row.onClick) {
      return (
        <button
          type="button"
          class={`settings-row focus-ring${row.danger ? " settings-row-danger" : ""}`}
          onClick={row.onClick}
          aria-label={row.label}
        >
          {content}
        </button>
      );
    }
    return (
      <a
        href={row.href}
        class={`settings-row focus-ring${row.danger ? " settings-row-danger" : ""}`}
        aria-label={row.label}
      >
        {content}
      </a>
    );
  };

  return (
    <PageContainer width="narrow" paddingTop="0" paddingBottom="var(--sp-12)">
      <div class="settings-page profile-fade-in">
        {/* Back button */}
        <div style={{ padding: "var(--sp-4) var(--sp-5) 0" }}>
          <a href="/profile" class="settings-back focus-ring" aria-label="Back to profile">
            <span class="material-symbols-outlined" style={{ "font-size": "14px" }} aria-hidden="true">
              arrow_back
            </span>
            Profile
          </a>
        </div>

        {/* Header */}
        <div class="settings-header">
          <p class="settings-eyebrow">Settings</p>
          <h1 class="settings-title">Preferences</h1>
          <p class="settings-subtitle">
            Manage your experience. Sign out is at the bottom, under Account.
          </p>
        </div>

        {/* Body */}
        <div class="settings-body">
          {/* Preferences */}
          <section class="settings-section">
            <p class="settings-section-label">Preferences</p>
            <div class="settings-group">
              {preferencesRows.map(renderRow)}
            </div>
          </section>

          {/* Data */}
          <section class="settings-section">
            <p class="settings-section-label">Data</p>
            <div class="settings-group">
              {dataRows.map(renderRow)}
            </div>
          </section>

          {/* Advanced */}
          <section class="settings-section">
            <p class="settings-section-label">Advanced</p>
            <div class="settings-group">
              {advancedRows.map(renderRow)}
            </div>
          </section>

          {/* Account — Sign Out is LAST */}
          <section class="settings-section">
            <p class="settings-section-label">Account</p>
            <div class="settings-group">
              {accountRows.map(renderRow)}
            </div>
          </section>
        </div>
      </div>
    </PageContainer>
  );
};

export default SettingsPage;
