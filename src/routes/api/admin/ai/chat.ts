// src/routes/api/admin/ai/chat.ts
//
// CineLog V2 — Admin AI Assistant Chat API (Phase 16 Chunk 2)
// ---------------------------------------------------------------------
// POST /api/admin/ai/chat — sends the admin's question to Groq with
// live system-state context, returns the assistant's reply.
//
// FLOW:
//   1. requireAdmin() — verifies admin session cookie.
//   2. isAiFeatureEnabled("adminAssistantEnabled") — the CRITICAL
//      gate. If the admin has turned off the Master AI Switch OR the
//      Admin Assistant sub-toggle, we return 403 immediately. No
//      Groq API call is made. This is the kill-switch contract.
//   3. Gather live system context (total users, active users, vault
//      counts, recent audit log entries) to inject into the system
//      prompt. This is what makes the assistant "aware" of the
//      current state rather than a generic chatbot.
//   4. Build the system prompt (sarcastic-but-helpful persona per
//      the spec) + the user's question.
//   5. callGroq(systemPrompt, userPrompt) — the Chunk 1 helper.
//   6. Return { reply, model, generatedAt } on success.
//
// ERROR HANDLING (Rule 3 — fail gracefully):
//   • If the feature is disabled → 403 with a clear message.
//   • If Groq fails (429 rate limit, 5xx, network, timeout) → 503
//     with a friendly message. The UI shows this in the chat bubble.
//   • If the request body is malformed → 400.
//   • If context-gathering fails (DB error), we STILL call Groq with
//     whatever context we have — the assistant is still useful even
//     with partial context. We log the failure but don't block.
//
// AUDIT LOGGING:
//   Each successful chat call is audit-logged with action=
//   "ai.assistant.chat" so admins can see who used the assistant
//   and what they asked (the question is in the payload). This is
//   important for a 2-3 user testing phase — we want to know exactly
//   how the free-tier quota is being consumed.
//
// RATE LIMITING:
//   We reuse the existing admin mutation rate limiter with a dedicated
//   key ("ai.assistant.chat") so a chatty admin can't exhaust the
//   Groq free tier (30 req/min on Groq's free plan as of Feb 2026).
//   The limiter is per-admin, sliding window.

import {
  requireAdmin,
  type AdminAPIEvent
} from "~/lib/supabase/admin/adminGuard";
import { createAdminClient } from "~/lib/supabase/admin/adminClient";
import { logAdminAction } from "~/lib/supabase/admin/auditLog";
import { enforceAdminMutationRateLimit } from "~/lib/server/adminRateLimit";
import {
  callGroq,
  isAiFeatureEnabled,
  getAiModel
} from "~/lib/server/groq";

type APIEvent = AdminAPIEvent;

// ─── Types ───────────────────────────────────────────────────────

interface ChatRequestBody {
  message?: unknown;
  /** Optional model override — must be in the enabledModels list. */
  model?: unknown;
}

interface ChatResponse {
  reply: string;
  model: string;
  generatedAt: string;
}

