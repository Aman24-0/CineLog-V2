// src/features/discover/components/DiscoverSection.tsx
//
// DiscoverSection — the standard wrapper for each Discover fold.
// Shows a label with an icon, and either the children or a 6-card
// skeleton rail while data is loading.
//
// Premium Phase 4 upgrade:
//   - Optional `actionLabel` + `onAction` renders a premium "See All"
//     glass pill button on the right side of the header.
//   - The header is now a flex row so the label + action sit on the
//     same baseline.

import { Show, For, type JSX } from "solid-js";

interface DiscoverSectionProps {
  label: string;
  icon: string;
  loading?: boolean;
  children: JSX.Element;
  /** Optional action button label (e.g. "See All"). When provided with onAction, renders a premium glass pill button. */
  actionLabel?: string;
  /** Optional action handler. When provided with actionLabel, renders a premium glass pill button. */
  onAction?: () => void;
}

export function DiscoverSection(props: DiscoverSectionProps) {
  return (
    <section class="discover-fold" aria-label={props.label}>
      <div class="discover-fold-header">
        <div class="discover-fold-label">
          <span class="material-symbols-outlined" aria-hidden="true">{props.icon}</span>
          {props.label}
        </div>
        <Show when={props.actionLabel && props.onAction}>
          <button
            type="button"
            class="discover-fold-action focus-ring"
            onClick={() => props.onAction?.()}
            aria-label={props.actionLabel}
          >
            <span>{props.actionLabel}</span>
            <span class="material-symbols-outlined" aria-hidden="true">chevron_right</span>
          </button>
        </Show>
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
