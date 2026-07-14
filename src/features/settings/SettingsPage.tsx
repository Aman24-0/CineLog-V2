// src/features/settings/SettingsPage.tsx
//
// SettingsPage — the settings hub.
//
// Not Android settings. Not iOS settings. Not Chrome settings.
// Think Linear, Notion, Arc Browser, Raycast — calm, organized, beautiful.
//
// Sections:
//   • Account — email, password, providers, delete, sign out
//   • Appearance — theme, accent, density, motion
//   • Playback — (future) default status, autoplay
//   • Notifications — push prefs
//   • TMDB — API config
//   • Sync — Supabase, import/export, backup
//   • Privacy — data, visibility
//   • Developer — debug tools
//   • Danger Zone — delete account

import { type Component } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { signOut } from "~/shared/hooks/useAuthActions";
import PageContainer from "~/shared/ui/PageContainer";
import ScrollToTop from "~/shared/ui/ScrollToTop";

interface SettingRowDef {
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

  const accountRows: SettingRowDef[] = [
    { href: "/settings/account", label: "Account", desc: "Email, password, providers, sessions", icon: "manage_accounts" },
  ];

  const preferencesRows: SettingRowDef[] = [
    { href: "/settings/appearance", label: "Appearance", desc: "Theme, accent, density, motion", icon: "palette" },
    { href: "/settings/notifications", label: "Notifications", desc: "Push preferences", icon: "notifications" },
  ];

  const dataRows: SettingRowDef[] = [
    { href: "/settings/sync", label: "Sync", desc: "Supabase, import / export, backup", icon: "sync" },
    { href: "/settings/privacy", label: "Privacy", desc: "Data, storage, visibility", icon: "lock" },
  ];

  const advancedRows: SettingRowDef[] = [
    { href: "/settings/developer", label: "Developer", desc: "Debug, feature flags, diagnostics", icon: "code" },
  ];

  const sessionRows: SettingRowDef[] = [
    { label: "Sign Out", desc: "End your session on this device", icon: "logout", danger: true, onClick: handleSignOut },
  ];

  const renderRow = (row: SettingRowDef) => {
    const content = (
      <>
        <div class="setting-row-icon" aria-hidden="true">
          <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">
            {row.icon}
          </span>
        </div>
        <div class="setting-row-text">
          <span class="setting-row-label">{row.label}</span>
          <span class="setting-row-desc">{row.desc}</span>
        </div>
        <span class="material-symbols-outlined setting-row-chevron" aria-hidden="true">
          {row.onClick ? "logout" : "chevron_right"}
        </span>
      </>
    );

    if (row.onClick) {
      return (
        <button
          type="button"
          class={`setting-row focus-ring${row.danger ? " setting-row-danger" : ""}`}
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
        class={`setting-row focus-ring${row.danger ? " setting-row-danger" : ""}`}
        aria-label={row.label}
      >
        {content}
      </a>
    );
  };

  return (
    <PageContainer width="narrow" paddingTop="0" paddingBottom="var(--sp-12)">
      <ScrollToTop />
      <div class="sec-page sec-fade-in">
        {/* Header */}
        <div class="sec-header">
          <a href="/profile" class="sec-back focus-ring" aria-label="Back to profile">
            <span class="material-symbols-outlined" style={{ "font-size": "14px" }} aria-hidden="true">
              arrow_back
            </span>
            Profile
          </a>
          <p class="sec-eyebrow">Settings</p>
          <h1 class="sec-title">Preferences</h1>
          <p class="sec-subtitle">
            Manage your experience. Sign out is at the bottom.
          </p>
        </div>

        {/* Body */}
        <div class="sec-body">
          {/* Account */}
          <section class="sec-section" style={{ "margin-top": "0" }}>
            <p class="sec-section-label">Account</p>
            <div class="setting-group">
              {accountRows.map(renderRow)}
            </div>
          </section>

          {/* Preferences */}
          <section class="sec-section">
            <p class="sec-section-label">Preferences</p>
            <div class="setting-group">
              {preferencesRows.map(renderRow)}
            </div>
          </section>

          {/* Data */}
          <section class="sec-section">
            <p class="sec-section-label">Data</p>
            <div class="setting-group">
              {dataRows.map(renderRow)}
            </div>
          </section>

          {/* Advanced */}
          <section class="sec-section">
            <p class="sec-section-label">Advanced</p>
            <div class="setting-group">
              {advancedRows.map(renderRow)}
            </div>
          </section>

          {/* Session — Sign Out is LAST */}
          <section class="sec-section">
            <p class="sec-section-label">Session</p>
            <div class="setting-group">
              {sessionRows.map(renderRow)}
            </div>
          </section>
        </div>
      </div>
    </PageContainer>
  );
};

export default SettingsPage;
