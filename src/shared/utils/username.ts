/**
 * CineLog V2 — Username System
 * ---------------------------------------------------------------------
 * Complete production-grade username system: validation, sanitization,
 * availability checking, and candidate generation.
 *
 * Architecture:
 *   sanitizeUsername()      — transform raw input into a valid username
 *   validateUsername()      — check if a username meets all rules
 *   checkUsernameAvailability() — query the database (in repository layer)
 *   generateUsernameCandidates() — generate alternatives when taken
 *   findAvailableUsername() — try candidates until one is available
 *
 * Username rules (Telegram/GitHub style):
 *   • Lowercase only (a-z, 0-9, _)
 *   • 3–24 characters
 *   • Must start with a letter
 *   • Cannot start or end with _
 *   • Cannot contain __ (consecutive underscores)
 *   • No spaces, no special characters
 *
 * Reserved usernames (cannot be claimed by users):
 *   admin, support, system, official, cinelog, api, root, owner,
 *   staff, discover, watchlist, collection, collections, settings,
 *   profile, login, signup, auth, search, movie, series, help,
 *   about, privacy, terms
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 24;

/**
 * Reserved usernames that cannot be claimed by users.
 * These are system/route names that would conflict with app URLs
 * (e.g., /user/admin would be confusing).
 */
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  "admin", "support", "system", "official", "cinelog", "api",
  "root", "owner", "staff", "discover", "watchlist", "collection",
  "collections", "settings", "profile", "login", "signup", "auth",
  "search", "movie", "series", "help", "about", "privacy", "terms",
  "cinema", "film", "tv", "shows", "new", "user", "null", "undefined",
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UsernameValidationStatus =
  | "valid"           // Username passes all format rules
  | "too_short"       // Fewer than USERNAME_MIN_LENGTH characters
  | "too_long"        // More than USERNAME_MAX_LENGTH characters
  | "invalid_format"  // Contains disallowed characters or patterns
  | "reserved"        // Is a reserved system username
  | "starts_underscore" // Starts with _
  | "ends_underscore"   // Ends with _
  | "double_underscore" // Contains __
  | "must_start_letter"; // Doesn't start with a letter

export interface UsernameValidationResult {
  status: UsernameValidationStatus;
  valid: boolean;
  message: string;
  sanitized: string; // The sanitized version of the input
}

// ---------------------------------------------------------------------------
// Sanitization
// ---------------------------------------------------------------------------

/**
 * Sanitize a raw string into a valid username format.
 *
 * This does NOT validate — it only transforms. It:
 *   1. Lowercases everything
 *   2. Removes all characters except [a-z0-9_]
 *   3. Collapses consecutive underscores into one
 *   4. Trims leading/trailing underscores
 *   5. Truncates to USERNAME_MAX_LENGTH
 *
 * Example:
 *   "Aman Dahayat" → "aman_dahayat"
 *   "AMAN24" → "aman24"
 *   "Aman__24" → "aman_24"
 *   "john.doe@gmail.com" → "john_doe"
 *
 * @param input The raw input string (display name, email, or typed username)
 * @returns The sanitized string (may still need validation)
 */
