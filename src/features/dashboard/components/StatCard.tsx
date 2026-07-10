// src/features/dashboard/components/StatCard.tsx
import { Component } from "solid-js";

interface StatCardProps {
  title: string;
  value: string | number;
}

const StatCard: Component<StatCardProps> = (props) => {
  return (
    <div class="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <p class="text-xs uppercase tracking-[0.2em] text-zinc-500">
        {props.title}
      </p>

      <h3 class="mt-3 text-4xl font-black">
        {props.value}
      </h3>
    </div>
  );
};

export default StatCard;
