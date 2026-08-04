-- 20260810_add_admin_2fa.sql
--
-- Phase 6 Part 3 — Task 4 (Admin Features)
--
-- Adds the `admin_2fa_secrets` table for admin TOTP-based 2FA.
--
-- Each admin (profile with is_admin=TRUE) can enroll a single TOTP
-- secret. While enrolled, the admin login flow requires a 6-digit
-- TOTP code in addition to the existing PIN.
--
-- The secret is stored AES-encrypted with a server-side key
-- (ADMIN_2FA_ENCRYPTION_KEY env var). This way, even if the database
-- is compromised, the attacker cannot derive TOTP codes without the
-- encryption key.
--
-- Schema:
--   admin_id          UUID  — FK to profiles.id, PRIMARY KEY (1:1)
--   secret_cipher     TEXT  — AES-256-GCM-encrypted Base64 TOTP secret
--   enabled_at        TIMESTAMPTZ — when 2FA was enabled (NULL = pending)
--   backup_codes_hash TEXT  — JSON array of bcrypt-hashed backup codes (future)
--   created_at        TIMESTAMPTZ
--   updated_at        TIMESTAMPTZ
--
-- RLS: admin-only (admin_id = auth.uid() AND is_admin = TRUE).

CREATE TABLE IF NOT EXISTS public.admin_2fa_secrets (
  admin_id          UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  secret_cipher     TEXT NOT NULL,
  enabled_at        TIMESTAMPTZ,
  backup_codes_hash TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_2fa_enabled
  ON public.admin_2fa_secrets(admin_id)
  WHERE enabled_at IS NOT NULL;

ALTER TABLE public.admin_2fa_secrets ENABLE ROW LEVEL SECURITY;

-- Admins can read + update their OWN 2FA secret only.
DROP POLICY IF EXISTS "admin_2fa_self_read" ON public.admin_2fa_secrets;
CREATE POLICY "admin_2fa_self_read" ON public.admin_2fa_secrets
  FOR SELECT TO authenticated
  USING (
    admin_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_admin = TRUE
        AND p.admin_disabled_at IS NULL
        AND p.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "admin_2fa_self_insert" ON public.admin_2fa_secrets;
CREATE POLICY "admin_2fa_self_insert" ON public.admin_2fa_secrets
  FOR INSERT TO authenticated
  WITH CHECK (
    admin_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_admin = TRUE
        AND p.admin_disabled_at IS NULL
        AND p.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "admin_2fa_self_update" ON public.admin_2fa_secrets;
CREATE POLICY "admin_2fa_self_update" ON public.admin_2fa_secrets
  FOR UPDATE TO authenticated
  USING (admin_id = auth.uid())
  WITH CHECK (admin_id = auth.uid());

DROP POLICY IF EXISTS "admin_2fa_self_delete" ON public.admin_2fa_secrets;
CREATE POLICY "admin_2fa_self_delete" ON public.admin_2fa_secrets
  FOR DELETE TO authenticated
  USING (admin_id = auth.uid());

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_admin_2fa_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_2fa_updated_at ON public.admin_2fa_secrets;
CREATE TRIGGER trg_admin_2fa_updated_at
  BEFORE UPDATE ON public.admin_2fa_secrets
  FOR EACH ROW EXECUTE FUNCTION public.tg_admin_2fa_updated_at();
