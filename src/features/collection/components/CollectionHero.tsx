// src/features/collection/components/CollectionHero.tsx
import { Show, type Accessor } from "solid-js";

/**
 * CollectionHero — cinematic hero for the CollectionModal.
 *
 * Renders the backdrop, close button, eyebrow, franchise name, and
 * the progress ring (owned / total).
 *
 * Phase 6.2 Task 2b — added an "Add all to vault" bulk action button
 * that appears when there are titles in the franchise the user doesn't
 * yet have in their watchlist. The button is hidden when the user's
 * vault already contains every title (missingCount === 0).
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
  /** Number of titles in the franchise NOT yet in the user's vault.
   *  When > 0, the "Add all to vault" button is shown. */
  missingCount?: Accessor<number>;
  /** True while the bulk-add operation is in-flight. Disables the button
   *  and shows a spinner. */
  isAddingAll?: Accessor<boolean>;
  /** Called when the user clicks "Add all to vault". The parent handles
   *  the actual bulk-create logic (iterate titles, call createVaultItem). */
  onAddAll?: () => void;
  onClose: () => void;
}

export default function CollectionHero(props: CollectionHeroProps) {
  const missingCount = () => props.missingCount?.() ?? 0;
  const isAddingAll = () => props.isAddingAll?.() ?? false;

  return (
    <div class="collection-hero">
      <Show when={props.backdropUrl()}>
        <img
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
          src={props.backdropUrl()}
          class="collection-hero-backdrop"
          loading="eager"
          decoding="async"
          {...({ fetchpriority: "high" } as Record<string, string>)}
          alt={props.franchiseName() ? `${props.franchiseName()} collection backdrop` : "Collection backdrop"}
        />
      </Show>
      <div class="collection-hero-overlay" aria-hidden="true" />
      <button
        onClick={() => props.onClose()}
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
              <span class="collection-progress-label">
                titles in your watchlist
              </span>
            </div>
          </div>
        </Show>

        {/* Phase 6.2 Task 2b — "Add all to vault" bulk action.
            Renders only when there are titles in the franchise NOT yet
            in the user's vault. Hidden when the user already owns every
            title (or while data is still loading). */}
        <Show when={missingCount() > 0 && props.onAddAll}>
          <button
            type="button"
            class="collection-add-all-btn focus-ring"
            onClick={() => props.onAddAll?.()}
            disabled={isAddingAll()}
            aria-label={
              isAddingAll()
                ? `Adding ${missingCount()} titles to your vault`
                : `Add all ${missingCount()} missing titles to your vault`
            }
            style={{
              display: "inline-flex",
              "align-items": "center",
              gap: "6px",
              "margin-top": "var(--sp-3)",
              padding: "8px 14px",
              "border-radius": "9999px",
              border: "1px solid var(--hairline)",
              background: "var(--p)",
              color: "var(--active-text)",
              "font-size": "0.75rem",
              "font-weight": 700,
              cursor: isAddingAll() ? "wait" : "pointer",
              opacity: isAddingAll() ? "0.7" : "1",
              transition: "transform 150ms ease-out, opacity 150ms ease-out"
            }}
          >
            <span
              class="material-symbols-outlined"
              aria-hidden="true"
              style={{
                "font-size": "16px",
                animation: isAddingAll()
                  ? "cinelog-spin 0.9s linear infinite"
                  : "none"
              }}
            >
              {isAddingAll() ? "progress_activity" : "playlist_add"}
            </span>
            <span>
              {isAddingAll()
                ? `Adding ${missingCount()} titles...`
                : `Add all to vault (${missingCount()})`}
            </span>
          </button>
        </Show>
      </div>
    </div>
  );
}
