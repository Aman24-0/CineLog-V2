// src/features/admin/AdminShell.tsx
//
// CineLog V2 — Admin Layout Shell (Phase 9 Chunks 1 + 2 — Glass Redesign)
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
//     Communication, Configuration, Services, Developer.
//   • All inline emoji icons replaced with Material Symbols.
//   • Sidebar / topbar restyled using Glass design tokens.
//   • Removed the always-empty FUTURE_ITEMS placeholder block.
//
// PHASE 9 CHUNK 2 CHANGES:
//   • Services group rewritten to expose the 7 new Services Hub pages
//     (TMDB, MDBList, AniList, Supabase, Resend, Vercel, Web Push)
//     instead of the old flat list (TMDB Cache + AniList + Maintenance).
//     The dedicated TMDB Cache browser and the AniList feature-toggle
//     page are still reachable — they're linked FROM the new service
//     pages (e.g. /admin/services/tmdb has a "Manage cache entries →"
//     link to /admin/tmdb-cache). Keeping them OUT of the sidebar
//     enforces the Phase 9 zero-duplication rule: a service setting
//     belongs to exactly one page.
//   • Maintenance kept in the Services group — it's an operational
//     tool, not a config page.
//   • Sidebar collapse breakpoint tightened to <1024px (was 768px)
//     so the sidebar hides on tablets in landscape mode too. The
//     hamburger button is now properly visible below 1024px.
//
// RESPONSIVE:
//   - Desktop (≥1024px): sidebar is visible, 248px wide
//   - Mobile / tablet (<1024px): sidebar hidden, hamburger menu opens
//     it as a full-height overlay with a backdrop blur
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
  onCleanup,
  createEffect,
  createSignal,
  type Component
} from "solid-js";
import { useNavigate, useLocation, A } from "@solidjs/router";
import { useAdminAuth } from "./hooks/useAdminAuth";
import { GlassButton } from "~/shared/ui/glass/GlassButton";
import { GlassLoadingState } from "~/shared/ui/glass/GlassLoadingState";
import { PermissionDenied } from "~/shared/ui/states";
// Phase 14 Chunk 5 — Admin Ambient Glass Migration.
// The admin panel now mounts the same AmbientBackground component
// the consumer app uses, so the sidebar + topbar + content area all
// float over the vibrant multi-color blob field. The admin-shell
// wrapper switches from solid `bg-void` to translucent `--void-ambient`
// so the blobs bleed through (mirrors the consumer AppShell pattern).
import AmbientBackground from "~/shared/ui/AmbientBackground";

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

