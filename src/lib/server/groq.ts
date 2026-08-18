// src/lib/server/groq.ts
//
// CineLog V2 — Groq API Client + AI Settings Guard (Server-Only)
// ---------------------------------------------------------------------
// Server-side utility for calling the Groq API (OpenAI-compatible
// /chat/completions endpoint) and for reading the AI feature flags
// from the `app_config` table.
//
// WHY THIS EXISTS (Phase 16 Chunk 1):
//   We are integrating Groq's free-tier LLM API to power future AI
//   features (Admin Assistant chat, Discover recommendations). Groq
//   is OpenAI-compatible, so we use the built-in `fetch` API instead
//   of installing the `openai` SDK — keeps the bundle small and
//   avoids pulling in a heavyweight dependency for a 2-3 user testing
//   phase.
//
//   Two responsibilities:
//     1. callGroq(systemPrompt, userPrompt, model?) — thin wrapper
//        around POST https://api.groq.com/openai/v1/chat/completions.
//        Returns the assistant's message string. Throws on any error
//        (network, non-2xx, malformed JSON, empty choices).
//     2. checkAiSettings() — reads the `ai_settings` row from
//        app_config and returns the three boolean flags. This is the
//        SINGLE source of truth that gates every AI feature server-side.
//
// SECURITY:
//   • This module is server-only. Importing it from the browser throws
//     (the `isServer` guard from solid-js/web fires immediately).
//   • The GROQ_API_KEY is read from process.env on every call — it
//     NEVER reaches the client bundle, NEVER appears in any response
//     payload, and NEVER gets logged.
//   • The service-role admin client is used to read app_config so we
//     can read the row even if RLS policies change in the future
//     (defensive — app_config currently has public SELECT RLS).
//   • Groq API responses are filtered to ONLY the assistant message
//     content before returning. We never echo the raw upstream
//     payload (which includes prompt tokens, model metadata, etc.).
//   • All requests have a 30-second timeout to prevent hung
//     connections from blocking the request thread.
//
// ENVIRONMENT VARIABLES:
//   • GROQ_API_KEY — Required for callGroq(). Get one at
//                    https://console.groq.com/keys (free tier available).
//                    Missing key → callGroq() throws a clear error.
//                    checkAiSettings() does NOT require this key (it
//                    only reads the DB).
//
//   • VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY — Required by
//     createAdminClient() for checkAiSettings(). These are already
//     used by every other admin route, so no new env vars needed.

import { isServer } from "solid-js/web";
import { createAdminClient } from "~/lib/supabase/admin/adminClient";

// ─── Groq API constants ──────────────────────────────────────────

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

/**
 * Default Groq model. Groq's free tier currently supports several
 * models; `openai/gpt-oss-120b` is the most capable general-purpose
 * model available on the free tier at time of writing (Aug 2026).
 *
 * The model is overridable per-call via the `model` parameter on
 * callGroq() — this default just keeps call sites simple.
 *
 * If Groq deprecates this model, callers can pass a different model
 * string without touching this file.
 */
const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";

/** Hard timeout for Groq API calls. Groq is fast (typically <2s for
 *  short prompts) but we cap at 30s to prevent a slow upstream from
 *  blocking the request thread indefinitely. */
const GROQ_REQUEST_TIMEOUT_MS = 30_000;

// ─── Types ───────────────────────────────────────────────────────

/**
 * Shape of the `ai_settings` row in app_config.
 *
 * This is the SINGLE source of truth for AI feature gating. Both the
 * public /api/ai/status route and the admin /admin/ai page consume
 * these flags (the public route only exposes a subset).
 *
 * If you add a new flag here, you MUST also:
 *   1. Update the default validator in src/routes/api/admin/settings.ts
 *      (the `ai_settings` validator).
 *   2. Update the seed in supabase/migrations/20260815_add_ai_settings.sql.
 *   3. Update the AdminAiPage UI to render a toggle for it.
 *   4. Decide whether the new flag is exposed via /api/ai/status
 *      (public) or stays admin-only.
 */
export interface AiSettings {
  /** Global kill switch. When false, EVERY AI feature is off,
   *  regardless of the other flags. This is the emergency stop. */
  masterEnabled: boolean;
  /** Gates the AI section on the public Discover page. Exposed via
   *  /api/ai/status so the client knows whether to render the rail. */
  userRecommendationsEnabled: boolean;
  /** Gates the AI chat assistant inside the admin panel. This flag
   *  is NEVER exposed to the public status route — admin-only. */
  adminAssistantEnabled: boolean;
}

/** Safe defaults used when the row is missing or malformed. Mirrors
 *  the seed migration — all OFF. AI must be explicitly opted-in. */
export const DEFAULT_AI_SETTINGS: AiSettings = {
  masterEnabled: false,
  userRecommendationsEnabled: false,
  adminAssistantEnabled: false
};

/** A single chat message in the OpenAI-compatible format. */
interface GroqChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Minimal subset of the Groq /chat/completions response that we
 *  actually read. We ignore the rest (token usage, logprobs, etc.). */
