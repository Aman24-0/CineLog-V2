// src/features/settings/SettingsPage.tsx
//
// SettingsPage — the redesigned settings hub (8 sections, 11 sub-pages).
//
// Sections (top → bottom):
//   1. Account           — email, password, OAuth, 2FA, sessions, delete
//   2. Profile & Prefs   — name, country, language, fallback, default status
//   3. Appearance        — theme, accent, density, type, accessibility
//   4. Content & Discover — adult filter, rating cap, providers, default tab
//   5. Notifications     — per-category, quiet hours, digest, lead time
//   6. Calendar          — first day of week, time format, tz, default view
//   7. Sync & Backup     — cloud, import/export, devices, danger zone
//   8. Privacy           — visibility, hide ratings, clear cache/history
//   9. About & Help      — version, changelog, ToS, privacy, licenses, dev tools
//
// Session — Sign Out is LAST, in its own section.

import { Show, createSignal, type Component } from "solid-js";
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
  const [showSignOutConfirm, setShowSignOutConfirm] = createSignal(false);
  const [signingOut, setSigningOut] = createSignal(false);

  const handleSignOutClick = () => {
    setShowSignOutConfirm(true);
  };

  const handleConfirmSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      navigate("/discover");
    } catch (e) {
      console.error("[settings] sign out failed:", e);
      setSigningOut(false);
      setShowSignOutConfirm(false);
    }
  };

  const accountRows: SettingRowDef[] = [
    {
      href: "/settings/account",
      label: "Account",
      desc: "Email, password, OAuth providers, 2FA, sessions",
      icon: "manage_accounts"
    }
  ];

  const profileRows: SettingRowDef[] = [
    {
      href: "/settings/profile-preferences",
      label: "Profile & Preferences",
      desc: "Display name, country, language, default vault status",
      icon: "person"
    }
  ];

  const appearanceRows: SettingRowDef[] = [
    {
      href: "/settings/appearance",
      label: "Appearance",
      desc: "Theme, accent, density, type, accessibility",
      icon: "palette"
    }
  ];

  const contentRows: SettingRowDef[] = [
    {
      href: "/settings/content-discover",
      label: "Content & Discover",
      desc: "Adult filter, rating cap, streaming providers, default tab, rating scale",
      icon: "tune"
    }
  ];

  const notificationsRows: SettingRowDef[] = [
    {
      href: "/settings/notifications",
      label: "Notifications",
      desc: "Per-category, quiet hours, weekly digest, reminder lead time",
      icon: "notifications"
    }
  ];

  const calendarRows: SettingRowDef[] = [
    {
      href: "/settings/calendar",
      label: "Calendar",
      desc: "First day of week, time format, release timezone, default view",
      icon: "calendar_month"
    }
  ];

  const dataRows: SettingRowDef[] = [
    {
      href: "/settings/sync",
      label: "Sync & Backup",
      desc: "Cloud status, sync cadence, import (CSV/JSON), export (CSV/JSON), devices, danger zone",
      icon: "sync"
    },
    {
      href: "/settings/privacy",
      label: "Privacy",
      desc: "Visibility, hide ratings in screenshots, clear search history, clear cache",
      icon: "lock"
    }
  ];

  const aboutRows: SettingRowDef[] = [
    {
      href: "/settings/about",
      label: "About & Help",
      desc: "Version, changelog, terms, privacy, licenses, contact, FAQ, developer tools",
      icon: "info"
    }
  ];

  const sessionRows: SettingRowDef[] = [
    {
      label: "Sign Out",
      desc: "End your session on this device",
      icon: "logout",
      danger: true,
      onClick: handleSignOutClick
    }
  ];

  const renderRow = (row: SettingRowDef) => {
    const content = (
      <>
        <div class="setting-row-icon" aria-hidden="true">
          <span
            class="material-symbols-outlined"
            style={{ "font-size": "18px" }}
            aria-hidden="true"
          >
            {row.icon}
          </span>
        </div>
        <div class="setting-row-text">
          <span class="setting-row-label">{row.label}</span>
          <span class="setting-row-desc">{row.desc}</span>
        </div>
        <span
          class="material-symbols-outlined setting-row-chevron"
          aria-hidden="true"
        >
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
          <a
            href="/profile"
            class="sec-back focus-ring"
            aria-label="Back to profile"
          >
            <span
              class="material-symbols-outlined"
              style={{ "font-size": "14px" }}
              aria-hidden="true"
            >
              arrow_back
            </span>
            Profile
          </a>
          <p class="sec-eyebrow">Settings</p>
          <h1 class="sec-title">Preferences</h1>
          <p class="sec-subtitle">
            Account, preferences, content, sync, privacy, and help — all in one
            place.
          </p>
        </div>

        {/* Body */}
        <div class="sec-body">
          {/* 1. Account */}
          <section class="sec-section" style={{ "margin-top": "0" }}>
            <p class="sec-section-label">Account</p>
            <div class="setting-group">{accountRows.map(renderRow)}</div>
          </section>

          {/* 2. Profile & Preferences */}
          <section class="sec-section">
            <p class="sec-section-label">Profile & Preferences</p>
            <div class="setting-group">{profileRows.map(renderRow)}</div>
          </section>

          {/* 3. Appearance */}
          <section class="sec-section">
            <p class="sec-section-label">Appearance</p>
            <div class="setting-group">{appearanceRows.map(renderRow)}</div>
          </section>

          {/* 4. Content & Discover */}
          <section class="sec-section">
            <p class="sec-section-label">Content & Discover</p>
            <div class="setting-group">{contentRows.map(renderRow)}</div>
          </section>

          {/* 5. Notifications */}
          <section class="sec-section">
            <p class="sec-section-label">Notifications</p>
            <div class="setting-group">{notificationsRows.map(renderRow)}</div>
          </section>

          {/* 6. Calendar */}
          <section class="sec-section">
            <p class="sec-section-label">Calendar</p>
            <div class="setting-group">{calendarRows.map(renderRow)}</div>
          </section>

          {/* 7. Data */}
          <section class="sec-section">
            <p class="sec-section-label">Data</p>
            <div class="setting-group">{dataRows.map(renderRow)}</div>
          </section>

          {/* 8. About & Help */}
          <section class="sec-section">
            <p class="sec-section-label">About & Help</p>
            <div class="setting-group">{aboutRows.map(renderRow)}</div>
          </section>

          {/* Session — Sign Out is LAST */}
          <section class="sec-section">
            <p class="sec-section-label">Session</p>
            <div class="setting-group">{sessionRows.map(renderRow)}</div>
          </section>
        </div>

        {/* Sign-out confirmation sheet */}
        <Show when={showSignOutConfirm()}>
          <div
            style={{
              position: "fixed",
              inset: "0",
              "z-index": "9999",
              background: "rgba(0,0,0,0.6)",
              "backdrop-filter": "blur(8px)",
              display: "flex",
              "align-items": "flex-end",
              "justify-content": "center",
              padding: "var(--sp-4)"
            }}
            onClick={() => !signingOut() && setShowSignOutConfirm(false)}
          >
            <div
              class="sec-fade-in"
              style={{
                background: "var(--tier-2)",
                border: "1px solid var(--hairline-2)",
                "border-radius": "var(--radius-lg)",
                padding: "var(--sp-5)",
                "max-width": "420px",
                width: "100%"
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  display: "flex",
                  "align-items": "center",
                  gap: "var(--sp-3)",
                  "margin-bottom": "var(--sp-3)"
                }}
              >
                <div
                  style={{
                    width: "40px",
                    height: "40px",
                    "border-radius": "50%",
                    background: "rgba(255,45,85,0.12)",
                    color: "#ff2d55",
                    display: "flex",
                    "align-items": "center",
                    "justify-content": "center"
                  }}
                >
                  <span
                    class="material-symbols-outlined"
                    style={{ "font-size": "20px" }}
                    aria-hidden="true"
                  >
                    logout
                  </span>
                </div>
                <h3
                  style={{
                    margin: "0",
                    "font-family": "'Outfit', sans-serif",
                    "font-size": "1.0625rem",
                    "font-weight": 700,
                    color: "var(--text-strong)"
                  }}
                >
                  Sign out of CineLog?
                </h3>
              </div>
              <p
                style={{
                  margin: "0 0 var(--sp-4) 0",
                  "font-size": "0.875rem",
                  color: "var(--text-body)",
                  "line-height": "1.5"
                }}
              >
                You'll lose access to your vault on this device until you sign
                back in. Your data stays safe in the cloud.
              </p>
              <div style={{ display: "flex", gap: "var(--sp-2)" }}>
                <button
                  type="button"
                  class="btn-primary focus-ring"
                  onClick={handleConfirmSignOut}
                  disabled={signingOut()}
                  style={{
                    flex: "1",
                    background: "#ff2d55",
                    "box-shadow":
                      "0 0 0 1px rgba(255,45,85,0.4), 0 4px 12px rgba(255,45,85,0.2)"
                  }}
                >
                  <Show when={!signingOut()} fallback="Signing out…">
                    Sign Out
                  </Show>
                </button>
                <button
                  type="button"
                  class="btn-ghost focus-ring"
                  onClick={() => setShowSignOutConfirm(false)}
                  disabled={signingOut()}
                  style={{ flex: "1" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </Show>
      </div>
    </PageContainer>
  );
};

export default SettingsPage;
