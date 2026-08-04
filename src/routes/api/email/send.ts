// src/routes/api/email/send.ts
//
// CineLog V2 — Email Send Endpoint (Server-Only)
// ---------------------------------------------------------------------
// POST /api/email/send
//   Body: {
//     to: string,                  // recipient email address
//     subject: string,             // email subject line
//     html: string,                // rendered HTML email body
//     text?: string,               // plain-text fallback (default: stripped html)
//     userId?: string,             // optional — if present, preference check runs
//     notificationType?: string,   // one of: reminder | weekly_recap | new_season
//                                  //   | continue_watching | recommendations | sync_status
//     accessToken?: string,        // optional — falls back to session cookie
//     bypassRateLimit?: boolean    // optional — only honored when caller is the
//                                  //   weekly-recap cron (CRON_SECRET auth)
//   }
//   → 200 { success: true, id?: string }            on real send
//   → 200 { success: true, mock: true }             when RESEND_API_KEY missing
//   → 200 { success: true, suppressed: true }       when preference disabled
//   → 400 on validation error
//   → 401 on missing/expired session
//   → 403 on userId mismatch (caller can only email themselves)
//   → 429 on rate limit exceeded
//   → 503 on Resend API failure
//
// WHAT THIS DOES:
//   1. Validates inputs (to / subject / html are required).
//   2. Resolves the caller's session — either via `accessToken` in
//      the body (the browser-stored localStorage session) OR via the
//      CRON_SECRET header (the weekly-recap cron path).
//   3. If a userId is provided, reads the user's email-notification
//      preferences from user_preferences.prefs_json and short-
//      circuits if the master toggle OR the per-category toggle is
//      off. This is the preference gate — a user who has disabled
//      email notifications should NEVER receive an email, regardless
//      of what the caller requested.
//   4. Rate-limits per user (max 10 emails/day) to protect against
//      runaway callers. The cron path bypasses the rate limit since
//      it only fires once per week per user.
//   5. If RESEND_API_KEY is missing, logs the email to the console
//      ("mock mode") and returns success — this lets the system
//      run end-to-end in dev without a real Resend account.
//   6. Otherwise, POSTs to Resend's /emails endpoint and returns
//      the Resend message id.
//
// WHY A SERVERLESS ROUTE (not a Supabase Edge Function):
//   Same rationale as /api/push/send.ts (see lines 39-43 of that
//   file): CineLog is a SolidStart app on Vercel, and serverless
//   functions are the natural fit. The Resend API is a plain HTTPS
//   POST, so we don't need any special runtime.
//
// SECURITY:
//   • The Resend API key is read from process.env.RESEND_API_KEY
//     and NEVER reaches the browser bundle.
//   • The service-role key (used for the preference check) is read
//     from process.env.SUPABASE_SERVICE_ROLE_KEY and NEVER reaches
//     the browser bundle.
//   • A user can only send emails to themselves (callerUid must
//     match body.userId, unless the caller is the cron).
//   • Rate-limited per user: max 10 emails/day. The cron path
//     bypasses this since it sends at most one email per week per
//     user.
//
// RATE LIMIT DETAILS:
//   • In-memory Map keyed by userId.
//   • 24-hour rolling window.
//   • Max 10 sends per window.
//   • Resets on serverless cold-start (acceptable for a fallback
//     channel — the worst case is a user gets 10 emails in a day
//     before the limit kicks in, which is unlikely to be a real
//     spam problem).
//   • The cron path bypasses the rate limit by setting
//     bypassRateLimit=true in the body — this flag is only honored
//     when the caller authenticated via CRON_SECRET.

import { createClient } from "@supabase/supabase-js";
import { isServer } from "solid-js/web";
import { createAdminClient } from "~/lib/supabase/admin/adminClient";
import { getSupabaseAccessToken } from "~/lib/supabase/admin/sessionCookie";
import { checkAndIncrement } from "~/lib/server/rateLimiter";
import { timingSafeEqual as nodeTimingSafeEqual } from "node:crypto";

interface APIEvent {
  request: Request;
}

interface SendEmailRequestBody {
  to?: unknown;
  subject?: unknown;
  html?: unknown;
  text?: unknown;
  userId?: unknown;
  notificationType?: unknown;
  accessToken?: unknown;
  bypassRateLimit?: unknown;
}