export function sanitizeUsername(input: string): string {
  if (!input) return "";

  // Extract local part if it's an email
  let s = input.includes("@") ? input.split("@")[0] : input;

  // Lowercase
  s = s.toLowerCase();

  // Replace common separators with underscore
  s = s.replace(/[\.\-\+\s]/g, "_");

  // Remove any character that's not a-z, 0-9, or _
  s = s.replace(/[^a-z0-9_]/g, "");

  // Collapse consecutive underscores
  s = s.replace(/_+/g, "_");

  // Remove leading non-letters (underscores and digits)
  s = s.replace(/^[^a-z]+/, "");

  // Remove trailing underscore
  s = s.replace(/_$/, "");

  // Truncate to max length
  s = s.slice(0, USERNAME_MAX_LENGTH);

  // Re-trim trailing underscore after truncation
  s = s.replace(/_$/, "");

  return s;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate a username against ALL CineLog rules.
 *
 * This is a PURE function — no database calls. It checks:
 *   • Length (3–24 characters)
 *   • Only [a-z0-9_] characters
 *   • Starts with a letter
 *   • No leading/trailing underscore
 *   • No consecutive underscores (__)
 *   • Not a reserved username
 *
 * For availability checking (is it taken?), use checkUsernameAvailability()
 * in the repository layer.
 *
 * @param username The username to validate (should be pre-sanitized)
 * @returns Validation result with status, message, and sanitized version
 */
export function validateUsername(username: string): UsernameValidationResult {
  const sanitized = sanitizeUsername(username);

  // Check: empty after sanitization
  if (!sanitized) {
    return {
      status: "invalid_format",
      valid: false,
      message: "Username must contain at least one letter.",
      sanitized: "",
    };
  }

  // Check: minimum length
  if (sanitized.length < USERNAME_MIN_LENGTH) {
    return {
      status: "too_short",
      valid: false,
      message: `Username must be at least ${USERNAME_MIN_LENGTH} characters.`,
      sanitized,
    };
  }

  // Check: maximum length
  if (sanitized.length > USERNAME_MAX_LENGTH) {
    return {
      status: "too_long",
      valid: false,
      message: `Username must be at most ${USERNAME_MAX_LENGTH} characters.`,
      sanitized: sanitized.slice(0, USERNAME_MAX_LENGTH),
    };
  }

  // Check: must start with a letter
  if (!/^[a-z]/.test(sanitized)) {
    return {
      status: "must_start_letter",
      valid: false,
      message: "Username must start with a letter.",
      sanitized,
    };
  }

  // Check: only [a-z0-9_] — already guaranteed by sanitizeUsername,
  // but double-check for safety
  if (!/^[a-z0-9_]+$/.test(sanitized)) {
    return {
      status: "invalid_format",
      valid: false,
      message: "Username can only contain letters, numbers, and underscores.",
      sanitized,
    };
  }

  // Check: no leading underscore
  if (sanitized.startsWith("_")) {
    return {
      status: "starts_underscore",
      valid: false,
      message: "Username cannot start with an underscore.",
      sanitized,
    };
  }

  // Check: no trailing underscore
  if (sanitized.endsWith("_")) {
    return {
      status: "ends_underscore",
      valid: false,
      message: "Username cannot end with an underscore.",
      sanitized,
    };
  }

  // Check: no consecutive underscores
  if (sanitized.includes("__")) {
    return {
      status: "double_underscore",
      valid: false,
      message: "Username cannot contain consecutive underscores.",
      sanitized,
    };
  }

  // Check: reserved username
  if (RESERVED_USERNAMES.has(sanitized)) {
    return {
      status: "reserved",
      valid: false,
      message: "This username is reserved.",
      sanitized,
    };
  }

  // All checks passed
  return {
    status: "valid",
    valid: true,
    message: "Username is valid.",
    sanitized,
  };
}

// ---------------------------------------------------------------------------
// Candidate generation
// ---------------------------------------------------------------------------

/**
 * Generate username candidates from a base, in order of preference.
 *
 * Pattern: base → base24 → base_24 → base247 → base_247 → ...
 *
 * @param base The sanitized username base (from email or display name).
 * @param maxAttempts Maximum number of candidates to generate.
 * @returns Array of candidate usernames, most preferred first.
 */
export function generateUsernameCandidates(base: string, maxAttempts = 10): string[] {
  const candidates: string[] = [base];
  const suffixes = ["24", "_24", "247", "_247", "2471", "_2471", "24715", "_24715", "247159", "_247159"];

  for (let i = 0; i < Math.min(suffixes.length, maxAttempts - 1); i++) {
    const candidate = `${base}${suffixes[i]}`.slice(0, USERNAME_MAX_LENGTH);
    if (!candidates.includes(candidate)) {
      candidates.push(candidate);
    }
  }

  // If we still need more, use random numbers
  while (candidates.length < maxAttempts) {
    const num = Math.floor(Math.random() * 99999) + 1;
    const candidate = `${base}${num}`.slice(0, USERNAME_MAX_LENGTH);
    if (!candidates.includes(candidate)) {
      candidates.push(candidate);
    }
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// Display name extraction (used by ensureProfile)
// ---------------------------------------------------------------------------

/**
 * Extract a display name from an email address.
 *
 * "aman@gmail.com" → "Aman"
 * "john.doe@yahoo.com" → "John Doe"
 * "sarah_connor@skynet.com" → "Sarah Connor"
 */
export function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0];
  const name = local.replace(/[\.\-\+_]/g, " ").trim();
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
