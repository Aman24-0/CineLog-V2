import { ParentComponent } from "solid-js";

const PageContainer: ParentComponent = (props) => {
  return (
    <main class="mx-auto w-full max-w-7xl px-4 py-4">
      {props.children}
    </main>
  );
};

export default PageContainer;