interface ErrorResponse {
  error: string;
  /** Optional human-friendly hint shown in the chat bubble. */
  hint?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

// ─── System context builder ──────────────────────────────────────
//
// Gathers a compact snapshot of the system state to inject into the
// system prompt. This is what makes the assistant "admin-aware" —
// it can answer questions like "how many users do we have?" without
// the admin having to look at the dashboard.
//
// Each query is individually try/caught so a failure in one (e.g.
// activity_log table missing) doesn't kill the whole context. The
// assistant still gets partial context.

interface SystemContext {
  totalUsers: number;
  activeUsers24h: number;
  totalVaultEntries: number;
  moviesVsTv: { movies: number; tv: number };
  recentAdminActions: Array<{
    action: string;
    admin: string | null;
    createdAt: string;
  }>;
  tmdbCacheEntries: number;
}

async function gatherSystemContext(): Promise<SystemContext> {
  const supabase = createAdminClient();
  const now = new Date();
  const iso24hAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  // Run all context queries in parallel — each is independently
  // fail-soft (returns 0 / [] on error).
  const [
    totalUsersResp,
    active24hResp,
    totalVaultResp,
    vaultMediaTypeResp,
    recentActionsResp,
    tmdbCacheCountResp
  ] = await Promise.allSettled([
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null),
    supabase
      .from("activity_log")
      .select("user_id", { count: "exact", head: true })
      .gte("created_at", iso24hAgo),
    supabase
      .from("vault")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null),
    supabase.from("vault").select("media_type").is("deleted_at", null),
    supabase
      .from("admin_actions")
      .select("action, created_at, admin:profiles!admin_actions_admin_id_fkey(display_name)")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase.from("tmdb_cache").select("id", { count: "exact", head: true })
  ]);

  // Helper: extract count from a settled Promise.allSettled result.
  const countOf = (
    r: PromiseSettledResult<{ count: number | null } | null>
  ): number =>
    r.status === "fulfilled" ? (r.value?.count ?? 0) : 0;

  // Aggregate movies vs TV from the media_type rows.
  let movies = 0;
  let tv = 0;
  if (
    vaultMediaTypeResp.status === "fulfilled" &&
    Array.isArray(vaultMediaTypeResp.value?.data)
  ) {
    for (const row of vaultMediaTypeResp.value.data as Array<{
      media_type: string;
    }>) {
      if (row.media_type === "movie") movies++;
      else if (row.media_type === "tv" || row.media_type === "series")
        tv++;
    }
  }

  // Normalize recent admin actions — the join returns a nested object.
  const recentActions: SystemContext["recentAdminActions"] = [];
  if (
    recentActionsResp.status === "fulfilled" &&
    Array.isArray(recentActionsResp.value?.data)
  ) {
    for (const row of recentActionsResp.value.data as Array<{
      action: string;
      created_at: string;
      admin?:
        | { display_name: string | null }
        | { display_name: string | null }[]
        | null;
    }>) {
      // The Supabase JS client returns joined rows as either a single
      // object or an array depending on the relationship cardinality.
      // We handle both shapes defensively.
      let adminName: string | null = null;
      if (Array.isArray(row.admin) && row.admin.length > 0) {
        adminName = row.admin[0]?.display_name ?? null;
      } else if (
        row.admin &&
        !Array.isArray(row.admin) &&
        typeof row.admin === "object"
      ) {
        adminName = (row.admin as { display_name: string | null }).display_name;
      }
      recentActions.push({
        action: row.action,
        admin: adminName,
        createdAt: row.created_at
      });
    }
  }

  return {
    totalUsers: countOf(totalUsersResp as PromiseSettledResult<{ count: number | null } | null>),
    activeUsers24h: countOf(active24hResp as PromiseSettledResult<{ count: number | null } | null>),
    totalVaultEntries: countOf(totalVaultResp as PromiseSettledResult<{ count: number | null } | null>),
    moviesVsTv: { movies, tv },
    recentAdminActions: recentActions,
    tmdbCacheEntries: countOf(tmdbCacheCountResp as PromiseSettledResult<{ count: number | null } | null>)
  };
}

/**
 * Build the system prompt. The persona is "sarcastic but helpful" per
 * the spec — keeps the assistant engaging without being unprofessional.
 *
 * The system context is serialized as a compact JSON block so the LLM
 * can reference exact numbers. We keep it short to stay within the
 * Groq free-tier context window (varies by model).
 */
function buildSystemPrompt(ctx: SystemContext): string {
  return [
    "You are a sarcastic but helpful admin assistant for CineLog V2,",
    "a personal cinema tracking app. You have live access to the",
    "current system state (below). Answer the admin's question",
    "concisely — no more than 3-4 short paragraphs. Be witty but",
    "accurate; cite the real numbers when relevant. If you don't know",
    "something, say so rather than making it up.",
    "",
    "CURRENT SYSTEM STATE:",
    JSON.stringify(ctx, null, 2),
    "",
    "Notes:",
    "- 'activeUsers24h' = distinct users with activity_log entries in",
    "  the last 24 hours.",
    "- 'recentAdminActions' are the 5 most recent audit-log entries.",
    "- 'tmdbCacheEntries' = rows in the TMDB response cache table.",
    "- Do NOT invent metrics that aren't in the system state above.",
    "- If the admin asks about a user's private data (vault contents,",
    "  ratings, etc.), politely decline — you only have aggregate stats."
  ].join("\n");
}

// ─── POST /api/admin/ai/chat ─────────────────────────────────────

