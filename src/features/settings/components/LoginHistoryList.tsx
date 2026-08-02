// src/features/settings/components/LoginHistoryList.tsx
//
// LoginHistoryList — shows the user's recent sign-ins from the
// `login_history` table. Each row shows:
//   • The device/browser (parsed from user_agent)
//   • The IP address (if available — currently null because the
//     browser can't read the client IP)
//   • The date/time of the sign-in
//
// The list is loaded on mount and can be refreshed manually.
// Falls back to a friendly empty state if no history exists (e.g.
// the user signed in before this feature was deployed).

import {
  createSignal,
  onMount,
  Show,
  For,
  type Component
} from "solid-js";
import { useAuth } from "~/shared/hooks/useAuth";
import {
  getLoginHistory,
  type LoginHistoryRow
} from "~/lib/supabase/repositories/loginHistory";

/** Parse a user-agent string into a human-readable device label. */
function parseDevice(ua: string | null): {
  browser: string;
  platform: string;
  isMobile: boolean;
} {
  if (!ua) return { browser: "Unknown", platform: "Unknown", isMobile: false };
  let platform = "Unknown";
  let browser = "Unknown";
  let isMobile = false;

  if (/Windows NT/i.test(ua)) platform = "Windows";
  else if (/Mac OS X/i.test(ua)) platform = "macOS";
  else if (/Android/i.test(ua)) {
    platform = "Android";
    isMobile = true;
  } else if (/iPhone|iPad|iPod/i.test(ua)) {
    platform = "iOS";
    isMobile = true;
  } else if (/Linux/i.test(ua)) platform = "Linux";

  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) browser = "Chrome";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = "Safari";

  if (!isMobile && /Mobi|Tablet/i.test(ua)) isMobile = true;
  return { browser, platform, isMobile };
}

/** Format an ISO date string as "Mon DD, YYYY · HH:MM AM/PM". */
function formatLoginDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  } catch {
    return iso;
  }
}

const LoginHistoryList: Component = () => {
  const { user } = useAuth();
  const [rows, setRows] = createSignal<LoginHistoryRow[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);

  onMount(() => {
    void load();
  });

  async function load() {
    const uid = user()?.uid;
    if (!uid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const res = await getLoginHistory(uid, 50);
    if (res.error) {
      setError(res.error.message);
    } else {
      setRows(res.data ?? []);
    }
    setLoading(false);
  }

  return (
    <div class="settings-login-history">
      <div class="settings-login-history-header">
        <button
          type="button"
          class="btn-ghost settings-login-history-refresh focus-ring"
          onClick={() => void load()}
          disabled={loading()}
          aria-label="Refresh login history"
        >
          <span
            class="material-symbols-outlined"
            aria-hidden="true"
            style={{ "font-size": "16px" }}
          >
            refresh
          </span>
          Refresh
        </button>
      </div>

      <Show when={error()}>
        <div class="settings-error" role="alert">
          {error()}
        </div>
      </Show>

      <Show when={loading()}>
        <div class="settings-login-history-loading">
          Loading login history…
        </div>
      </Show>

      <Show when={!loading() && rows().length === 0 && !error()}>
        <div class="settings-login-history-empty">
          <span
            class="material-symbols-outlined"
            aria-hidden="true"
            style={{ "font-size": "32px", color: "var(--text-soft)" }}
          >
            history
          </span>
          <p>No login history yet.</p>
          <p class="settings-login-history-empty-sub">
            Sign-ins will appear here after your next login.
          </p>
        </div>
      </Show>

      <Show when={!loading() && rows().length > 0}>
        <ul class="settings-login-history-list">
          <For each={rows()}>
            {(row) => {
              const device = parseDevice(row.user_agent);
              return (
                <li class="settings-login-history-row">
                  <div class="settings-login-history-icon">
                    <span
                      class="material-symbols-outlined"
                      aria-hidden="true"
                      style={{ "font-size": "20px" }}
                    >
                      {device.isMobile ? "smartphone" : "laptop"}
                    </span>
                  </div>
                  <div class="settings-login-history-info">
                    <span class="settings-login-history-device">
                      {device.browser} on {device.platform}
                    </span>
                    <span class="settings-login-history-date">
                      {formatLoginDate(row.login_at)}
                    </span>
                  </div>
                  <Show when={row.ip_address}>
                    <span class="settings-login-history-ip">
                      {row.ip_address}
                    </span>
                  </Show>
                </li>
              );
            }}
          </For>
        </ul>
      </Show>
    </div>
  );
};

export default LoginHistoryList;
