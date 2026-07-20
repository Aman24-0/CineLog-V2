// src/routes/api/admin/auth.ts
//
// CineLog V2 — Admin Auth API
// ---------------------------------------------------------------------
// Two endpoints:
//   POST /api/admin/auth  → login (verify email + password + PIN)
//   DELETE /api/admin/auth → logout (clear admin cookie)
//
// LOGIN FLOW:
//   1. Client sends { email, password, pin }.
//   2. We verify email + password via Supabase Auth (anon key).
//   3. On success, we look up the user's profile with the service
//      role client and check `is_admin = TRUE` and `admin_disabled_at IS NULL`.
//   4. We compare the PIN against ADMIN_PIN env var (constant-time).
//   5. On all-three-pass, we sign an admin JWT and set it as an
//      HttpOnly cookie. Return { ok: true, admin: { ... } }.
//   6. On any failure, return 401 with a generic "Invalid credentials"
//      message (do NOT reveal which layer failed).
//
// RATE LIMITING:
//   In-memory per-IP lockout: 5 failed attempts → 15-minute lockout.
//   State is lost on server restart (acceptable for an admin panel).
//
// SECURITY:
//   • Password is verified by Supabase Auth (never touched by us).
//   • PIN is verified in constant time to prevent timing attacks.
//   • Admin cookie is HttpOnly, Secure, SameSite=Strict, max-age=4h.
//   • The PIN env var is NEVER exposed to the client.

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
//
// On Vercel serverless, this state is per-instance (each Lambda
// container has its own state). A determined attacker could rotate
// across containers to bypass this, but the underlying 3-layer auth
// (Supabase password + is_admin flag + PIN) still protects the app.

interface RateLimitEntry {
  failures: number;
  lockedUntil: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();
const MAX_FAILURES = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

// Periodically purge stale entries (every 5 minutes)
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
    entry.failures = 0; // reset so the lockout window is fixed
  }
  rateLimitMap.set(ip, entry);
}

function clearFailures(ip: string | null): void {
  if (!ip) return;
  rateLimitMap.delete(ip);
}

// ─── Constant-time string comparison ──────────────────────────────
//
// Prevents timing attacks on PIN verification.

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// ─── Helpers ──────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function setAdminCookie(token: string): string {
  const name = adminCookieName();
  const maxAge = adminTokenLifetime();
  // HttpOnly: not accessible via JS
  // Secure: only sent over HTTPS (Vercel is always HTTPS)
  // SameSite=Strict: not sent on cross-site requests
  // Path=/: available to all /admin/* routes
  return `${name}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}

function clearAdminCookie(): string {
  const name = adminCookieName();
  return `${name}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

// ─── POST /api/admin/auth (login) ─────────────────────────────────

export async function POST(event: APIEvent) {
  try {
    const ip = getClientIP(event);

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

    if (!email || !password || !pin) {
      return jsonResponse({ ok: false, error: "Email, password, and PIN are required." }, 400);
    }

    // 3. Verify email + password via Supabase Auth (anon key)
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("[CineLog Admin] Missing Supabase env vars");
      return jsonResponse({ ok: false, error: "Server misconfiguration" }, 500);
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
      email,
      password,
    });

    if (authError || !authData.session) {
      recordFailure(ip);
      // Always return the same generic error to avoid leaking which check failed
      return jsonResponse({ ok: false, error: "Invalid credentials" }, 401);
    }

    // 4. Look up the profile and check admin status (service role, bypasses RLS)
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      console.error("[CineLog Admin] Missing SUPABASE_SERVICE_ROLE_KEY");
      return jsonResponse({ ok: false, error: "Server misconfiguration" }, 500);
    }

    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const userId = authData.user?.id;
    if (!userId) {
      recordFailure(ip);
      return jsonResponse({ ok: false, error: "Invalid credentials" }, 401);
    }

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("id, username, display_name, is_admin, admin_disabled_at")
      .eq("id", userId)
      .is("deleted_at", null)
      .single<AdminProfileRow>();

    if (profileError || !profile) {
      recordFailure(ip);
      return jsonResponse({ ok: false, error: "Invalid credentials" }, 401);
    }

    if (!profile.is_admin) {
      recordFailure(ip);
      return jsonResponse({ ok: false, error: "Invalid credentials" }, 401);
    }

    if (profile.admin_disabled_at) {
      recordFailure(ip);
      return jsonResponse({ ok: false, error: "Admin account disabled" }, 403);
    }

    // 5. Verify PIN (constant-time comparison against env var)
    const expectedPin = process.env.ADMIN_PIN;
    if (!expectedPin) {
      console.error("[CineLog Admin] Missing ADMIN_PIN env var");
      return jsonResponse({ ok: false, error: "Server misconfiguration" }, 500);
    }

    if (!constantTimeEqual(pin, expectedPin)) {
      recordFailure(ip);
      return jsonResponse({ ok: false, error: "Invalid credentials" }, 401);
    }

    // 6. All three layers passed — sign admin JWT and set cookie
    clearFailures(ip);

    const token = signAdminToken({
      admin_id: profile.id,
      email,
    });

    // 7. Log the successful login to the audit trail
    try {
      await adminClient.from("admin_actions").insert({
        admin_id: profile.id,
        action: "auth.login",
        entity_type: "admin_session",
        entity_id: profile.id,
        payload: { email, ip },
        ip_address: ip,
        user_agent: event.request.headers.get("user-agent"),
      });
    } catch (err) {
      console.error("[CineLog Admin] Failed to log login action:", err);
    }

    // 8. Sign out the Supabase session — we don't need it for admin
    //    routes (we use the admin JWT cookie instead). This also
    //    means the admin can sign in to the regular app separately.
    //
    //    Note: We don't sign out because Supabase Auth sessions are
    //    browser-side state, not server-side. The admin client we
    //    created here is stateless. So there's nothing to sign out.
    //    The browser may still have a Supabase session — that's fine.

    return new Response(
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
    );
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
      // Best-effort audit log
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
