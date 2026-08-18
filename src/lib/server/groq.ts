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
 * Ultimate fallback model — only used if the ai_settings config is
 * completely missing or has no valid models. In normal operation,
 * the model is resolved dynamically via getAiModel() which reads
 * from app_config.ai_settings.
 */
const DEFAULT_GROQ_MODEL = "openai/gpt-oss-20b";

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

  // ── AI Model Configuration ──────────────────────────────────
  /** The default Groq model used by all AI features unless
   *  overridden by featureModels or a per-request override. */
  defaultModel: string;
  /** List of Groq models the admin has enabled for CineLog.
   *  Models not in this list are blocked even if Groq allows them. */
  enabledModels: string[];
  /** Fallback model used when the defaultModel fails or is
   *  unavailable. Falls back to the first enabledModel if unset. */
  fallbackModel: string;
  /** Per-feature model overrides. Allows specific AI features to
   *  use a different model than the global default. Missing entries
   *  fall back to `defaultModel`. */
  featureModels?: FeatureModelOverrides;
}

/** All known Groq models. The admin can enable/disable any of these.
 *  New models should be added here when Groq adds them. */
export const KNOWN_GROQ_MODELS = [
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "qwen/qwen3.6-27b"
] as const;

/** Per-feature model overrides. If a feature has an entry here,
 *  it uses that model instead of the global default. Missing entries
 *  fall back to `defaultModel`. This allows future feature-specific
 *  model tuning without another architectural rewrite. */
export interface FeatureModelOverrides {
  userRecommendations?: string;
  adminAssistant?: string;
}

/** Result of resolving a model for an AI request. */
export interface ModelResolution {
  /** The model id to use for the Groq API call. */
  model: string;
  /** Whether the resolved model was verified as available in Groq. */
  available: boolean;
  /** If the requested model was unavailable, which fallback was used. */
  fallbackUsed?: string;
  /** If no model could be resolved, the reason why. */
  error?: string;
}

/** Safe defaults used when the row is missing or malformed. Mirrors
 *  the seed migration — all OFF. AI must be explicitly opted-in. */
