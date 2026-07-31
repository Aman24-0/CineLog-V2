// src/features/settings/components/SessionList.tsx
//
// SessionList — shows the current device info and a "Sign out of all
// devices" button. The authenticator-app list lives in the 2FA section
// (TwoFactorSetup.tsx); this component does NOT duplicate it.
//
// Supabase does NOT expose a "list all my sessions" endpoint to the
// client — the auth.sessions table is server-side only. What we CAN
// show:
//   • The current device (parsed from navigator.userAgent).
//   • The current session's AAL (aal1 = no 2FA this session,
//     aal2 = 2FA verified this session).
//
// The "Sign out everywhere" button calls
// supabase.auth.signOut({ scope: "global" }) which invalidates ALL
// refresh tokens for the user across every device.

import {
  createSignal,
  onMount,
  Show,
  type Component
} from "solid-js";
import { useAuth } from "~/shared/hooks/useAuth";
import { useToast } from "~/shared/hooks/useToast";
import { useNavigate } from "@solidjs/router";
import {
  getSessionsOverview,
  revokeAllSessions,
  type SessionsOverview
} from "~/lib/supabase/repositories/sessions";

const SessionList: Component = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [overview, setOverview] = createSignal<SessionsOverview | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [signingOut, setSigningOut] = createSignal(false);

  onMount(() => {
    void load();
  });

  async function load() {
    setLoading(true);
    setError(null);
    const uid = user()?.uid;
    if (!uid) {
      setLoading(false);
      return;
    }
    const res = await getSessionsOverview();
    if (res.error) {
      setError(res.error.message);
    } else {
      setOverview(res.data);
    }
    setLoading(false);
  }

  async function handleSignOutEverywhere() {
    if (
      !confirm(
        "Sign out of ALL devices?\n\nYou'll need to sign in again on every device, including this one."
      )
    ) {
      return;
    }
    setSigningOut(true);
    const res = await revokeAllSessions();
    setSigningOut(false);
    if (res.error) {
      showToast(`Failed: ${res.error.message}`, "error");
      return;
    }
    showToast("Signed out of all devices", "success");
    // Navigate to discover — the auth state change will fire and
    // the app will re-render as signed-out.
    navigate("/discover");
  }

  return (
    <div class="settings-sessions">
      <Show when={error()}>
        <div class="settings-error" role="alert">
          {error()}
        </div>
      </Show>

      <Show when={loading()}>
        <div class="settings-sessions-loading">Loading sessions…</div>
      </Show>

      <Show when={!loading() && overview()}>
        {(ov) => (
          <>
            {/* Current device */}
            <div class="settings-session-card settings-session-current">
              <div class="settings-session-icon">
                <span
                  class="material-symbols-outlined"
                  aria-hidden="true"
                  style={{ "font-size": "24px" }}
                >
                  {ov().thisDevice.isMobile ? "smartphone" : "laptop"}
                </span>
              </div>
              <div class="settings-session-info">
                <span class="settings-session-name">
                  This device
                  <span class="settings-session-badge">Current</span>
                </span>
                <span class="settings-session-meta">
                  {ov().thisDevice.browser} on {ov().thisDevice.platform}
                </span>
                <Show when={ov().currentAal}>
                  <span class="settings-session-aal">
                    {ov().currentAal === "aal2"
                      ? "2FA verified this session"
                      : "No 2FA this session"}
                  </span>
                </Show>
              </div>
            </div>

            {/* Sign out everywhere */}
            <div class="settings-sessions-danger">
              <button
                type="button"
                class="btn-ghost settings-danger-btn focus-ring"
                onClick={handleSignOutEverywhere}
                disabled={signingOut()}
              >
                <Show when={!signingOut()} fallback="Signing out…">
                  Sign out of all devices
                </Show>
              </button>
              <p class="settings-sessions-danger-desc">
                Signs you out on every device, including this one. Use this if you think your account was compromised.
              </p>
            </div>
          </>
        )}
      </Show>
    </div>
  );
};

export default SessionList;
