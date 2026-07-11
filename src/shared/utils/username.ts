/**
 * CineLog V2 — Username Generation Utility
 * ---------------------------------------------------------------------
 * Generates unique, URL-safe usernames from email addresses.
 *
 * Algorithm (Telegram/Discord style):
 *   1. Extract the local part of the email (before @)
 *   2. Sanitize: lowercase, remove spaces, keep only [a-z0-9_]
 *   3. If the base username is taken, append incrementing suffixes:
 *      aman → aman24 → aman_24 → aman247 → aman2471 → ...
 *   4. Never exceed 20 characters total
 *
 * The suffix pattern alternates between numeric and underscore-numeric
 * to maximize the chance of finding a short, readable username.
 */

/**
 * Sanitize a string into a valid CineLog username.
 * Rules: lowercase, no spaces, only [a-z0-9_], max 20 chars, must start
 * with a letter.
 */
export function sanitizeUsername(input: string): string {
  // Extract local part if it's an email
  let local = input.includes("@") ? input.split("@")[0] : input;
  // Lowercase
  local = local.toLowerCase();
  // Replace common separators with underscore
  local = local.replace(/[\.\-\+]/g, "_");
  // Remove any character that's not a-z, 0-9, or _
  local = local.replace(/[^a-z0-9_]/g, "");
  // Remove leading underscores/digits (must start with a letter)
  local = local.replace(/^[^a-z]+/, "");
  // Collapse multiple underscores
  local = local.replace(/_+/g, "_");
  // Remove trailing underscore
  local = local.replace(/_$/, "");
  // Truncate to 20 chars
  local = local.slice(0, 20);
  return local || "cinephile";
}

/**
 * Generate username candidates from a base, in order of preference.
 *
 * Pattern: base → base24 → base_24 → base247 → base_247 → ...
 *
 * @param base The sanitized username base (from email).
 * @param maxAttempts Maximum number of candidates to generate.
 * @returns Array of candidate usernames, most preferred first.
 */
export function generateUsernameCandidates(base: string, maxAttempts = 10): string[] {
  const candidates: string[] = [base];
  const suffixes = ["24", "_24", "247", "_247", "2471", "_2471", "24715", "_24715", "247159", "_247159"];

  for (let i = 0; i < Math.min(suffixes.length, maxAttempts - 1); i++) {
    const candidate = `${base}${suffixes[i]}`.slice(0, 20);
    if (!candidates.includes(candidate)) {
      candidates.push(candidate);
    }
  }

  // If we still need more, use random numbers
  while (candidates.length < maxAttempts) {
    const num = Math.floor(Math.random() * 99999) + 1;
    const candidate = `${base}${num}`.slice(0, 20);
    if (!candidates.includes(candidate)) {
      candidates.push(candidate);
    }
  }

  return candidates;
}

/**
 * Extract a display name from an email address.
 *
 * "aman@gmail.com" → "Aman"
 * "john.doe@yahoo.com" → "John Doe"
 * "sarah_connor@skynet.com" → "Sarah Connor"
 */
export function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0];
  // Replace separators with spaces
  const name = local.replace(/[\.\-\+_]/g, " ").trim();
  // Title case each word
  const titled = name
    .split(" ")
    .filter((w) => w.length > 0)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
  return titled || "New User";
}

/**
 * Extract a display name from Google OAuth user metadata.
 *
 * Falls back to email-derived name if no Google metadata is available.
 */
export function displayNameFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
  email: string | null | undefined,
): string {
  const fullName = metadata?.full_name ?? metadata?.name ?? metadata?.display_name;
  if (typeof fullName === "string" && fullName.trim().length > 0) {
    return fullName.trim();
  }
  if (email) {
    return displayNameFromEmail(email);
  }
  return "New User";
}
