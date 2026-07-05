// src/features/watchlist/components/VaultHeader.tsx
import Icon from "~/shared/ui/Icon";

interface VaultHeaderProps {
  viewMode: () => "grid" | "timeline";
  setViewMode: (mode: "grid" | "timeline") => void;
  activeFilterCount: () => number;
  onFilterClick: () => void;
}

export default function VaultHeader(props: VaultHeaderProps) {
  return (
    <div class="flex justify-between items-center mb-4">
      <h2 class="type-page-title text-white">VAULT</h2>
      <div class="flex items-center gap-3">
        <div
          class="flex p-1 rounded-full border shadow-sm"
          style="background: var(--surface); border-color: var(--border-active)"
          role="group"
          aria-label="View mode"
        >
          <button
            onClick={() => props.setViewMode("grid")}
            class={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${props.viewMode() === "grid" ? "text-[#0c0e14] shadow-[0_0_12px_var(--p-glow)]" : "text-gray-500 hover:text-white"}`}
            style={props.viewMode() === "grid" ? "background: var(--p)" : ""}
            aria-label="Grid view"
            aria-pressed={props.viewMode() === "grid"}
          >
            <Icon name="grid_view" class="text-sm" aria-hidden="true" />
          </button>
          <button
            onClick={() => props.setViewMode("timeline")}
            class={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${props.viewMode() === "timeline" ? "text-[#0c0e14] shadow-[0_0_12px_var(--p-glow)]" : "text-gray-500 hover:text-white"}`}
            style={props.viewMode() === "timeline" ? "background: var(--p)" : ""}
            aria-label="Timeline view"
            aria-pressed={props.viewMode() === "timeline"}
          >
            <Icon name="timeline" class="text-sm" aria-hidden="true" />
          </button>
        </div>
        <button
          onClick={() => props.onFilterClick()}
          class="flex items-center gap-2 px-4 py-2.5 rounded-full type-caption border active:scale-95 transition-all"
          style="background: var(--surface); border-color: var(--border-active); color: var(--muted)"
          aria-label={`Filter vault${props.activeFilterCount() > 0 ? ` — ${props.activeFilterCount()} active` : ""}`}
        >
          <Icon name="tune" class="text-sm" aria-hidden="true" />
          <span class="hidden sm:inline">Filter</span>
          {props.activeFilterCount() > 0 && (
            <span class="px-2 py-0.5 rounded-full type-caption text-black" style="background: var(--p)" aria-hidden="true">
              {props.activeFilterCount()}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
