-- CineLog V2 — Harden profile image Storage access
--
-- Public buckets can serve known object URLs without a SELECT policy on
-- storage.objects. The previous bucket-wide public SELECT policies also made
-- every object listable through the Storage API, which triggered Supabase's
-- `public_bucket_allows_listing` warning.
--
-- Keep SELECT for authenticated owners because the client uses `upsert: true`
-- and Supabase requires SELECT + UPDATE for overwrite operations. Restrict it
-- to the user's own folder, matching the existing upload/update/delete rules.
-- Public downloads continue to work because both buckets remain public.

DROP POLICY IF EXISTS "banners_public_read" ON storage.objects;
DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;

DROP POLICY IF EXISTS "banners_authenticated_select_own" ON storage.objects;
CREATE POLICY "banners_authenticated_select_own"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'banners'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

DROP POLICY IF EXISTS "avatars_authenticated_select_own" ON storage.objects;
CREATE POLICY "avatars_authenticated_select_own"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );
