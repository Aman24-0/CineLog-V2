// src/features/dashboard/components/StatsGrid.tsx
import { For, Show, createMemo, Component } from "solid-js";
import Icon from "~/shared/ui/Icon";
import type { WatchlistItem } from "~/shared/types";

interface StatsGridProps {
  watchlist: WatchlistItem[];
  onNavigate: (status: string) => void;
}

const StatsGrid: Component<StatsGridProps> = (props) => {
  const watchingCount = createMemo(() => props.watchlist.filter((m) => m.status === "Watching").length);
  const plannedList = createMemo(() => props.watchlist.filter((m) => m.status === "Planned" || m.status === "Plan to Watch"));
  const completedCount = createMemo(() => props.watchlist.filter((m) => m.status === "Completed").length);

  const stats = createMemo(() => [
    {
      icon: "inventory_2",
      label: "Total Vault",
      value: props.watchlist.length,
      color: "white",
      status: "all",
    },
    {
      icon: "play_circle",
      label: "Watching",
      value: watchingCount(),
      color: "white",
      status: "Watching",
    },
    {
      icon: "bookmark",
      label: "Planned",
      value: plannedList().length,
      color: "var(--p)",
      status: "Planned",
    },
    {
      icon: "task_alt",
      label: "Completed",
      value: completedCount(),
      color: "white",
      status: "Completed",
    },
  ]);

  return (
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger" role="region" aria-label="Vault statistics">
      <For each={stats()}>
        {(stat) => (
          <div
            onClick={() => props.onNavigate(stat.status)}
            onKeyDown={(e) => {
              if (e.key === "Enter") props.onNavigate(stat.status);
            }}
            class="stat-card p-4 flex flex-col items-center justify-center cursor-pointer group animate-fade-up"
            role="button"
            tabindex={0}
            aria-label={`${stat.value} ${stat.label}`}
          >
            <Icon
              name={stat.icon}
              class="text-gray-600 group-hover:text-white mb-2 text-xl"
              style={{ transition: "color 220ms ease-out", color: stat.color === "white" ? undefined : stat.color }}
              aria-hidden="true"
            />
            <span class="type-stat text-white mb-1" style={{ color: stat.color }}>{stat.value}</span>
            <span class="type-caption text-gray-500">{stat.label}</span>
          </div>
        )}
      </For>
    </div>
  );
};

export default StatsGrid;
