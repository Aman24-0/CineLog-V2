// src/features/settings/components/TwoFactorSetup.tsx
//
// TwoFactorSetup — the 2FA enrollment / management UI.
//
// FLOW:
//   1. On mount, calls supabase.auth.mfa.listFactors() to see if the
//      user already has any verified TOTP factors.
//   2. If they do: show "2FA is ON" with a single "Disable 2FA" button.
//   3. If they don't: show "2FA is OFF" with an "Enable 2FA" button
//      that starts the enrollment flow.
//   4. Enrollment flow:
//      a. Call supabase.auth.mfa.enroll({ factorType: "totp" }) →
//         returns a URI + secret.
//      b. Use the `qrcode` library to render the URI as a PNG data URL.
//      c. User scans the QR with their authenticator app (Google
//         Authenticator, Authy, 1Password, etc.) OR manually enters
//         the secret.
//      d. User enters the 6-digit code from their app.
//      e. Call supabase.auth.mfa.challengeAndVerify({ factorId, code })
//         to verify. If successful, 2FA is now active and we flip to
//         the "on" step.
//      f. If the code is wrong, show an error and let them try again.
//   5. Disable: call supabase.auth.mfa.unenroll({ factorId }).
//
// QR CODE:
//   Supabase's enroll() response includes a `qr_code` field, but it's
//   an SVG string that some browsers render unreliably as an <img src>.
//   We render the canonical `uri` (otpauth://...) ourselves using the
//   `qrcode` npm package, which produces a PNG data URL that works
//   everywhere.
//
// SECURITY NOTE:
//   After enabling 2FA, the user's next sign-in on a NEW device will
//   require the TOTP code. The current session is unaffected (it
//   stays at aal1 until the user re-authenticates). This is standard
//   Supabase MFA behaviour.

import {
  createSignal,
  onMount,
  Show,
  For,
  type Component
} from "solid-js";
// qrcode (~42KB) is lazily imported on user interaction to keep the
// initial bundle small. See startEnrollment below.
import { getClient } from "~/lib/supabase/client";
import { useToast } from "~/shared/hooks/useToast";
import type { MfaFactorInfo } from "~/lib/supabase/repositories/sessions";

type Step = "loading" | "off" | "enrolling" | "on";

interface EnrollData {
  factorId: string;
  qrCode: string;
  secret: string;
  uri: string;
}

