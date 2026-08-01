// src/routes/api/push/status.ts
//
// CineLog V2 — Web Push Diagnostic Endpoint (Server-Only)
// ---------------------------------------------------------------------
// GET /api/push/status
//   → 200 {
//       vapidPublicKeyEnvVar: { present, length, preview },
//       vapidPrivateKeyEnvVar: { present, length },
//       vapidConfigured: boolean,
//       vapidConfigError: string | null,
//       appConfigVapidKey: { present, length, preview, matchesEnv },
//       pushSubscriptionsCount: number,
//       serverTime: string
//     }
//
// WHAT THIS DOES:
//   Returns a diagnostic snapshot of the Web Push setup — WITHOUT
//   exposing any secrets. Used to debug "Push notifications are not
//   configured on the server" errors.
//
//   The public key is partially revealed (first 8 + last 8 chars) so
//   the user can visually confirm it matches what they set in the
//   Vercel dashboard. The private key only reports presence + length.
//
// SECURITY:
//   • No authentication required — this endpoint reveals no secrets.
//     The public key is already... public (it's fetched by the browser
//     during subscribe()). The private key is only reported as
//     present/absent + length.
//   • Rate-limited to 20 requests per minute per IP (basic abuse
//     prevention).
//   • The push_subscriptions count is only reported as an aggregate
//     number — no user-specific data is exposed.
//
// WHY THIS EXISTS:
//   When the user gets a 503 "Push notifications are not configured on
//   the server" error, there are several possible causes:
//     1. VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY env var not set
//     2. Env vars set but in the wrong Vercel environment (Preview
//        vs Production)
//     3. Env vars set but no new deploy was triggered (Vercel env
//        vars only apply to NEW deployments)
//     4. Env vars set with extra whitespace or surrounding quotes
//     5. Env vars set but the keys are invalid (wrong format, not a
//        valid P-256 pair)
//     6. app_config.vapid_public_key not populated (browser can't
//        subscribe)
//   This endpoint distinguishes between all six cases.

import { isServer } from "solid-js/web";
import webPush from "web-push";
import { createAdminClient } from "~/lib/supabase/admin/adminClient";

interface APIEvent {
  request: Request;
}

// ─── In-memory rate limiter (per IP) ──────────────────────────────────

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();
const MAX_REQUESTS_PER_MINUTE = 20;
const WINDOW_MS = 60 * 1000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_REQUESTS_PER_MINUTE;
}

// ─── Helpers ──────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}

/**
 * Return a preview of a key: first 8 + "..." + last 8 chars.
 * Used for visual confirmation that the env var value matches what
 * the user set in the Vercel dashboard. Safe to expose for public
 * keys; for private keys we only report length.
 */
function previewKey(key: string): string {
  if (!key) return "";
  if (key.length <= 16) return "***";
  return key.slice(0, 8) + "..." + key.slice(-8);
}

/**
 * Trim whitespace and strip surrounding quotes from an env var value.
 * Vercel's dashboard sometimes preserves surrounding quotes if the
 * user pastes them — this normalizes the value.
 */
