// src/features/landing/components/ImportFlow.tsx
/**
 * ImportFlow — visual import/sync flow diagram for the landing page.
 *
 * Renders a flow diagram showing:
 *   Source icons (Letterboxd, Trakt, IMDb, TV Time, CSV)
 *     → Arrow down → CineLog logo → Arrow down → "Your Vault" with checkmark
 *
 * Horizontal on desktop, vertical on mobile. Purely visual — no
 * actual import functionality.
 */

import { Component, For } from "solid-js";
import { GlassCard } from "~/shared/ui/glass";
import Icon from "~/shared/ui/Icon";

// ─── Source definitions ────────────────────────────────────────

const SOURCES = [
  { name: "Letterboxd", icon: "local_movies" },
  { name: "Trakt", icon: "tv" },
  { name: "IMDb", icon: "movie" },
  { name: "TV Time", icon: "schedule" },
  { name: "CSV", icon: "table" }
] as const;

// ─── Component ─────────────────────────────────────────────────

const ImportFlow: Component = () => {
  return (
    <div class="landing-import">
      {/* Source row */}
      <div class="landing-import__sources">
        <For each={SOURCES}>
          {(source) => (
            <GlassCard
              variant="glass"
              size="compact"
              hoverable
              class="landing-import__source"
            >
              <Icon
                name={source.icon}
                fill
                class="landing-import__source-icon"
              />
              <span class="landing-import__source-name">
                {source.name}
              </span>
            </GlassCard>
          )}
        </For>
      </div>

      {/* Arrow down */}
      <div class="landing-import__arrow" aria-hidden="true">
        <Icon name="arrow_downward" class="landing-import__arrow-icon" />
      </div>

      {/* CineLog hub */}
      <GlassCard
        variant="accent"
        size="default"
        class="landing-import__hub"
      >
        <Icon
          name="movie"
          fill
          class="landing-import__hub-icon"
        />
        <span class="landing-import__hub-name">CineLog</span>
      </GlassCard>

      {/* Arrow down */}
      <div class="landing-import__arrow" aria-hidden="true">
        <Icon name="arrow_downward" class="landing-import__arrow-icon" />
      </div>

      {/* Your Vault */}
      <GlassCard
        variant="glass-strong"
        size="default"
        class="landing-import__vault"
      >
        <Icon
          name="check_circle"
          fill
          class="landing-import__vault-check"
        />
        <span class="landing-import__vault-label">Your Vault</span>
      </GlassCard>
    </div>
  );
};

export default ImportFlow;