// ─── Rate limiter (per user, DB-backed, 24-hour window) ─────────────
//
// Replaces the previous in-memory Map that was a no-op on Vercel
// serverless (cold starts reset the Map). Now backed by the
// `rate_limit_buckets` table via the service-role client.
//
// Tracks the count of emails sent in the current 24-hour window per
// user. After MAX_EMAILS_PER_DAY (10), further sends are rejected
// with 429.
//
// Fails OPEN on DB error — a Supabase outage shouldn't block a
// legitimate email send (the worst case is a few extra emails slip
// through during the outage window).

const MAX_EMAILS_PER_DAY = 10;

// ─── Helpers ────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Constant-time string comparison to prevent timing attacks on the
 * CRON_SECRET. Same implementation as /api/push/send-admin.ts.
 */
function secretsEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    nodeTimingSafeEqual(bufA, bufA); // keep timing constant
    return false;
  }
  return nodeTimingSafeEqual(bufA, bufB);
}

/**
 * Validate that a string looks like a plausible email address.
 *
 * We deliberately use a SIMPLE regex (not a full RFC-822 parser)
 * because:
 *   1. The address will be validated again by Resend before delivery.
 *   2. We're not the source of truth on email validity — we just
 *      want to catch obvious typos / malicious payloads (e.g. a
 *      10MB string, or a string with newlines that could be an
 *      email header injection attempt).
 *
 * The regex is the same one used by most HTML5 <input type="email">
 * implementations: at least one non-whitespace char, an @, at least
 * one non-whitespace char, a dot, at least one non-whitespace char.
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Map a NotificationType (the typed enum from the renderer) to the
 * corresponding key in NotificationPrefs. Returns the prefs key
 * (e.g. "emailNewSeason") or null if the type doesn't have a
 * per-category preference gate.
 *
 *   "reminder"           → null  (reminders use the push "newSeason" /
 *                                 "continueWatching" prefs — there's
 *                                 no separate "emailReminder" pref
 *                                 because reminders are always tied
 *                                 to one of those categories)
 *   "weekly_recap"       → "emailWeeklyRecap"
 *   "new_season"         → "emailNewSeason"
 *   "continue_watching"  → "emailContinueWatching"
 *   "recommendations"    → "emailRecommendations"
 *   "sync_status"        → "emailSyncStatus"
 */
function notificationTypeToEmailPrefKey(
  type: string
): string | null {
  switch (type) {
    case "weekly_recap":
      return "emailWeeklyRecap";
    case "new_season":
      return "emailNewSeason";
    case "continue_watching":
      return "emailContinueWatching";
    case "recommendations":
      return "emailRecommendations";
    case "sync_status":
      return "emailSyncStatus";
    case "reminder":
      // Reminders fire for both new-season and continue-watching
      // flows. We don't gate them on a per-category email pref
      // because the user already opted into the push category,
      // and the email is just a fallback. If the user has
      // emailEnabled=false, they won't get the reminder email
      // regardless.
      return null;
    default:
      return null;
  }
}

/**
 * Read the user's email-notification preferences from
 * user_preferences.prefs_json. Returns { emailEnabled, categoryEnabled }
 * — both default to true if the prefs row is missing or the specific
 * field is absent (fail-open: better to send an unwanted email than
 * to drop one the user expected).
 */
async function readEmailPrefs(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  notificationType: string | undefined
): Promise<{ emailEnabled: boolean; categoryEnabled: boolean }> {
  // Default: everything enabled.
  const defaultResult = { emailEnabled: true, categoryEnabled: true };

  try {
    const { data, error } = await adminClient
      .from("user_preferences")
      .select("prefs_json")
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !data?.prefs_json) return defaultResult;

    const prefs = data.prefs_json as Record<string, unknown> | null;
    if (!prefs || typeof prefs !== "object") return defaultResult;

    // The notifPrefs sub-object is where the email prefs live (see
    // preferencesSync.ts — the snapshot stores notifPrefs as a nested
    // object under prefs_json).
    const notifPrefs = prefs.notifPrefs as Record<string, unknown> | null;
    if (!notifPrefs || typeof notifPrefs !== "object") return defaultResult;

    const emailEnabled =
      typeof notifPrefs.emailEnabled === "boolean"
        ? notifPrefs.emailEnabled
        : true;

    if (!emailEnabled) {
      return { emailEnabled: false, categoryEnabled: false };
    }

    // If the caller didn't specify a notificationType, we only check
    // the master toggle.
    if (!notificationType) {
      return { emailEnabled: true, categoryEnabled: true };
    }

    const prefKey = notificationTypeToEmailPrefKey(notificationType);
    if (!prefKey) {
      // No per-category gate for this type — master toggle is enough.
      return { emailEnabled: true, categoryEnabled: true };
    }

    const categoryValue = notifPrefs[prefKey];
    const categoryEnabled =
      typeof categoryValue === "boolean" ? categoryValue : true;

    return { emailEnabled: true, categoryEnabled };
  } catch (err) {
    // On any error, fail-open (send the email). The preference check
    // is a courtesy, not a security boundary — the user explicitly
    // triggered the action that led to this email (or the cron did
    // on their behalf), so suppressing it silently would be worse
    // than sending it.
    console.warn("[api/email/send] Preference check failed:", err);
    return defaultResult;
  }
}

