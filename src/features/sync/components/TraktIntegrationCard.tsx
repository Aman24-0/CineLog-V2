// src/features/sync/components/TraktIntegrationCard.tsx
//
// TraktIntegrationCard — Direct Integrations card for the Settings
// → Data & Sync page.
//
// STATE
//   The card tracks two pieces of state:
//
//   1. `connected` — boolean. Whether the user has a Trakt account
//      linked to their CineLog account.
//
//   2. `lastSyncedAt` — Date | null. The last time the user ran a
//      Trakt sync. Used to display "Last Synced: <date>".
//
// PERSISTENCE
//   CineLog has no backend endpoint that returns just "is Trakt
//   connected" — that would be a fourth API route and the user
//   explicitly asked for no backend changes in Chunk 3. So:
//
//   • `connected` is inferred from the OAuth callback URL parameter
//     `?trakt=connected` (set by /api/auth/trakt/callback on success)
//     and persisted to localStorage so it survives page reloads.
//
//   • `lastSyncedAt` is persisted to localStorage by the
//     TraktSyncWizard's onSuccess callback.
//
//   If the user's Trakt connection is ever revoked server-side
//   (token expired, refresh failed, manually deleted from DB), the
//   next call to /api/sync/trakt/preview will return 409 — the
//   wizard's onConnectionLost callback clears the localStorage flag
//   and the card flips back to the "unconnected" state on the next
//   render.
//
// ERROR HANDLING
//   The OAuth callback redirects to /settings/sync?error=trakt_email_mismatch
//   when the user's Trakt account email doesn't match their CineLog
//   account email. We detect this URL parameter on mount and show a
//   red error banner explaining the mismatch. The parameter is then
//   stripped from the URL (so a refresh doesn't re-trigger the banner).
//
// SECURITY
//   • No tokens are stored client-side.
//   • The "Connect Trakt" button navigates to /api/auth/trakt —
//     the server handles the entire OAuth flow.
//   • The "Disconnect" button calls /api/auth/trakt/disconnect (a
//     future route — currently returns 404, but we still update
//     the UI optimistically so the user gets immediate feedback).
//     Once the disconnect route is implemented server-side, the
//     behavior will be: call the route, on success clear the
//     connected flag, on failure show a toast.

import {
  Show,
  createSignal,
  onMount,
  type Component
} from "solid-js";
import { GlassCard, GlassButton, GlassBadge } from "~/shared/ui/glass";
import { useToast } from "~/shared/hooks/useToast";
import TraktLogo from "./TraktLogo";
import TraktSyncWizard from "./TraktSyncWizard";

// ─── Constants ───────────────────────────────────────────────────

const LOCALSTORAGE_CONNECTED_KEY = "cinelog_trakt_connected";
const LOCALSTORAGE_LAST_SYNCED_KEY = "cinelog_trakt_last_synced_at";

// ─── URL param helpers ───────────────────────────────────────────

interface UrlState {
  /** Set when OAuth callback succeeded — `?trakt=connected`. */
  justConnected: boolean;
  /** Set when OAuth callback failed due to email mismatch. */
  emailMismatch: boolean;
  /** Set when OAuth state cookie didn't match (CSRF failure). */
  stateMismatch: boolean;
}

/**
 * Read the OAuth-callback URL parameters and strip them from the
 * address bar (so a refresh doesn't re-trigger error toasts).
 *
 * Runs only in the browser — safe to call during onMount.
 */
const consumeUrlState = (): UrlState => {
  if (typeof window === "undefined") {
    return { justConnected: false, emailMismatch: false, stateMismatch: false };
  }
  const url = new URL(window.location.href);
  const params = url.searchParams;

  const justConnected = params.get("trakt") === "connected";
  const emailMismatch = params.get("error") === "trakt_email_mismatch";
  const stateMismatch = params.get("error") === "trakt_state_mismatch";

  if (justConnected || emailMismatch || stateMismatch) {
    // Strip the params we consumed — keep any others intact.
    if (justConnected) params.delete("trakt");
    if (emailMismatch || stateMismatch) params.delete("error");
    const newSearch = params.toString();
    const newUrl =
      url.pathname + (newSearch ? `?${newSearch}` : "") + url.hash;
    // replaceState so the back button doesn't take the user back to
    // the URL with the param (which would re-trigger the toast).
    window.history.replaceState({}, "", newUrl);
  }

  return { justConnected, emailMismatch, stateMismatch };
};

// ─── localStorage helpers ────────────────────────────────────────

const readConnected = (): boolean => {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(LOCALSTORAGE_CONNECTED_KEY) === "true";
  } catch {
    // localStorage can throw in private mode / sandboxed iframes
    return false;
  }
};

