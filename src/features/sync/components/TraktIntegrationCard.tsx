// src/features/sync/components/TraktIntegrationCard.tsx
//
// TraktIntegrationCard — Direct Integrations card for the Settings
// → Data & Sync page.
//
// STATE
//   The card tracks three pieces of state:
//
//   1. `connected` — boolean. Whether the user has a Trakt account
//      linked to their CineLog account.
//
//   2. `lastSyncedAt` — Date | null. The last time the user's Trakt
//      integration row was touched (connected or re-connected).
//      Displayed as "Last Synced: <date>".
//
//   3. `statusLoading` — boolean. True while the initial /status
//      fetch is in flight. While loading, the card body shows a
//      skeleton so the user doesn't see a flash of the "unconnected"
//      state.
//
// PERSISTENCE
//   The card fetches `/api/auth/trakt/status` on mount to determine
//   `connected` and `lastSyncedAt`. This is the single source of
//   truth — we no longer rely on localStorage or URL parameters for
//   the connected state.
//
//   After a successful sync (wizard onSuccess), we optimistically
//   update `lastSyncedAt` locally and re-fetch /status so the
//   timestamp stays in sync with the backend's `updated_at`.
//
//   If the user's Trakt connection is ever revoked server-side (token
//   expired, refresh failed, manually deleted from DB), the next call
//   to /api/sync/trakt/preview will return 409 — the wizard's
//   onConnectionLost callback flips the card back to the "unconnected"
//   state.
//
// ERROR HANDLING
//   The OAuth callback redirects to /settings/sync?error=trakt_email_mismatch
//   when the user's Trakt account email doesn't match their CineLog
//   account email. We detect this URL parameter on mount and show a
//   red error banner explaining the mismatch. The parameter is then
//   stripped from the URL (so a refresh doesn't re-trigger the banner).
//
//   The OAuth callback also redirects with ?error=trakt_state_mismatch
//   when the CSRF state cookie doesn't match (usually a stale cookie
//   or session timeout). We show a transient toast for this — the
//   user just needs to retry.
//
// SECURITY
//   • No tokens are stored client-side.
//   • The "Connect Trakt" button POSTs to /api/auth/trakt with the
//     access token in the request body (NOT in the URL query string).
//     The server verifies the session, generates a CSRF state cookie,
//     and returns the Trakt authorize URL. The client then navigates
//     to that URL to complete the OAuth flow. The token never appears
//     in any URL, server log, or browser history.
//   • The "Disconnect" button POSTs to /api/auth/trakt/disconnect,
//     which deletes the user_integrations row server-side. On
//     success, the card flips back to the "unconnected" state.

import {
  Show,
  createSignal,
  onMount,
  type Component
} from "solid-js";
import { GlassCard, GlassButton, GlassBadge, GlassSkeleton } from "~/shared/ui/glass";
import { useToast } from "~/shared/hooks/useToast";
import { getAuthHeaders } from "~/lib/supabase/session";
import TraktLogo from "./TraktLogo";
import TraktSyncWizard from "./TraktSyncWizard";

// ─── Types (mirror server response shape) ────────────────────────

interface TraktStatusResponse {
  connected: boolean;
  lastSynced: string | null;
  trakt_username: string | null;
  trakt_email: string | null;
}

// ─── URL param helpers ───────────────────────────────────────────

interface UrlErrorState {
  /** Set when OAuth callback failed due to email mismatch. */
  emailMismatch: boolean;
  /** Set when OAuth state cookie didn't match (CSRF failure). */
  stateMismatch: boolean;
}

/**
 * Read the OAuth-callback error URL parameters and strip them from the
 * address bar (so a refresh doesn't re-trigger error toasts/banners).
 *
 * Runs only in the browser — safe to call during onMount.
 *
 * Note: we no longer consume `?trakt=connected` here. The connected
 * state is determined by fetching /api/auth/trakt/status on mount, so
 * the URL parameter is redundant. We still strip it if present (so a
 * manual refresh of the OAuth success URL doesn't leave the param
 * lingering in the address bar).
 */
