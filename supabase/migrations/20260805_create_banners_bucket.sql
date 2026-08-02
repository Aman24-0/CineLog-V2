-- supabase/migrations/20260805_create_banners_bucket.sql
-- ─────────────────────────────────────────────────────────────────
-- CineLog V2 — Create the `banners` Storage Bucket
-- ─────────────────────────────────────────────────────────────────
-- The banner-upload feature (EditProfileModal → BannerEditor →
-- uploadBannerToSupabase) uploads compressed JPEGs to a Storage bucket
-- named `banners`. The bucket was documented in migration
-- 20260730_add_social_and_profile_fields.sql but never actually
-- created — the comment said "actual bucket creation is performed by
-- the apply script / dashboard", which never happened.
--
-- Result: every banner upload failed with "Bucket not found", and the
-- code fell back to a data URL (a ~270KB base64 string stored in
-- profiles.banner_url). This worked but was slow + bloated the
-- profiles table.
--
-- This migration creates the bucket via the Storage API + sets up
-- the RLS policies:
--   • Public read (banners are visible on shared profiles)
--   • Authenticated write to the user's own folder (uid/...)
--
-- The migration is idempotent — it uses `insert ... on conflict do
-- nothing` so re-running it is safe.

-- ─── 1. Create the bucket ────────────────────────────────────────
-- The `storage.buckets` table is the Supabase Storage metadata table.
-- We insert a row with id='banners', name='banners', public=true.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'banners',
  'banners',
  true,  -- public read — banners are visible on shared profiles
  5242880,  -- 5 MB file size limit (compressed banners are ~200-400KB)
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- ─── 2. RLS policies for the banners bucket ──────────────────────
-- Storage RLS is separate from table RLS — it's on the `storage.objects`
-- table, scoped by `bucket_id`.

-- 2.1 Public read — anyone (anon + authenticated) can read banner
-- objects. This is required because banners appear on public profiles
-- (/u/<username>) which are viewable by logged-out users.
DROP POLICY IF EXISTS "banners_public_read" ON storage.objects;
CREATE POLICY "banners_public_read"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'banners');

-- 2.2 Authenticated insert — a user can upload to banners/<their-uid>/.
-- The path constraint (storage.foldername(name)[1] = auth.uid()::text)
-- ensures a user can only write to their own folder.
-- We use foldername(name)[1] because the upload path is
-- "<uid>/banner.jpg" — the first folder segment is the uid.
DROP POLICY IF EXISTS "banners_authenticated_insert" ON storage.objects;
CREATE POLICY "banners_authenticated_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'banners'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 2.3 Authenticated update — a user can overwrite their own banner.
-- Same path constraint as insert.
DROP POLICY IF EXISTS "banners_authenticated_update" ON storage.objects;
CREATE POLICY "banners_authenticated_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'banners'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'banners'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 2.4 Authenticated delete — a user can delete their own banner.
DROP POLICY IF EXISTS "banners_authenticated_delete" ON storage.objects;
CREATE POLICY "banners_authenticated_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'banners'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ─── 3. Also create the `avatars` bucket (same pattern) ──────────
-- The EditProfileModal also has an uploadAvatarToSupabase helper that
-- targets an `avatars` bucket. Create it with the same policies so
-- avatar uploads work too.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152,  -- 2 MB (avatars are smaller than banners)
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY "avatars_public_read"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_authenticated_insert" ON storage.objects;
CREATE POLICY "avatars_authenticated_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "avatars_authenticated_update" ON storage.objects;
CREATE POLICY "avatars_authenticated_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "avatars_authenticated_delete" ON storage.objects;
CREATE POLICY "avatars_authenticated_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================================
-- Done. The banners + avatars buckets now exist with proper RLS policies.
-- Existing banner uploads that fell back to data URLs will continue to work
-- (the data URL is stored in profiles.banner_url, which is still valid).
-- New uploads will use Storage and return a proper public URL.
-- ============================================================================
