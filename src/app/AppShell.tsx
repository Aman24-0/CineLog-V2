import { ParentComponent, lazy, Suspense, Show } from "solid-js";
import ToastContainer from "~/shared/ui/ToastContainer";
import BottomNavigation from "~/shared/ui/BottomNavigation";
import AppHeader from "~/shared/ui/AppHeader";
import { useModalState } from "~/shared/hooks/useModalState";

const DetailsModal = lazy(() => import("~/features/details/DetailsModal"));

const AppShell: ParentComponent = (props) => {
  const { selectedItem } = useModalState();

  return (
    <div
      class="min-h-screen bg-black text-white"
      style={{ "padding-bottom": "var(--nav-total-height)" }}
    >
      <AppHeader />

      {props.children}

      <ToastContainer />

      <BottomNavigation />

      <Show when={selectedItem()}>
        <Suspense fallback={null}>
          <DetailsModal />
        </Suspense>
      </Show>
    </div>
  );
};

export default AppShell;
