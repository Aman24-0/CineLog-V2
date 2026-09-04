// src/routes/api/vault/clear-new-release.ts
//
// POST /api/vault/clear-new-release
//   Body: { tmdbId: number, mediaType: string }
//   → 200 { success: true }
//   → 401 on missing session
//   → 404 on vault item not found
//
// Clears the has_new_release flag on a vault item. Called when the user
// opens the details page for a title that was auto-reactivated from
// Completed to Watching by the episode release detection cron job.
//
// The optimistic local update (useUserLibrary.updateItem) already clears
// the badge in the UI immediately — this API call persists the change
// to Supabase so it survives a page refresh.

import { isServer } from "solid-js/web";
import { createAdminClient } from "~/lib/supabase/admin/adminClient";
import { getSupabaseAccessTokenFromRequest } from "~/lib/supabase/admin/sessionCookie";

interface APIEvent {
  request: Request;
}

interface ClearNewReleaseBody {
  tmdbId?: number;
  mediaType?: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

export async function POST(event: APIEvent): Promise<Response> {
  if (!isServer) return jsonResponse({ error: "Server only" }, 500);

  try {
    const body = (await event.request.json()) as ClearNewReleaseBody;

    if (!body?.tmdbId || !body?.mediaType) {
      return jsonResponse({ error: "Missing tmdbId or mediaType" }, 400);
    }

    // Get the caller's UID from the access token
    const accessToken = getSupabaseAccessTokenFromRequest(event.request);
    if (!accessToken) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const adminClient = createAdminClient();

    // Verify the user's session
    const { data: userData, error: userError } =
      await adminClient.auth.getUser(accessToken);
    if (userError || !userData.user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const userId = userData.user.id;

    // Clear has_new_release on the vault item
    const { error: updateError } = await adminClient
      .from("vault")
      .update({
        has_new_release: false,
        updated_at: new Date().toISOString()
      })
      .eq("user_id", userId)
      .eq("tmdb_id", body.tmdbId)
      .eq("media_type", body.mediaType)
      .is("deleted_at", null);

    if (updateError) {
      console.warn("[api/vault/clear-new-release] update error:", updateError.message);
      return jsonResponse({ error: "Failed to clear NEW badge" }, 500);
    }

    return jsonResponse({ success: true });
  } catch (err) {
    console.error("[api/vault/clear-new-release] error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
}
