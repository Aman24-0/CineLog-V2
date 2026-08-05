// src/routes/api/admin/services/status.ts
//
// CineLog V2 — Admin Service Health API (Phase 9 Chunk 2)
// ---------------------------------------------------------------------
// GET /api/admin/services/status
//   → 200 {
//       services: [
//         { service: "Supabase", status: "ok"|"degraded"|"down"|"unknown",
//           latency_ms: number|null, detail?: string },
//         ...
//       ],
//       fetched_at: string
//     }
//
// WHAT THIS DOES:
//   Runs a lightweight health probe against each external integration
//   the CineLog V2 admin cares about, then returns a single aggregated
//   payload the dashboard can render in one round-trip.
//
// PROBES (each is bounded by a 5s timeout + runs concurrently):
//   • Supabase  — count profiles (1 round DB query, service_role)
//   • TMDB      — GET /configuration with the API key
//   • MDBList   — GET /user/me with the API key
//   • AniList   — POST a trivial GraphQL query (Viewer.id)
//   • Resend    — GET /domains (returns 200 even with 0 domains)
//   • Vercel    — GET /v6/deployments?projectId=<ref>&limit=1
//                 (skipped if VERCEL_TOKEN is not set; returns "unknown")
//   • Web Push  — checks VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY env vars
//                 are set AND app_config.vapid_public_key is populated
//
// STATUS SEMANTICS:
//   • "ok"       — probe succeeded within the timeout
//   • "degraded" — probe succeeded but with a non-fatal warning
//                  (e.g. AniList returned 403 outage, VAPID env set but
//                   app_config missing)
//   • "down"     — probe failed (network error, 5xx, missing API key)
//   • "unknown"  — probe was skipped (e.g. Vercel token not configured,
//                  feature not enabled)
//
// SECURITY:
//   • Admin-only — requireAdmin() gates the entire endpoint.
//   • No secrets are returned. Latency is reported as a number;
//     `detail` is a short human-readable string (no keys, no URLs).

import {
  requireAdmin,
  type AdminAPIEvent
} from "~/lib/supabase/admin/adminGuard";
import { createAdminClient } from "~/lib/supabase/admin/adminClient";

interface APIEvent extends AdminAPIEvent {}

type ServiceStatus = "ok" | "degraded" | "down" | "unknown";

interface ServiceHealth {
  service: string;
  status: ServiceStatus;
  /** Probe latency in ms (null when the probe was skipped or failed before
   *  any timing could be captured). */
  latency_ms: number | null;
  /** Short human-readable note (no secrets). */
  detail?: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, no-cache, must-revalidate"
    }
  });
}

/**
 * Fetch with a hard timeout. Returns the Response object on success,
 * throws on network error or timeout. Used by every external probe so
 * a slow upstream can't stall the whole endpoint.
 */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Measure the wall-clock latency of an async probe in milliseconds. */
async function timed<T>(
  fn: () => Promise<T>
): Promise<{ value: T; latencyMs: number }> {
  const start = Date.now();
  const value = await fn();
  return { value, latencyMs: Date.now() - start };
}

// ─── Individual probes ────────────────────────────────────────────

async function probeSupabase(): Promise<ServiceHealth> {
  try {
    const supabase = createAdminClient();
    const { latencyMs } = await timed(async () => {
      const { error } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .limit(1);
      if (error) throw error;
    });
    return {
      service: "Supabase",
      status: "ok",
      latency_ms: latencyMs,
      detail: "DB query ok"
    };
  } catch (err) {
    return {
      service: "Supabase",
      status: "down",
      latency_ms: null,
      detail: err instanceof Error ? err.message.slice(0, 120) : "DB error"
    };
  }
}

