import { ParentComponent } from "solid-js";
import ToastContainer from "~/shared/ui/ToastContainer";
import BottomNavigation from "~/shared/ui/BottomNavigation";

const AppShell: ParentComponent = (props) => {
  return (
    <div class="min-h-screen bg-black pb-16 text-white">
      {props.children}

      <ToastContainer />

      <BottomNavigation />
    </div>
  );
};

export default AppShell;
