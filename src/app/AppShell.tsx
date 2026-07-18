import { ParentComponent, lazy, Suspense, Show, createMemo } from "solid-js";
import ToastContainer from "~/shared/ui/ToastContainer";
import BottomNavigation from "~/shared/ui/BottomNavigation";
import AppHeader from "~/shared/ui/AppHeader";
import AuthModal from "~/shared/ui/AuthModal";
import { useModalState } from "~/shared/hooks/useModalState";
import { useCollectionModal } from "~/shared/hooks/useCollectionModal";
import { useAuthModal } from "~/shared/hooks/useAuthModal";

const DetailsModal = lazy(() => import("~/features/details/DetailsModal"));
const CollectionModal = lazy(() => import("~/features/collection/CollectionModal"));

const AppShell: ParentComponent = (props) => {
  const { selectedItem } = useModalState();
  const { collectionSelectedItem } = useCollectionModal();
  const { authModalOpen, closeAuthModal } = useAuthModal();
  const backgroundIsBlocked = createMemo(
    () => Boolean(selectedItem() || collectionSelectedItem() || authModalOpen()),
  );

  return (
    <div
      class="min-h-screen app-shell-bg"
      style={{
        "padding-bottom": "var(--nav-total-height)",
        background: "var(--void)",
        color: "var(--text)",
      }}
    >
      <div
        inert={backgroundIsBlocked()}
      >
        <AppHeader />

        {props.children}

        <BottomNavigation />
      </div>

      <ToastContainer />

      {/* Auth modal — opened from any page when a guest tries to sign in */}
      <AuthModal show={authModalOpen} onClose={closeAuthModal} />

      {/* Details modal — opened from Vault, Discover, Search, or Collection */}
      <Show when={selectedItem()}>
        <Suspense fallback={null}>
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
  );
};

export default AppShell;