export async function POST(event: APIEvent): Promise<Response> {
  // 1. Admin auth check
  const adminResult = await requireAdmin(event);
  if (!adminResult.ok) {
    return jsonResponse({ error: "Unauthorized" } satisfies ErrorResponse, 401);
  }

  // 2. Rate limit (per-admin, dedicated key so a chatty admin can't
  //    exhaust the Groq free tier). The limiter returns a Response
  //    when the limit is hit; we pass it through.
  const rateLimited = await enforceAdminMutationRateLimit(
    event,
    adminResult.admin,
    "ai.assistant.chat"
  );
  if (rateLimited) return rateLimited;

  // 3. CRITICAL GATE — check that the Admin Assistant feature is on.
  //    This reads app_config.ai_settings via checkAiSettings() and
  //    applies the master-switch conjunction. If the admin turned
  //    off either the master switch or the admin-assistant sub-toggle,
  //    we short-circuit with 403 BEFORE any Groq call.
  const enabled = await isAiFeatureEnabled("adminAssistantEnabled");
  if (!enabled) {
    return jsonResponse(
      {
        error: "AI Assistant is disabled",
        hint: "An admin can enable it at /admin/ai (Master AI Switch + Admin Assistant toggle)."
      } satisfies ErrorResponse,
      403
    );
  }

  // 4. Parse + validate the request body
  let userMessage: string;
  let body: ChatRequestBody;
  try {
    body = (await event.request.json().catch(() => ({}))) as ChatRequestBody;
    if (typeof body.message !== "string" || body.message.trim().length === 0) {
      return jsonResponse(
        { error: "Request body must include a non-empty 'message' string." } satisfies ErrorResponse,
        400
      );
    }
    // Cap the message length to prevent abuse (Groq's context window
    // is 8K tokens; 4000 chars is a generous cap that leaves room for
    // the system prompt + the reply).
    userMessage = body.message.trim().slice(0, 4000);
  } catch {
    return jsonResponse(
      { error: "Invalid JSON body." } satisfies ErrorResponse,
      400
    );
  }

  // 5. Gather live system context. This is fail-soft — if the DB is
  //    having a bad day, we still call Groq with whatever context we
  //    managed to collect. The assistant is still useful with partial
  //    context.
  let ctx: SystemContext;
  try {
    ctx = await gatherSystemContext();
  } catch (err) {
    console.warn("[ai/chat] context gathering failed, using empty context:", err);
    ctx = {
      totalUsers: 0,
      activeUsers24h: 0,
      totalVaultEntries: 0,
      moviesVsTv: { movies: 0, tv: 0 },
      recentAdminActions: [],
      tmdbCacheEntries: 0
    };
  }

  // 6. Call Groq. callGroq throws on any failure (network, non-2xx,
  //    empty response) — we catch and map to a 503 with a friendly
  //    hint so the UI can show it in the chat bubble.
  const systemPrompt = buildSystemPrompt(ctx);
  // Resolve model: admin can pick from enabled models, or use the configured default.
  const requestedModel = typeof body.model === "string" && body.model.trim().length > 0
    ? body.model.trim()
    : undefined;
  const model = await getAiModel(requestedModel, "adminAssistant");

  let reply: string;
  try {
    reply = await callGroq(systemPrompt, userMessage, model);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ai/chat] Groq call failed:", msg);

    // Distinguish error types for better UX.
    const isRateLimit =
      msg.includes("429") || msg.toLowerCase().includes("rate limit");
    const isModelUnavailable =
      msg.includes("No usable AI model") ||
      msg.includes("model") && msg.toLowerCase().includes("unavailable");

    return jsonResponse(
      {
        error: isModelUnavailable
          ? "No AI model is currently available."
          : isRateLimit
            ? "Groq rate limit hit — the free tier is exhausted."
            : "The AI assistant is unavailable right now.",
        hint: isModelUnavailable
          ? "Check model availability at /admin/ai and ensure at least one model is enabled and available."
          : isRateLimit
            ? "Wait a minute and try again."
            : "Check that GROQ_API_KEY is set and the Groq service is reachable."
      } satisfies ErrorResponse,
      503
    );
  }

  // 7. Audit log the chat call. We log the question (truncated) so
  //    admins can review free-tier usage. The reply is NOT logged
  //    (it could be long + low-value for auditing).
  try {
    await logAdminAction(event, adminResult.admin, {
      action: "ai.assistant.chat",
      entity_type: "ai_assistant",
      entity_id: null,
      payload: {
        question: userMessage.slice(0, 200),
        model,
        contextSummary: {
          totalUsers: ctx.totalUsers,
          activeUsers24h: ctx.activeUsers24h
        }
      }
    });
  } catch (auditErr) {
    // Audit logging is best-effort — don't fail the chat if it breaks.
    console.warn("[ai/chat] audit log failed:", auditErr);
  }

  // 8. Return the reply
  const responseBody: ChatResponse = {
    reply,
    model,
    generatedAt: new Date().toISOString()
  };
  return jsonResponse(responseBody, 200);
}
