// src/features/settings/SettingsPage.tsx
//
// SettingsPage — the redesigned settings hub.
//
// LAYOUT:
//   Desktop (≥768px): Two-column grid.
//     • Left: sticky sidebar with section links + global search.
//     • Right: scrollable list of setting sections (accordions).
//   Mobile (<768px): Single column.
//     • Sticky search bar at top.
//     • Accordion sections (tap to expand).
//
// SECTIONS:
//   1. Account           — link to /settings/account (email, password, 2FA, sessions)
//   2. Profile           — link to /settings/profile-preferences
//   3. Appearance        — link to /settings/appearance
//   4. Content & Discover — link to /settings/content-discover
//   5. Notifications     — link to /settings/notifications
//   6. Calendar          — link to /settings/calendar
//   7. Sync & Backup     — link to /settings/sync (import/export)
//   8. Privacy           — link to /settings/privacy
//   9. About & Help      — link to /settings/about
//   10. Session          — Sign out (inline)
//
// SEARCH:
//   The search input filters sections by title, description, and
//   row labels. Matching sections auto-expand; non-matching sections
//   are hidden. The search is debounced 200ms.
//
// ACCORDION:
//   On mobile, each section is a <details>-like collapsible. On
//   desktop, all sections are expanded by default (the sidebar
//   provides navigation). The sidebar links scroll to the section
//   and briefly highlight it.
//
// This page replaces the old "list of links" hub with a more
// discoverable, searchable layout while keeping the existing
// sub-pages intact.

import {
  createSignal,
  createMemo,
  For,
  Show,
  type Component,
  type JSX
} from "solid-js";
import { useNavigate } from "@solidjs/router";
import { signOut } from "~/shared/hooks/useAuthActions";
import PageContainer from "~/shared/ui/PageContainer";
import ScrollToTop from "~/shared/ui/ScrollToTop";

interface SettingSection {
  id: string;
  title: string;
  desc: string;
  icon: string;
  href?: string;
  rows: SettingRow[];
}

interface SettingRow {
  label: string;
  desc: string;
  icon: string;
  href?: string;
  danger?: boolean;
  onClick?: () => void;
}

