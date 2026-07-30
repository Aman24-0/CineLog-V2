// src/features/sync/components/ImportHub.tsx
//
// ImportHub — the import section of the Sync page.
//
// Renders a card per registered ImportSource (CineLog V1 today; future
// providers render as "Coming soon"). Tapping an available source opens
// its wizard in a bottom-sheet modal.
//
// ARCHITECTURE:
//   This component reads IMPORT_SOURCES + FUTURE_SOURCES from the
//   registry. To add a new provider, register it in ImportSource.ts —
//   this component picks it up automatically with no code changes here.

import { For, Show, createSignal, type Component } from "solid-js";
import { Portal } from "solid-js/web";
import {
  IMPORT_SOURCES,
  FUTURE_SOURCES,
  type ImportSource,
  type ImportResult
} from "../import/ImportSource";
import { useToast } from "~/shared/hooks/useToast";

const ImportHub: Component = () => {
  const { showToast } = useToast();
  const [activeSource, setActiveSource] = createSignal<ImportSource | null>(
    null
  );

  const handleOpen = (source: ImportSource) => {
    setActiveSource(source);
  };

  const handleClose = () => {
    setActiveSource(null);
  };

  const handleComplete = (result: ImportResult) => {
    setActiveSource(null);
    showToast(`Import complete — ${result.summary}`, "success", 4000);
  };

  return (
    <div class="sync-import-hub">
      {/* Available sources */}
      <For each={IMPORT_SOURCES}>
        {(source) => (
          <button
            type="button"
            class="sync-import-card focus-ring"
            onClick={() => handleOpen(source)}
            aria-label={`Import from ${source.displayName}`}
          >
            <div
              class="sync-import-card-icon"
              style={{ background: source.accentColor }}
              aria-hidden="true"
            >
              <span
                class="material-symbols-outlined"
                style={{ "font-size": "24px", color: "var(--tier-1)" }}
                aria-hidden="true"
              >
                {source.icon}
              </span>
            </div>
            <div class="sync-import-card-text">
              <p class="sync-import-card-title">{source.displayName}</p>
              <p class="sync-import-card-desc">{source.description}</p>
            </div>
            <span
              class="material-symbols-outlined sync-import-card-chevron"
              aria-hidden="true"
            >
              arrow_forward
            </span>
          </button>
        )}
      </For>

      {/* Future sources — "coming soon" */}
      <For each={FUTURE_SOURCES}>
        {(source) => (
          <div
            class="sync-import-card sync-import-card-future"
            aria-disabled="true"
          >
            <div
              class="sync-import-card-icon sync-import-card-icon-future"
              aria-hidden="true"
            >
              <span
                class="material-symbols-outlined"
                style={{ "font-size": "24px", color: "var(--text-dim)" }}
                aria-hidden="true"
              >
                {source.icon}
              </span>
            </div>
            <div class="sync-import-card-text">
              <p class="sync-import-card-title">{source.displayName}</p>
              <p class="sync-import-card-desc">{source.description}</p>
            </div>
            <span class="sync-import-card-badge">Coming soon</span>
          </div>
        )}
      </For>

      {/* Wizard modal */}
      <Show when={activeSource()}>
        {(source) => (
          <Portal>
            <div
              class="modal-backdrop fixed inset-0 z-[999999] flex items-end justify-center p-0 sm:items-center sm:p-4"
              style={{
                background: "rgba(0,0,0,0.85)",
                "backdrop-filter": "blur(8px)",
                "-webkit-backdrop-filter": "blur(8px)"
              }}
              onClick={handleClose}
              role="dialog"
              aria-modal="true"
              aria-label={`Import from ${source().displayName}`}
            >
              <div
                class="modal-sheet-enter modal-surface sync-wizard-panel"
                onClick={(e) => e.stopPropagation()}
              >
                <div class="sheet-handle sm:hidden" aria-hidden="true" />
                <button
                  type="button"
                  onClick={handleClose}
                  class="sync-wizard-close focus-ring"
                  aria-label="Close import wizard"
                >
                  <span
                    class="material-symbols-outlined"
                    style={{ "font-size": "16px" }}
                    aria-hidden="true"
                  >
                    close
                  </span>
                </button>
                {/* Render the source's wizard component */}
                {(() => {
                  const Wizard = source().Wizard;
                  return (
                    <Wizard
                      onComplete={handleComplete}
                      onCancel={handleClose}
                    />
                  );
                })()}
              </div>
            </div>
          </Portal>
        )}
      </Show>
    </div>
  );
};

export default ImportHub;