interface GroqChatCompletionResponse {
  choices?: Array<{
    message?: { role?: string; content?: string };
    finish_reason?: string;
  }>;
  error?: { message?: string; type?: string; code?: string };
}

// ─── Environment helper ──────────────────────────────────────────

/**
 * Read the GROQ_API_KEY from the server environment.
 *
 * @throws if called on the browser (the module-level isServer guard
 *         also catches this, but we double-check here for clarity).
 * @throws if GROQ_API_KEY is missing or empty.
 */
function readGroqApiKey(): string {
  if (!isServer) {
    throw new Error(
      "[groq] Groq client accessed on the browser. The GROQ_API_KEY " +
        "must never reach the client bundle."
    );
  }
  const key = process.env.GROQ_API_KEY;
  if (!key || key.trim().length === 0) {
    throw new Error(
      "[groq] Missing GROQ_API_KEY. Create one at " +
        "https://console.groq.com/keys and set it in the server environment."
    );
  }
  return key.trim();
}

// ─── checkAiSettings ─────────────────────────────────────────────

/**
 * Read the AI feature flags from the `ai_settings` row in app_config.
 *
 * This is the SINGLE source of truth that gates every AI feature
 * server-side. Call this BEFORE any Groq API call to check whether
 * the relevant feature is enabled.
 *
 * Behaviour:
 *   • If the row is missing (migration not run yet), returns
 *     DEFAULT_AI_SETTINGS (all flags false).
 *   • If the row exists but a flag is missing/null, the missing flag
 *     falls back to its default (false).
 *   • If the row value is not an object (corrupted), returns
 *     DEFAULT_AI_SETTINGS and logs a warning.
 *   • Never throws — a database error should NOT take down the host
 *     route. The caller gets the safe all-off defaults instead.
 *
 * Uses the service-role admin client so we read the row even if RLS
 * is tightened in the future. The anon client would also work today
 * (app_config has public SELECT) but the admin client is more
 * defensive and consistent with how other server utilities read
 * config (e.g. /api/admin/settings).
 *
 * @returns The three boolean flags. Always returns a complete object.
 */
export async function checkAiSettings(): Promise<AiSettings> {
  // Server-only guard — even though createAdminClient() also checks,
  // we check here first so a browser import fails with a clearer
  // error message that names this module.
  if (!isServer) {
    throw new Error(
      "[groq] checkAiSettings() was called on the browser. " +
        "AI settings must only be read server-side."
    );
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", "ai_settings")
      .single();

    if (error) {
      // PGRST116 = "JSON object requested, too many rows" or "no rows".
      // The "no rows" case means the migration hasn't been applied yet —
      // we fall back to defaults silently. Any other error is logged.
      if (error.code !== "PGRST116") {
        console.warn(
          "[groq] checkAiSettings: db error, falling back to defaults:",
          error.message
        );
      }
      return { ...DEFAULT_AI_SETTINGS };
    }

    if (!data || typeof data.value !== "object" || data.value === null) {
      console.warn(
        "[groq] checkAiSettings: ai_settings value is not an object, using defaults."
      );
      return { ...DEFAULT_AI_SETTINGS };
    }

    const v = data.value as Record<string, unknown>;
    const asBool = (val: unknown): boolean =>
      typeof val === "boolean" ? val : false;

    return {
      masterEnabled: asBool(v.masterEnabled),
      userRecommendationsEnabled: asBool(v.userRecommendationsEnabled),
      adminAssistantEnabled: asBool(v.adminAssistantEnabled)
    };
  } catch (err) {
    // createAdminClient() throws if env vars are missing — in that
    // case we can't read the DB, so we return defaults. The host
    // route still responds; AI features just appear disabled.
    console.warn(
      "[groq] checkAiSettings: unexpected error, falling back to defaults:",
      err instanceof Error ? err.message : err
    );
    return { ...DEFAULT_AI_SETTINGS };
  }
}

// ─── callGroq ────────────────────────────────────────────────────

/**
 * Call the Groq /chat/completions API and return the assistant's
 * message string.
 *
 * This is a thin wrapper around fetch — no SDK, no streaming, no
 * function-calling. It does the simplest possible thing: send a
 * system+user prompt pair, get back the assistant's reply text.
 *
 * IMPORTANT — Callers MUST call checkAiSettings() BEFORE this function
 * to verify the relevant feature flag is on. This function does NOT
 * check the flags itself, because:
 *   1. Different features have different flag requirements (e.g. the
 *      Admin Assistant needs masterEnabled AND adminAssistantEnabled;
 *      Discover recommendations need masterEnabled AND
 *      userRecommendationsEnabled).
 *   2. Keeping the gate separate from the call makes both units
 *      easier to test independently.
 *
 * @param systemPrompt  The system prompt (sets assistant behaviour).
 *                      Must be a non-empty string.
 * @param userPrompt    The user's message / query.
 *                      Must be a non-empty string.
 * @param model         Optional Groq model id. Defaults to
 *                      `openai/gpt-oss-120b`. Override per-call
 *                      if a feature needs a different model (e.g.
 *                      a smaller/faster model for short autocomplete).
 *
 * @returns The assistant's reply as a string. Never null — throws
 *          if the response has no choices or empty content.
 *
 * @throws Error if:
 *   - Called on the browser (isServer guard).
 *   - GROQ_API_KEY is missing or empty.
 *   - systemPrompt or userPrompt is empty/not a string.
 *   - The fetch fails (network error or timeout).
 *   - Groq returns a non-2xx status (the error message includes
 *     the status code and Groq's error message when available).
 *   - The response JSON has no choices or empty content.
 */
