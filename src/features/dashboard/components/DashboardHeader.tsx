import Icon from "~/shared/ui/Icon";

export default function DashboardHeader() {
  return (
    <header class="sticky top-0 z-20 flex items-center justify-between border-b border-zinc-800 bg-black/95 px-5 py-4 backdrop-blur">
      <div class="flex items-center gap-3">
        <div
          class="flex h-10 w-10 items-center justify-center rounded-xl"
          style="background: var(--p-dim);"
        >
          <Icon
            name="movie_filter"
            fill
            style="color: var(--p)"
          />
        </div>

        <div>
          <h1 class="text-2xl font-black tracking-wide">
            CINE<span style="color: var(--p)">LOG</span>
          </h1>

          <p class="text-xs text-zinc-500">
            Personal Movie Vault
          </p>
        </div>
      </div>
    </header>
  );
}
