// src/features/admin/AdminShell.tsx
//
// CineLog V2 — Admin Layout Shell (Phase 9 Chunk 1 — Glass Redesign)
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
// PHASE 9 CHUNK 1 CHANGES:
//   • Sidebar reorganized into 7 named groups: Overview, Users, Content,
//     Communication, Configuration, Services, Developer. The previous
//     flat list mixed concerns (e.g. "TMDB Cache" sat between
//     "Announcements" and "Analytics"), making the panel hard to
//     navigate. The grouping also sets up the Phase 9 "Services Hub"
//     separation from "App Settings" — service-related pages
//     (TMDB Cache, AniList, Maintenance) now live under Services,
//     while global app configuration (Settings, Feature Flags) lives
//     under Configuration.
//   • All inline emoji icons replaced with Material Symbols (consistent
//     with the rest of the Glass UI system).
//   • Sidebar / topbar restyled using Glass design tokens
//     (bg-glass, backdrop-blur-xl, border-glass-border, text-text-*).
//     Logout button now uses <GlassButton variant="glass">.
//   • Removed the always-empty FUTURE_ITEMS placeholder block — it was
//     dead code carried since Phase 1 and violated the Phase 9
//     "no dead/dummy UI" rule.
//
// RESPONSIVE:
//   - Desktop (≥768px): sidebar is visible, 248px wide
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
  createSignal,
  type Component
} from "solid-js";
import { useNavigate, useLocation, A } from "@solidjs/router";
import { useAdminAuth } from "./hooks/useAdminAuth";
import { GlassButton } from "~/shared/ui/glass/GlassButton";

// ─── Navigation Model ──────────────────────────────────────────

interface NavItem {
  href: string;
  label: string;
  /** Material Symbols icon name (renders via .material-symbols-outlined). */
  icon: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

// Sidebar groups (Phase 9 Chunk 1).
//
// Grouping rationale:
//   • Overview       — at-a-glance pages (dashboard, analytics, audit)
//   • Users          — account management
//   • Content        — what users see on Discover / collections
//   • Communication  — outbound messaging (announcements)
//   • Configuration  — global app config + feature toggles
//   • Services       — external integrations & operational tooling
//                      (TMDB Cache, AniList, Maintenance). This is the
//                      future home of the "Services Hub" — Phase 9 will
//                      consolidate service-specific settings here so they
//                      don't duplicate the global Settings page.
//   • Developer      — env diagnostics, cache tools
//
// Every href below points to a real route file under src/routes/admin/
// — no dead links, no dummy placeholders.
const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/admin", label: "Dashboard", icon: "dashboard" },
      { href: "/admin/analytics", label: "Analytics", icon: "insights" },
      { href: "/admin/logs", label: "Audit Trail", icon: "history_edu" }
    ]
  },
  {
    label: "Users",
    items: [
      { href: "/admin/users", label: "Users", icon: "group" }
    ]
  },
  {
    label: "Content",
    items: [
      { href: "/admin/content", label: "Featured", icon: "featured_video" },
      { href: "/admin/homepage", label: "Homepage", icon: "home" },
      {
        href: "/admin/collections",
        label: "Collections",
        icon: "collections_bookmark"
      }
    ]
  },
  {
    label: "Communication",
    items: [
      {
        href: "/admin/announcements",
        label: "Announcements",
        icon: "campaign"
      }
    ]
  },
  {
    label: "Configuration",
    items: [
      { href: "/admin/settings", label: "Settings", icon: "settings" },
      {
        href: "/admin/feature-flags",
        label: "Feature Flags",
        icon: "toggle_on"
      }
    ]
  },
  {
    label: "Services",
    items: [
      { href: "/admin/tmdb-cache", label: "TMDB Cache", icon: "storage" },
      { href: "/admin/anime", label: "AniList", icon: "animation" },
      { href: "/admin/maintenance", label: "Maintenance", icon: "build" }
    ]
  },
  {
    label: "Developer",
    items: [
      { href: "/admin/developer", label: "Developer", icon: "terminal" }
    ]
  }
];

// ─── Sidebar Sub-component ─────────────────────────────────────

interface SidebarProps {
  activePath: () => string;
  onNavigate: () => void;
}

const isActive = (href: string, currentPath: string): boolean => {
  if (href === "/admin") return currentPath === "/admin";
  return currentPath.startsWith(href);
};

