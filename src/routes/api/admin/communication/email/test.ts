// src/routes/api/admin/communication/email/test.ts
//
// CineLog V2 — Admin: Send Test Email (Phase 9 Chunk 4)
// ---------------------------------------------------------------------
// POST /api/admin/communication/email/test
//   Headers: admin cookie
//   Body: {
//     template: "reminder" | "weekly_recap" | "new_season"
//            | "continue_watching" | "recommendations" | "sync_status",
//     to?: string  // optional, defaults to admin's own email
//   }
//   → 200 { ok: true, mock?: boolean, message: string }
//   → 400 on validation error
//   → 401 on missing admin session
//   → 503 on Resend API failure / missing key
//
// WHAT THIS DOES:
//   Renders the chosen email template with sample context, then sends
//   it to the admin's own email address (or an explicit `to` if
//   provided). This is the "Send Test Email" button on the
//   Communication Hub → Email page.
//
// HOW IT DIFFERS FROM /api/email/send:
//   • /api/email/send requires a USER Supabase session. This endpoint
//     requires an ADMIN session (admin cookie).
//   • /api/email/send respects the user's email-notification prefs.
//     This endpoint BYPASSES prefs — the admin is explicitly testing
//     the email channel.
//   • /api/email/send takes raw HTML. This endpoint takes a template
//     name and renders the template server-side.
//
// CRITICAL RULE COMPLIANCE:
//   • Zero duplication — this is the ONLY admin test-email endpoint.
//   • Strict user-side mapping — uses the SAME templates
//     (src/lib/email/templates/) that user-side emails use. No dummy
//     templates.
//   • No OMDB.

import {
  requireAdmin,
  type AdminAPIEvent
} from "~/lib/supabase/admin/adminGuard";
import { renderEmailTemplate, type NotificationType } from "~/lib/email/renderer";

type APIEvent = AdminAPIEvent;

interface TestEmailBody {
  template?: unknown;
  to?: unknown;
}

const VALID_TEMPLATES: NotificationType[] = [
  "reminder",
  "weekly_recap",
  "new_season",
  "continue_watching",
  "recommendations",
  "sync_status"
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

// Sample context for each template. These values are intentionally
// generic so the rendered email looks like a real notification
// without depending on any specific user data.
const SAMPLE_CONTEXT: Record<NotificationType, Parameters<typeof renderEmailTemplate>[1]> = {
  reminder: {
    title: "The Bear — Season 3, Episode 7",
    releaseDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString(),
    message: "New episode airs in 24 hours. Don't miss it!"
  },
  weekly_recap: {
    activity: {
      completed: 4,
      rated: 7,
      added: 3,
      highestRated: { title: "Dune: Part Two", rating: 9 }
    }
  },
  new_season: {
    seriesName: "Severance",
    seasonNumber: 2,
    episodeCount: 10
  },
  continue_watching: {
    title: "Shōgun",
    progress: "S1 E5 — 32 min remaining"
  },
  recommendations: {
    recommendations: [
      { title: "Past Lives", year: "2023" },
      { title: "Anatomy of a Fall", year: "2023" },
      { title: "The Zone of Interest", year: "2023" }
    ]
  },
  sync_status: {
    status: "success",
    timestamp: new Date().toLocaleString(),
    titleCount: 247
  }
};

const SUBJECT_BY_TEMPLATE: Record<NotificationType, string> = {
  reminder: "CineLog test — Episode reminder",
  weekly_recap: "CineLog test — Your weekly recap",
  new_season: "CineLog test — New season alert",
  continue_watching: "CineLog test — Continue watching",
  recommendations: "CineLog test — Recommended for you",
  sync_status: "CineLog test — Sync status"
};

export async function POST(event: APIEvent) {
  // Admin auth.
  const admin = await requireAdmin(event);
  if (!admin.ok) {
    return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  }

  // Parse + validate body.
  const body = (await event.request.json().catch(() => ({}))) as TestEmailBody;
  const template = body.template as NotificationType;
  if (!template || !VALID_TEMPLATES.includes(template)) {
    return jsonResponse(
      {
        ok: false,
        error: `Invalid template. Must be one of: ${VALID_TEMPLATES.join(", ")}`
      },
      400
    );
  }

  const to =
    typeof body.to === "string" && body.to.includes("@")
      ? body.to.trim()
      : admin.admin.email;

  if (!to) {
    return jsonResponse(
      { ok: false, error: "No recipient email address available." },
      400
    );
  }

  // Render the template.
  const html = renderEmailTemplate(template, SAMPLE_CONTEXT[template]);
  const subject = SUBJECT_BY_TEMPLATE[template];

  // Send via Resend.
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail =
    process.env.RESEND_FROM_EMAIL || "CineLog <noreply@cinelog.app>";

  if (!apiKey) {
    // Mock mode — log to console and return success.
    console.log(
      `[admin/communication/email/test] MOCK MODE — RESEND_API_KEY not set.\n` +
        `To: ${to}\nSubject: ${subject}\nLength: ${html.length} chars`
    );
    return jsonResponse({
      ok: true,
      mock: true,
      message:
        "Mock mode — RESEND_API_KEY not set. Email content was logged to the server console."
    });
  }

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: fromEmail,
        to,
        subject,
        html
      })
    });

    if (!resp.ok) {
      const errorText = await resp.text().catch(() => "unknown");
      console.error(
        `[admin/communication/email/test] Resend API error: ${resp.status} ${errorText}`
      );
      return jsonResponse(
        {
          ok: false,
          error: `Resend API returned ${resp.status}: ${errorText}`
        },
        502
      );
    }

    const data = (await resp.json().catch(() => ({}))) as { id?: string };
    return jsonResponse({
      ok: true,
      messageId: data.id,
      message: `Test email sent to ${to}`
    });
  } catch (err) {
    console.error("[admin/communication/email/test] error:", err);
    return jsonResponse(
      { ok: false, error: "Failed to send email via Resend" },
      502
    );
  }
}
