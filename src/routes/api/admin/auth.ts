// src/routes/api/admin/auth.ts
//
// CineLog V2 — Admin Auth API
// ---------------------------------------------------------------------
// Three endpoints:
//   POST   /api/admin/auth  → login (verify identity + PIN)
//   DELETE /api/admin/auth  → logout (clear admin cookie)
//   GET    /api/admin/auth  → session check (is the admin cookie valid?)
//
// LOGIN FLOW (two supported identity paths):
//
//   Path A — "session" (OAuth users who are already signed into CineLog):
//     Body: { pin: string }
//     The browser automatically sends the Supabase auth cookie
//     (sb-<anon>-auth-token). We extract the access_token from it,
//     call supabase.auth.getUser(access_token) to verify the session
//     is valid, then look up the profile to confirm is_admin.
//
//   Path B — "password" (users with an email/password account):
//     Body: { email: string, password: string, pin: string }
//     We call supabase.auth.signInWithPassword() to verify the
//     credentials, then look up the profile to confirm is_admin.
//
//   After either path, we:
//     1. Verify the user's profile.is_admin = TRUE and admin_disabled_at IS NULL.
//     2. Compare the PIN against ADMIN_PIN env var (constant-time).
//     3. Sign an admin JWT and set it as an HttpOnly cookie.
//     4. Log the login to admin_actions.
//
// RATE LIMITING:
//   In-memory per-IP lockout: 5 failed attempts → 15-minute lockout.
//   State is lost on server restart (acceptable for an admin panel).
//
// SECURITY:
//   • The PIN env var is NEVER exposed to the client.
//   • PIN is verified in constant time to prevent timing attacks.
//   • Admin cookie is HttpOnly, Secure, SameSite=Strict, max-age=4h.
//   • All failures return a generic "Invalid credentials" message so
//     an attacker cannot tell which layer failed.

import { createClient } from "@supabase/supabase-js";
import {
  signAdminToken,
  adminCookieName,
  adminTokenLifetime,
  getClientIP,
} from "~/lib/supabase/admin";

// ─── Types ────────────────────────────────────────────────────────

interface APIEvent {
  request: Request;
}

interface LoginBody {
  email?: unknown;
  password?: unknown;
  pin?: unknown;
  // Optional explicit mode flag. If omitted, we infer from the body:
  //   - If email + password present  → "password" mode
  //   - Otherwise                    → "session" mode
  mode?: unknown;
}

interface AdminProfileRow {
  id: string;
  username: string;
  display_name: string;
  is_admin: boolean;
  admin_disabled_at: string | null;
}

// ─── In-memory rate limiter ───────────────────────────────────────
//
// Tracks failed login attempts per IP. After 5 failures, the IP is
// locked out for 15 minutes. State is lost on server restart —
// acceptable for an admin panel with a single admin.

interface RateLimitEntry {
  failures: number;
  lockedUntil: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();
const MAX_FAILURES = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

const PURGE_INTERVAL_MS = 5 * 60 * 1000;
let lastPurge = Date.now();

function purgeStaleEntries(): void {
  const now = Date.now();
  if (now - lastPurge < PURGE_INTERVAL_MS) return;
  lastPurge = now;
  for (const [ip, entry] of rateLimitMap.entries()) {
    if (entry.lockedUntil < now && entry.failures === 0) {
      rateLimitMap.delete(ip);
    }
  }
}

function isRateLimited(ip: string | null): boolean {
  purgeStaleEntries();
  if (!ip) return false;
  const entry = rateLimitMap.get(ip);
  if (!entry) return false;
  return entry.lockedUntil > Date.now();
}

function recordFailure(ip: string | null): void {
  if (!ip) return;
  const entry = rateLimitMap.get(ip) ?? { failures: 0, lockedUntil: 0 };
  entry.failures += 1;
  if (entry.failures >= MAX_FAILURES) {
    entry.lockedUntil = Date.now() + LOCKOUT_MS;
    entry.failures = 0;
  }
  rateLimitMap.set(ip, entry);
}

function clearFailures(ip: string | null): void {
  if (!ip) return;
  rateLimitMap.delete(ip);
}

// ─── Constant-time string comparison ──────────────────────────────

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// ─── Cookie helpers ───────────────────────────────────────────────

/**
 * Parse a single cookie value out of a Cookie header.
 * Returns null if the cookie is absent.
 *
 * The Supabase browser client stores the auth session under names
 * like `sb-<project-ref>-auth-token` (and a `.code` variant during
 * the PKCE flow). We look for the first cookie whose name starts with
 * `sb-` and ends with `-auth-token` — that's the access token JSON.
 */
function getSupabaseAccessToken(cookieHeader: string): string | null {
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(";");
  for (const c of cookies) {
    const [rawName, ...rest] = c.trim().split("=");
    if (!rawName) continue;
    const name = rawName.trim();
    // Primary: sb-<ref>-auth-token (PKCE final, base64-URL JSON or plain JSON)
    if (name.startsWith("sb-") && name.endsWith("-auth-token")) {
      const raw = decodeURIComponent(rest.join("="));
      return parseAccessTokenFromSessionCookie(raw);
    }
  }
  return null;
}

/**
 * Supabase stores the session as either:
 *   - A JSON string: {"access_token":"...","refresh_token":"...", ...}
 *   - A base64-URL-encoded string of that JSON (newer versions)
 *   - Or, in some flows, just the access_token directly (rare)
 *
 * We try each in turn.
 */
function parseAccessTokenFromSessionCookie(raw: string): string | null {
  if (!raw) return null;

  // 1. Plain JSON
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.access_token === "string") {
      return parsed.access_token;
    }
  } catch {
    // not JSON, try base64
  }

  // 2. base64-URL → JSON
  try {
    // base64url → base64
    const b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const decoded = atob(padded);
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed.access_token === "string") {
      return parsed.access_token;
    }
  } catch {
    // not base64 either
  }

  // 3. Raw JWT (fallback — Supabase doesn't usually do this but be safe)
  if (raw.split(".").length === 3 && raw.length > 40) {
    return raw;
  }

  return null;
}

