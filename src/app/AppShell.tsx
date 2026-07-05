import { ParentComponent } from "solid-js";
import ToastContainer from "~/shared/ui/ToastContainer";

const AppShell: ParentComponent = (props) => {
  return (
    <div class="min-h-screen bg-black text-white">
      {props.children}

      <ToastContainer />
    </div>
  );
};

export default AppShell;