const consumeUrlErrorState = (): UrlErrorState => {
  if (typeof window === "undefined") {
    return { emailMismatch: false, stateMismatch: false };
  }
  const url = new URL(window.location.href);
  const params = url.searchParams;

  const emailMismatch = params.get("error") === "trakt_email_mismatch";
  const stateMismatch = params.get("error") === "trakt_state_mismatch";
  const hasConnectedParam = params.get("trakt") === "connected";

  if (emailMismatch || stateMismatch || hasConnectedParam) {
    if (emailMismatch || stateMismatch) params.delete("error");
    if (hasConnectedParam) params.delete("trakt");
    const newSearch = params.toString();
    const newUrl =
      url.pathname + (newSearch ? `?${newSearch}` : "") + url.hash;
    // replaceState so the back button doesn't take the user back to
    // the URL with the param (which would re-trigger the toast/banner).
    window.history.replaceState({}, "", newUrl);
  }

  return { emailMismatch, stateMismatch };
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
  const [statusLoading, setStatusLoading] = createSignal<boolean>(true);
  const [wizardOpen, setWizardOpen] = createSignal<boolean>(false);
  const [emailMismatch, setEmailMismatch] = createSignal<boolean>(false);
  const [disconnecting, setDisconnecting] = createSignal<boolean>(false);

  // ─── Fetch connection status from the backend ─────────────────
  //
  // This is the single source of truth for `connected` and
  // `lastSynced`. Called on mount, after a successful sync (so the
  // backend's updated_at has a chance to be re-read), and after a
  // successful disconnect (defensive — the optimistic update already
  // flipped the state).
  const refreshStatus = async () => {
    try {
      const res = await fetch("/api/auth/trakt/status", {
        method: "GET",
        credentials: "include",
        // Phase 13 Chunk 1: send the Supabase access token via the
        // Authorization header — the browser stores sessions in
        // localStorage (NOT cookies), so the server cannot read the
        // session from the Cookie header.
        headers: { Accept: "application/json", ...await getAuthHeaders() }
      });

      if (res.status === 401) {
        // Not signed in — the parent route will handle redirecting
        // to the auth flow. For now, just leave the card in the
        // unconnected state.
        setConnected(false);
        setLastSynced(null);
        return;
      }

      if (!res.ok) {
        // Unexpected status — log + leave the card in the unconnected
        // state. Don't toast: this runs on every mount and would be
        // noisy.
        console.warn(
          "[trakt/status] Unexpected status",
          res.status,
          "— leaving card in unconnected state"
        );
        setConnected(false);
        setLastSynced(null);
        return;
      }

      const data = (await res.json()) as TraktStatusResponse;
      setConnected(data.connected === true);
      if (data.lastSynced) {
        const d = new Date(data.lastSynced);
        setLastSynced(Number.isNaN(d.getTime()) ? null : d);
      } else {
        setLastSynced(null);
      }
    } catch (err) {
      console.error("[trakt/status] fetch failed:", err);
      // Network error — leave the card in the unconnected state
      // rather than spinning forever.
      setConnected(false);
      setLastSynced(null);
    } finally {
      setStatusLoading(false);
    }
  };

  // ─── Initialize on mount ──────────────────────────────────────
  onMount(() => {
    // Surface error states from the OAuth callback URL.
    const urlState = consumeUrlErrorState();
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

    // Fetch the real connection status from the backend.
    void refreshStatus();
  });

  // ─── Handlers ────────────────────────────────────────────────

  const handleConnectClick = async () => {
    // POST to the OAuth init route with the access token in the
    // request body (NOT in the URL query string). The server verifies
    // the session, generates a CSRF state cookie, and returns the
    // Trakt authorize URL. We then navigate to that URL to complete
    // the OAuth flow.
    //
    // This avoids exposing the access token in the URL, which would
    // leak into browser history, server logs, and Referer headers.
    const headers = await getAuthHeaders();
    const accessToken = headers.Authorization?.startsWith("Bearer ")
      ? headers.Authorization.slice("Bearer ".length)
      : "";
    if (!accessToken) {
      showToast(
        "You must be signed in to connect Trakt.",
        "error",
        4000
      );
      return;
    }
    try {
      const res = await fetch("/api/auth/trakt", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({ accessToken })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(
          (data as { error?: string }).error ?? "Failed to start Trakt connection.",
          "error",
          4000
        );
        return;
      }
      const data = (await res.json()) as { redirectUrl?: string };
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      } else {
        showToast("Unexpected response from server.", "error", 4000);
      }
    } catch (err) {
      console.error("[trakt] connect POST failed:", err);
      showToast("Network error. Please try again.", "error", 4000);
    }
  };

  const handleSyncNowClick = () => {
    setWizardOpen(true);
  };

  const handleDisconnectClick = async () => {
    if (disconnecting()) return;
    setDisconnecting(true);

    try {
      const res = await fetch("/api/auth/trakt/disconnect", {
        method: "POST",
        credentials: "include",
        // Phase 13 Chunk 1: send the Supabase access token via the
        // Authorization header — sessions live in localStorage, not
        // cookies, so the server needs the Bearer header to verify
        // the caller.
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...await getAuthHeaders()
        }
      });

      if (res.ok) {
        // Real disconnect succeeded — flip the card back to the
        // unconnected state immediately. We don't need to re-fetch
        // /status because we know the row is gone.
        setConnected(false);
        setLastSynced(null);
        showToast("Trakt account disconnected", "info", 3000);
      } else if (res.status === 401) {
        showToast(
          "You must be signed in to disconnect Trakt.",
          "error",
          4000
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
    // Optimistically update the local "Last Synced" timestamp so the
    // UI shows "Today at … <now>" immediately. We then re-fetch
    // /status so the backend's updated_at has a chance to be the
    // source of truth (in case the execute route is ever modified to
    // bump updated_at — currently it doesn't, but this is defensive).
    setLastSynced(new Date());
    void refreshStatus();
  };

  const handleWizardConnectionLost = () => {
    // The wizard's preview call returned 409 — Trakt is no longer
    // connected. Flip the card back to the unconnected state.
    setConnected(false);
    setLastSynced(null);
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
            <Show when={connected() && !statusLoading()}>
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

          {/* ── Body: changes based on loading + connection state ── */}
          <Show
            when={!statusLoading()}
            fallback={
              <div class="trakt-integration-body trakt-integration-body-loading">
                <GlassSkeleton variant="text" lines={2} width="100%" />
                <div class="trakt-integration-skeleton-actions">
                  <GlassSkeleton
                    variant="block"
                    width="120px"
                    height="36px"
                    radius="8px"
                  />
                </div>
              </div>
            }
          >
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
