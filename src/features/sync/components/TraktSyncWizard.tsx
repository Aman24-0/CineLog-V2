// src/features/sync/components/TraktSyncWizard.tsx
//
// TraktSyncWizard — a GlassModal-based 3-step sync flow.
//
//   Step 1 — Loading / Preview:
//     • On modal open, fetches /api/sync/trakt/preview
//     • GlassSkeleton while loading
//     • On success: shows summary ("Found X new movies, Y new shows, Z conflicts")
//       + sample titles (up to 10 each)
//     • On 409 (not connected): shows GlassEmptyState with "Connect Trakt" CTA
//     • On 401 (not auth): shows error
//     • On 502 (Trakt API fail): shows retry option
//
//   Step 2 — Confirm & Execute:
//     • "Confirm Sync" GlassButton — POSTs to /api/sync/trakt/execute
//     • "Cancel" button — closes the wizard
//     • Disabled if 0 new items AND 0 conflicts
//
//   Step 3 — Progress / Success:
//     • Spinner during execute
//     • On success: green "Sync Complete! X items imported, Y updated."
//     • "Close" button — calls props.onClose + refreshes library
//
// CRITICAL:
//   • No tokens are read or sent by this component — all Trakt API
//     access is proxied through the server routes.
//   • The wizard is purely presentational + stateful UI; it does
//     not need to know anything about the user's Trakt credentials.
//
// Mobile-first:
//   • GlassModal size="md" (max-w-md = 28rem = 448px) — fits mobile
//   • Stat grid wraps on narrow widths
//   • Sample lists are scrollable

import {
  Show,
  For,
  createSignal,
  createEffect,
  type Component
} from "solid-js";
import {
  GlassModal,
  GlassButton,
  GlassSkeleton,
  GlassEmptyState,
  GlassBadge
} from "~/shared/ui/glass";
import { useUserLibrary } from "~/shared/hooks/useUserLibrary";
import { useToast } from "~/shared/hooks/useToast";

// ─── Types (mirror server response shapes) ───────────────────────

interface TraktSampleItem {
  tmdb_id: number;
  title: string;
  year: number | null;
  watched_at: string;
  rating: number | null;
}

interface TraktPreviewSummary {
  newMovies: number;
  newShows: number;
  conflicts: number;
  alreadyInVault: number;
  totalTraktItems: number;
  totalVaultItems: number;
}

interface TraktPreviewResponse {
  connected: true;
  trakt_username: string;
  trakt_email: string | null;
  summary: TraktPreviewSummary;
  sample: {
    newMovies: TraktSampleItem[];
    newShows: TraktSampleItem[];
  };
  fetched_at: string;
}

interface TraktExecuteResponse {
  ok: true;
  imported: number;
  updated: number;
  skipped: number;
  totalProcessed: number;
  duration_ms: number;
  trakt_username: string;
}

// ─── Wizard step state machine ───────────────────────────────────

type WizardStep =
  | "loading" // fetching preview
  | "preview" // showing summary, awaiting confirm
  | "executing" // POST /execute in flight
  | "success" // execute returned ok
  | "error"; // any failure along the way

interface ErrorState {
  /** User-facing message. */
  message: string;
  /** Machine-readable kind — drives retry button visibility. */
  kind: "not-connected" | "auth" | "trakt-down" | "unknown";
}

// ─── Props ───────────────────────────────────────────────────────

export interface TraktSyncWizardProps {
  /** Controls modal visibility. */
  open: boolean;
  /** Called when the user closes the wizard (Close button, backdrop, ESC). */
  onClose: () => void;
  /**
   * Called after a successful sync, before the wizard closes.
   * The parent can use this to refresh the "Last Synced" timestamp
   * or update the connection state.
   */
  onSuccess?: (result: TraktExecuteResponse) => void;
  /**
   * Called when the wizard detects that the Trakt connection has
   * been revoked (preview returns 409). The parent should switch
   * the integration card back to the "unconnected" state.
   */
  onConnectionLost?: () => void;
}

// ─── Component ───────────────────────────────────────────────────

