// src/features/watchlist/components/LoadingSkeleton.tsx
import { For } from "solid-js";

export default function LoadingSkeleton() {
  return (
    <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 animate-fade-in">
      <For each={Array.from({ length: 12 })}>
        {() => (
          <div class="aspect-[2/3] rounded-2xl border border-white/5 overflow-hidden">
            <div class="w-full h-full" style="background: linear-gradient(105deg, rgba(255,255,255,0.02) 25%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.02) 75%); background-size: 300% 100%; animation: shimmer 1.4s ease-in-out infinite;"></div>
          </div>
        )}
      </For>
    </div>
  );
}
