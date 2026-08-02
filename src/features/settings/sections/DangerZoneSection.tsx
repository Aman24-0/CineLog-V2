// src/features/settings/sections/DangerZoneSection.tsx
//
// Danger Zone section — reset library (DangerZoneCard) + delete /
// deactivate account buttons.
//
// Pure JSX extractor: receives the `SettingsState` bag for the
// `isSignedIn()` accessor + `handleDeactivate` / `handleDelete`
// handlers + accordion UI helpers.
//
// What lives here:
//   • The outer `<Show>` visibility filter.
//   • The accordion header (styled red to indicate danger).
//   • The inner panel:
//       - Sign-in gate (Show fallback if not signed in)
//       - DangerZoneCard (reset library)
//       - Deactivate account button
//       - Permanently delete account button
//
// The DeactivateAccountSheet itself is NOT rendered here — it's
// rendered at the SettingsPage root. This section only controls its
// `open` state via `s.handleDeactivate` / `s.handleDelete`.

import { Show } from "solid-js";
import type { SettingsState } from "./types";
import DangerZoneCard from "~/features/sync/components/DangerZoneCard";

export function DangerZoneSection(props: { state: SettingsState }) {
  // eslint-disable-next-line solid/reactivity -- props.state is a stable object reference (bag of accessors), not a reactive value; destructuring it once at the top is safe.
  const s = props.state;

  return (
    <Show when={s.filteredSections().some((sec) => sec.id === "danger")}>
      <section
        id="section-danger"
        class="settings-accordion-section settings-accordion-section-danger"
      >
        <button
          type="button"
          class="settings-accordion-header focus-ring"
          onClick={() => s.toggleSection("danger")}
          aria-expanded={s.isExpanded("danger")}
          aria-controls="panel-danger"
        >
          <span
            class="material-symbols-outlined settings-accordion-icon"
            aria-hidden="true"
            style={{ color: "#f87171" }}
          >
            warning
          </span>
          <div class="settings-accordion-meta">
            <span
              class="settings-accordion-title"
              style={{ color: "#f87171" }}
            >
              {s.highlightText("Danger Zone")}
            </span>
            <span class="settings-accordion-desc">
              {s.highlightText("Reset library, delete account")}
            </span>
          </div>
          <span
            class="material-symbols-outlined settings-accordion-chevron"
            aria-hidden="true"
            style={{
              transform: s.isExpanded("danger")
                ? "rotate(180deg)"
                : "none",
              transition: "transform 200ms ease"
            }}
          >
            expand_more
          </span>
        </button>

        <Show when={s.isExpanded("danger")}>
          <div
            id="panel-danger"
            class="settings-accordion-panel"
          >
            <Show
              when={s.isSignedIn()}
              fallback={
                <div class="settings-empty-section" role="status">
                  <p>Sign in to manage danger zone actions.</p>
                </div>
              }
            >
              {/* Reset library — uses existing DangerZoneCard */}
              <DangerZoneCard />

              {/* Delete / Deactivate account */}
              <div class="setting-subsection danger-subsection">
                <p class="setting-subsection-label">
                  Account deletion
                </p>
                <div class="setting-group">
                  <button
                    type="button"
                    class="setting-row focus-ring setting-row-danger"
                    onClick={s.handleDeactivate}
                    aria-label="Deactivate account"
                  >
                    <div
                      class="setting-row-icon"
                      aria-hidden="true"
                    >
                      <span
                        class="material-symbols-outlined"
                        style={{ "font-size": "18px" }}
                        aria-hidden="true"
                      >
                        block
                      </span>
                    </div>
                    <div class="setting-row-text">
                      <span class="setting-row-label">
                        Deactivate account
                      </span>
                      <span class="setting-row-desc">
                        Temporarily disable. Recovers in 7 days.
                      </span>
                    </div>
                    <span
                      class="material-symbols-outlined setting-row-chevron"
                      aria-hidden="true"
                    >
                      chevron_right
                    </span>
                  </button>
                  <button
                    type="button"
                    class="setting-row focus-ring setting-row-danger"
                    onClick={s.handleDelete}
                    aria-label="Permanently delete account"
                  >
                    <div
                      class="setting-row-icon"
                      aria-hidden="true"
                    >
                      <span
                        class="material-symbols-outlined"
                        style={{ "font-size": "18px" }}
                        aria-hidden="true"
                      >
                        delete_forever
                      </span>
                    </div>
                    <div class="setting-row-text">
                      <span class="setting-row-label">
                        Permanently delete account
                      </span>
                      <span class="setting-row-desc">
                        Irreversible. Removes all your data.
                      </span>
                    </div>
                    <span
                      class="material-symbols-outlined setting-row-chevron"
                      aria-hidden="true"
                    >
                      chevron_right
                    </span>
                  </button>
                </div>
              </div>
            </Show>
          </div>
        </Show>
      </section>
    </Show>
  );
}
