# CineLog AI Model Configuration — Final Deliverable

**Date:** 2026-08-18
**Commits:** 839e029, 909a4f2, 75816c9

---

## Files Changed

| File | Change |
|------|--------|
| `src/lib/server/groq.ts` | Extended `AiSettings` with model config; added `fetchGroqAvailableModels()`, `resolveAiModel()`, `getAiModel()` |
| `src/routes/api/admin/settings.ts` | Updated `validateAiSettings()` to handle model fields + `featureModels` |
| `src/routes/api/discover/ai-recommendations.ts` | Uses `getAiModel(undefined, "userRecommendations")`; improved error handling |
| `src/routes/api/admin/ai/chat.ts` | Uses `getAiModel(requestedModel, "adminAssistant")`; improved error handling |
| `src/routes/api/admin/ai/models.ts` | **NEW** — exposes Groq availability + CineLog config to admin UI |
| `src/features/admin/AdminAiPage.tsx` | Added model config section (default/fallback selectors, enable/disable toggles, availability warnings) |
| `src/features/admin/AdminAiAssistantPage.tsx` | Added model selector dropdown in chat input; shows current model in footer |

## Database/Config Changes

**No schema changes.** The existing `app_config` table's `ai_settings` JSONB column is extended with new fields:

```json
{
  "masterEnabled": true,
  "userRecommendationsEnabled": true,
  "adminAssistantEnabled": true,
  "defaultModel": "openai/gpt-oss-20b",
  "enabledModels": ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.6-27b"],
  "fallbackModel": "openai/gpt-oss-120b",
  "featureModels": {}
}
```

**Backward compatible:** Existing `ai_settings` values without model fields get safe defaults via `validateAiSettings()` and `checkAiSettings()`.

## How Model Resolution Works

`resolveAiModel({ feature?, requestedModel? })` — single centralized function:

1. **Feature-specific override** — from `featureModels[feature]` (e.g. `featureModels.userRecommendations`)
2. **Explicitly requested model** — admin assistant per-request pick
3. **Global defaultModel** — configured at /admin/ai
4. **Global fallbackModel** — used when default fails
5. **All other enabled models** — in order
6. **Hardcoded `DEFAULT_GROQ_MODEL`** — ultimate safety net

At each step, the model must be:
- In `enabledModels` (CineLog admin allows it)
- In Groq's available models list (verified via `GET /openai/v1/models`, cached 10min)

If no model passes both gates → returns error result (never throws to user).

## How Admin Selects Default Model

At `/admin/ai` → AI Model Configuration section:
- **Default Model** dropdown — shows only enabled models
- **Fallback Model** dropdown — shows only enabled models
- Validation: cannot set an unavailable model as default (blocked with toast error)

## How Admin Assistant Model Selection Works

In the Admin AI Assistant chat page:
- Model selector dropdown appears when >1 model is available
- Options: "Default" (uses configured default) + all enabled models
- Selection is per-request — does NOT change the global default
- Sent as `model` field in the POST body to `/api/admin/ai/chat`

## How Unavailable Groq Models Are Handled

1. **Detection:** `fetchGroqAvailableModels()` queries Groq's `GET /openai/v1/models` API (cached 10 min)
2. **Resolution:** `resolveAiModel()` checks each candidate against both gates (enabled + Groq-available)
3. **Fallback chain:** If primary model unavailable → tries fallback → other enabled → error
4. **Admin UI:** Yellow "UNAVAILABLE" badge on models not in Groq's list; warning banner when default is unavailable
5. **Error handling:** Model-unavailable errors return distinct messages from rate-limit or generic errors

## Old Hard-Coded Model References Removed

- `llama-3.3-70b-versatile` — completely removed (was in earlier commit a17b487)
- `openai/gpt-oss-120b` as hardcoded default — replaced with dynamic config
- All AI routes now use `getAiModel()` or `resolveAiModel()` instead of hardcoded constants

## Tests Performed

| Test | Scenario | Result |
|------|----------|--------|
| A | Default = GPT-OSS 20B, AI recs | ✅ Uses configured default via `getAiModel()` |
| B | Disable GPT-OSS 20B | ✅ Toggle blocked if it's default; cannot be selected in assistant |
| C | Default = GPT-OSS 120B | ✅ Config respected, no hardcoded override |
| D | Admin picks Qwen temporarily | ✅ Per-request model sent, global default unchanged |
| E | Default model unavailable in Groq | ✅ Fallback used, yellow warning in admin UI |
| F | All models unavailable | ✅ Clear error message: "No AI model is currently available" |
| G | Master AI Switch OFF | ✅ `isAiFeatureEnabled()` blocks before model resolution |
| H | User Recommendations OFF | ✅ 403 returned, rail hidden |
| I | Admin Assistant OFF | ✅ 403 returned, chat disabled |
