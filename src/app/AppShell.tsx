import {
  ParentComponent,
  lazy,
  Suspense,
  Show,
  createMemo,
  createEffect
} from "solid-js";
import { Portal } from "solid-js/web";
import { useLocation } from "@solidjs/router";
import ToastContainer from "~/shared/ui/ToastContainer";
import BottomNavigation from "~/shared/ui/BottomNavigation";
import AppHeader from "~/shared/ui/AppHeader";
import AuthModal from "~/shared/ui/AuthModal";
import AnnouncementsBanner from "~/shared/ui/AnnouncementsBanner";
import DesktopSidebar from "~/shared/ui/DesktopSidebar";
import DesktopUtilityPanel from "~/shared/ui/DesktopUtilityPanel";
// Phase 14 — Ambient Cinematic UI: the multi-color frosted glass
// background. Mounted ONCE inside the consumer wrapper so it persists
// across all consumer route changes (Discover → Watchlist → Profile).
// Admin and Landing routes do NOT mount it (their wrappers keep solid
// --void). See src/shared/ui/AmbientBackground.tsx for the full design.
import AmbientBackground from "~/shared/ui/AmbientBackground";
import { useModalState } from "~/shared/hooks/useModalState";
import { useCollectionModal } from "~/shared/hooks/useCollectionModal";
import { useAuthModal } from "~/shared/hooks/useAuthModal";
import SearchOverlay from "~/features/search/SearchOverlay";

const DetailsModal = lazy(() => import("~/features/details/DetailsModal"));
const CollectionModal = lazy(
  () => import("~/features/collection/CollectionModal")
);

/**
 * AppShell — the application's root layout.
 *
 * STRUCTURE:
 *   <div class="app-shell-bg" inert?={anyModalOpen()}>
 *     <a class="skip-link" href="#main-content">Skip to content</a>
 *     <AppHeader />          ← <header role="banner">
 *     <main id="main-content">← SINGLE <main> landmark (WCAG 2.4.1)
 *       {props.children}     ← page content (pages use <div role="region">)
 *     </main>
 *     <ToastContainer />     ← aria-live region
 *     <BottomNavigation />   ← <nav role="navigation">
 *     <AuthModal />          ← Portal, rendered above
 *     <DetailsModal />       ← Portal, rendered above
 *     <CollectionModal />    ← Portal, rendered above
 *   </div>
 *
 * ACCESSIBILITY (WCAG 1.3.1, 2.1.2, 2.4.1, 4.1.2):
 *   SKIP LINK (WCAG 2.4.1 — Bypass Blocks):
 *     The first element in the consumer wrapper is a visually-hidden
 *     skip link (`<a href="#main-content" class="skip-link">`). It
 *     becomes visible only when focused (Tab from the address bar)
 *     so keyboard users can jump straight to the main content
 *     without tabbing through the entire header + bottom nav on
 *     every page. The link targets the `<main id="main-content">`
 *     landmark below.
 *
 *   INERT BACKGROUND (WCAG 2.1.2 — No Keyboard Trap, 4.1.2):
 *     When any modal (Details / Auth / Collection) is open, we set
 *     the `inert` attribute on the consumer app wrapper. This makes
 *     the entire background (header, sidebar, main, bottom nav)
 *     non-focusable AND hidden from the accessibility tree —
 *     exactly the behaviour AT users expect when a modal opens.
 *     `inert` is the modern, native alternative to manually setting
 *     `aria-hidden="true"` on each chrome element (which is what the
 *     Vercel/Lighthouse audit flags as "ARIA hidden element must not
 *     be focusable" when child focusables are still in the tab order).
 *     With `inert`, focusables are removed from the tab order AND
 *     hidden from AT, so there is no audit violation.
 *
 *     The `aria-modal="true"` attribute on each dialog is also kept
 *     (GlassModal / GlassSheet / AuthModal set it) as a belt-and-
 *     braces signal to AT — some legacy screen readers don't yet
 *     honour `inert` but DO honour `aria-modal`.
 *
 * SINGLE <main> LANDMARK (WCAG 1.3.1, 2.4.1):
 *   The AppShell renders EXACTLY ONE <main> landmark. Page routes
 *   wrap their content in <div role="region"> (via PageContainer or
 *   directly) so there is never a second <main> on the page.
 */