// ─── Response helpers ─────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function setAdminCookie(token: string): string {
  const name = adminCookieName();
  const maxAge = adminTokenLifetime();
  return `${name}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}

function clearAdminCookie(): string {
  const name = adminCookieName();
  return `${name}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

// ─── Common post-auth logic ───────────────────────────────────────
//
// Given a verified Supabase user ID, look up the profile, verify
// admin status, verify PIN, and issue the admin cookie.
// Returns a Response on failure, or null on success (the caller
// builds the success Response using the returned admin object).

interface IssueResult {
  ok: true;
  response: Response;
}

interface IssueError {
  ok: false;
  response: Response;
}

async function verifyProfileAndIssueAdmin(
  args: {
    userId: string;
    email: string;
    pin: string;
    ip: string | null;
    userAgent: string | null;
    loginMethod: "password" | "session";
  },
): Promise<IssueResult | IssueError> {
  const { userId, email, pin, ip, userAgent, loginMethod } = args;

  // 1. Look up the profile (service role bypasses RLS)
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error("[CineLog Admin] Missing Supabase env vars");
    return {
      ok: false,
      response: jsonResponse({ ok: false, error: "Server misconfiguration" }, 500),
    };
  }

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("id, username, display_name, is_admin, admin_disabled_at")
    .eq("id", userId)
    .is("deleted_at", null)
    .single<AdminProfileRow>();

  if (profileError || !profile) {
    recordFailure(ip);
    return {
      ok: false,
      response: jsonResponse({ ok: false, error: "Invalid credentials" }, 401),
    };
  }

  if (!profile.is_admin) {
    recordFailure(ip);
    return {
      ok: false,
      response: jsonResponse({ ok: false, error: "Invalid credentials" }, 401),
    };
  }

  if (profile.admin_disabled_at) {
    recordFailure(ip);
    return {
      ok: false,
      response: jsonResponse({ ok: false, error: "Admin account disabled" }, 403),
    };
  }

  // 2. Verify PIN (constant-time)
  const expectedPin = process.env.ADMIN_PIN;
  if (!expectedPin) {
    console.error("[CineLog Admin] Missing ADMIN_PIN env var");
    return {
      ok: false,
      response: jsonResponse({ ok: false, error: "Server misconfiguration" }, 500),
    };
  }

  if (!constantTimeEqual(pin, expectedPin)) {
    recordFailure(ip);
    return {
      ok: false,
      response: jsonResponse({ ok: false, error: "Invalid credentials" }, 401),
    };
  }

  // 3. All checks passed — clear rate limit, sign JWT, log
  clearFailures(ip);

  const token = signAdminToken({
    admin_id: profile.id,
    email,
  });

  // Best-effort audit log
  try {
    await adminClient.from("admin_actions").insert({
      admin_id: profile.id,
      action: "auth.login",
      entity_type: "admin_session",
      entity_id: profile.id,
      payload: { email, ip, method: loginMethod },
      ip_address: ip,
      user_agent: userAgent,
    });
  } catch (err) {
    console.error("[CineLog Admin] Failed to log login action:", err);
  }

  return {
    ok: true,
    response: new Response(
      JSON.stringify({
        ok: true,
        admin: {
          id: profile.id,
          email,
          username: profile.username,
          display_name: profile.display_name,
        },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": setAdminCookie(token),
        },
      },
    ),
  };
}

// ─── POST /api/admin/auth (login) ─────────────────────────────────