async function probeTmdb(): Promise<ServiceHealth> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    return {
      service: "TMDB",
      status: "down",
      latency_ms: null,
      detail: "TMDB_API_KEY env var not set"
    };
  }
  try {
    const { value: resp, latencyMs } = await timed(() =>
      fetchWithTimeout(
        `https://api.themoviedb.org/3/configuration?api_key=${encodeURIComponent(apiKey)}`,
        { method: "GET" },
        5000
      )
    );
    if (!resp.ok) {
      return {
        service: "TMDB",
        status: resp.status >= 500 ? "down" : "degraded",
        latency_ms: latencyMs,
        detail: `HTTP ${resp.status}`
      };
    }
    return {
      service: "TMDB",
      status: "ok",
      latency_ms: latencyMs,
      detail: "configuration endpoint ok"
    };
  } catch (err) {
    return {
      service: "TMDB",
      status: "down",
      latency_ms: null,
      detail: err instanceof Error ? err.message.slice(0, 120) : "fetch error"
    };
  }
}

async function probeMdblist(): Promise<ServiceHealth> {
  const apiKey = process.env.MDBLIST_API_KEY;
  if (!apiKey) {
    return {
      service: "MDBList",
      status: "down",
      latency_ms: null,
      detail: "MDBLIST_API_KEY env var not set"
    };
  }
  try {
    const { value: resp, latencyMs } = await timed(() =>
      fetchWithTimeout(
        `https://mdblist.com/api/user/me?apikey=${encodeURIComponent(apiKey)}`,
        { method: "GET" },
        5000
      )
    );
    if (!resp.ok) {
      return {
        service: "MDBList",
        status: resp.status >= 500 ? "down" : "degraded",
        latency_ms: latencyMs,
        detail: `HTTP ${resp.status}`
      };
    }
    return {
      service: "MDBList",
      status: "ok",
      latency_ms: latencyMs,
      detail: "user endpoint ok"
    };
  } catch (err) {
    return {
      service: "MDBList",
      status: "down",
      latency_ms: null,
      detail: err instanceof Error ? err.message.slice(0, 120) : "fetch error"
    };
  }
}

async function probeAnilist(): Promise<ServiceHealth> {
  // Trivial query — just asks for the viewer's id. Anonymous requests
  // are allowed, so we don't need to inject the access token here.
  // The probe purpose is to detect outages (403 "temporarily disabled")
  // and network errors.
  const query = "query { Viewer { id } }";
  try {
    const { value: resp, latencyMs } = await timed(() =>
      fetchWithTimeout(
        "https://graphql.anilist.co",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify({ query })
        },
        5000
      )
    );
    // AniList returns 200 even for unauthenticated queries (Viewer is
    // null in that case). The only failure modes we care about are:
    //   • 403 with "temporarily disabled" → outage
    //   • 5xx → server error
    //   • network error → caught by the try/catch below
    if (resp.status === 403) {
      // Could be a transient outage — mark as degraded.
      return {
        service: "AniList",
        status: "degraded",
        latency_ms: latencyMs,
        detail: "HTTP 403 — possibly outage"
      };
    }
    if (!resp.ok) {
      return {
        service: "AniList",
        status: resp.status >= 500 ? "down" : "degraded",
        latency_ms: latencyMs,
        detail: `HTTP ${resp.status}`
      };
    }
    return {
      service: "AniList",
      status: "ok",
      latency_ms: latencyMs,
      detail: "GraphQL endpoint ok"
    };
  } catch (err) {
    return {
      service: "AniList",
      status: "down",
      latency_ms: null,
      detail: err instanceof Error ? err.message.slice(0, 120) : "fetch error"
    };
  }
}

async function probeResend(): Promise<ServiceHealth> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return {
      service: "Resend",
      status: "down",
      latency_ms: null,
      detail: "RESEND_API_KEY env var not set"
    };
  }
  try {
    const { value: resp, latencyMs } = await timed(() =>
      fetchWithTimeout(
        "https://api.resend.com/domains",
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          }
        },
        5000
      )
    );
    if (!resp.ok) {
      return {
        service: "Resend",
        status: resp.status >= 500 ? "down" : "degraded",
        latency_ms: latencyMs,
        detail: `HTTP ${resp.status}`
      };
    }
    return {
      service: "Resend",
      status: "ok",
      latency_ms: latencyMs,
      detail: "domains endpoint ok"
    };
  } catch (err) {
    return {
      service: "Resend",
      status: "down",
      latency_ms: null,
      detail: err instanceof Error ? err.message.slice(0, 120) : "fetch error"
    };
  }
}