const writeConnected = (value: boolean) => {
  if (typeof window === "undefined") return;
  try {
    if (value) {
      window.localStorage.setItem(LOCALSTORAGE_CONNECTED_KEY, "true");
    } else {
      window.localStorage.removeItem(LOCALSTORAGE_CONNECTED_KEY);
    }
  } catch {
    // Best-effort — UI still works without persistence.
  }
};

const readLastSynced = (): Date | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LOCALSTORAGE_LAST_SYNCED_KEY);
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
};

const writeLastSynced = (d: Date) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCALSTORAGE_LAST_SYNCED_KEY, d.toISOString());
  } catch {
    // Best-effort.
  }
};

// ─── Date formatting ─────────────────────────────────────────────

const formatLastSynced = (d: Date | null): string => {
  if (!d) return "";
  // Relative-ish: "Today at 3:45 PM", "Yesterday at …", "Mar 4 at …"
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  const time = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit"
  });

  if (sameDay) return `Today at ${time}`;
  if (isYesterday) return `Yesterday at ${time}`;

  // Same year → omit year. Different year → include it.
  const sameYear = d.getFullYear() === now.getFullYear();
  const date = d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" })
  });
  return `${date} at ${time}`;
};

// ─── Component ───────────────────────────────────────────────────

const TraktIntegrationCard: Component = () => {
  const { showToast } = useToast();

  const [connected, setConnected] = createSignal<boolean>(false);
  const [lastSynced, setLastSynced] = createSignal<Date | null>(null);
  const [wizardOpen, setWizardOpen] = createSignal<boolean>(false);
  const [emailMismatch, setEmailMismatch] = createSignal<boolean>(false);
  const [disconnecting, setDisconnecting] = createSignal<boolean>(false);

  // ─── Initialize state from URL + localStorage on mount ────────
  onMount(() => {
    const urlState = consumeUrlState();

    // Initialize connected from localStorage, then layer URL on top.
    const stored = readConnected();
    setConnected(stored || urlState.justConnected);

    // If justConnected is true, persist so it survives reloads.
    if (urlState.justConnected) {
      writeConnected(true);
      showToast("Trakt account connected successfully", "success", 3000);
    }

    // Read last synced timestamp.
    setLastSynced(readLastSynced());

    // Surface error states.
    if (urlState.emailMismatch) {
      setEmailMismatch(true);
      // Don't auto-dismiss — let the user read it. They can dismiss
      // via the close button on the banner.
    }
    if (urlState.stateMismatch) {
      // CSRF state mismatch — usually a stale cookie or session
      // timeout. A toast is sufficient here (no persistent banner
      // needed; the user just needs to retry the connection).
      showToast(
        "Trakt connection cancelled — security check failed. Please try again.",
        "error",
        5000
      );
    }
  });

  // ─── Handlers ────────────────────────────────────────────────

  const handleConnectClick = () => {
    // Navigate to the OAuth init route — the server redirects to
    // Trakt's consent screen. We use window.location (not useNavigate)
    // because /api/auth/trakt is a server route, not a client route.
    window.location.href = "/api/auth/trakt";
  };

  const handleSyncNowClick = () => {
    setWizardOpen(true);
  };

  const handleDisconnectClick = async () => {
    if (disconnecting()) return;
    setDisconnecting(true);

    try {
      // The disconnect route doesn't exist yet — it will return 404
      // or 405 from the static file server. We treat both as "not
      // implemented yet" but still update the UI optimistically so
      // the user gets immediate feedback.
      //
      // Once /api/auth/trakt/disconnect is implemented server-side,
      // this same call will hit the real route and we'll respect
      // the actual response status.
      const res = await fetch("/api/auth/trakt/disconnect", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        }
      });

      if (res.ok) {
        // Real disconnect succeeded.
        setConnected(false);
        setLastSynced(null);
        writeConnected(false);
        try {
          window.localStorage.removeItem(LOCALSTORAGE_LAST_SYNCED_KEY);
        } catch {
          // ignore
        }
        showToast("Trakt account disconnected", "info", 3000);
      } else if (res.status === 404 || res.status === 405) {
        // Route not yet implemented — update UI optimistically but
        // tell the user the server-side cleanup is pending.
        setConnected(false);
        writeConnected(false);
        showToast(
          "Disconnected locally. Server-side cleanup will be available in a future update.",
          "info",
          5000
        );
      } else {
        showToast(
          "Could not disconnect Trakt. Please try again.",
          "error",
          4000
        );
      }
    } catch (err) {
      console.error("[trakt] disconnect failed:", err);
      showToast(
        "Network error while disconnecting. Please try again.",
        "error",
        4000
      );
    } finally {
      setDisconnecting(false);
    }
  };

  const handleWizardSuccess = () => {
    const now = new Date();
    setLastSynced(now);
    writeLastSynced(now);
  };

  const handleWizardConnectionLost = () => {
    // The wizard's preview call returned 409 — Trakt is no longer
    // connected. Flip the card back to the unconnected state.
    setConnected(false);
    setLastSynced(null);
    writeConnected(false);
    try {
      window.localStorage.removeItem(LOCALSTORAGE_LAST_SYNCED_KEY);
    } catch {
      // ignore
    }
  };

  const dismissEmailMismatch = () => {
    setEmailMismatch(false);
  };

  // ─── Render ───────────────────────────────────────────────────
  return (
    <div class="trakt-integration-wrap">
      <GlassCard variant="glass" padding="default" hoverable={false}>
        <div class="trakt-integration-card">
          {/* ── Header row: logo + title + status badge ─────── */}
          <div class="trakt-integration-header">
            <div class="trakt-integration-brand">
              <TraktLogo size={40} />
              <div class="trakt-integration-titles">
                <p class="trakt-integration-title">Trakt</p>
                <p class="trakt-integration-subtitle">Direct Integration</p>
              </div>
            </div>
            <Show when={connected()}>
              <GlassBadge
                intent="success"
                size="default"
                label="Connected"
                icon="check_circle"
              />
            </Show>
          </div>

          {/* ── Email mismatch error banner ──────────────────── */}
          <Show when={emailMismatch()}>
            <div
              class="trakt-integration-error-banner"
              role="alert"
              aria-live="assertive"
            >
              <span
                class="material-symbols-outlined trakt-integration-error-icon"
                aria-hidden="true"
              >
                error
              </span>
              <div class="trakt-integration-error-content">
                <p class="trakt-integration-error-title">
                  Connection failed: email mismatch
                </p>
                <p class="trakt-integration-error-body">
                  Your Trakt account email does not match your CineLog
                  account email. Please ensure both accounts use the same
                  email address, then try connecting again.
                </p>
              </div>
              <button
                type="button"
                class="trakt-integration-error-close focus-ring"
                onClick={dismissEmailMismatch}
                aria-label="Dismiss error"
              >
                <span
                  class="material-symbols-outlined"
                  style={{ "font-size": "18px" }}
                  aria-hidden="true"
                >
                  close
                </span>
              </button>
            </div>
          </Show>

          {/* ── Body: changes based on connection state ──────── */}
          <Show
            when={!connected()}
            fallback={
              <div class="trakt-integration-body trakt-integration-body-connected">
                <p class="trakt-integration-desc">
                  Trakt is connected. Sync your watch history and ratings
                  on demand — no manual CSV exports needed.
                </p>
                <Show when={lastSynced()}>
                  <p class="trakt-integration-last-synced">
                    <span
                      class="material-symbols-outlined"
                      style={{ "font-size": "14px" }}
                      aria-hidden="true"
                    >
                      schedule
                    </span>
                    Last Synced: {formatLastSynced(lastSynced())}
                  </p>
                </Show>
                <div class="trakt-integration-actions">
                  <GlassButton
                    variant="primary"
                    size="default"
                    icon="sync"
                    onClick={handleSyncNowClick}
                  >
                    Sync Now
                  </GlassButton>
                  <button
                    type="button"
                    class="trakt-integration-disconnect-btn focus-ring"
                    onClick={handleDisconnectClick}
                    disabled={disconnecting()}
                  >
                    <Show
                      when={!disconnecting()}
                      fallback="Disconnecting…"
                    >
                      Disconnect
                    </Show>
                  </button>
                </div>
              </div>
            }
          >
            <div class="trakt-integration-body trakt-integration-body-unconnected">
              <p class="trakt-integration-desc">
                Automatically sync your watch history and ratings from Trakt.
                Connect your account to get started.
              </p>
              <div class="trakt-integration-actions">
                <GlassButton
                  variant="primary"
                  size="default"
                  icon="link"
                  onClick={handleConnectClick}
                >
                  Connect Trakt
                </GlassButton>
              </div>
            </div>
          </Show>
        </div>
      </GlassCard>

      {/* ── Sync wizard modal ─────────────────────────────────── */}
      <TraktSyncWizard
        open={wizardOpen()}
        onClose={() => setWizardOpen(false)}
        onSuccess={handleWizardSuccess}
        onConnectionLost={handleWizardConnectionLost}
      />
    </div>
  );
};

export default TraktIntegrationCard;