const AppShell: ParentComponent = (props) => {
  const { selectedItem } = useModalState();
  const { collectionSelectedItem } = useCollectionModal();
  const { authModalOpen } = useAuthModal();
  const location = useLocation();

  // Admin routes render their own layout (AdminShell) with its own sidebar,
  // top bar, and auth gate. They must NOT be wrapped in the consumer AppShell
  // chrome (AppHeader + AnnouncementsBanner + BottomNavigation), otherwise:
  //   1. The consumer Discover/Watchlist/Collections bottom nav leaks into
  //      the admin panel (user-reported issue).
  //   2. The consumer layout's padding-bottom (for the bottom nav) conflicts
  //      with the admin sidebar's sticky positioning, producing a blank page
  //      on /admin/collections.
  // Admin routes still need the providers (UserLibraryProvider, VaultProvider,
  // CollectionsProvider) wrapped in app.tsx, so we keep them inside AppShell
  // but bypass all consumer chrome.
  const isAdminRoute = createMemo(() => location.pathname.startsWith("/admin"));

  // Phase 11 — Landing Page: the root route `/` renders the marketing
  // LandingPage for logged-out users. The LandingPage has its OWN sticky
  // header, hero, and footer, so the consumer chrome (AppHeader,
  // BottomNavigation, DesktopSidebar, AnnouncementsBanner) must NOT be
  // rendered. We still mount AuthModal + ToastContainer so the "Get
  // Started" / "Login" CTAs work and auth toasts can fire. The route
  // itself (src/routes/index.tsx) handles the signed-in → /discover
  // redirect, so by the time LandingPage actually paints the user is
  // guaranteed to be logged-out (or about to be redirected).
  const isLandingRoute = createMemo(() => location.pathname === "/");

  // Any modal open — used for body scroll lock (set in each modal's onMount)
  // AND for setting `inert` on the consumer wrapper so the background chrome
  // (header, sidebar, main, bottom nav) is non-focusable AND hidden from AT
  // while a modal is open. See the header comment for the full rationale.
  const anyModalOpen = createMemo(
    () => !!selectedItem() || !!collectionSelectedItem() || !!authModalOpen()
  );

  // Lock body scroll when any modal is open so the background doesn't scroll
  // under the modal. This is a UX concern, not an a11y concern.
  createEffect(() => {
    if (typeof document === "undefined") return;
    document.body.style.overflow = anyModalOpen() ? "hidden" : "";
  });

  // Admin routes: render children bare — no consumer chrome, no padding.
  // Landing routes: render children bare (no AppHeader / BottomNav /
  // DesktopSidebar / AnnouncementsBanner) but still mount AuthModal +
  // ToastContainer so the marketing CTAs work. The bottom-nav padding
  // is also removed so the hero can be truly full-bleed.
  return (
    <Show
      when={isAdminRoute()}
      fallback={
        <Show
          when={isLandingRoute()}
          fallback={
            <div
              class="app-shell-bg min-h-screen w-full"
              // `inert` makes the entire background chrome (header, sidebar,
              // main, bottom nav) non-focusable AND hidden from the AT tree
              // when any modal is open. This is the WCAG-compliant way to
              // contain keyboard focus inside the modal — see header comment.
              inert={anyModalOpen() ? true : undefined}
              style={{
                "padding-bottom":
                  "calc(var(--nav-total-height) + var(--nav-float-margin, 1rem) + 0.5rem)",
                // Phase 14: switched from solid --void to translucent
                // --void-ambient so the AmbientBackground blobs show
                // through. Solid --void is still used by body + admin +
                // landing routes where the ambient is hidden.
                background: "var(--void-ambient)",
                color: "var(--text)"
              }}
            >
              {/* Phase 14 — AmbientBackground: fixed, full-viewport,
                  non-interactive multi-color blob layer. MUST be the
                  first child so it paints below all chrome. Its
                  position:fixed + z-index:0 means it never participates
                  in flow and never intercepts clicks. */}
              <AmbientBackground />

              {/* Skip link (WCAG 2.4.1 — Bypass Blocks). First focusable
                  element in the DOM so keyboard users land on it before
                  the header. Visually hidden until focused (CSS in
                  base/accessibility.css). */}
              <a href="#main-content" class="skip-link">
                Skip to content
              </a>

              <AppHeader />

              <AnnouncementsBanner />

              {/* Desktop Sidebar — hidden on mobile, visible on desktop via CSS */}
              <DesktopSidebar />

              {/* SINGLE <main> landmark for the entire consumer app.
                Page routes render <div role="region"> (not <main>) inside
                this <main> so there is exactly one <main> per page. */}
              <main id="main-content">{props.children}</main>

              {/* Desktop Utility Panel — hidden on mobile, visible on desktop via CSS */}
              <DesktopUtilityPanel />

              {/* Global Search Overlay — independent from any page, renders
                  above the current page when the user searches from the AppHeader. */}
              <SearchOverlay />

              <ToastContainer />

              <BottomNavigation />

              {/* Auth modal — opened from any page when a guest tries to sign in.
                AuthModal takes no props; it reads open/close state directly from
                the useAuthModal() hook. Previously this passed `show` / `onClose`
                which were silently ignored and also produced a TS error. */}
              <AuthModal />

              {/* Details modal — opened from Vault, Discover, Search, or Collection.
                Shown when selectedItem() is truthy. The Suspense fallback is a
                lightweight centered spinner so the user sees immediate feedback
                that the modal is opening. Users can tap the backdrop or press
                ESC to cancel during slow TMDB loads. */}
              <Show when={selectedItem()}>
                <Suspense
                  fallback={
                    <Portal>
                      <div
                        class="fixed inset-0 z-[999999] flex items-center justify-center"
                        style={{
                          background: "rgba(0,0,0,0.75)",
                          "backdrop-filter": "blur(8px)",
                          "-webkit-backdrop-filter": "blur(8px)"
                        }}
                        role="dialog"
                        aria-modal="true"
                        aria-label="Loading details"
                        onClick={() => {
                          // Allow backdrop tap to cancel slow TMDB loads
                          import("~/shared/hooks/useModalState").then(
                            ({ closeTitle }) => closeTitle()
                          );
                        }}
                        onKeyDown={(e: KeyboardEvent) => {
                          if (e.key === "Escape") {
                            import("~/shared/hooks/useModalState").then(
                              ({ closeTitle }) => closeTitle()
                            );
                          }
                        }}
                      >
                        <span
                          class="material-symbols-outlined"
                          style={{
                            "font-size": "32px",
                            color: "var(--text-soft)",
                            animation: "softPulse 1.2s ease-in-out infinite"
                          }}
                          aria-hidden="true"
                        >
                          progress_activity
                        </span>
                      </div>
                    </Portal>
                  }
                >
                  <DetailsModal />
                </Suspense>
              </Show>

              {/* Collection modal — opened from Details FranchiseInfo, Discover, or Vault.
                Rendered at z-[999998] — below Details (z-[999999]) so if both are
                open, Details paints on top. In practice only one is open at a time. */}
              <Show when={collectionSelectedItem()}>
                <Suspense
                  fallback={
                    <Portal>
                      <div
                        class="fixed inset-0 z-[999998] flex items-center justify-center"
                        style={{
                          background: "rgba(0,0,0,0.75)",
                          "backdrop-filter": "blur(8px)",
                          "-webkit-backdrop-filter": "blur(8px)"
                        }}
                        role="dialog"
                        aria-modal="true"
                        aria-label="Loading collection"
                      >
                        <div
                          class="flex flex-col items-center gap-3"
                          style={{
                            width: "280px",
                            padding: "24px",
                            "border-radius": "16px",
                            background: "rgba(255,255,255,0.06)",
                            "border": "1px solid rgba(255,255,255,0.10)",
                            "backdrop-filter": "blur(12px)"
                          }}
                        >
                          <div
                            style={{
                              width: "100%",
                              height: "20px",
                              "border-radius": "6px",
                              background: "rgba(255,255,255,0.08)",
                              animation: "softPulse 1.2s ease-in-out infinite"
                            }}
                            aria-hidden="true"
                          />
                          <div
                            style={{
                              width: "70%",
                              height: "14px",
                              "border-radius": "6px",
                              background: "rgba(255,255,255,0.05)",
                              animation: "softPulse 1.2s ease-in-out infinite"
                            }}
                            aria-hidden="true"
                          />
                          <div
                            style={{
                              width: "100%",
                              height: "12px",
                              "border-radius": "6px",
                              background: "rgba(255,255,255,0.05)",
                              animation: "softPulse 1.2s ease-in-out infinite"
                            }}
                            aria-hidden="true"
                          />
                          <div
                            style={{
                              width: "85%",
                              height: "12px",
                              "border-radius": "6px",
                              background: "rgba(255,255,255,0.05)",
                              animation: "softPulse 1.2s ease-in-out infinite"
                            }}
                            aria-hidden="true"
                          />
                        </div>
                      </div>
                    </Portal>
                  }
                >
                  <CollectionModal />
                </Suspense>
              </Show>
            </div>
          }
        >
          {/* Landing route — minimal wrapper. No consumer chrome, but
              AuthModal + ToastContainer must be mounted so the marketing
              CTAs ("Get Started" / "Login") open the auth modal and auth
              success/error toasts can fire. The LandingPage component
              provides its own <main> landmark and skip link target.
              
              IMPORTANT: Uses app-shell-landing (NOT app-shell-bg) to avoid
              the desktop-workspace.css grid layout that breaks the full-width
              landing page at ≥1024px. The workspace grid is designed for the
              consumer app's 3-column layout (sidebar/main/utility), not the
              marketing landing page. */}
          <div
            class="app-shell-landing min-h-screen w-full"
            inert={anyModalOpen() ? true : undefined}
            style={{
              background: "var(--void)",
              color: "var(--text)"
            }}
          >
            {props.children}
            <ToastContainer />
            <AuthModal />
          </div>
        </Show>
      }
    >
      {/* Admin route: bare render — AdminShell handles its own layout.
          Admin routes use <div role="region"> for content (not <main>)
          so there is still exactly one <main> per page — provided by
          the AdminShell. */}
      {props.children}
    </Show>
  );
};

export default AppShell;
