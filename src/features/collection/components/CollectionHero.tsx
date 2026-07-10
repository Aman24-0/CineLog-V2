// src/features/collection/components/CollectionHero.tsx
import { Show, type Accessor } from "solid-js";

/**
 * CollectionHero — cinematic hero for the CollectionModal.
 *
 * Renders the backdrop, close button, eyebrow, franchise name, and
 * the progress ring (owned / total).
 */
export interface CollectionHeroProps {
  backdropUrl: Accessor<string>;
  franchiseName: Accessor<string | undefined>;
  stats: Accessor<{
    owned: number;
    completed: number;
    watching: number;
    total: number;
    pct: number;
    avgRating: string | null;
  } | null>;
  onClose: () => void;
}

export default function CollectionHero(props: CollectionHeroProps) {
  return (
    <div class="collection-hero">
      <Show when={props.backdropUrl()}>
        <img
          onError={(e) => { e.currentTarget.style.display = "none"; }}
          src={props.backdropUrl()}
          class="collection-hero-backdrop"
          loading="eager"
          decoding="async"
          {...({ fetchpriority: "high" } as Record<string, string>)}
          alt=""
          aria-hidden="true"
        />
      </Show>
      <div class="collection-hero-overlay" aria-hidden="true" />
      <button
        onClick={props.onClose}
        class="cinematic-close-btn"
        aria-label="Close collection"
      >
        <span
          class="material-symbols-outlined"
          style={{ "font-size": "18px" }}
          aria-hidden="true"
        >
          close
        </span>
      </button>
      <div class="collection-hero-content">
        <p class="collection-hero-eyebrow">Collection</p>
        <h2 class="collection-hero-title">{props.franchiseName()}</h2>
        <Show when={props.stats()}>
          <div class="collection-hero-progress">
            <div
              class="collection-progress-ring"
              style={{ "--progress": `${props.stats()!.pct}%` }}
            >
              <span class="collection-progress-pct">{props.stats()!.pct}%</span>
            </div>
            <div class="collection-progress-text">
              <span class="collection-progress-owned">
                {props.stats()!.owned} of {props.stats()!.total}
              </span>
              <span class="collection-progress-label">titles in your vault</span>
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
}
