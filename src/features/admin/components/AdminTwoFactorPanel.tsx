// src/features/admin/components/AdminTwoFactorPanel.tsx
//
// CineLog V2 — Admin 2FA Enrollment Panel (Phase 6 Part 3 — Task 4)
// ---------------------------------------------------------------------
// Renders the 2FA section of the Admin Settings page.
//
// Three states:
//   1. Loading — fetching the current 2FA status from /api/admin/2fa/status.
//   2. Not enabled — shows "Enable 2FA" button. Clicking it triggers
//      /api/admin/2fa/enroll, which returns a QR code + secret. The
//      user scans the QR with their authenticator app, then enters a
//      6-digit code to verify and complete enrollment.
//   3. Enabled — shows "2FA is enabled" badge + a "Disable 2FA"
//      button. Disabling requires a valid TOTP code as confirmation.
//
// All API calls go through the admin cookie auth (requireAdmin).
// The user must be signed in as an admin to access this panel —
// the parent AdminSettingsPage enforces that.

import {
  createSignal,
  createResource,
  Show,
  type Component
} from "solid-js";

interface StatusResponse {
  ok: boolean;
  enabled?: boolean;
  pending?: boolean;
  error?: string;
}

interface EnrollResponse {
  ok: boolean;
  secretBase32?: string;
  otpauthURL?: string;
  qrDataUrl?: string;
  error?: string;
  detail?: string;
}

interface ActionResponse {
  ok: boolean;
  enabled?: boolean;
  disabled?: boolean;
  error?: string;
}

type PanelState =
  | { kind: "loading" }
  | { kind: "idle"; enabled: boolean; pending: boolean }
  | { kind: "enrolling"; secretBase32: string; qrDataUrl: string }
  | { kind: "verifying"; secretBase32: string; qrDataUrl: string }
  | { kind: "disabling" }
  | { kind: "error"; message: string };