const Sidebar: Component<SidebarProps> = (props) => {
  return (
    <nav
      class="flex flex-col gap-5"
      aria-label="Admin navigation"
    >
      <For each={NAV_GROUPS}>
        {(group) => (
          <div class="flex flex-col gap-1">
            <div
              class="px-3 font-label text-[10px] font-bold uppercase tracking-widest text-text-muted"
              aria-hidden="true"
            >
              {group.label}
            </div>
            <For each={group.items}>
              {(item) => {
                const active = () => isActive(item.href, props.activePath());
                return (
                  <A
                    href={item.href}
                    onClick={props.onNavigate}
                    aria-current={active() ? "page" : undefined}
                    class={`group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-[background-color,color] duration-fast ease-standard ${
                      active()
                        ? "bg-primary-dim font-semibold text-primary"
                        : "font-medium text-text-secondary hover:bg-glass-strong hover:text-text-strong"
                    }`}
                  >
                    <span
                      class="material-symbols-outlined text-lg"
                      style={{
                        "font-variation-settings": active()
                          ? "'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 20"
                          : "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 20"
                      }}
                      aria-hidden="true"
                    >
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </A>
                );
              }}
            </For>
          </div>
        )}
      </For>
    </nav>
  );
};

// ─── AdminShell ────────────────────────────────────────────────

const AdminShell: ParentComponent = (props) => {
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAdminAuth();

  // Mobile sidebar open/close
  const [sidebarOpen, setSidebarOpen] = createSignal(false);

  // Path-based active state
  const currentPath = () => location.pathname;

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
            <div class="flex min-h-screen items-center justify-center bg-void text-text-muted">
              <div class="text-center">
                <span
                  class="material-symbols-outlined mx-auto mb-3 block text-4xl"
                  style={{
                    animation: "softPulse 1.2s ease-in-out infinite"
                  }}
                  aria-hidden="true"
                >
                  progress_activity
                </span>
                <div class="text-sm">Verifying admin session…</div>
              </div>
            </div>
          }
        >
          <div class="flex min-h-screen items-center justify-center bg-void text-text-muted">
            <div class="text-center">
              <span
                class="material-symbols-outlined mx-auto mb-3 block text-4xl"
                aria-hidden="true"
              >
                lock
              </span>
              <div class="mb-4 text-sm">Redirecting to login…</div>
            </div>
          </div>
        </Show>
      }
    >
      <div class="admin-shell flex min-h-screen bg-void text-text">
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
              "backdrop-filter": "blur(4px)",
              "z-index": 40
            }}
            class="admin-sidebar-overlay"
          />
        </Show>

        {/* Sidebar — Glass surface.
            We use the Glass tokens (bg-glass + backdrop-blur-xl +
            border-glass-border) directly via Tailwind utilities rather
            than wrapping in <GlassSurface>, because the sidebar is a
            full-height column with a right divider — not a rounded
            floating card. The tokens are the same ones GlassSurface
            applies internally, so the visual language is consistent. */}
        <aside
          class="admin-sidebar sticky top-0 flex max-h-screen w-[248px] flex-shrink-0 flex-col gap-1 overflow-y-auto border-r border-glass-border bg-glass px-3 py-5 backdrop-blur-xl"
        >
          {/* Brand */}
          <div class="border-b border-glass-border px-3 pb-5">
            <div class="flex items-center gap-2">
              <span
                class="material-symbols-outlined text-xl text-primary"
                style={{
                  "font-variation-settings":
                    "'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 24"
                }}
                aria-hidden="true"
              >
                movie
              </span>
              <div>
                <div class="text-base font-bold leading-tight text-text-strong">
                  CineLog
                </div>
                <div class="font-label text-[10px] font-semibold uppercase tracking-widest text-text-muted">
                  Admin Panel
                </div>
              </div>
            </div>
          </div>

          {/* Nav groups */}
          <div class="mt-2">
            <Sidebar activePath={currentPath} onNavigate={closeSidebar} />
          </div>
        </aside>

        {/* Main */}
        <div class="admin-main flex min-w-0 flex-1 flex-col">
          {/* TopBar — Glass surface */}
          <header
            class="admin-topbar sticky top-0 z-30 flex items-center justify-between border-b border-glass-border bg-glass px-6 py-3 backdrop-blur-xl"
          >
            <div class="flex items-center gap-3">
              <span
                class="admin-hamburger-hidden material-symbols-outlined text-xl text-primary"
                aria-hidden="true"
              >
                movie
              </span>
              <h1 class="m-0 text-base font-semibold text-text">
                {breadcrumb()}
              </h1>
            </div>

            <div class="flex items-center gap-4">
              <Show when={auth.admin()}>
                {(admin) => (
                  <div class="flex items-center gap-2 text-xs text-text-secondary">
                    <div
                      class="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-on-primary"
                      aria-hidden="true"
                    >
                      {admin().display_name.charAt(0).toUpperCase()}
                    </div>
                    <span>{admin().display_name}</span>
                  </div>
                )}
              </Show>

              <GlassButton
                variant="glass"
                size="compact"
                icon="logout"
                onClick={handleLogout}
                aria-label="Logout"
              >
                Logout
              </GlassButton>
            </div>
          </header>

          {/* Page content — AdminShell is the root layout for /admin
              routes (AppShell renders bare children for admin), so this
              is the SINGLE <main> landmark for admin pages. */}
          <main class="flex-1 overflow-y-auto p-6">
            {props.children}
          </main>
        </div>
      </div>
    </Show>
  );
};

export default AdminShell;
