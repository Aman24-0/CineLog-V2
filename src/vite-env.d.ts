/// <reference types="vite/client" />

/**
 * Augment Vite's ImportMetaEnv with all custom environment variables
 * used throughout the CineLog V2 codebase.
 *
 * This eliminates the need for `(import.meta as any).env?.SOME_VAR`
 * casts — every custom env var is now properly typed here.
 *
 * VITE_ prefixed vars are exposed to the browser by Vite.
 * Server-only vars (no VITE_ prefix) are available in SolidStart
 * server code but never shipped to the client bundle.
 */
interface ImportMetaEnv {
  // ── Supabase ────────────────────────────────────────────────────
  readonly VITE_SUPABASE_URL: string | undefined;
  readonly VITE_SUPABASE_ANON_KEY: string | undefined;

  // ── TMDB ────────────────────────────────────────────────────────
  readonly VITE_TMDB_API_KEY: string | undefined;

  // ── Sentry ──────────────────────────────────────────────────────
  readonly VITE_SENTRY_DSN: string | undefined;
  readonly VITE_SENTRY_RELEASE: string | undefined;

  // ── Resend (transactional email) ────────────────────────────────
  readonly VITE_RESEND_FROM_EMAIL: string | undefined;

  // ── App ─────────────────────────────────────────────────────────
  readonly VITE_APP_BASE_URL: string | undefined;



  // ── Trakt ──────────────────────────────────────────────────────
  readonly VITE_TRAKT_CLIENT_ID: string | undefined;

  // ── Vercel (build-time git metadata) ───────────────────────────
  readonly VITE_VERCEL_GIT_COMMIT_SHA: string | undefined;
  readonly VITE_VERCEL_GIT_COMMIT_MESSAGE: string | undefined;
  readonly VITE_VERCEL_GIT_COMMIT_AUTHOR_NAME: string | undefined;
  readonly VITE_VERCEL_URL: string | undefined;

  // ── Server-only (no VITE_ prefix — never shipped to browser) ───
  readonly SUPABASE_DEBUG_COOKIE_LOG: string | undefined;

  // ── Vitest ─────────────────────────────────────────────────────
  // Set automatically by Vitest when running tests.
  readonly VITEST: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
