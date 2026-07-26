// src/features/discover/components/DiscoverSection.tsx
//
// DiscoverSection — the standard wrapper for each Discover fold.
// Shows a label with an icon, and either the children or a 6-card
// skeleton rail while data is loading.

import { Show, For, type JSX } from "solid-js";

interface DiscoverSectionProps {
  label: string;
  icon: string;
  loading?: boolean;
  children: JSX.Element;
}

export function DiscoverSection(props: DiscoverSectionProps) {
  return (
    <section class="discover-fold" aria-label={props.label}>
      <div class="discover-fold-label">
        <span class="material-symbols-outlined" aria-hidden="true">{props.icon}</span>
        {props.label}
      </div>
      <Show when={!props.loading} fallback={
        <div class="search-rail">
          <For each={Array.from({ length: 6 })}>{() => <div class="search-rail-card" style={{ cursor: "default" }}><div class="search-rail-poster skeleton-base" /></div>}</For>
        </div>
      }>
        {props.children}
      </Show>
    </section>
  );
}