// Sidebar groups (Phase 9 Chunk 2).
//
// Grouping rationale:
//   • Overview       — at-a-glance pages (dashboard, analytics, audit)
//   • Users          — account management
//   • Content        — what users see on Discover / collections
//   • Communication  — outbound messaging (announcements, push, email,
//                      global notification settings). Phase 9 Chunk 4
//                      expanded this group from just Announcements to
//                      the full Communication Hub.
//   • Configuration  — global app config + feature toggles
//   • Services       — one page per external integration. Each page is
//                      the SINGLE source of truth for that service's
//                      status + config (zero duplication). Sub-pages
//                      like the TMDB Cache browser + AniList feature
//                      toggles are linked FROM these pages, not from
//                      the sidebar.
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
        href: "/admin/communication/announcements",
        label: "Announcements",
        icon: "campaign"
      },
      {
        href: "/admin/communication/push",
        label: "Web Push",
        icon: "notifications"
      },
      {
        href: "/admin/communication/email",
        label: "Email",
        icon: "mail"
      },
      {
        href: "/admin/communication/notifications",
        label: "Notification Settings",
        icon: "tune"
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
      },
      // Phase 16 Chunk 1 — AI Control Center. Sits in the Configuration
      // group because it's a global toggle surface (like Feature Flags),
      // not a service integration. The "smart_toy" icon (a robot head)
      // signals AI without overlapping the "tune" icon used for
      // Notification Settings.
      { href: "/admin/ai", label: "AI Control Center", icon: "smart_toy" },
      // Phase 16 Chunk 2 — AI Assistant chat. Separate from the Control
      // Center (which is the toggle surface). The "chat" icon signals
      // conversational UI. Gated by the adminAssistantEnabled flag —
      // the page renders a disabled banner if the flag is off.
      {
        href: "/admin/ai-assistant",
        label: "AI Assistant",
        icon: "chat"
      }
    ]
  },
  {
    label: "Services",
    items: [
      { href: "/admin/services/tmdb", label: "TMDB", icon: "movie" },
      { href: "/admin/services/mdblist", label: "MDBList", icon: "rate_review" },
      { href: "/admin/services/anilist", label: "AniList", icon: "animation" },
      { href: "/admin/services/supabase", label: "Supabase", icon: "database" },
      { href: "/admin/services/resend", label: "Resend", icon: "mail" },
      { href: "/admin/services/vercel", label: "Vercel", icon: "cloud" },
      {
        href: "/admin/services/web-push",
        label: "Web Push",
        icon: "notifications"
      },
      // Part 4 — Platform Catalogue admin page. Lives in the Services
      // group because it's the operational surface for the published
      // JustWatch provider catalogue that powers the user-side Library
      // Platform filter. Distinct from the existing Service Hub pages
      // (TMDB/Supabase/etc.) because it's not a status+config page —
      // it's a fetch/compare/publish workflow.
      {
        href: "/admin/platform-catalog",
        label: "Platform Catalogue",
        icon: "live_tv"
      },
      { href: "/admin/maintenance", label: "Maintenance", icon: "build" }
    ]
  },
  {
    label: "Developer",
    items: [
      { href: "/admin/developer", label: "Developer", icon: "terminal" },
      { href: "/admin/cron", label: "Cron Jobs", icon: "schedule" },
      { href: "/admin/database", label: "Database", icon: "database" }
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

  // Track whether we were ever admin so we can detect session expiration.
  const [wasAdmin, setWasAdmin] = createSignal(false);
  const [sessionExpired, setSessionExpired] = createSignal(false);

  // Session gate — redirect to login if not authenticated
  //
  // PHASE 15 QA BUG #4: the previous version only checked at 0ms,
  // 100ms, and 500ms. If the admin session check hung (network
  // issue, SW intercepting), `adminReady()` stayed `false` at 500ms
  // and `checkAuth` did nothing — the AdminShell stayed stuck on
  // "Verifying admin session…" forever.
  //
  // The fix: useAdminAuth now races its fetch against a 5s timeout
  // (see useAdminAuth.ts), so `adminReady` is GUARANTEED to flip to
  // true within ~5s. We add a final `checkAuth` at 5.5s (just after
  // that timeout) so the redirect to /admin/login fires even in the
  // worst case. If `adminReady` resolved earlier (normal path), the
  // 5.5s check is a harmless no-op (the Show has already switched).
  onMount(() => {
    const checkAuth = () => {
      if (auth.adminReady() && !auth.isAdmin()) {
        navigate("/admin/login", { replace: true });
      }
    };
    // Check now and again at increasing intervals. The 5.5s final
    // fallback is the safety net for the worst-case timeout path.
    checkAuth();
    setTimeout(checkAuth, 100);
    setTimeout(checkAuth, 500);
    setTimeout(checkAuth, 5500);
  });

  // Detect session expiration: if we were previously admin and the
  // session drops (e.g. cookie expired, server restarted), show a
  // session-expired state instead of silently redirecting. This
  // prevents the admin from losing work in an open tab.
  createEffect(() => {
    if (auth.isAdmin()) {
      setWasAdmin(true);
      setSessionExpired(false);
    } else if (wasAdmin() && auth.adminReady()) {
      setSessionExpired(true);
    }
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

  // Close the mobile sidebar on Escape key (accessibility pattern
  // for off-canvas drawers — Phase 9 Chunk 8). Also closes when
  // the route changes (handled by the <A onClick={closeSidebar}>
  // in Sidebar).
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && sidebarOpen()) {
      e.preventDefault();
      setSidebarOpen(false);
      // Return focus to the hamburger button so keyboard users
      // don't lose their place after closing the drawer.
      const hamburger = document.querySelector<HTMLButtonElement>(
        ".admin-hamburger"
      );
      hamburger?.focus();
    }
  };

  onMount(() => {
    document.addEventListener("keydown", handleKeyDown);
  });

  onCleanup(() => {
    document.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <Show
      when={auth.isAdmin()}
      fallback={
        <Show
          when={auth.adminReady()}
          fallback={
            <div
              class="flex min-h-screen items-center justify-center"
              style={{ background: "var(--void-ambient)" }}
            >
              <GlassLoadingState
                size="default"
                message="Verifying admin session…"
              />
            </div>
          }
        >
          <Show
            when={sessionExpired()}
            fallback={
              <PermissionDenied
                message="You need to be signed in as an admin to access this panel."
                showHome={false}
              />
            }
          >
            <div
              class="flex min-h-screen flex-col items-center justify-center gap-4 text-center"
              style={{ background: "var(--void-ambient)" }}
              role="alert"
              aria-live="assertive"
            >
              <span
                class="material-symbols-outlined text-4xl text-amber-400"
                aria-hidden="true"
              >
                timer_off
              </span>
              <h3 class="font-heading text-lg font-bold text-text-strong">
                Admin session expired
              </h3>
              <p class="max-w-[320px] text-sm text-text-soft">
                Your admin session has expired. Please sign in again to continue.
              </p>
              <GlassButton
                variant="primary"
                size="default"
                icon="login"
                onClick={() => navigate("/admin/login", { replace: true })}
              >
                Sign in again
              </GlassButton>
            </div>
          </Show>
        </Show>
      }
    >
      <div
        class="admin-shell flex min-h-screen text-text"
        style={{
          // Phase 14 Chunk 5 — translucent void-ambient so the
          // AmbientBackground blobs bleed through the admin chrome.
          // Solid --void is now reserved for the body element + landing
          // routes (which intentionally hide the ambient).
          background: "var(--void-ambient)",
          color: "var(--text)"
        }}
      >
        {/* Phase 14 Chunk 5 — AmbientBackground: fixed, full-viewport,
            non-interactive multi-color blob layer. MUST be the first
            child so it paints below all admin chrome (sidebar, topbar,
            content). Mirrors the consumer AppShell mounting pattern. */}
        <AmbientBackground />

        {/* Skip-link for keyboard users — jumps focus past the sidebar
            nav directly into the page <main>. Visually hidden until
            focused. Phase 9 Chunk 8 accessibility pass. */}
        <a
          href="#admin-main-content"
          class="admin-skip-link"
          aria-label="Skip to main content"
        >
          Skip to main content
        </a>

        {/* Mobile / tablet hamburger button (visible below lg / 1024px).
            The previous implementation hardcoded `display: none` which
            meant the sidebar was unreachable on small screens — Phase 9
            Chunk 2 fixes this with proper Tailwind responsive prefixes. */}
        <button
          type="button"
          class="admin-hamburger fixed left-3 top-3 z-[60] flex h-10 w-10 items-center justify-center rounded-md border border-glass-border bg-glass text-text backdrop-blur-xl transition-[background-color] hover:bg-glass-strong lg:hidden"
          onClick={toggleSidebar}
          aria-label={sidebarOpen() ? "Close admin menu" : "Open admin menu"}
          aria-expanded={sidebarOpen()}
        >
          <span class="material-symbols-outlined text-xl" aria-hidden="true">
            {sidebarOpen() ? "close" : "menu"}
          </span>
        </button>

        {/* Sidebar overlay (mobile / tablet only).
            Click anywhere outside the sidebar to close it. */}
        <Show when={sidebarOpen()}>
          <div
            onClick={closeSidebar}
            class="admin-sidebar-overlay fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
            aria-hidden="true"
          />
        </Show>

        {/* Sidebar — Glass surface.
            • On desktop (lg+): sticky 248px column, always visible.
            • On mobile/tablet (<lg): fixed off-canvas drawer that
              slides in when sidebarOpen() is true. The width is still
              248px so nav labels don't wrap.
            We use the Glass tokens (bg-glass + backdrop-blur-xl +
            border-glass-border) directly via Tailwind utilities rather
            than wrapping in <GlassSurface>, because the sidebar is a
            full-height column with a right divider — not a rounded
            floating card. */}
        <aside
          class={`admin-sidebar fixed inset-y-0 left-0 z-50 flex max-h-screen w-[248px] flex-shrink-0 flex-col gap-1 overflow-y-auto border-r border-glass-border bg-glass px-3 py-5 backdrop-blur-xl transition-[transform] duration-base ease-standard lg:sticky lg:top-0 lg:z-auto lg:translate-x-0 ${
            sidebarOpen() ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
          }`}
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
            class="admin-topbar sticky top-0 z-30 flex items-center justify-between border-b border-glass-border bg-glass px-4 py-3 backdrop-blur-xl lg:px-6"
          >
            <div class="flex items-center gap-3">
              {/* Spacer for hamburger on mobile — keeps the breadcrumb
                  aligned with the hamburger when it's visible. On
                  desktop (lg+) the hamburger is hidden so this spacer
                  collapses. */}
              <span class="w-10 lg:hidden" aria-hidden="true" />
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
              is the SINGLE <main> landmark for admin pages. Padding is
              responsive: 1 unit on mobile, 6 units on lg+ (the previous
              fixed `p-6` caused content to touch the screen edges on
              small screens). */}
          <main
            id="admin-main-content"
            class="flex-1 overflow-y-auto p-4 lg:p-6"
            tabindex={-1}
          >
            {props.children}
          </main>
        </div>
      </div>
    </Show>
  );
};

export default AdminShell;
