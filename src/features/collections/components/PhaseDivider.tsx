// src/features/collections/components/PhaseDivider.tsx
import { Show, type Component } from "solid-js";
import type { UniversePhase } from "~/shared/types";

/**
 * PhaseDivider — section header rendered BETWEEN entries of a
 * curated universe timeline.
 *
 * Data source: the `universe_phases` table (admin-managed). The user
 * has NO edit access — phases are configured in the admin panel and
 * fetched by `fetchPhasesForUniverse(universeId)`.
 *
 * Rendering model
 * ---------------
 * Each phase row has a `beforeEntryId` (the TMDB id of the entry it
 * appears BEFORE). The TimelineEngine walks the sorted entries; when
 * it encounters an entry whose `id` matches a phase's `beforeEntryId`,
 * it renders the PhaseDivider first, then the entry itself. A null
 * `beforeEntryId` means "render at the very top of the timeline".
 *
 * Visual design
 * -------------
 *   ┌──────────────────────────────────────┐
 *   │  PHASE 1                             │
 *   │  Avengers Assemble                   │
 *   └──────────────────────────────────────┘
 *
 * Uses the universe's accent color (passed via `accentColor`) so the
 * divider visually belongs to its universe.
 */
export interface PhaseDividerProps {
  phase: UniversePhase;
  accentColor?: string;
  /** 1-based position of this phase in the universe (for the
   *  numeric badge). Optional. */
  index?: number;
}

const PhaseDivider: Component<PhaseDividerProps> = (props) => {
  const accent = () => props.accentColor ?? "var(--p)";

  return (
    <div
      class="phase-divider"
      style={{
        "--phase-accent": accent(),
        "--phase-accent-glow": `${accent()}22`,
      }}
      role="separator"
      aria-label={props.phase.label}
    >
      <div class="phase-divider-marker" aria-hidden="true">
        <span class="phase-divider-index">
          {props.index ?? ""}
        </span>
      </div>
      <div class="phase-divider-content">
        <p class="phase-divider-label">{props.phase.label}</p>
        <Show when={props.phase.description}>
          <p class="phase-divider-description">{props.phase.description}</p>
        </Show>
      </div>
    </div>
  );
};

export default PhaseDivider;