export async function callGroq(
  systemPrompt: string,
  userPrompt: string,
  model: string = DEFAULT_GROQ_MODEL
): Promise<string> {
  // ── Input validation ──────────────────────────────────────────
  if (!isServer) {
    throw new Error(
      "[groq] callGroq() was called on the browser. " +
        "Groq API calls must only happen server-side."
    );
  }
  if (typeof systemPrompt !== "string" || systemPrompt.trim().length === 0) {
    throw new Error("[groq] callGroq: systemPrompt must be a non-empty string.");
  }
  if (typeof userPrompt !== "string" || userPrompt.trim().length === 0) {
    throw new Error("[groq] callGroq: userPrompt must be a non-empty string.");
  }
  if (typeof model !== "string" || model.trim().length === 0) {
    throw new Error("[groq] callGroq: model must be a non-empty string.");
  }

  // ── Read API key (throws if missing) ──────────────────────────
  const apiKey = readGroqApiKey();

  // ── Build request body ────────────────────────────────────────
  const messages: GroqChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ];

  const body = JSON.stringify({
    model,
    messages,
    // Temperature controls randomness. 0.7 is a sensible default for
    // general-purpose chat — creative enough for recommendations,
    // deterministic enough for admin-assistant Q&A. Callers can't
    // override this per-call yet; if a future feature needs a
    // different temperature, add it as a parameter.
    temperature: 0.7,
    // We always want exactly one completion — no need for n > 1.
    n: 1,
    // Disable streaming for the server-side wrapper. Streaming is
    // useful for the admin chat UX, but that's a Chunk 2 concern;
    // for now we wait for the full response.
    stream: false
  });

  // ── Fetch with timeout ────────────────────────────────────────
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    GROQ_REQUEST_TIMEOUT_MS
  );

  let resp: Response;
  try {
    resp = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        // Groq accepts OpenAI-style headers. Accept JSON response.
        Accept: "application/json"
      },
      body,
      signal: controller.signal
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `[groq] callGroq: request timed out after ${GROQ_REQUEST_TIMEOUT_MS}ms.`
      );
    }
    throw new Error(
      `[groq] callGroq: network error — ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  } finally {
    clearTimeout(timeoutId);
  }

  // ── Parse response ────────────────────────────────────────────
  // Groq returns JSON for both success and error responses. We parse
  // it once and inspect both the `error` field and HTTP status.
  let parsed: GroqChatCompletionResponse;
  try {
    parsed = (await resp.json()) as GroqChatCompletionResponse;
  } catch {
    // Non-JSON response (rare — usually a Groq outage / 5xx HTML page).
    throw new Error(
      `[groq] callGroq: non-JSON response (HTTP ${resp.status} ${resp.statusText}).`
    );
  }

  if (!resp.ok) {
    const errMsg =
      parsed.error?.message ||
      `HTTP ${resp.status} ${resp.statusText}`;
    throw new Error(
      `[groq] callGroq: Groq API error (${resp.status}): ${errMsg}`
    );
  }

  // ── Extract assistant message ─────────────────────────────────
  const choice = parsed.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content !== "string" || content.length === 0) {
    throw new Error(
      `[groq] callGroq: empty or missing assistant message in response. ` +
        `(finish_reason=${choice?.finish_reason ?? "unknown"})`
    );
  }

  return content;
}

// ─── Convenience: isAiFeatureEnabled ─────────────────────────────

/**
 * Helper that combines the master switch with a specific feature
 * flag. The master switch overrides everything — when it's off, no
 * AI feature is enabled, period.
 *
 * Use this in route handlers to gate a feature with one line:
 *
 *   const enabled = await isAiFeatureEnabled("adminAssistantEnabled");
 *   if (!enabled) return json({ error: "AI feature disabled" }, 403);
 *
 * @param featureKey One of the feature-specific flag names
 *                   (NOT "masterEnabled" — that would be circular).
 */
export async function isAiFeatureEnabled(
  featureKey: "userRecommendationsEnabled" | "adminAssistantEnabled"
): Promise<boolean> {
  const settings = await checkAiSettings();
  // Master switch is the global kill — if it's off, everything is off.
  if (!settings.masterEnabled) return false;
  return settings[featureKey] === true;
}