const TraktSyncWizard: Component<TraktSyncWizardProps> = (props) => {
  const library = useUserLibrary();
  const { showToast } = useToast();

  const [step, setStep] = createSignal<WizardStep>("loading");
  const [preview, setPreview] = createSignal<TraktPreviewResponse | null>(
    null
  );
  const [executeResult, setExecuteResult] =
    createSignal<TraktExecuteResponse | null>(null);
  const [error, setError] = createSignal<ErrorState | null>(null);

  // ─── Fetch the preview ────────────────────────────────────────
  const fetchPreview = async () => {
    setStep("loading");
    setError(null);
    setPreview(null);

    try {
      const res = await fetch("/api/sync/trakt/preview", {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" }
      });

      if (res.status === 409) {
        // Not connected — surface a friendly CTA
        setError({
          message:
            "Trakt isn't connected to your CineLog account. Connect it first to enable sync.",
          kind: "not-connected"
        });
        setStep("error");
        props.onConnectionLost?.();
        return;
      }

      if (res.status === 401) {
        setError({
          message: "Your session has expired. Please sign in again.",
          kind: "auth"
        });
        setStep("error");
        return;
      }

      if (res.status === 502) {
        setError({
          message:
            "Trakt's API is unavailable right now. Please try again in a moment.",
          kind: "trakt-down"
        });
        setStep("error");
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError({
          message:
            (body as { error?: string })?.error ??
            "Could not load your Trakt preview. Please try again.",
          kind: "unknown"
        });
        setStep("error");
        return;
      }

      const data = (await res.json()) as TraktPreviewResponse;
      setPreview(data);
      setStep("preview");
    } catch (err) {
      console.error("[trakt-wizard] preview fetch failed:", err);
      setError({
        message:
          "Network error while contacting CineLog. Check your connection and retry.",
        kind: "unknown"
      });
      setStep("error");
    }
  };

  // ─── Execute the sync ─────────────────────────────────────────
  const handleConfirmSync = async () => {
    setStep("executing");
    setError(null);

    try {
      const res = await fetch("/api/sync/trakt/execute", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        // Default options — skip conflicts false, overwrite rating false.
        // The user gets a non-destructive import: new items are added,
        // existing items are updated only on status/watched_on (rating
        // preserved unless they explicitly opt in elsewhere).
        body: JSON.stringify({
          skipConflicts: false,
          overwriteRating: false
        })
      });

      if (res.status === 409) {
        setError({
          message:
            "Trakt connection was revoked since the preview. Reconnect to continue.",
          kind: "not-connected"
        });
        setStep("error");
        props.onConnectionLost?.();
        return;
      }

      if (res.status === 401) {
        setError({
          message: "Your session has expired. Please sign in again.",
          kind: "auth"
        });
        setStep("error");
        return;
      }

      if (res.status === 502) {
        setError({
          message:
            "Trakt's API is unavailable right now. Your existing library is untouched.",
          kind: "trakt-down"
        });
        setStep("error");
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError({
          message:
            (body as { error?: string })?.error ??
            "Sync failed. Your existing library is untouched.",
          kind: "unknown"
        });
        setStep("error");
        return;
      }

      const data = (await res.json()) as TraktExecuteResponse;
      setExecuteResult(data);
      setStep("success");
      // Refresh the in-memory vault so new items appear immediately.
      void library.refresh();
      props.onSuccess?.(data);

      showToast(
        `Synced ${data.imported + data.updated} of ${data.totalProcessed} Trakt items`,
        "success",
        4000
      );
    } catch (err) {
      console.error("[trakt-wizard] execute failed:", err);
      setError({
        message:
          "Network error during sync. Your existing library is untouched.",
        kind: "unknown"
      });
      setStep("error");
    }
  };

  // ─── Reset state when the modal closes ────────────────────────
  // We defer the state reset so the close animation isn't disturbed,
  // and so the user can briefly see the success state before the
  // modal disappears.
  const handleClose = () => {
    props.onClose();
    setTimeout(() => {
      setStep("loading");
      setPreview(null);
      setExecuteResult(null);
      setError(null);
    }, 250);
  };

  // ─── Fetch preview when the modal opens ───────────────────────
  // createEffect tracks `props.open` reactively. On the false→true
  // edge (modal opening), we kick off the preview fetch.
  //
  // We deliberately DO NOT read `props.open` outside createEffect
  // for the `lastOpen` initializer — that would be an untracked
  // reactive read (eslint solid/reactivity). Initialize to false so
  // the first effect run on mount (if `open` starts true) treats it
  // as an open transition and kicks off the preview.
  let lastOpen = false;
  createEffect(() => {
    const isOpen = props.open;
    if (isOpen && !lastOpen) {
      void fetchPreview();
    }
    lastOpen = isOpen;
  });

  return (
    <GlassModal
      open={props.open}
      onClose={handleClose}
      title="Trakt Sync"
      icon="sync"
      size="md"
      showCloseButton={step() !== "executing"}
      disableBackdropClose={step() === "executing" || step() === "loading"}
    >
      {/* ── STEP 1: Loading ─────────────────────────────────────── */}
      <Show when={step() === "loading"}>
        <div class="trakt-wizard-body">
          <p class="trakt-wizard-intro">
            Comparing your Trakt history with your CineLog vault…
          </p>
          <div class="trakt-wizard-skeleton">
            <GlassSkeleton variant="text" lines={2} />
            <div class="trakt-wizard-skeleton-grid">
              <GlassSkeleton variant="block" height="64px" />
              <GlassSkeleton variant="block" height="64px" />
              <GlassSkeleton variant="block" height="64px" />
            </div>
            <GlassSkeleton variant="text" lines={3} />
          </div>
        </div>
      </Show>

      {/* ── STEP 2: Preview / Confirm ───────────────────────────── */}
      <Show when={step() === "preview" && preview()}>
        <div class="trakt-wizard-body">
          <p class="trakt-wizard-intro">
            Here's what will be synced from{" "}
            <strong>@{preview()!.trakt_username}</strong>'s Trakt history.
          </p>

          {/* Summary stat grid */}
          <div class="trakt-wizard-stat-grid">
            <div class="trakt-wizard-stat" data-tone="primary">
              <span
                class="material-symbols-outlined trakt-wizard-stat-icon"
                aria-hidden="true"
              >
                movie
              </span>
              <div class="trakt-wizard-stat-text">
                <span class="trakt-wizard-stat-value">
                  {preview()!.summary.newMovies}
                </span>
                <span class="trakt-wizard-stat-label">New Movies</span>
              </div>
            </div>

            <div class="trakt-wizard-stat" data-tone="primary">
              <span
                class="material-symbols-outlined trakt-wizard-stat-icon"
                aria-hidden="true"
              >
                tv
              </span>
              <div class="trakt-wizard-stat-text">
                <span class="trakt-wizard-stat-value">
                  {preview()!.summary.newShows}
                </span>
                <span class="trakt-wizard-stat-label">New TV Shows</span>
              </div>
            </div>

            <div class="trakt-wizard-stat" data-tone="warning">
              <span
                class="material-symbols-outlined trakt-wizard-stat-icon"
                aria-hidden="true"
              >
                swap_horiz
              </span>
              <div class="trakt-wizard-stat-text">
                <span class="trakt-wizard-stat-value">
                  {preview()!.summary.conflicts}
                </span>
                <span class="trakt-wizard-stat-label">Conflicts</span>
              </div>
            </div>

            <div class="trakt-wizard-stat" data-tone="muted">
              <span
                class="material-symbols-outlined trakt-wizard-stat-icon"
                aria-hidden="true"
              >
                check_circle
              </span>
              <div class="trakt-wizard-stat-text">
                <span class="trakt-wizard-stat-value">
                  {preview()!.summary.alreadyInVault}
                </span>
                <span class="trakt-wizard-stat-label">Already in Vault</span>
              </div>
            </div>
          </div>

          {/* Conflict explainer — only when there are conflicts */}
          <Show when={preview()!.summary.conflicts > 0}>
            <div class="trakt-wizard-conflict-note" role="note">
              <span
                class="material-symbols-outlined"
                aria-hidden="true"
                style={{
                  "font-size": "16px",
                  color: "var(--warning, #fbbf24)"
                }}
              >
                info
              </span>
              <span>
                Conflicts are items already in your vault with a different
                rating or status. Syncing will update their status to
                "Completed" and set the watched date — but will{" "}
                <strong>not</strong> overwrite your existing rating.
              </span>
            </div>
          </Show>

          {/* Sample new movies */}
          <Show when={preview()!.sample.newMovies.length > 0}>
            <div class="trakt-wizard-sample">
              <p class="trakt-wizard-sample-title">Sample new movies</p>
              <ul class="trakt-wizard-sample-list">
                <For each={preview()!.sample.newMovies.slice(0, 5)}>
                  {(item) => (
                    <li class="trakt-wizard-sample-item">
                      <span class="trakt-wizard-sample-item-title">
                        {item.title}
                        <Show when={item.year}>
                          <span class="trakt-wizard-sample-item-year">
                            {" "}
                            ({item.year})
                          </span>
                        </Show>
                      </span>
                      <Show when={item.rating != null}>
                        <GlassBadge
                          intent="primary"
                          size="compact"
                          label={`★ ${item.rating}`}
                          icon="star"
                        />
                      </Show>
                    </li>
                  )}
                </For>
                <Show when={preview()!.sample.newMovies.length > 5}>
                  <li class="trakt-wizard-sample-more">
                    + {preview()!.sample.newMovies.length - 5} more
                  </li>
                </Show>
              </ul>
            </div>
          </Show>

          {/* Sample new shows */}
          <Show when={preview()!.sample.newShows.length > 0}>
            <div class="trakt-wizard-sample">
              <p class="trakt-wizard-sample-title">Sample new shows</p>
              <ul class="trakt-wizard-sample-list">
                <For each={preview()!.sample.newShows.slice(0, 5)}>
                  {(item) => (
                    <li class="trakt-wizard-sample-item">
                      <span class="trakt-wizard-sample-item-title">
                        {item.title}
                        <Show when={item.year}>
                          <span class="trakt-wizard-sample-item-year">
                            {" "}
                            ({item.year})
                          </span>
                        </Show>
                      </span>
                      <Show when={item.rating != null}>
                        <GlassBadge
                          intent="primary"
                          size="compact"
                          label={`★ ${item.rating}`}
                          icon="star"
                        />
                      </Show>
                    </li>
                  )}
                </For>
                <Show when={preview()!.sample.newShows.length > 5}>
                  <li class="trakt-wizard-sample-more">
                    + {preview()!.sample.newShows.length - 5} more
                  </li>
                </Show>
              </ul>
            </div>
          </Show>

          {/* Empty case — nothing to import */}
          <Show
            when={
              preview()!.summary.newMovies === 0 &&
              preview()!.summary.newShows === 0 &&
              preview()!.summary.conflicts === 0
            }
          >
            <div class="trakt-wizard-nothing">
              <span
                class="material-symbols-outlined"
                aria-hidden="true"
                style={{ "font-size": "32px", color: "var(--p)" }}
              >
                check_circle
              </span>
              <p>
                Your CineLog vault is already up-to-date with your Trakt
                history. Nothing to import.
              </p>
            </div>
          </Show>

          {/* Action row */}
          <div class="trakt-wizard-actions">
            <GlassButton variant="ghost" onClick={handleClose}>
              Cancel
            </GlassButton>
            <Show
              when={
                preview()!.summary.newMovies > 0 ||
                preview()!.summary.newShows > 0 ||
                preview()!.summary.conflicts > 0
              }
            >
              <GlassButton
                variant="primary"
                icon="sync"
                onClick={handleConfirmSync}
              >
                Confirm Sync
              </GlassButton>
            </Show>
          </div>
        </div>
      </Show>

      {/* ── STEP 3a: Executing ──────────────────────────────────── */}
      <Show when={step() === "executing"}>
        <div class="trakt-wizard-body trakt-wizard-executing">
          <div class="trakt-wizard-spinner" aria-hidden="true">
            <span
              class="material-symbols-outlined"
              style={{
                "font-size": "40px",
                color: "var(--p)",
                animation: "spin 1.2s linear infinite"
              }}
              aria-hidden="true"
            >
              progress_activity
            </span>
          </div>
          <h3 class="trakt-wizard-status-title">Syncing your library…</h3>
          <p class="trakt-wizard-status-body">
            Importing and updating items from your Trakt history. Don't close
            this window.
          </p>
        </div>
      </Show>

      {/* ── STEP 3b: Success ────────────────────────────────────── */}
      <Show when={step() === "success" && executeResult()}>
        <div class="trakt-wizard-body trakt-wizard-success">
          <div class="trakt-wizard-success-icon" aria-hidden="true">
            <span
              class="material-symbols-outlined"
              style={{
                "font-size": "44px",
                color: "var(--success, #10b981)"
              }}
              aria-hidden="true"
            >
              check_circle
            </span>
          </div>
          <h3 class="trakt-wizard-status-title">Sync Complete!</h3>
          <p class="trakt-wizard-status-body">
            {executeResult()!.imported} items imported
            <Show when={executeResult()!.updated > 0}>
              {", " + executeResult()!.updated + " updated"}
            </Show>
            <Show when={executeResult()!.skipped > 0}>
              {", " + executeResult()!.skipped + " skipped"}
            </Show>
            {" "}
            in {(executeResult()!.duration_ms / 1000).toFixed(1)}s.
          </p>

          {/* Result stat grid */}
          <div class="trakt-wizard-result-grid">
            <div class="trakt-wizard-stat" data-tone="primary">
              <span
                class="material-symbols-outlined trakt-wizard-stat-icon"
                aria-hidden="true"
              >
                download
              </span>
              <div class="trakt-wizard-stat-text">
                <span class="trakt-wizard-stat-value">
                  {executeResult()!.imported}
                </span>
                <span class="trakt-wizard-stat-label">Imported</span>
              </div>
            </div>
            <div class="trakt-wizard-stat" data-tone="primary">
              <span
                class="material-symbols-outlined trakt-wizard-stat-icon"
                aria-hidden="true"
              >
                update
              </span>
              <div class="trakt-wizard-stat-text">
                <span class="trakt-wizard-stat-value">
                  {executeResult()!.updated}
                </span>
                <span class="trakt-wizard-stat-label">Updated</span>
              </div>
            </div>
            <Show when={executeResult()!.skipped > 0}>
              <div class="trakt-wizard-stat" data-tone="muted">
                <span
                  class="material-symbols-outlined trakt-wizard-stat-icon"
                  aria-hidden="true"
                >
                  skip_next
                </span>
                <div class="trakt-wizard-stat-text">
                  <span class="trakt-wizard-stat-value">
                    {executeResult()!.skipped}
                  </span>
                  <span class="trakt-wizard-stat-label">Skipped</span>
                </div>
              </div>
            </Show>
          </div>

          <div class="trakt-wizard-actions">
            <GlassButton variant="primary" icon="check" onClick={handleClose}>
              Close
            </GlassButton>
          </div>
        </div>
      </Show>

      {/* ── STEP 4: Error ───────────────────────────────────────── */}
      <Show when={step() === "error" && error()}>
        <div class="trakt-wizard-body trakt-wizard-error">
          <Show
            when={error()!.kind === "not-connected"}
            fallback={
              <>
                <div class="trakt-wizard-error-icon" aria-hidden="true">
                  <span
                    class="material-symbols-outlined"
                    style={{
                      "font-size": "40px",
                      color: "var(--danger, #ef4444)"
                    }}
                    aria-hidden="true"
                  >
                    error
                  </span>
                </div>
                <h3 class="trakt-wizard-status-title">Sync Failed</h3>
                <p class="trakt-wizard-status-body">{error()!.message}</p>
                <div class="trakt-wizard-actions">
                  <GlassButton variant="ghost" onClick={handleClose}>
                    Close
                  </GlassButton>
                  <Show
                    when={
                      error()!.kind === "trakt-down" ||
                      error()!.kind === "unknown"
                    }
                  >
                    <GlassButton
                      variant="primary"
                      icon="refresh"
                      onClick={() => void fetchPreview()}
                    >
                      Retry
                    </GlassButton>
                  </Show>
                </div>
              </>
            }
          >
            <GlassEmptyState
              icon="link_off"
              title="Trakt not connected"
              message={error()!.message}
              variant="default"
              action={
                <GlassButton
                  variant="primary"
                  icon="link"
                  onClick={() => {
                    // Send the user to the OAuth init route — the
                    // server will redirect to Trakt's consent screen.
                    window.location.href = "/api/auth/trakt";
                  }}
                >
                  Connect Trakt
                </GlassButton>
              }
            />
            <div class="trakt-wizard-actions">
              <GlassButton variant="ghost" onClick={handleClose}>
                Close
              </GlassButton>
            </div>
          </Show>
        </div>
      </Show>
    </GlassModal>
  );
};

export default TraktSyncWizard;
