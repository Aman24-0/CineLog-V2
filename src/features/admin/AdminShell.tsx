// src/features/admin/AdminShell.tsx
//
// CineLog V2 — Admin Layout Shell
// ---------------------------------------------------------------------
// The admin shell is a separate layout from the consumer AppShell.
// It does NOT use the bottom navigation, the consumer header, or
// any of the consumer app's modal providers.
//
// STRUCTURE:
//   <div class="admin-shell">
//     <AdminSidebar />      ← left sidebar (desktop) / hamburger (mobile)
//     <div class="admin-main">
//       <AdminTopBar />     ← top bar with breadcrumb + logout
//       <main>              ← page content (props.children)
//     </div>
//   </div>
//
// RESPONSIVE:
//   - Desktop (≥768px): sidebar is visible, 240px wide
//   - Mobile (<768px): sidebar hidden, hamburger menu opens it as overlay
//
// SESSION GATE:
//   If the admin session is not authenticated, the shell redirects
//   to /admin/login. While the session check is in flight, a loading
//   spinner is shown.

import {
  ParentComponent,
  Show,
  createMemo,
  For,
  onMount,
  createSignal
} from "solid-js";
import { useNavigate, useLocation, A } from "@solidjs/router";
import { useAdminAuth } from "./hooks/useAdminAuth";

interface NavItem {
  href: string;
  label: string;
  icon: string;
  description: string;
}

// Navigation items (Phase 1 + Phase 2)
const NAV_ITEMS: NavItem[] = [
  {
    href: "/admin",
    label: "Dashboard",
    icon: "📊",
    description: "Overview metrics"
  },
  {
    href: "/admin/users",
    label: "Users",
    icon: "👥",
    description: "Manage user accounts"
  },
  {
    href: "/admin/feature-flags",
    label: "Feature Flags",
    icon: "⚙️",
    description: "Toggle app features"
  },
  {
    href: "/admin/content",
    label: "Content",
    icon: "🎬",
    description: "Featured & pinned titles"
  },
  {
    href: "/admin/homepage",
    label: "Homepage",
    icon: "🔥",
    description: "Discover section toggles"
  },
  {
    href: "/admin/collections",
    label: "Collections",
    icon: "📦",
    description: "Curated universes CRUD"
  },
  {
    href: "/admin/announcements",
    label: "Announcements",
    icon: "📢",
    description: "Banners & notices"
  },
  {
    href: "/admin/tmdb-cache",
    label: "TMDB Cache",
    icon: "🗄️",
    description: "Cache stats & ops"
  },
  {
    href: "/admin/analytics",
    label: "Analytics",
    icon: "📈",
    description: "Aggregated engagement metrics"
  },
  {
    href: "/admin/maintenance",
    label: "Maintenance",
    icon: "🔧",
    description: "Cleanup & vacuum operations"
  },
  {
    href: "/admin/settings",
    label: "Settings",
    icon: "🌍",
    description: "Site-wide configuration"
  },
  {
    href: "/admin/anime",
    label: "Anime",
    icon: "🌸",
    description: "AniList integration settings"
  },
  {
    href: "/admin/logs",
    label: "Audit Trail",
    icon: "📝",
    description: "Admin action history"
  },
  {
    href: "/admin/developer",
    label: "Developer",
    icon: "🛠️",
    description: "Env vars, diagnostics, cache tools"
  }
];

// (Phase 3 items are now in NAV_ITEMS — this is kept for backwards
// compatibility but should always be empty.)
const FUTURE_ITEMS: NavItem[] = [];

