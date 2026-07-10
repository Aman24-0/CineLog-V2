import Icon from "./Icon";

export default function LoadingScreen() {
  return (
    <div class="flex min-h-screen flex-col items-center justify-center bg-black text-white">
      <div class="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl border border-zinc-800 bg-zinc-900">
        <Icon
          name="movie_filter"
          class="animate-spin text-5xl"
          style="color: var(--p)"
        />
      </div>

      <h1 class="text-4xl font-bold tracking-wide">
        CineLog
      </h1>

      <p class="mt-3 text-sm text-zinc-400">
        Initializing Vault...
      </p>
    </div>
  );
}
