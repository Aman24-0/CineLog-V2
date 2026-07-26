import { ParentComponent, lazy, Suspense, Show, createMemo, createEffect } from "solid-js";
import { Portal } from "solid-js/web";
import { useLocation } from "@solidjs/router";
import ToastContainer from "~/shared/ui/ToastContainer";
import BottomNavigation from "~/shared/ui/BottomNavigation";
import AppHeader from "~/shared/ui/AppHeader";
import AuthModal from "~/shared/ui/AuthModal";
import AnnouncementsBanner from "~/shared/ui/AnnouncementsBanner";
import { useModalState } from "~/shared/hooks/useModalState";
import { useCollectionModal } from "~/shared/hooks/useCollectionModal";
import { useAuthModal } from "~/shared/hooks/useAuthModal";

const DetailsModal = lazy(() => import("~/features/details/DetailsModal"));
const CollectionModal = lazy(() => import("~/features/collection/CollectionModal"));

/**
 * AppShell — the application's root layout.
 *
 * STRUCTURE:
 *   <div class="app-shell-bg">
 *     <AppHeader />          ← <header role="banner">
 *     <main>                 ← SINGLE <main> landmark (WCAG 2.4.1)
 *       {props.children}     ← page content (pages use <div role="region">)
 *     </main>
 *     <ToastContainer />     ← aria-live region
 *     <BottomNavigation />   ← <nav role="navigation">
 *     <AuthModal />          ← Portal, rendered above
 *     <DetailsModal />       ← Portal, rendered above
 *     <CollectionModal />    ← Portal, rendered above
 *   </div>
 *
 * ACCESSIBILITY (WCAG 1.3.1, 2.1.2, 4.1.2):
 *   We do NOT set `inert` OR `aria-hidden` on the background wrapper when
 *   a modal is open. Both approaches cause the Vercel/Lighthouse audit
 *   "ARIA hidden element must not be focusable or contain focusable
 *   elements" to flag the background `<header>`, `<nav>`, `<form>`,
 *   `.scroll-to-top`, etc. — because the audit's static DOM scan sees
 *   focusable buttons inside an inert/aria-hidden parent and reports
 *   them, even though `inert` does make them non-focusable at runtime.
 *
 *   Instead, we rely on `aria-modal="true"` on each modal dialog (set
 *   in DetailsModal / CollectionModal / AuthModal). `aria-modal="true"`
 *   tells assistive technology that the rest of the page is inert —
 *   screen readers honour this and skip the background. A focus trap
 *   (in DetailsModal) contains keyboard focus inside the modal.
 *
 *   This is the WCAG-compliant way that passes the Vercel audit:
 *     - No `aria-hidden` on structural layout tags (header, nav, main).
 *     - No `inert` on the background wrapper (avoids false positives).
 *     - `aria-modal="true"` on the dialog handles AT hiding.
 *     - Focus trap handles keyboard users.
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

  // Any modal open — used for body scroll lock (set in each modal's onMount).
  // We do NOT use `inert` or `aria-hidden` on the background wrapper — see
  // the comment above for the full rationale.
  const anyModalOpen = createMemo(() =>
    !!selectedItem() || !!collectionSelectedItem() || !!authModalOpen(),
  );

  // Lock body scroll when any modal is open so the background doesn't scroll
  // under the modal. This is a UX concern, not an a11y concern.
  createEffect(() => {
    if (typeof document === "undefined") return;
    document.body.style.overflow = anyModalOpen() ? "hidden" : "";
  });

  // Admin routes: render children bare — no consumer chrome, no padding.
  return (
    <Show when={isAdminRoute()} fallback={
      <div
        class="min-h-screen w-full app-shell-bg"
        style={{
          "padding-bottom": "calc(var(--nav-total-height) + var(--nav-float-margin, 1rem) + 0.5rem)",
          background: "var(--void)",
          color: "var(--text)",
        }}
      >
        <AppHeader />

        <AnnouncementsBanner />

        {/* SINGLE <main> landmark for the entire consumer app.
            Page routes render <div role="region"> (not <main>) inside
            this <main> so there is exactly one <main> per page. */}
        <main id="main-content">
          {props.children}
        </main>

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
          <Suspense fallback={
            <Portal>
              <div
                class="fixed inset-0 z-[999999] flex items-center justify-center"
                style={{ background: "rgba(0,0,0,0.75)", "backdrop-filter": "blur(8px)", "-webkit-backdrop-filter": "blur(8px)" }}
                role="dialog"
                aria-modal="true"
                aria-label="Loading details"
                onClick={() => {
                  // Allow backdrop tap to cancel slow TMDB loads
                  import("~/shared/hooks/useModalState").then(({ closeTitle }) => closeTitle());
                }}
                onKeyDown={(e: KeyboardEvent) => {
                  if (e.key === "Escape") {
                    import("~/shared/hooks/useModalState").then(({ closeTitle }) => closeTitle());
                  }
                }}
              >
                <span
                  class="material-symbols-outlined"
                  style={{
                    "font-size": "32px",
                    color: "var(--text-soft)",
                    animation: "softPulse 1.2s ease-in-out infinite",
                  }}
                  aria-hidden="true"
                >
                  progress_activity
                </span>
              </div>
            </Portal>
          }>
            <DetailsModal />
          </Suspense>
        </Show>

        {/* Collection modal — opened from Details FranchiseInfo, Discover, or Vault.
            Rendered at z-[999998] — below Details (z-[999999]) so if both are
            open, Details paints on top. In practice only one is open at a time. */}
        <Show when={collectionSelectedItem()}>
          <Suspense fallback={null}>
            <CollectionModal />
          </Suspense>
        </Show>
      </div>
    }>
      {/* Admin route: bare render — AdminShell handles its own layout.
          Admin routes use <div role="region"> for content (not <main>)
          so there is still exactly one <main> per page — provided by
          the AdminShell. */}
      {props.children}
    </Show>
  );
};

export default AppShell;