const AdminShell: ParentComponent = (props) => {
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAdminAuth();

  // Mobile sidebar open/close
  const [sidebarOpen, setSidebarOpen] = createSignal(false);

  // Path-based active state
  const currentPath = () => location.pathname;
  const isActive = (href: string) => {
    if (href === "/admin") return currentPath() === "/admin";
    return currentPath().startsWith(href);
  };

  // Breadcrumb from path
  const breadcrumb = createMemo(() => {
    const path = currentPath().replace("/admin", "").replace(/^\//, "");
    if (!path) return "Dashboard";
    return path
      .split("/")
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(" / ");
  });

  // Session gate — redirect to login if not authenticated
  onMount(() => {
    // Wait a tick for adminReady to resolve
    const checkAuth = () => {
      if (auth.adminReady() && !auth.isAdmin()) {
        navigate("/admin/login", { replace: true });
      }
    };
    // Check now and again in 100ms (in case adminReady hasn't resolved yet)
    checkAuth();
    setTimeout(checkAuth, 100);
    setTimeout(checkAuth, 500);
  });

  const handleLogout = async () => {
    await auth.logout();
    navigate("/admin/login", { replace: true });
  };

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen());
  };

  const closeSidebar = () => {
    setSidebarOpen(false);
  };

  return (
    <Show
      when={auth.isAdmin()}
      fallback={
        <Show
          when={auth.adminReady()}
          fallback={
            <div
              style={{
                "min-height": "100vh",
                display: "flex",
                "align-items": "center",
                "justify-content": "center",
                background: "var(--void)",
                color: "var(--text-muted)",
                "font-size": "0.9375rem"
              }}
            >
              <div style={{ "text-align": "center" }}>
                <div
                  style={{
                    "font-size": "2rem",
                    "margin-bottom": "var(--sp-3)"
                  }}
                >
                  ⏳
                </div>
                <div>Verifying admin session…</div>
              </div>
            </div>
          }
        >
          <div
            style={{
              "min-height": "100vh",
              display: "flex",
              "align-items": "center",
              "justify-content": "center",
              background: "var(--void)",
              color: "var(--text-muted)",
              "font-size": "0.9375rem"
            }}
          >
            <div style={{ "text-align": "center" }}>
              <div
                style={{ "font-size": "2rem", "margin-bottom": "var(--sp-3)" }}
              >
                🔒
              </div>
              <div style={{ "margin-bottom": "var(--sp-4)" }}>
                Redirecting to login…
              </div>
            </div>
          </div>
        </Show>
      }
    >
      <div
        class="admin-shell"
        style={{
          display: "flex",
          "min-height": "100vh",
          background: "var(--void)",
          color: "var(--text)"
        }}
      >
        {/* Mobile hamburger */}
        <button
          class="admin-hamburger"
          onClick={toggleSidebar}
          aria-label="Open admin menu"
          style={{
            display: "none",
            position: "fixed",
            top: "var(--sp-3)",
            left: "var(--sp-3)",
            "z-index": 60,
            background: "var(--tier-2)",
            border: "1px solid var(--hairline)",
            "border-radius": "var(--radius-md)",
            padding: "var(--sp-2)",
            "font-size": "1.25rem",
            cursor: "pointer",
            color: "var(--text)"
          }}
        >
          ☰
        </button>

        {/* Sidebar overlay (mobile) */}
        <Show when={sidebarOpen()}>
          <div
            onClick={closeSidebar}
            style={{
              display: "none",
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.6)",
              "z-index": 40
            }}
            class="admin-sidebar-overlay"
          />
        </Show>

        {/* Sidebar */}
        <aside
          class="admin-sidebar"
          style={{
            width: "240px",
            "flex-shrink": 0,
            background: "var(--tier-1)",
            "border-right": "1px solid var(--hairline)",
            padding: "var(--sp-5) var(--sp-3)",
            "overflow-y": "auto",
            position: "sticky",
            top: 0,
            "max-height": "100vh"
          }}
        >
          {/* Brand */}
          <div
            style={{
              padding: "0 var(--sp-3) var(--sp-5)",
              "border-bottom": "1px solid var(--hairline)",
              "margin-bottom": "var(--sp-4)"
            }}
          >
            <div
              style={{
                "font-size": "1.125rem",
                "font-weight": "700",
                color: "var(--text)"
              }}
            >
              🎬 CineLog
            </div>
            <div
              style={{
                "font-size": "0.75rem",
                color: "var(--text-muted)",
                "text-transform": "uppercase",
                "letter-spacing": "0.1em",
                "margin-top": "2px"
              }}
            >
              Admin Panel
            </div>
          </div>

          {/* Active nav */}
          <nav
            style={{ display: "flex", "flex-direction": "column", gap: "2px" }}
          >
            <For each={NAV_ITEMS}>
              {(item) => (
                <A
                  href={item.href}
                  onClick={closeSidebar}
                  style={{
                    display: "flex",
                    "align-items": "center",
                    gap: "var(--sp-3)",
                    padding: "var(--sp-2) var(--sp-3)",
                    "border-radius": "var(--radius-md)",
                    "text-decoration": "none",
                    "font-size": "0.875rem",
                    "font-weight": isActive(item.href) ? "600" : "400",
                    background: isActive(item.href)
                      ? "var(--p-dim)"
                      : "transparent",
                    color: isActive(item.href)
                      ? "var(--p)"
                      : "var(--text-secondary)",
                    transition: "all 0.15s ease"
                  }}
                >
                  <span style={{ "font-size": "1rem", "line-height": "1" }}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </A>
              )}
            </For>

            {/* Divider */}
            <div
              style={{
                margin: "var(--sp-4) 0 var(--sp-2)",
                "border-top": "1px solid var(--hairline)"
              }}
            />

            {/* Future items — disabled */}
            <For each={FUTURE_ITEMS}>
              {(item) => (
                <div
                  title={item.description}
                  style={{
                    display: "flex",
                    "align-items": "center",
                    gap: "var(--sp-3)",
                    padding: "var(--sp-2) var(--sp-3)",
                    "border-radius": "var(--radius-md)",
                    "font-size": "0.875rem",
                    "font-weight": "400",
                    color: "var(--text-muted)",
                    opacity: 0.5,
                    cursor: "not-allowed"
                  }}
                >
                  <span style={{ "font-size": "1rem", "line-height": "1" }}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </div>
              )}
            </For>
          </nav>
        </aside>

        {/* Main */}
        <div
          class="admin-main"
          style={{
            flex: 1,
            "min-width": 0,
            display: "flex",
            "flex-direction": "column"
          }}
        >
          {/* TopBar */}
          <header
            class="admin-topbar"
            style={{
              padding: "var(--sp-3) var(--sp-6)",
              background: "var(--tier-1)",
              "border-bottom": "1px solid var(--hairline)",
              display: "flex",
              "align-items": "center",
              "justify-content": "space-between",
              position: "sticky",
              top: 0,
              "z-index": 30
            }}
          >
            <div
              style={{
                display: "flex",
                "align-items": "center",
                gap: "var(--sp-3)"
              }}
            >
              <span
                style={{ "font-size": "1.125rem" }}
                class="admin-hamburger-hidden"
              >
                🎬
              </span>
              <h1
                style={{
                  "font-size": "1rem",
                  "font-weight": "600",
                  margin: 0,
                  color: "var(--text)"
                }}
              >
                {breadcrumb()}
              </h1>
            </div>

            <div
              style={{
                display: "flex",
                "align-items": "center",
                gap: "var(--sp-4)"
              }}
            >
              <Show when={auth.admin()}>
                {(admin) => (
                  <div
                    style={{
                      display: "flex",
                      "align-items": "center",
                      gap: "var(--sp-2)",
                      "font-size": "0.8125rem",
                      color: "var(--text-secondary)"
                    }}
                  >
                    <div
                      style={{
                        width: "28px",
                        height: "28px",
                        "border-radius": "50%",
                        background: "var(--p)",
                        color: "var(--on-primary)",
                        display: "flex",
                        "align-items": "center",
                        "justify-content": "center",
                        "font-weight": "600",
                        "font-size": "0.75rem"
                      }}
                    >
                      {admin().display_name.charAt(0).toUpperCase()}
                    </div>
                    <span>{admin().display_name}</span>
                  </div>
                )}
              </Show>

              <button
                onClick={handleLogout}
                style={{
                  background: "transparent",
                  border: "1px solid var(--hairline-2)",
                  "border-radius": "var(--radius-md)",
                  padding: "var(--sp-2) var(--sp-3)",
                  color: "var(--text-secondary)",
                  "font-size": "0.8125rem",
                  "font-weight": "500",
                  cursor: "pointer",
                  transition: "all 0.15s ease"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--tier-2)";
                  e.currentTarget.style.color = "var(--text)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "var(--text-secondary)";
                }}
              >
                Logout
              </button>
            </div>
          </header>

          {/* Page content — AdminShell is the root layout for /admin
              routes (AppShell renders bare children for admin), so this
              is the SINGLE <main> landmark for admin pages. */}
          <main
            style={{
              flex: 1,
              padding: "var(--sp-6)",
              "overflow-y": "auto"
            }}
          >
            {props.children}
          </main>
        </div>
      </div>
    </Show>
  );
};

export default AdminShell;
