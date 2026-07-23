// DiscoverSection — CineLog section header with optional "See all" link.
// Renders a horizontal rail of poster cards with premium spacing.
import { Show, For, type JSX } from "solid-js";

interface DiscoverSectionProps {
  label: string;
  icon: string;
  loading?: boolean;
  children: JSX.Element;
  onSeeAll?: () => void;
}

export function DiscoverSection(props: DiscoverSectionProps) {
  return (
    <section class="dulo-section page-section" aria-label={props.label}>
      <div class="dulo-section-header">
        <h2 class="dulo-section-title">{props.label}</h2>
        <Show when={props.onSeeAll}>
          <button class="dulo-section-see-all" onClick={props.onSeeAll} type="button">
            See all
          </button>
        </Show>
      </div>
      <Show when={!props.loading} fallback={
        <div class="dulo-rail">
          <For each={Array.from({ length: 6 })}>{() =>
            <div class="dulo-rail-card" style={{ cursor: "default" }}>
              <div class="dulo-rail-poster skeleton-base" />
            </div>
          }</For>
        </div>
      }>
        {props.children}
      </Show>
    </section>
  );
}