const AdminTwoFactorPanel: Component = () => {
  const [state, setState] = createSignal<PanelState>({
    kind: "loading"
  });
  const [verifyCode, setVerifyCode] = createSignal("");
  const [disableCode, setDisableCode] = createSignal("");
  const [actionLoading, setActionLoading] = createSignal(false);
  const [toast, setToast] = createSignal<{
    msg: string;
    type: "success" | "error" | "info";
  } | null>(null);

  const showToast = (
    msg: string,
    type: "success" | "error" | "info"
  ) => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Fetch the current 2FA status on mount.
  const fetchStatus = async (): Promise<void> => {
    try {
      const resp = await fetch("/api/admin/2fa/status", {
        credentials: "include"
      });
      if (resp.status === 401) {
        window.location.href = "/admin/login";
        return;
      }
      const data = (await resp.json()) as StatusResponse;
      if (data.ok) {
        setState({
          kind: "idle",
          enabled: Boolean(data.enabled),
          pending: Boolean(data.pending)
        });
      } else {
        setState({
          kind: "error",
          message: data.error ?? "Failed to fetch 2FA status"
        });
      }
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error"
      });
    }
  };

  // Use createResource to fetch on mount.
  // eslint-disable-next-line solid/reactivity -- fetchStatus is a stable closure
  const [_statusResource] = createResource(fetchStatus);
  void _statusResource;

  const handleEnroll = async () => {
    setActionLoading(true);
    try {
      const resp = await fetch("/api/admin/2fa/enroll", {
        method: "POST",
        credentials: "include"
      });
      const data = (await resp.json()) as EnrollResponse;
      if (data.ok && data.secretBase32 && data.qrDataUrl) {
        setState({
          kind: "enrolling",
          secretBase32: data.secretBase32,
          qrDataUrl: data.qrDataUrl
        });
      } else {
        showToast(data.error ?? "Failed to begin enrollment", "error");
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Network error", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleVerify = async () => {
    const code = verifyCode().trim();
    if (!/^\d{6}$/.test(code)) {
      showToast("Code must be exactly 6 digits.", "error");
      return;
    }
    setActionLoading(true);
    try {
      const resp = await fetch("/api/admin/2fa/verify", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code })
      });
      const data = (await resp.json()) as ActionResponse;
      if (data.ok) {
        showToast("2FA enabled successfully!", "success");
        setVerifyCode("");
        setState({ kind: "idle", enabled: true, pending: false });
      } else {
        showToast(data.error ?? "Invalid code.", "error");
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Network error", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDisable = async () => {
    const code = disableCode().trim();
    if (!/^\d{6}$/.test(code)) {
      showToast("Code must be exactly 6 digits.", "error");
      return;
    }
    setActionLoading(true);
    try {
      const resp = await fetch("/api/admin/2fa/disable", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code })
      });
      const data = (await resp.json()) as ActionResponse;
      if (data.ok) {
        showToast("2FA disabled.", "info");
        setDisableCode("");
        setState({ kind: "idle", enabled: false, pending: false });
      } else {
        showToast(data.error ?? "Invalid code.", "error");
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Network error", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelEnroll = () => {
    setVerifyCode("");
    setState({ kind: "idle", enabled: false, pending: false });
  };

  return (
    <div
      style={{
        background: "var(--tier-2)",
        border: "1px solid var(--hairline)",
        "border-radius": "var(--radius-lg)",
        padding: "var(--sp-5)"
      }}
    >
      <div
        style={{
          display: "flex",
          "align-items": "center",
          gap: "var(--sp-3)",
          "margin-bottom": "var(--sp-4)"
        }}
      >
        <span style={{ "font-size": "1.25rem" }} aria-hidden="true">
          🔐
        </span>
        <div>
          <h3
            style={{
              margin: 0,
              "font-size": "1rem",
              "font-weight": 600,
              color: "var(--text)"
            }}
          >
            Two-Factor Authentication (TOTP)
          </h3>
          <p
            style={{
              margin: "2px 0 0 0",
              "font-size": "0.8125rem",
              color: "var(--text-muted)"
            }}
          >
            Add an extra verification step to admin login using an
            authenticator app (Google Authenticator, Authy, 1Password, etc.).
          </p>
        </div>
      </div>

      <Show when={state().kind === "loading"}>
        <div
          style={{
            padding: "var(--sp-4)",
            "text-align": "center",
            color: "var(--text-muted)",
            "font-size": "0.875rem"
          }}
        >
          Checking 2FA status…
        </div>
      </Show>

      <Show when={state().kind === "error"}>
        <div
          style={{
            padding: "var(--sp-3)",
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            "border-radius": "var(--radius-md)",
            color: "rgb(252, 165, 165)",
            "font-size": "0.8125rem"
          }}
        >
          {(state() as { kind: "error"; message: string }).message}
        </div>
      </Show>

      <Show when={state().kind === "idle"}>
        <IdleState
          enabled={(state() as { kind: "idle"; enabled: boolean; pending: boolean }).enabled}
          pending={(state() as { kind: "idle"; enabled: boolean; pending: boolean }).pending}
          disableCode={disableCode}
          setDisableCode={setDisableCode}
          actionLoading={actionLoading}
          onDisable={handleDisable}
          onEnroll={handleEnroll}
        />
      </Show>

      <Show when={state().kind === "enrolling" || state().kind === "verifying"}>
        <EnrollingState
          secretBase32={(state() as { kind: "enrolling"; secretBase32: string; qrDataUrl: string }).secretBase32}
          qrDataUrl={(state() as { kind: "enrolling"; secretBase32: string; qrDataUrl: string }).qrDataUrl}
          verifyCode={verifyCode}
          setVerifyCode={setVerifyCode}
          actionLoading={actionLoading}
          onVerify={handleVerify}
          onCancel={handleCancelEnroll}
        />
      </Show>

      <Show when={toast()}>
        {(t) => (
          <div
            style={{
              "margin-top": "var(--sp-4)",
              padding: "var(--sp-2) var(--sp-3)",
              background:
                t().type === "success"
                  ? "rgba(34, 197, 94, 0.12)"
                  : t().type === "info"
                  ? "rgba(99, 102, 241, 0.12)"
                  : "rgba(239, 68, 68, 0.12)",
              border: `1px solid ${
                t().type === "success"
                  ? "rgba(34, 197, 94, 0.3)"
                  : t().type === "info"
                  ? "rgba(99, 102, 241, 0.3)"
                  : "rgba(239, 68, 68, 0.3)"
              }`,
              "border-radius": "var(--radius-md)",
              "font-size": "0.8125rem",
              color:
                t().type === "success"
                  ? "rgb(134, 239, 172)"
                  : t().type === "info"
                  ? "rgb(165, 180, 252)"
                  : "rgb(252, 165, 165)"
            }}
          >
            {t().msg}
          </div>
        )}
      </Show>
    </div>
  );
};

export default AdminTwoFactorPanel;

// ─── Sub-components (extracted from the main panel for clarity) ─────

import { type Accessor, type Setter } from "solid-js";

interface IdleStateProps {
  enabled: boolean;
  pending: boolean;
  disableCode: Accessor<string>;
  setDisableCode: Setter<string>;
  actionLoading: Accessor<boolean>;
  onDisable: () => void;
  onEnroll: () => void;
}

