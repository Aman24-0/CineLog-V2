// src/lib/email/templates/base.ts
//
// CineLog V2 — Base Email Template (Phase 2 — Task 15)
// ---------------------------------------------------------------------
// The shared HTML wrapper every CineLog email uses. Provides:
//   • A dark-themed container with CineLog branding (gold gradient wordmark).
//   • A header with the "🎬 CineLog" wordmark.
//   • A content slot for the email-specific body.
//   • A footer linking back to the notification-preferences page so
//     the user can opt out in one click.
//
// WHY A SINGLE BASE TEMPLATE:
//   All CineLog emails share the same visual identity. Keeping the
//   wrapper in one place means a rebrand only touches one file, and
//   every email type (reminder, recap, new season, etc.) renders
//   inside the same chrome so the user always knows the message
//   came from CineLog.
//
// INLINE CSS RATIONALE:
//   Resend (and most email clients) strip <style> tags from the
//   <head>, so we inline all CSS on the root elements. The styles
//   here are deliberately minimal — dark background, gold accent,
//   generous spacing — because Gmail / Outlook ignore most modern
//   CSS. Flexbox, grid, and media queries are NOT used because
//   Outlook desktop doesn't support them.
//
// USAGE:
//   import { renderBaseEmail } from "~/lib/email/templates/base";
//   const html = renderBaseEmail("<p>Your content here</p>", "Subject");
//
// The `title` parameter is currently used for the <title> tag only
// (not visible in most email clients, but shown in browser previews
// and tab titles if the user opens the email in a web view).

/**
 * Render the CineLog-branded email wrapper around an arbitrary HTML
 * content string.
 *
 * @param content — HTML string for the email body (no <body> tag needed).
 * @param title   — Used in the <title> element. Not visible in most
 *                  email clients, but used by browser-based email
 *                  previews and tab titles.
 * @returns A complete HTML document string.
 */
export function renderBaseEmail(content: string, title: string): string {
  // Escape the title for safe inclusion in the <title> element.
  // We don't escape `content` because it's already trusted HTML
  // produced by the other template functions (which themselves
  // escape any user-provided strings they interpolate).
  const safeTitle = title
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark only">
  <meta name="supported-color-schemes" content="dark only">
  <title>${safeTitle}</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;">
  <div role="presentation" style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <div style="text-align:center;padding-bottom:30px;border-bottom:1px solid #2a2a2a;">
      <h1 style="margin:0;font-size:28px;font-weight:700;color:#f5c842;letter-spacing:-0.5px;">
        🎬 CineLog
      </h1>
    </div>
    <div style="padding:30px 0;">
      ${content}
    </div>
    <div style="text-align:center;padding-top:30px;border-top:1px solid #2a2a2a;font-size:12px;color:#888;">
      <p style="margin:0 0 6px 0;">
        You received this email because you enabled email notifications in CineLog.
      </p>
      <p style="margin:0;">
        <a href="https://cinelogv2.vercel.app/settings/notifications" style="color:#f5c842;text-decoration:underline;">
          Manage your notification preferences
        </a>
      </p>
    </div>
  </div>
</body>
</html>`;
}
