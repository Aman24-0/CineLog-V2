// src/routes/api/admin/ai/models.ts
//
// CineLog V2 — Admin AI Models Availability API
// ---------------------------------------------------------------------
// GET /api/admin/ai/models — returns the list of models available in
// the Groq project AND the current CineLog AI settings, so the admin
// UI can show availability warnings and prevent invalid configuration.
//
// SECURITY: Admin-only (requires admin session cookie).

import {
  requireAdmin,
  type AdminAPIEvent
} from "~/lib/supabase/admin/adminGuard";
import {
  fetchGroqAvailableModels,
  checkAiSettings
} from "~/lib/server/groq";

type APIEvent = AdminAPIEvent;

interface ModelsResponse {
  /** Models available in the Groq project (from Groq API). */
  groqAvailable: string[];
  /** Models enabled in CineLog (from ai_settings). */
  cilogEnabled: string[];
  /** The configured default model. */
  defaultModel: string;
  /** The configured fallback model. */
  fallbackModel: string;
  /** Models that are enabled in CineLog but NOT available in Groq. */
  unavailableInGroq: string[];
}

export async function GET(event: APIEvent): Promise<Response> {
  const adminResult = await requireAdmin(event);
  if (!adminResult.ok) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const [groqModels, settings] = await Promise.all([
      fetchGroqAvailableModels(),
      checkAiSettings()
    ]);

    const groqAvailable = groqModels ?? [];
    const cilogEnabled = settings.enabledModels;

    // Find models enabled in CineLog but not available in Groq.
    const unavailableInGroq = groqModels
      ? cilogEnabled.filter((m) => !groqAvailable.includes(m))
      : [];

    const body: ModelsResponse = {
      groqAvailable,
      cilogEnabled,
      defaultModel: settings.defaultModel,
      fallbackModel: settings.fallbackModel,
      unavailableInGroq
    };

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        // Short cache — availability can change.
        "Cache-Control": "private, max-age=60, s-maxage=0"
      }
    });
  } catch (err) {
    console.error("[admin/ai/models] error:", err);
    return new Response(
      JSON.stringify({ error: "Failed to check model availability" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
