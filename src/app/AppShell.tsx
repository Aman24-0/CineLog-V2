import { ParentComponent } from "solid-js";

const AppShell: ParentComponent = (props) => {
  return (
    <div class="min-h-screen bg-black text-white">
      {props.children}
    </div>
  );
};

export default AppShell;
