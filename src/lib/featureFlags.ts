// src/lib/featureFlags.ts
//
// CineLog V2 — Client-Side Feature Flag Hook
// ---------------------------------------------------------------------
// Reactive feature flag state, shared across the consumer app.
//
// PUBLIC API:
//   { flags, isEnabled, refresh, ready }
//
// USAGE:
//   ```tsx
//   import { useFeatureFlags } from "~/lib/featureFlags";
//   const ff = useFeatureFlags();
//   <Show when={ff.isEnabled("imdb_integration")}>
//     <ImdbRating />
//   </Show>
//   ```
//
// FLAGS ARE FETCHED ONCE on app load and cached in module-level signals.
// Components that read flags will reactively re-render if the flags
// change (e.g., after an admin toggles a flag and the user refreshes).
//
// SSR SAFETY:
//   During SSR, all flags return their default values (true for the
//   "default-on" flags). The actual fetched values are only applied
//   after hydration on the client.

import { createSignal } from "solid-js";
import { isServer } from "solid-js/web";

// ─── Default flag values ──────────────────────────────────────────
//
// These match the defaults seeded in the Phase 1 migration.
// If the API call fails, these values are used as a fallback.

export const DEFAULT_FEATURE_FLAGS: Record<string, boolean> = {
  imdb_integration: true,
  streaming_button: true,
  upcoming: true,
  random_picker: true,
  ai_recommendations: false,
  experimental_features: false
};

// ─── Module-level signals ─────────────────────────────────────────

const [flags, setFlags] = createSignal<Record<string, boolean>>({
  ...DEFAULT_FEATURE_FLAGS
});
const [ready, setReady] = createSignal<boolean>(false);

// ─── Auto-fetch on client load ────────────────────────────────────

if (!isServer) {
  // Fetch on module load (browser only)
  void fetch("/api/feature-flags", {
    credentials: "omit",
    headers: { "Content-Type": "application/json" }
  })
    .then((r) => r.json().catch(() => ({ flags: DEFAULT_FEATURE_FLAGS })))
    .then((body: { flags?: Record<string, boolean> }) => {
      if (body?.flags) {
        setFlags({ ...DEFAULT_FEATURE_FLAGS, ...body.flags });
      }
    })
    .catch(() => {
      // Silently fall back to defaults — the app should still work
    })
    .finally(() => setReady(true));
}

// ─── Public hook ──────────────────────────────────────────────────

export interface FeatureFlagsHook {
  /** All feature flags as a reactive record. */
  flags: () => Record<string, boolean>;
  /** True once the initial fetch has completed. */
  ready: () => boolean;
  /** Check if a specific flag is enabled. Returns false for unknown flags. */
  isEnabled: (name: string) => boolean;
  /** Force a re-fetch of the flags (e.g., after an admin change). */
  refresh: () => Promise<void>;
}

export function useFeatureFlags(): FeatureFlagsHook {
  return {
    flags,
    ready,
    isEnabled: (name: string) => flags()[name] === true,
    refresh: async () => {
      try {
        const resp = await fetch("/api/feature-flags?_=" + Date.now(), {
          credentials: "omit",
          headers: { "Content-Type": "application/json" }
        });
        const body = (await resp.json().catch(() => ({}))) as {
          flags?: Record<string, boolean>;
        };
        if (body?.flags) {
          setFlags({ ...DEFAULT_FEATURE_FLAGS, ...body.flags });
        }
      } catch {
        // ignore
      }
    }
  };
}