export const DEFAULT_AI_SETTINGS: AiSettings = {
  masterEnabled: false,
  userRecommendationsEnabled: false,
  adminAssistantEnabled: false,
  defaultModel: "openai/gpt-oss-20b",
  enabledModels: ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.6-27b"],
  fallbackModel: "openai/gpt-oss-120b",
  featureModels: {}
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
    const asString = (val: unknown, fallback: string): string =>
      typeof val === "string" && val.trim().length > 0 ? val.trim() : fallback;
    const asStringArray = (val: unknown, fallback: string[]): string[] => {
      if (!Array.isArray(val)) return fallback;
      const filtered = val.filter((item): item is string =>
        typeof item === "string" && item.trim().length > 0
      );
      return filtered.length > 0 ? filtered : fallback;
    };

    return {
      masterEnabled: asBool(v.masterEnabled),
      userRecommendationsEnabled: asBool(v.userRecommendationsEnabled),
      adminAssistantEnabled: asBool(v.adminAssistantEnabled),
      defaultModel: asString(v.defaultModel, DEFAULT_AI_SETTINGS.defaultModel),
      enabledModels: asStringArray(v.enabledModels, DEFAULT_AI_SETTINGS.enabledModels),
      fallbackModel: asString(v.fallbackModel, DEFAULT_AI_SETTINGS.fallbackModel),
      featureModels: typeof v.featureModels === "object" && v.featureModels !== null
        ? v.featureModels as FeatureModelOverrides
        : {}
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
 *                      the configured defaultModel from ai_settings.
 *                      Override per-call if a feature needs a different
 *                      model (e.g. admin assistant with user-selected model).
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
  model?: string
): Promise<string> {
  // ── Resolve model from config if not explicitly provided ────
  const resolvedModel = model ?? (await checkAiSettings()).defaultModel || DEFAULT_GROQ_MODEL;

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
  if (typeof resolvedModel !== "string" || resolvedModel.trim().length === 0) {
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
    model: resolvedModel,
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

// ─── Groq Model Availability ─────────────────────────────────────

/** Cache for Groq's available models list. Avoids hitting the API
 *  on every single AI request. TTL: 10 minutes. */
let cachedAvailableModels: string[] | null = null;
let availableModelsCacheExpiry = 0;
const MODEL_CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * Fetch the list of models available to the configured Groq API key.
 *
 * Calls GET https://api.groq.com/openai/v1/models and returns the
 * model ids. Results are cached for 10 minutes to avoid hitting the
 * API on every AI request.
 *
 * Returns null if the API call fails (network error, missing key,
 * etc.) — callers should treat null as "cannot determine availability"
 * and proceed with the configured model.
 */
export async function fetchGroqAvailableModels(): Promise<string[] | null> {
  // Return cache if fresh.
  if (cachedAvailableModels && Date.now() < availableModelsCacheExpiry) {
    return cachedAvailableModels;
  }

  let apiKey: string;
  try {
    apiKey = readGroqApiKey();
  } catch {
    return null;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    const resp = await fetch(
      "https://api.groq.com/openai/v1/models",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json"
        },
        signal: controller.signal
      }
    );
    clearTimeout(timeoutId);

    if (!resp.ok) {
      console.warn(
        `[groq] fetchGroqAvailableModels: HTTP ${resp.status} — ` +
        `model availability check failed. Proceeding without validation.`
      );
      return null;
    }

    const data = await resp.json() as {
      data?: Array<{ id?: string }>;
    };

    if (!Array.isArray(data.data)) {
      return null;
    }

    const ids = data.data
      .map((m) => m.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);

    cachedAvailableModels = ids;
    availableModelsCacheExpiry = Date.now() + MODEL_CACHE_TTL_MS;
    return ids;
  } catch (err) {
    console.warn(
      "[groq] fetchGroqAvailableModels: request failed:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

// ─── Convenience: resolveAiModel ────────────────────────────────

/**
 * Centralized model resolution for all AI features.
 *
 * Resolution order:
 *   1. Feature-specific model override (from featureModels config)
 *   2. Explicitly requested model (admin assistant per-request pick)
 *   3. Global defaultModel
 *   4. Global fallbackModel
 *   5. First enabled model
 *   6. Hardcoded DEFAULT_GROQ_MODEL
 *
 * At each step, the model must be:
 *   - In the enabledModels list (CineLog admin allows it)
 *   - Available in the Groq project (verified via API, if possible)
 *
 * If the resolved model fails availability validation, the next
 * candidate in the chain is tried. If NO model can be resolved,
 * returns an error result instead of throwing.
 *
 * @param opts.feature        Which AI feature is requesting a model.
 * @param opts.requestedModel Explicit model override (admin assistant).
 */
export async function resolveAiModel(opts: {
  feature?: "userRecommendations" | "adminAssistant";
  requestedModel?: string;
} = {}): Promise<ModelResolution> {
  const settings = await checkAiSettings();
  const enabled = settings.enabledModels;

  if (enabled.length === 0) {
    return {
      model: "",
      available: false,
      error: "No models are enabled. Enable at least one model in /admin/ai."
    };
  }

  // Fetch Groq's actual available models (cached, best-effort).
  const groqModels = await fetchGroqAvailableModels();

  /** Check if a model passes both gates: enabled in CineLog AND
   *  available in Groq (if we can determine Groq availability). */
  const isUsable = (modelId: string): boolean => {
    if (!enabled.includes(modelId)) return false;
    // If we couldn't fetch Groq's model list, assume available.
    if (!groqModels) return true;
    return groqModels.includes(modelId);
  };

  // Build the candidate list in resolution order.
  const candidates: Array<{ model: string; reason: string }> = [];

  // 1. Feature-specific override
  if (opts.feature && settings.featureModels?.[opts.feature]) {
    candidates.push({
      model: settings.featureModels[opts.feature]!,
      reason: `feature override (${opts.feature})`
    });
  }

  // 2. Explicitly requested model
  if (opts.requestedModel) {
    candidates.push({
      model: opts.requestedModel,
      reason: "explicitly requested"
    });
  }

  // 3. Global default
  if (settings.defaultModel) {
    candidates.push({
      model: settings.defaultModel,
      reason: "default model"
    });
  }

  // 4. Global fallback
  if (settings.fallbackModel && settings.fallbackModel !== settings.defaultModel) {
    candidates.push({
      model: settings.fallbackModel,
      reason: "fallback model"
    });
  }

  // 5. All other enabled models (in order)
  for (const m of enabled) {
    if (
      m !== settings.defaultModel &&
      m !== settings.fallbackModel &&
      m !== opts.requestedModel &&
      m !== settings.featureModels?.[opts.feature ?? ""]
    ) {
      candidates.push({ model: m, reason: "enabled model" });
    }
  }

  // 6. Hardcoded ultimate fallback
  if (!candidates.some((c) => c.model === DEFAULT_GROQ_MODEL)) {
    candidates.push({
      model: DEFAULT_GROQ_MODEL,
      reason: "hardcoded fallback"
    });
  }

  // Try each candidate.
  for (const candidate of candidates) {
    if (isUsable(candidate.model)) {
      const isFirstChoice =
        candidates[0]?.model === candidate.model;
      return {
        model: candidate.model,
        available: true,
        ...(!isFirstChoice && {
          fallbackUsed: `Used ${candidate.model} (${candidate.reason}) because primary choice was unavailable."
        })
      };
    }
  }

  // No usable model found.
  return {
    model: "",
    available: false,
    error:
      "No usable AI model available. The configured models may be " +
      "disabled in CineLog or unavailable in the Groq project. " +
      "Check /admin/ai for model configuration."
  };
}

// ─── Convenience: getAiModel ────────────────────────────────────

/**
 * Simplified model resolution — returns just the model id string.
 *
 * Wraps resolveAiModel() for callers that don't need the full
 * ModelResolution metadata. Throws if no model can be resolved.
 *
 * @param requestedModel  Optional override (e.g. admin assistant user pick).
 * @param feature         Optional feature name for feature-specific overrides.
 */
export async function getAiModel(
  requestedModel?: string,
  feature?: "userRecommendations" | "adminAssistant"
): Promise<string> {
  const result = await resolveAiModel({ feature, requestedModel });
  if (!result.available || !result.model) {
    throw new Error(
      result.error ?? "No usable AI model available. Check /admin/ai."
    );
  }
  return result.model;
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