const SettingsPage: Component = () => {
  const navigate = useNavigate();
  const [query, setQuery] = createSignal("");
  const [expanded, setExpanded] = createSignal<Set<string>>(
    new Set(["account", "profile", "appearance"])
  );
  const [showSignOutConfirm, setShowSignOutConfirm] = createSignal(false);
  const [signingOut, setSigningOut] = createSignal(false);

  const handleSignOutClick = () => setShowSignOutConfirm(true);

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

  const sections: SettingSection[] = [
    {
      id: "account",
      title: "Account",
      desc: "Email, password, 2FA, sessions",
      icon: "manage_accounts",
      href: "/settings/account",
      rows: [
        {
          label: "Account details",
          desc: "Name, email, country, joined date",
          icon: "person",
          href: "/settings/account"
        },
        {
          label: "Security & 2FA",
          desc: "Password, OAuth, two-factor auth, sessions",
          icon: "shield_lock",
          href: "/settings/account"
        },
        {
          label: "Login history",
          desc: "Recent sign-ins",
          icon: "history",
          href: "/settings/account"
        }
      ]
    },
    {
      id: "profile",
      title: "Profile & Preferences",
      desc: "Name, country, language, default vault status",
      icon: "person",
      href: "/settings/profile-preferences",
      rows: [
        {
          label: "Display name",
          desc: "Shown on your profile.",
          icon: "badge",
          href: "/settings/profile-preferences"
        },
        {
          label: "Country & Language",
          desc: "Affects Discover and metadata language.",
          icon: "language",
          href: "/settings/profile-preferences"
        },
        {
          label: "Default vault status",
          desc: "Status applied when adding new titles.",
          icon: "bookmark_add",
          href: "/settings/profile-preferences"
        }
      ]
    },
    {
      id: "appearance",
      title: "Appearance",
      desc: "Theme, accent, density, typography, accessibility",
      icon: "palette",
      href: "/settings/appearance",
      rows: [
        {
          label: "Accent color",
          desc: "8 presets + custom hex picker",
          icon: "palette",
          href: "/settings/appearance"
        },
        {
          label: "Theme mode",
          desc: "Dark / Light / System",
          icon: "dark_mode",
          href: "/settings/appearance"
        },
        {
          label: "Display density",
          desc: "Compact / Comfortable / Spacious",
          icon: "density_small",
          href: "/settings/appearance"
        },
        {
          label: "Typography",
          desc: "Font size: Small / Medium / Large",
          icon: "text_fields",
          href: "/settings/appearance"
        },
        {
          label: "Accessibility",
          desc: "Reduced motion, high contrast, hide spoilers",
          icon: "accessibility",
          href: "/settings/appearance"
        }
      ]
    },
    {
      id: "content",
      title: "Content & Discover",
      desc: "Adult filter, rating cap, streaming providers",
      icon: "tune",
      href: "/settings/content-discover",
      rows: [
        {
          label: "Adult content filter",
          desc: "Hide adult titles from Discover and search",
          icon: "block",
          href: "/settings/content-discover"
        },
        {
          label: "Streaming providers",
          desc: "Filter Discover by your services",
          icon: "live_tv",
          href: "/settings/content-discover"
        },
        {
          label: "Rating scale",
          desc: "10-star / 5-star / thumbs",
          icon: "star",
          href: "/settings/content-discover"
        }
      ]
    },
    {
      id: "notifications",
      title: "Notifications",
      desc: "Per-category, quiet hours, weekly recap",
      icon: "notifications",
      href: "/settings/notifications",
      rows: [
        {
          label: "Notification categories",
          desc: "New seasons, continue watching, recommendations",
          icon: "notifications_active",
          href: "/settings/notifications"
        },
        {
          label: "Quiet hours",
          desc: "Mute notifications during set hours",
          icon: "do_not_disturb_on",
          href: "/settings/notifications"
        },
        {
          label: "Weekly recap",
          desc: "Summary of your activity each week",
          icon: "summarize",
          href: "/settings/notifications"
        }
      ]
    },
    {
      id: "calendar",
      title: "Calendar",
      desc: "First day of week, time format, timezone",
      icon: "calendar_month",
      href: "/settings/calendar",
      rows: [
        {
          label: "First day of week",
          desc: "Sunday / Monday / Saturday",
          icon: "view_week",
          href: "/settings/calendar"
        },
        {
          label: "Time format",
          desc: "12-hour / 24-hour",
          icon: "schedule",
          href: "/settings/calendar"
        },
        {
          label: "Release timezone",
          desc: "Local / US-East / US-Pacific / UTC",
          icon: "public",
          href: "/settings/calendar"
        }
      ]
    },
    {
      id: "sync",
      title: "Sync & Backup",
      desc: "Cloud sync, import, export, devices",
      icon: "sync",
      href: "/settings/sync",
      rows: [
        {
          label: "Import from CSV",
          desc: "Letterboxd, Trakt, IMDb, TV Time",
          icon: "file_upload",
          href: "/settings/sync"
        },
        {
          label: "Export library",
          desc: "JSON backup, CSV",
          icon: "file_download",
          href: "/settings/sync"
        },
        {
          label: "Sync cadence",
          desc: "Realtime / Wi-Fi only / Manual",
          icon: "cloud_sync",
          href: "/settings/sync"
        }
      ]
    },
    {
      id: "privacy",
      title: "Privacy",
      desc: "Visibility, screenshot privacy, search history",
      icon: "lock",
      href: "/settings/privacy",
      rows: [
        {
          label: "Profile visibility",
          desc: "Always private",
          icon: "visibility",
          href: "/settings/privacy"
        },
        {
          label: "Screenshot privacy",
          desc: "Hide ratings in screenshots",
          icon: "screenshot",
          href: "/settings/privacy"
        },
        {
          label: "Clear search history",
          desc: "Remove recent searches from this device",
          icon: "cleaning_services",
          href: "/settings/privacy"
        }
      ]
    },
    {
      id: "about",
      title: "About & Help",
      desc: "Version, changelog, terms, privacy, FAQ",
      icon: "info",
      href: "/settings/about",
      rows: [
        {
          label: "App version & changelog",
          desc: "Current version and recent changes",
          icon: "new_releases",
          href: "/settings/about"
        },
        {
          label: "Legal",
          desc: "Terms of service, privacy policy, licenses",
          icon: "gavel",
          href: "/settings/about"
        },
        {
          label: "Contact & FAQ",
          desc: "Report a bug, send feedback, frequently asked questions",
          icon: "help",
          href: "/settings/about"
        }
      ]
    }
  ];

  // The session (sign out) section is special — it has an inline
  // action instead of navigating to a sub-page.
  const sessionSection: SettingSection = {
    id: "session",
    title: "Session",
    desc: "End your session on this device",
    icon: "logout",
    rows: [
      {
        label: "Sign out",
        desc: "End your session on this device",
        icon: "logout",
        danger: true,
        onClick: handleSignOutClick
      }
    ]
  };

  // Filtered sections based on the search query.
  const filteredSections = createMemo<SettingSection[]>(() => {
    const q = query().trim().toLowerCase();
    if (!q) return [...sections, sessionSection];

    const matchSection = (s: SettingSection) => {
      if (s.title.toLowerCase().includes(q)) return true;
      if (s.desc.toLowerCase().includes(q)) return true;
      return s.rows.some(
        (r) =>
          r.label.toLowerCase().includes(q) ||
          r.desc.toLowerCase().includes(q)
      );
    };

    const matched = sections.filter(matchSection);
    if (matchSection(sessionSection)) matched.push(sessionSection);
    return matched;
  });

  // When searching, auto-expand all matched sections so the user can
  // see the matching rows without tapping.
  const visibleSectionIds = createMemo(() => {
    const ids = new Set<string>();
    for (const s of filteredSections()) ids.add(s.id);
    return ids;
  });

  function toggleSection(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function isExpanded(id: string): boolean {
    // When searching, all matched sections are expanded.
    if (query().trim().length > 0) return visibleSectionIds().has(id);
    return expanded().has(id);
  }

  function scrollToSection(id: string) {
    const el = document.getElementById(`section-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      // Briefly highlight the section.
      el.classList.add("settings-section-highlight");
      setTimeout(() => el.classList.remove("settings-section-highlight"), 1500);
    }
  }

  function handleSidebarClick(id: string, href?: string) {
    if (href) {
      navigate(href);
      return;
    }
    // Ensure the section is expanded before scrolling to it.
    if (!isExpanded(id)) toggleSection(id);
    // Defer the scroll so the section has time to expand.
    setTimeout(() => scrollToSection(id), 50);
  }

  // Highlight matched text in section titles/descriptions.
  const highlightText = (text: string): JSX.Element => {
    const q = query().trim();
    if (!q) return <>{text}</>;
    const lower = text.toLowerCase();
    const ql = q.toLowerCase();
    const idx = lower.indexOf(ql);
    if (idx === -1) return <>{text}</>;
    return (
      <>
        {text.slice(0, idx)}
        <mark class="settings-search-mark">{text.slice(idx, idx + q.length)}</mark>
        {text.slice(idx + q.length)}
      </>
    );
  };

  const renderRow = (row: SettingRow): JSX.Element => {
    // Highlight matching text in search results.
    const q = query().trim();
    const highlight = (text: string): JSX.Element => {
      if (!q) return <>{text}</>;
      const lower = text.toLowerCase();
      const ql = q.toLowerCase();
      const idx = lower.indexOf(ql);
      if (idx === -1) return <>{text}</>;
      return (
        <>
          {text.slice(0, idx)}
          <mark class="settings-search-mark">{text.slice(idx, idx + q.length)}</mark>
          {text.slice(idx + q.length)}
        </>
      );
    };

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
          <span class="setting-row-label">{highlight(row.label)}</span>
          <span class="setting-row-desc">{highlight(row.desc)}</span>
        </div>
        <span
          class="material-symbols-outlined setting-row-chevron"
          aria-hidden="true"
        >
          {row.onClick ? (row.danger ? "logout" : "chevron_right") : "chevron_right"}
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

        {/* Search bar — sticky on mobile, inline on desktop */}
        <div class="settings-search-wrapper">
          <div class="settings-search">
            <span
              class="material-symbols-outlined settings-search-icon"
              aria-hidden="true"
            >
              search
            </span>
            <input
              type="search"
              class="settings-search-input focus-ring"
              placeholder="Search settings…"
              value={query()}
              onInput={(e) => setQuery(e.currentTarget.value)}
              aria-label="Search settings"
            />
            <Show when={query()}>
              <button
                type="button"
                class="settings-search-clear focus-ring"
                onClick={() => setQuery("")}
                aria-label="Clear search"
              >
                <span class="material-symbols-outlined" aria-hidden="true">
                  close
                </span>
              </button>
            </Show>
          </div>
        </div>

        {/* Two-column layout: sidebar (desktop) + sections */}
        <div class="settings-layout">
          {/* Sidebar — desktop only */}
          <aside class="settings-sidebar" aria-label="Settings sections">
            <nav>
              <ul class="settings-sidebar-list">
                <For each={[...sections, sessionSection]}>
                  {(s) => (
                    <li>
                      <button
                        type="button"
                        class="settings-sidebar-link focus-ring"
                        onClick={() => handleSidebarClick(s.id, s.href)}
                      >
                        <span
                          class="material-symbols-outlined settings-sidebar-icon"
                          aria-hidden="true"
                        >
                          {s.icon}
                        </span>
                        <span class="settings-sidebar-label">{s.title}</span>
                      </button>
                    </li>
                  )}
                </For>
              </ul>
            </nav>
          </aside>

          {/* Sections — accordion on mobile, expanded on desktop */}
          <div class="settings-content">
            <Show
              when={filteredSections().length > 0}
              fallback={
                <div class="settings-search-empty">
                  <span
                    class="material-symbols-outlined"
                    aria-hidden="true"
                    style={{ "font-size": "40px", color: "var(--text-soft)" }}
                  >
                    search_off
                  </span>
                  <p>No settings match "{query()}"</p>
                  <button
                    type="button"
                    class="btn-ghost focus-ring"
                    onClick={() => setQuery("")}
                  >
                    Clear search
                  </button>
                </div>
              }
            >
              <For each={filteredSections()}>
                {(s) => (
                  <section
                    id={`section-${s.id}`}
                    class="settings-accordion-section"
                  >
                    <button
                      type="button"
                      class="settings-accordion-header focus-ring"
                      onClick={() => toggleSection(s.id)}
                      aria-expanded={isExpanded(s.id)}
                      aria-controls={`panel-${s.id}`}
                    >
                      <span
                        class="material-symbols-outlined settings-accordion-icon"
                        aria-hidden="true"
                      >
                        {s.icon}
                      </span>
                      <div class="settings-accordion-meta">
                        <span class="settings-accordion-title">{highlightText(s.title)}</span>
                        <span class="settings-accordion-desc">{highlightText(s.desc)}</span>
                      </div>
                      <span
                        class="material-symbols-outlined settings-accordion-chevron"
                        aria-hidden="true"
                        style={{
                          transform: isExpanded(s.id) ? "rotate(180deg)" : "none",
                          transition: "transform 200ms ease"
                        }}
                      >
                        expand_more
                      </span>
                    </button>
                    <Show when={isExpanded(s.id)}>
                      <div
                        id={`panel-${s.id}`}
                        class="settings-accordion-panel"
                      >
                        <div class="setting-group">
                          <For each={s.rows}>{renderRow}</For>
                        </div>
                        <Show when={s.href}>
                          <a
                            href={s.href}
                            class="settings-accordion-view-all focus-ring"
                          >
                            Open {s.title} settings
                            <span
                              class="material-symbols-outlined"
                              aria-hidden="true"
                              style={{ "font-size": "16px" }}
                            >
                              arrow_forward
                            </span>
                          </a>
                        </Show>
                      </div>
                    </Show>
                  </section>
                )}
              </For>
            </Show>
          </div>
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