const IdleState: Component<IdleStateProps> = (props) => {
  return (
    <>
      <Show when={props.enabled}>
        <div
          style={{
            display: "flex",
            "align-items": "center",
            gap: "var(--sp-3)",
            padding: "var(--sp-3) var(--sp-4)",
            background: "rgba(34, 197, 94, 0.1)",
            border: "1px solid rgba(34, 197, 94, 0.3)",
            "border-radius": "var(--radius-md)",
            "margin-bottom": "var(--sp-4)"
          }}
        >
          <span style={{ "font-size": "1rem" }} aria-hidden="true">
            ✅
          </span>
          <div style={{ flex: 1 }}>
            <div
              style={{
                "font-size": "0.875rem",
                "font-weight": 600,
                color: "rgb(134, 239, 172)"
              }}
            >
              2FA is enabled
            </div>
            <div
              style={{
                "font-size": "0.75rem",
                color: "var(--text-muted)"
              }}
            >
              You'll need a 6-digit code from your authenticator app
              each time you sign in to the admin panel.
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: "var(--sp-2)",
            "align-items": "center"
          }}
        >
          <input
            type="text"
            inputmode="numeric"
            maxlength={6}
            placeholder="Enter code to disable"
            value={props.disableCode()}
            onInput={(e) =>
              props.setDisableCode(
                e.currentTarget.value.replace(/\D/g, "").slice(0, 6)
              )
            }
            disabled={props.actionLoading()}
            style={{
              flex: 1,
              padding: "var(--sp-2) var(--sp-3)",
              background: "var(--tier-3)",
              border: "1px solid var(--hairline-2)",
              "border-radius": "var(--radius-md)",
              color: "var(--text)",
              "font-family": "monospace",
              "letter-spacing": "0.3em",
              "text-align": "center",
              "font-size": "0.875rem",
              outline: "none"
            }}
          />
          <button
            type="button"
            onClick={props.onDisable}
            disabled={props.actionLoading() || props.disableCode().length !== 6}
            style={{
              padding: "var(--sp-2) var(--sp-4)",
              background:
                props.actionLoading() || props.disableCode().length !== 6
                  ? "var(--tier-3)"
                  : "rgb(239, 68, 68)",
              color: "white",
              border: "none",
              "border-radius": "var(--radius-md)",
              "font-size": "0.8125rem",
              "font-weight": 600,
              cursor:
                props.actionLoading() || props.disableCode().length !== 6
                  ? "not-allowed"
                  : "pointer"
            }}
          >
            Disable 2FA
          </button>
        </div>
      </Show>

      <Show when={!props.enabled && !props.pending}>
        <div
          style={{
            display: "flex",
            "align-items": "center",
            gap: "var(--sp-3)",
            padding: "var(--sp-3) var(--sp-4)",
            background: "rgba(99, 102, 241, 0.08)",
            border: "1px solid rgba(99, 102, 241, 0.25)",
            "border-radius": "var(--radius-md)",
            "margin-bottom": "var(--sp-4)"
          }}
        >
          <span style={{ "font-size": "1rem" }} aria-hidden="true">
            ℹ️
          </span>
          <div style={{ flex: 1 }}>
            <div
              style={{
                "font-size": "0.875rem",
                "font-weight": 600,
                color: "rgb(165, 180, 252)"
              }}
            >
              2FA is not enabled
            </div>
            <div
              style={{
                "font-size": "0.75rem",
                color: "var(--text-muted)"
              }}
            >
              We strongly recommend enabling 2FA to protect the admin
              panel from unauthorized access.
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={props.onEnroll}
          disabled={props.actionLoading()}
          style={{
            padding: "var(--sp-2) var(--sp-5)",
            background: props.actionLoading() ? "var(--tier-3)" : "var(--p)",
            color: props.actionLoading()
              ? "var(--text-muted)"
              : "var(--on-primary)",
            border: "none",
            "border-radius": "var(--radius-md)",
            "font-size": "0.875rem",
            "font-weight": 600,
            cursor: props.actionLoading() ? "not-allowed" : "pointer"
          }}
        >
          {props.actionLoading() ? "Starting…" : "Enable 2FA"}
        </button>
      </Show>

      <Show when={!props.enabled && props.pending}>
        <div
          style={{
            padding: "var(--sp-3) var(--sp-4)",
            background: "rgba(251, 191, 36, 0.08)",
            border: "1px solid rgba(251, 191, 36, 0.3)",
            "border-radius": "var(--radius-md)",
            "font-size": "0.8125rem",
            color: "rgb(253, 224, 71)"
          }}
        >
          Enrollment in progress — verify a code to complete, or click
          "Enable 2FA" to restart.
        </div>
        <button
          type="button"
          onClick={props.onEnroll}
          disabled={props.actionLoading()}
          style={{
            "margin-top": "var(--sp-3)",
            padding: "var(--sp-2) var(--sp-5)",
            background: props.actionLoading() ? "var(--tier-3)" : "var(--p)",
            color: props.actionLoading()
              ? "var(--text-muted)"
              : "var(--on-primary)",
            border: "none",
            "border-radius": "var(--radius-md)",
            "font-size": "0.875rem",
            "font-weight": 600,
            cursor: props.actionLoading() ? "not-allowed" : "pointer"
          }}
        >
          {props.actionLoading() ? "Starting…" : "Resume enrollment"}
        </button>
      </Show>
    </>
  );
};

