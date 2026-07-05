import { Icon } from "~/shared/ui";

export default function Home() {
  return (
    <main class="flex min-h-screen items-center justify-center bg-gray-900 text-white">
      <div class="flex flex-col items-center gap-4">
        <Icon
          name="movie_filter"
          class="text-6xl"
          style="color:#22c55e;"
        />
        <h1 class="text-4xl font-bold">
          CineLog V2 Foundation
        </h1>
      </div>
    </main>
  );
}