const TwoFactorSetup: Component = () => {
  const { showToast } = useToast();
  const [step, setStep] = createSignal<Step>("loading");
  const [factors, setFactors] = createSignal<MfaFactorInfo[]>([]);
  const [enrollData, setEnrollData] = createSignal<EnrollData | null>(null);
  const [code, setCode] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  onMount(() => {
    void refreshFactors();
  });

  async function refreshFactors() {
    setStep("loading");
    try {
      const client = getClient();
      const { data, error: err } = await client.auth.mfa.listFactors();
      if (err) {
        setError(err.message);
        setStep("off");
        return;
      }
      const verified = (data?.totp ?? []).filter(
        (f) => f.status === "verified"
      );
      setFactors(
        verified.map((f) => ({
          id: f.id,
          friendlyName: f.friendly_name ?? null,
          factorType: f.factor_type as "totp",
          status: f.status as "verified",
          createdAt: f.created_at,
          updatedAt: f.updated_at
        }))
      );
      setStep(verified.length > 0 ? "on" : "off");
    } catch (e) {
      setError((e as Error).message);
      setStep("off");
    }
  }

  async function startEnrollment() {
    setBusy(true);
    setError(null);
    try {
      const client = getClient();
      const { data, error: err } = await client.auth.mfa.enroll({
        factorType: "totp",
        issuer: "CineLog",
        friendlyName: "Authenticator app"
      });
      if (err) {
        setError(err.message);
        return;
      }
      if (data && data.totp) {
        // Render the otpauth:// URI as a PNG data URL using the qrcode
        // library. This is more reliable across browsers than Supabase's
        // built-in `qr_code` SVG string.
        let qrDataUrl = "";
        try {
          const { default: QRCode } = await import("qrcode");
          qrDataUrl = await QRCode.toDataURL(data.totp.uri, {
            margin: 1,
            width: 200,
            color: { dark: "#000000", light: "#ffffff" }
          });
        } catch (qrErr) {
          console.warn("[2fa] QR generation failed, falling back to Supabase qr_code:", qrErr);
          qrDataUrl = data.totp.qr_code;
        }
        setEnrollData({
          factorId: data.id,
          qrCode: qrDataUrl,
          secret: data.totp.secret,
          uri: data.totp.uri
        });
        setStep("enrolling");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    const ed = enrollData();
    if (!ed) return;
    const enteredCode = code().trim();
    if (!/^\d{6}$/.test(enteredCode)) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const client = getClient();
      const { error: err } = await client.auth.mfa.challengeAndVerify({
        factorId: ed.factorId,
        code: enteredCode
      });
      if (err) {
        setError(
          err.message.includes("invalid")
            ? "Invalid code. Try again."
            : err.message
        );
        return;
      }
      showToast("Two-factor authentication enabled", "success");
      setEnrollData(null);
      setCode("");
      // ONLY flip to "on" after the code is successfully verified.
      await refreshFactors();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function unenroll(factorId: string) {
    setBusy(true);
    setError(null);
    try {
      const client = getClient();
      const { error: err } = await client.auth.mfa.unenroll({ factorId });
      if (err) {
        setError(err.message);
        return;
      }
      showToast("Two-factor authentication disabled", "success");
      await refreshFactors();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function cancelEnrollment() {
    setEnrollData(null);
    setCode("");
    setError(null);
    setStep(factors().length > 0 ? "on" : "off");
  }

  return (
    <div class="settings-2fa">
      <Show when={error()}>
        <div class="settings-error" role="alert">
          {error()}
        </div>
      </Show>

      <Show when={step() === "loading"}>
        <div class="settings-2fa-loading">Checking 2FA status…</div>
      </Show>

      <Show when={step() === "off"}>
        <div class="settings-2fa-off">
          <div class="settings-2fa-status">
            <span
              class="material-symbols-outlined"
              aria-hidden="true"
              style={{ "font-size": "20px", color: "var(--text-soft)" }}
            >
              shield_off
            </span>
            <span>Two-factor authentication is OFF</span>
          </div>
          <p class="settings-2fa-desc">
            Require a 6-digit code from your authenticator app when signing in on a new device.
          </p>
          <button
            type="button"
            class="btn-primary focus-ring"
            onClick={startEnrollment}
            disabled={busy()}
          >
            <Show when={!busy()} fallback="Setting up…">
              Enable 2FA
            </Show>
          </button>
        </div>
      </Show>

      <Show when={step() === "enrolling" && enrollData()}>
        {(ed) => (
          <div class="settings-2fa-enroll">
            <h4 class="settings-2fa-step-title">
              Step 1 — Scan this QR code
            </h4>
            <p class="settings-2fa-desc">
              Open your authenticator app and scan the QR code, or enter the secret manually.
            </p>
            <div class="settings-2fa-qr">
              <img src={ed().qrCode} alt="QR code for 2FA" width={200} height={200} />
            </div>
            <div class="settings-2fa-secret">
              <span class="settings-2fa-secret-label">
                Or enter this code manually:
              </span>
              <code class="settings-2fa-secret-value">{ed().secret}</code>
            </div>

            <h4 class="settings-2fa-step-title" style={{ "margin-top": "var(--sp-4)" }}>
              Step 2 — Enter the 6-digit code
            </h4>
            <p class="settings-2fa-desc">
              Enter the code shown in your authenticator app to verify and enable 2FA.
            </p>
            <input
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              maxlength={6}
              class="settings-2fa-code-input focus-ring"
              placeholder="123456"
              value={code()}
              onInput={(e) =>
                setCode(e.currentTarget.value.replace(/\D/g, ""))
              }
              aria-label="6-digit verification code"
            />
            <div class="settings-2fa-actions">
              <button
                type="button"
                class="btn-primary focus-ring"
                onClick={verifyCode}
                disabled={busy() || code().length !== 6}
              >
                <Show when={!busy()} fallback="Verifying…">
                  Verify &amp; Enable
                </Show>
              </button>
              <button
                type="button"
                class="btn-ghost focus-ring"
                onClick={cancelEnrollment}
                disabled={busy()}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </Show>

      <Show when={step() === "on"}>
        <div class="settings-2fa-on">
          <div class="settings-2fa-status settings-2fa-status-on">
            <span
              class="material-symbols-outlined"
              aria-hidden="true"
              style={{ "font-size": "20px", color: "var(--success, #34c759)" }}
            >
              shield_lock
            </span>
            <span>Two-factor authentication is ON</span>
          </div>
          <p class="settings-2fa-desc">
            Your account is protected with a code from your authenticator app.
          </p>
          {/* Single "Disable 2FA" button per factor. No "Add another" —
              one authenticator is the typical setup, and adding multiple
              just creates confusion. */}
          <For each={factors()}>
            {(f) => (
              <div class="settings-2fa-factor">
                <div class="settings-2fa-factor-info">
                  <span class="settings-2fa-factor-name">
                    {f.friendlyName ?? "Authenticator app"}
                  </span>
                  <span class="settings-2fa-factor-date">
                    Added {new Date(f.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <button
                  type="button"
                  class="btn-ghost settings-2fa-remove focus-ring"
                  onClick={() => unenroll(f.id)}
                  disabled={busy()}
                >
                  Disable 2FA
                </button>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default TwoFactorSetup;