interface EnrollingStateProps {
  secretBase32: string;
  qrDataUrl: string;
  verifyCode: Accessor<string>;
  setVerifyCode: Setter<string>;
  actionLoading: Accessor<boolean>;
  onVerify: () => void;
  onCancel: () => void;
}

const EnrollingState: Component<EnrollingStateProps> = (props) => {
  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: "var(--sp-5)",
          "flex-wrap": "wrap",
          "align-items": "flex-start"
        }}
      >
        <div
          style={{
            background: "white",
            padding: "var(--sp-2)",
            "border-radius": "var(--radius-md)",
            "flex-shrink": 0
          }}
        >
          <img
            src={props.qrDataUrl}
            alt="QR code for authenticator app"
            style={{
              display: "block",
              width: "180px",
              height: "180px"
            }}
          />
        </div>
        <div style={{ flex: 1, "min-width": "240px" }}>
          <h4
            style={{
              margin: "0 0 var(--sp-2) 0",
              "font-size": "0.875rem",
              "font-weight": 600,
              color: "var(--text)"
            }}
          >
            1. Scan the QR code
          </h4>
          <p
            style={{
              margin: "0 0 var(--sp-3) 0",
              "font-size": "0.8125rem",
              color: "var(--text-muted)"
            }}
          >
            Open your authenticator app (Google Authenticator, Authy,
            1Password, etc.) and scan this code with the "Add account" →
            "Scan QR code" option.
          </p>

          <h4
            style={{
              margin: "0 0 var(--sp-2) 0",
              "font-size": "0.875rem",
              "font-weight": 600,
              color: "var(--text)"
            }}
          >
            Or enter the secret manually
          </h4>
          <code
            style={{
              display: "block",
              padding: "var(--sp-2) var(--sp-3)",
              background: "var(--tier-3)",
              border: "1px solid var(--hairline-2)",
              "border-radius": "var(--radius-sm)",
              "font-family": "monospace",
              "font-size": "0.75rem",
              color: "var(--text)",
              "word-break": "break-all",
              "margin-bottom": "var(--sp-4)"
            }}
          >
            {props.secretBase32}
          </code>

          <h4
            style={{
              margin: "0 0 var(--sp-2) 0",
              "font-size": "0.875rem",
              "font-weight": 600,
              color: "var(--text)"
            }}
          >
            2. Enter the 6-digit code from your app
          </h4>
          <div
            style={{
              display: "flex",
              gap: "var(--sp-2)",
              "align-items": "center"
            }}
          >
            <input
              type="text"
              inputmode="numeric"
              maxlength={6}
              placeholder="123456"
              value={props.verifyCode()}
              onInput={(e) =>
                props.setVerifyCode(
                  e.currentTarget.value.replace(/\D/g, "").slice(0, 6)
                )
              }
              disabled={props.actionLoading()}
              style={{
                flex: 1,
                padding: "var(--sp-2) var(--sp-3)",
                background: "var(--tier-3)",
                border: "1px solid var(--hairline-2)",
                "border-radius": "var(--radius-md)",
                color: "var(--text)",
                "font-family": "monospace",
                "letter-spacing": "0.3em",
                "text-align": "center",
                "font-size": "0.875rem",
                outline: "none"
              }}
            />
            <button
              type="button"
              onClick={props.onVerify}
              disabled={props.actionLoading() || props.verifyCode().length !== 6}
              style={{
                padding: "var(--sp-2) var(--sp-4)",
                background:
                  props.actionLoading() || props.verifyCode().length !== 6
                    ? "var(--tier-3)"
                    : "var(--p)",
                color:
                  props.actionLoading() || props.verifyCode().length !== 6
                    ? "var(--text-muted)"
                    : "var(--on-primary)",
                border: "none",
                "border-radius": "var(--radius-md)",
                "font-size": "0.8125rem",
                "font-weight": 600,
                cursor:
                  props.actionLoading() || props.verifyCode().length !== 6
                    ? "not-allowed"
                    : "pointer"
              }}
            >
              Verify & Enable
            </button>
          </div>
          <button
            type="button"
            onClick={props.onCancel}
            disabled={props.actionLoading()}
            style={{
              "margin-top": "var(--sp-3)",
              padding: "var(--sp-2) var(--sp-4)",
              background: "transparent",
              color: "var(--text-muted)",
              border: "1px solid var(--hairline-2)",
              "border-radius": "var(--radius-md)",
              "font-size": "0.8125rem",
              "font-weight": 500,
              cursor: "pointer"
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
