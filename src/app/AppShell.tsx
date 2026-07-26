import { ParentComponent, lazy, Suspense, Show, createMemo } from "solid-js";
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
 *     {props.children}       ← page content (each page wraps in <main>)
 *     <ToastContainer />     ← aria-live region
 *     <BottomNavigation />   ← <nav role="navigation">
 *     <AuthModal />          ← Portal, rendered above
 *     <DetailsModal />       ← Portal, rendered above
 *     <CollectionModal />    ← Portal, rendered above
 *   </div>
 *
 * INERT / ACCESSIBILITY (WCAG 1.3.1, 2.1.2, 4.1.2):
 *   When ANY modal is open (Details, Collection, Auth, Share), the
 *   background content (header + main + nav) is marked `inert`.
 *   The `inert` attribute:
 *     1. Hides the element and all descendants from the accessibility
 *        tree (equivalent to aria-hidden="true")
 *     2. Removes all descendants from the tab order (focusable elements
 *        become non-focusable)
 *     3. Prevents click events from firing on the background
 *
 *   This is the WCAG-compliant way to handle modal dialogs. Previously,
 *   the background stayed focusable, which caused:
 *     - Screen reader users could Tab into hidden content
 *     - Keyboard focus could escape the modal
 *     - The Vercel audit flagged "ARIA hidden element must not contain
 *       focusable elements" because the modal's aria-hidden backdrop
 *       sat on top of focusable header/nav buttons
 *
 *   `inert` is supported in all modern browsers (Chrome 102+, Safari
 *   15.5+, Firefox 112+). For older browsers, the modal's focus trap
 *   (in DetailsModal) still contains keyboard focus manually.
 *
 * SINGLE <main> LANDMARK (WCAG 1.3.1, 2.4.1):
 *   The AppShell does NOT render a <main> — each page route wraps its
 *   own content in <main> via PageContainer. This ensures exactly one
 *   <main> landmark per page (verified by the Vercel audit).
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

  // Any modal open → background is inert (hidden from AT + non-focusable)
  const anyModalOpen = createMemo(() =>
    !!selectedItem() || !!collectionSelectedItem() || !!authModalOpen(),
  );

  // Admin routes: render children bare — no consumer chrome, no padding,
  // no inert handling (admin pages don't use DetailsModal/CollectionModal/
  // AuthModal from the consumer app).
  return (
    <Show when={isAdminRoute()} fallback={
      <div
        class="min-h-screen w-full app-shell-bg"
        style={{
          "padding-bottom": "calc(var(--nav-total-height) + var(--nav-float-margin, 1rem) + 0.5rem)",
          background: "var(--void)",
          color: "var(--text)",
        }}
        // `inert` when a modal is open — hides this entire subtree from
        // the accessibility tree AND removes all focusable descendants
        // from the tab order. This is the WCAG-compliant way to handle
        // modal background content.
        inert={anyModalOpen()}
        // aria-hidden is redundant with inert but added for older
        // browsers / screen readers that don't support inert yet.
        aria-hidden={anyModalOpen() ? "true" : undefined}
      >
        <AppHeader />

        <AnnouncementsBanner />

        {props.children}

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
      {/* Admin route: bare render — AdminShell handles its own layout */}
      {props.children}
    </Show>
  );
};

export default AppShell;