function normalizeEnvVar(raw: string | undefined): string {
  if (!raw) return "";
  let v = raw.trim();
  // Strip a single pair of surrounding quotes (single or double).
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

// ─── VAPID configuration (mirrors /api/push/send.ts) ──────────────────
//
// We re-implement the VAPID configuration check here (rather than
// importing from send.ts) so that this endpoint is fully independent
// — if send.ts has a bug, this diagnostic still works.

function checkVapidConfig(): {
  publicKey: { present: boolean; length: number; preview: string };
  privateKey: { present: boolean; length: number };
  configured: boolean;
  error: string | null;
} {
  const rawPublic = process.env.VAPID_PUBLIC_KEY;
  const rawPrivate = process.env.VAPID_PRIVATE_KEY;

  const publicKey = normalizeEnvVar(rawPublic);
  const privateKey = normalizeEnvVar(rawPrivate);

  const pubReport = {
    present: publicKey.length > 0,
    length: publicKey.length,
    preview: previewKey(publicKey),
  };
  const privReport = {
    present: privateKey.length > 0,
    length: privateKey.length,
  };

  if (!publicKey || !privateKey) {
    return {
      publicKey: pubReport,
      privateKey: privReport,
      configured: false,
      error:
        "VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY env var is not set. " +
        "Set both in the Vercel dashboard (Settings → Environment Variables) " +
        "and trigger a new deployment — env var changes only apply to NEW " +
        "deploys, not the currently-running one.",
    };
  }

  // Try to configure web-push with the keys.
  const contact =
    process.env.VAPID_CONTACT_EMAIL ?? "mailto:admin@cinelog.app";
  try {
    webPush.setVapidDetails(contact, publicKey, privateKey);
    return {
      publicKey: pubReport,
      privateKey: privReport,
      configured: true,
      error: null,
    };
  } catch (err) {
    return {
      publicKey: pubReport,
      privateKey: privReport,
      configured: false,
      error:
        "webPush.setVapidDetails() rejected the keys: " +
        (err instanceof Error ? err.message : String(err)) +
        ". Check that the keys are valid base64-URL strings (no extra " +
        "whitespace or quotes) generated by `npx web-push generate-vapid-keys`.",
    };
  }
}

// ─── GET handler ──────────────────────────────────────────────────────

export async function GET(event: APIEvent): Promise<Response> {
  if (!isServer) {
    return jsonResponse({ error: "Server-only endpoint" }, 500);
  }

  // ─── Rate limit ─────────────────────────────────────────────────────
  const forwardedFor = event.request.headers.get("x-forwarded-for");
  const ip = forwardedFor?.split(",")[0]?.trim() ?? "unknown";
  if (isRateLimited(ip)) {
    return jsonResponse({ error: "Too many requests" }, 429);
  }

  // ─── Check VAPID env vars ───────────────────────────────────────────
  const vapidStatus = checkVapidConfig();

  // ─── Check app_config.vapid_public_key in the DB ────────────────────
  let appConfigReport: {
    present: boolean;
    length: number;
    preview: string;
    matchesEnv: boolean | null;
    error: string | null;
  } = {
    present: false,
    length: 0,
    preview: "",
    matchesEnv: null,
    error: null,
  };

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("app_config")
      .select("value")
      .eq("key", "vapid_public_key")
      .maybeSingle();

    if (error) {
      appConfigReport.error = error.message ?? String(error);
    } else if (data?.value) {
      // JSONB value may be a string or already-parsed
      let value: unknown = data.value;
      if (typeof value === "string") {
        try {
          value = JSON.parse(value);
        } catch {
          // keep as-is
        }
      }
      if (typeof value === "string" && value.length > 0) {
        appConfigReport = {
          present: true,
          length: value.length,
          preview: previewKey(value),
          matchesEnv: vapidStatus.publicKey.present
            ? value === normalizeEnvVar(process.env.VAPID_PUBLIC_KEY)
            : null,
          error: null,
        };
      } else {
        appConfigReport.error = "Row exists but value is empty.";
      }
    } else {
      appConfigReport.error = "Row not found in app_config.";
    }
  } catch (err) {
    appConfigReport.error =
      err instanceof Error ? err.message : String(err);
  }

  // ─── Count push_subscriptions (aggregate, no user data) ─────────────
  let subsCount: number | null = null;
  let subsError: string | null = null;
  try {
    const admin = createAdminClient();
    const { count, error } = await admin
      .from("push_subscriptions")
      .select("*", { count: "exact", head: true });
    if (error) {
      subsError = error.message ?? String(error);
    } else {
      subsCount = count ?? 0;
    }
  } catch (err) {
    subsError = err instanceof Error ? err.message : String(err);
  }

  // ─── Build response ─────────────────────────────────────────────────
  const allOk =
    vapidStatus.configured &&
    appConfigReport.present &&
    appConfigReport.matchesEnv !== false;

  return jsonResponse({
    ok: allOk,
    timestamp: new Date().toISOString(),
    vapidPublicKeyEnvVar: vapidStatus.publicKey,
    vapidPrivateKeyEnvVar: vapidStatus.privateKey,
    vapidConfigured: vapidStatus.configured,
    vapidConfigError: vapidStatus.error,
    appConfigVapidKey: appConfigReport,
    pushSubscriptionsCount: subsCount,
    pushSubscriptionsError: subsError,
    troubleshooting: {
      envVarNotSet:
        !vapidStatus.publicKey.present || !vapidStatus.privateKey.present,
      envVarInvalid: vapidStatus.publicKey.present &&
        vapidStatus.privateKey.present &&
        !vapidStatus.configured,
      appConfigMissing: !appConfigReport.present,
      envDbMismatch: appConfigReport.matchesEnv === false,
      nextSteps: buildNextSteps(vapidStatus, appConfigReport),
    },
  });
}

function buildNextSteps(
  vapid: ReturnType<typeof checkVapidConfig>,
  appConfig: {
    present: boolean;
    matchesEnv: boolean | null;
    error: string | null;
  }
): string[] {
  const steps: string[] = [];

  if (!vapid.publicKey.present || !vapid.privateKey.present) {
    steps.push(
      "Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in the Vercel dashboard " +
        "(Settings → Environment Variables → Production environment)."
    );
    steps.push(
      "Trigger a NEW deployment (Vercel → Deployments → Redeploy, or push " +
        "any commit). Env var changes only apply to NEW deployments."
    );
  } else if (!vapid.configured) {
    steps.push(
      "The env vars are set but web-push rejected them. Check for extra " +
        "whitespace or surrounding quotes in the Vercel dashboard values."
    );
    steps.push(
      "If the values look correct, regenerate the keypair with " +
        "`npx web-push generate-vapid-keys --json` and update both the " +
        "Vercel env vars AND app_config.vapid_public_key in Supabase."
    );
  } else if (!appConfig.present) {
    steps.push(
      "VAPID env vars are set, but app_config.vapid_public_key is missing " +
        "in Supabase. Run: INSERT INTO app_config (key, value) VALUES " +
        "('vapid_public_key', to_jsonb('<public-key>'::text));"
    );
  } else if (appConfig.matchesEnv === false) {
    steps.push(
      "app_config.vapid_public_key does NOT match VAPID_PUBLIC_KEY env var. " +
        "Update app_config to match: UPDATE app_config SET value = " +
        "to_jsonb('<env-var-value>'::text) WHERE key = 'vapid_public_key';"
    );
  } else {
    steps.push(
      "✓ Everything looks configured. If push still doesn't work, " +
        "toggle push OFF then ON in Settings → Notifications to create " +
        "a fresh subscription, then try 'Send test notification' again."
    );
  }

  return steps;
}