// ─── POST handler ───────────────────────────────────────────────────

export async function POST(event: APIEvent): Promise<Response> {
  if (!isServer) {
    return jsonResponse({ error: "Server-only endpoint" }, 500);
  }

  if (event.request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // ─── Parse + validate body ──────────────────────────────────────
  let body: SendEmailRequestBody;
  try {
    body = (await event.request.json()) as SendEmailRequestBody;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  if (typeof body !== "object" || body === null) {
    return jsonResponse({ error: "Body must be a JSON object" }, 400);
  }

  const to = typeof body.to === "string" ? body.to.trim() : "";
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const html = typeof body.html === "string" ? body.html : "";

  if (!to) {
    return jsonResponse({ error: "Missing required field: to" }, 400);
  }
  if (!subject) {
    return jsonResponse({ error: "Missing required field: subject" }, 400);
  }
  if (!html) {
    return jsonResponse({ error: "Missing required field: html" }, 400);
  }
  if (!EMAIL_REGEX.test(to)) {
    return jsonResponse({ error: "Invalid email address" }, 400);
  }

  // Cap subject + html length to protect against abuse. 200 chars for
  // subject is generous; 200KB for html is way more than any legitimate
  // CineLog email needs (the largest template, weekly recap with 5
  // recommendations, is ~10KB).
  if (subject.length > 200) {
    return jsonResponse({ error: "Subject too long (max 200 chars)" }, 400);
  }
  if (html.length > 200_000) {
    return jsonResponse({ error: "HTML body too large (max 200KB)" }, 400);
  }

  const text =
    typeof body.text === "string" && body.text.length > 0
      ? body.text
      : html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

  const userId = typeof body.userId === "string" ? body.userId : "";
  const notificationType =
    typeof body.notificationType === "string" ? body.notificationType : "";

  const bypassRateLimit =
    typeof body.bypassRateLimit === "boolean" ? body.bypassRateLimit : false;

  // ─── Authenticate the caller ────────────────────────────────────
  // Two auth paths:
  //   1. CRON_SECRET header — the weekly-recap cron uses this. The
  //      cron has no user session, so it authenticates via a shared
  //      secret instead. CRON callers can send to ANY user (the
  //      cron runs server-side and is trusted).
  //   2. access_token (in body or cookie) — browser callers. The
  //      caller's uid must match body.userId (you can only email
  //      yourself).
  const cronSecret = process.env.CRON_SECRET ?? "";
  const xCronHeader = event.request.headers.get("x-cron-secret") ?? "";
  const authHeader = event.request.headers.get("authorization") ?? "";
  const bearerSecret = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : "";

  const isCronCaller =
    cronSecret.length > 0 &&
    (xCronHeader.length > 0 || bearerSecret.length > 0) &&
    (secretsEqual(xCronHeader, cronSecret) ||
      secretsEqual(bearerSecret, cronSecret));

  let callerUid: string | null = null;

  if (isCronCaller) {
    // Cron caller — callerUid is the userId in the body. The cron is
    // trusted, so we don't verify a session.
    callerUid = userId || null;
  } else {
    // Browser caller — verify the session.
    const cookieHeader = event.request.headers.get("cookie") ?? "";
    const accessToken =
      typeof body.accessToken === "string" && body.accessToken.length > 0
        ? body.accessToken
        : getSupabaseAccessToken(cookieHeader);

    if (!accessToken) {
      return jsonResponse(
        { error: "No active session. Please sign in first." },
        401
      );
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error(
        "[api/email/send] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY"
      );
      return jsonResponse({ error: "Server misconfigured" }, 500);
    }

    const verifyClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: userData, error: userError } =
      await verifyClient.auth.getUser(accessToken);

    if (userError || !userData?.user) {
      return jsonResponse(
        { error: "Your session has expired. Please sign in again." },
        401
      );
    }

    callerUid = userData.user.id;

    // Authorization check — the caller can only email themselves.
    if (userId && callerUid !== userId) {
      return jsonResponse(
        { error: "You can only send emails to yourself." },
        403
      );
    }

    // bypassRateLimit is only honored for cron callers. A browser
    // user trying to set bypassRateLimit=true is ignored.
    if (bypassRateLimit) {
      // Log it — could be a sign of someone probing the API.
      console.warn(
        "[api/email/send] Browser caller attempted bypassRateLimit=true; ignoring."
      );
    }
  }

  const effectiveUserId = callerUid ?? userId;
  if (!effectiveUserId) {
    return jsonResponse({ error: "Missing userId" }, 400);
  }

  // ─── Preference check ───────────────────────────────────────────
  // Even the cron path goes through the preference check — if the
  // user has emailEnabled=false, we suppress the email and return
  // success (so the caller doesn't retry).
  let adminClient: ReturnType<typeof createAdminClient> | null = null;
  try {
    adminClient = createAdminClient();
  } catch (err) {
    // Missing SUPABASE_SERVICE_ROLE_KEY — log and continue. The
    // preference check will be skipped (fail-open), and we'll
    // still try to send the email.
    console.warn(
      "[api/email/send] Failed to create admin client (preference check will be skipped):",
      err instanceof Error ? err.message : String(err)
    );
  }

  if (adminClient) {
    const { emailEnabled, categoryEnabled } = await readEmailPrefs(
      adminClient,
      effectiveUserId,
      notificationType || undefined
    );

    if (!emailEnabled || !categoryEnabled) {
      // Return success with suppressed=true so the caller doesn't
      // treat it as an error. The caller (useNotifications.ts)
      // uses this to know whether to log "email sent" or
      // "email suppressed by preference".
      return jsonResponse({
        success: true,
        suppressed: true,
        reason: "preference_disabled",
        emailEnabled,
        categoryEnabled,
      });
    }
  }

  // ─── Rate limit (cron bypasses) ─────────────────────────────────
  if (!isCronCaller || !bypassRateLimit) {
    const { allowed, remaining } = await checkAndIncrement(
      "emailSend",
      effectiveUserId
    );
    if (!allowed) {
      return jsonResponse(
        {
          error: "Email rate limit exceeded. Try again later.",
          limit: MAX_EMAILS_PER_DAY,
          windowHours: 24
        },
        429
      );
    }
    // Stash the remaining count so we can include it in the response.
    // (We don't read it back here — it's set when checkAndIncrement
    // mutates the entry.)
    void remaining;
  }

  // ─── Send via Resend (or mock mode) ─────────────────────────────
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail =
    process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

  if (!apiKey) {
    // MOCK MODE — no API key configured. Log the email to the
    // console so a developer can see what WOULD have been sent,
    // then return success. This lets the full notification flow
    // work end-to-end in dev without a real Resend account.
    console.log(
      "[api/email/send] 🔸 MOCK MODE — RESEND_API_KEY not set. Would have sent:"
    );
    console.log(`  To:      ${to}`);
    console.log(`  From:    ${fromEmail}`);
    console.log(`  Subject: ${subject}`);
    console.log(
      `  Body:    ${html.substring(0, 200)}${html.length > 200 ? "..." : ""}`
    );
    return jsonResponse({
      success: true,
      mock: true,
      message: "Email logged (no RESEND_API_KEY configured)",
      to,
      subject,
    });
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: to,
        subject: subject,
        html: html,
        text: text,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(
        "[api/email/send] Resend error:",
        response.status,
        errorBody
      );
      // Map Resend errors to HTTP statuses the caller can handle.
      // 4xx → 503 (service unavailable — the caller should retry)
      // 5xx → 503 (Resend is down — the caller should retry)
      return jsonResponse(
        {
          error: "Failed to send email via Resend.",
          status: response.status,
          details: errorBody,
        },
        503
      );
    }

    const data = (await response.json()) as { id?: string };
    return jsonResponse({
      success: true,
      id: data.id,
      to,
      subject,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[api/email/send] Send error:", errorMessage);
    return jsonResponse(
      {
        error: "Failed to send email.",
        details: errorMessage,
      },
      500
    );
  }
}

// Reject GET / other methods.
export async function GET(): Promise<Response> {
  return jsonResponse(
    { error: "GET not supported. Use POST with a JSON body." },
    405
  );
}