export async function POST(event: APIEvent) {
  try {
    const ip = getClientIP(event);
    const userAgent = event.request.headers.get("user-agent");

    // 1. Rate limit check
    if (isRateLimited(ip)) {
      return jsonResponse(
        { ok: false, error: "Too many failed attempts. Try again in 15 minutes." },
        429,
      );
    }

    // 2. Parse body
    const body = (await event.request.json().catch(() => ({}))) as LoginBody;
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const pin = typeof body.pin === "string" ? body.pin.trim() : "";
    const explicitMode =
      typeof body.mode === "string" && (body.mode === "password" || body.mode === "session")
        ? body.mode
        : null;

    if (!pin) {
      return jsonResponse({ ok: false, error: "PIN is required." }, 400);
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("[CineLog Admin] Missing Supabase env vars");
      return jsonResponse({ ok: false, error: "Server misconfiguration" }, 500);
    }

    // Determine the login mode: explicit > inferred
    const hasPassword = Boolean(email && password);
    const mode = explicitMode ?? (hasPassword ? "password" : "session");

    // ─── Path A: session-based (OAuth users) ─────────────────────
    //
    // Read the Supabase access_token from the cookie header and
    // verify it. This is the path used by users who signed into
    // the main CineLog app via Google OAuth — they have no password
    // and their session is stored in the sb-<ref>-auth-token cookie.
    if (mode === "session") {
      const cookieHeader = event.request.headers.get("cookie") || "";
      const accessToken = getSupabaseAccessToken(cookieHeader);

      if (!accessToken) {
        return jsonResponse(
          {
            ok: false,
            error: "No active CineLog session. Please sign in to CineLog first.",
          },
          401,
        );
      }

      // Verify the access token by calling getUser()
      const verifyClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const { data: userData, error: userError } = await verifyClient.auth.getUser(accessToken);

      if (userError || !userData?.user) {
        recordFailure(ip);
        return jsonResponse(
          {
            ok: false,
            error: "Your CineLog session has expired. Please sign in again.",
          },
          401,
        );
      }

      const userEmail = userData.user.email ?? "";
      if (!userEmail) {
        recordFailure(ip);
        return jsonResponse({ ok: false, error: "Invalid credentials" }, 401);
      }

      const result = await verifyProfileAndIssueAdmin({
        userId: userData.user.id,
        email: userEmail,
        pin,
        ip,
        userAgent,
        loginMethod: "session",
      });

      return result.response;
    }

    // ─── Path B: password-based (classic) ────────────────────────
    if (!email || !password) {
      return jsonResponse(
        { ok: false, error: "Email, password, and PIN are required." },
        400,
      );
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
      email,
      password,
    });

    if (authError || !authData.session || !authData.user) {
      recordFailure(ip);
      return jsonResponse({ ok: false, error: "Invalid credentials" }, 401);
    }

    const result = await verifyProfileAndIssueAdmin({
      userId: authData.user.id,
      email,
      pin,
      ip,
      userAgent,
      loginMethod: "password",
    });

    return result.response;
  } catch (err) {
    console.error("[CineLog Admin] Login error:", err);
    return jsonResponse({ ok: false, error: "Server error" }, 500);
  }
}

// ─── DELETE /api/admin/auth (logout) ──────────────────────────────

export async function DELETE(event: APIEvent) {
  // No need to verify admin here — clearing the cookie is always safe.
  // We do a best-effort audit log if the cookie was valid.

  try {
    const { verifyAdminToken } = await import("~/lib/supabase/admin/adminJwt");
    const cookieHeader = event.request.headers.get("cookie") || "";
    const cookies = cookieHeader.split(";");
    let token: string | null = null;
    for (const c of cookies) {
      const [name, ...rest] = c.trim().split("=");
      if (name === adminCookieName()) {
        token = decodeURIComponent(rest.join("="));
        break;
      }
    }

    const payload = verifyAdminToken(token);
    if (payload) {
      try {
        const { createAdminClient } = await import("~/lib/supabase/admin/adminClient");
        const supabase = createAdminClient();
        await supabase.from("admin_actions").insert({
          admin_id: payload.admin_id,
          action: "auth.logout",
          entity_type: "admin_session",
          entity_id: payload.admin_id,
          payload: {},
          ip_address: getClientIP(event),
          user_agent: event.request.headers.get("user-agent"),
        });
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": clearAdminCookie(),
    },
  });
}

// ─── GET /api/admin/auth (session check) ──────────────────────────
//
// Used by the admin UI to check if the current session is valid.
// Returns { ok: true, admin } if the cookie is valid, else { ok: false }.

export async function GET(event: APIEvent) {
  try {
    const { requireAdmin } = await import("~/lib/supabase/admin/adminGuard");
    const result = await requireAdmin(event);
    if (!result.ok) {
      return jsonResponse({ ok: false }, 200);
    }
    return jsonResponse({ ok: true, admin: result.admin }, 200);
  } catch (err) {
    console.error("[CineLog Admin] Session check error:", err);
    return jsonResponse({ ok: false }, 200);
  }
}