async function probeVercel(): Promise<ServiceHealth> {
  const token = process.env.VERCEL_TOKEN ?? process.env.VERCEL_ACCESS_TOKEN;
  if (!token) {
    return {
      service: "Vercel",
      status: "unknown",
      latency_ms: null,
      detail: "VERCEL_TOKEN env var not set — open Vercel dashboard manually"
    };
  }
  // The Vercel project id / ref is not always available as an env var.
  // Vercel auto-sets VERCEL_PROJECT_ID inside the build environment, but
  // NOT at runtime. We try a couple of common env vars; if none are set,
  // we fall back to a user-scoped deployments lookup.
  const projectId =
    process.env.VERCEL_PROJECT_ID ?? process.env.PROJECT_ID ?? null;
  const url = projectId
    ? `https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(projectId)}&limit=1`
    : "https://api.vercel.com/v2/user";
  try {
    const { value: resp, latencyMs } = await timed(() =>
      fetchWithTimeout(
        url,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          }
        },
        5000
      )
    );
    if (!resp.ok) {
      return {
        service: "Vercel",
        status: resp.status >= 500 ? "down" : "degraded",
        latency_ms: latencyMs,
        detail: `HTTP ${resp.status}`
      };
    }
    return {
      service: "Vercel",
      status: "ok",
      latency_ms: latencyMs,
      detail: projectId ? "deployments endpoint ok" : "user endpoint ok"
    };
  } catch (err) {
    return {
      service: "Vercel",
      status: "down",
      latency_ms: null,
      detail: err instanceof Error ? err.message.slice(0, 120) : "fetch error"
    };
  }
}

async function probeWebPush(): Promise<ServiceHealth> {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) {
    return {
      service: "Web Push",
      status: "down",
      latency_ms: null,
      detail: "VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY env var not set"
    };
  }
  // Also verify app_config.vapid_public_key is populated so the browser
  // can actually subscribe. If env is set but DB row is missing, mark
  // as degraded (push won't work for new subscribers).
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("app_config")
      .select("value")
      .eq("key", "vapid_public_key")
      .maybeSingle();
    if (error) {
      return {
        service: "Web Push",
        status: "degraded",
        latency_ms: null,
        detail: `Env ok; app_config lookup failed: ${error.message.slice(0, 80)}`
      };
    }
    if (!data || !data.value) {
      return {
        service: "Web Push",
        status: "degraded",
        latency_ms: null,
        detail: "Env ok; app_config.vapid_public_key row missing"
      };
    }
    return {
      service: "Web Push",
      status: "ok",
      latency_ms: null,
      detail: "VAPID env + app_config row ok"
    };
  } catch (err) {
    return {
      service: "Web Push",
      status: "degraded",
      latency_ms: null,
      detail: err instanceof Error ? err.message.slice(0, 120) : "DB error"
    };
  }
}

// ─── GET handler ──────────────────────────────────────────────────

export async function GET(event: APIEvent): Promise<Response> {
  const adminResult = await requireAdmin(event);
  if (!adminResult.ok) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  // Run all probes concurrently — each has its own 5s timeout, so the
  // whole endpoint resolves in ≤5s even if every external service is
  // unreachable. Promise.allSettled ensures a single probe throwing
  // doesn't reject the whole batch (each probe already catches its own
  // errors, but allSettled is defensive).
  const probes = await Promise.allSettled([
    probeSupabase(),
    probeTmdb(),
    probeMdblist(),
    probeAnilist(),
    probeResend(),
    probeVercel(),
    probeWebPush()
  ]);

  const fallbackNames = [
    "Supabase",
    "TMDB",
    "MDBList",
    "AniList",
    "Resend",
    "Vercel",
    "Web Push"
  ];

  const services: ServiceHealth[] = probes.map((p, idx) => {
    if (p.status === "fulfilled") return p.value;
    // Defensive — each probe already catches internally, but if one
    // slipped through we still want a presentable row.
    return {
      service: fallbackNames[idx] ?? "Unknown",
      status: "down" as ServiceStatus,
      latency_ms: null,
      detail:
        p.reason instanceof Error
          ? p.reason.message.slice(0, 120)
          : "probe crashed"
    };
  });

  return jsonResponse({
    services,
    fetched_at: new Date().toISOString()
  });
}
