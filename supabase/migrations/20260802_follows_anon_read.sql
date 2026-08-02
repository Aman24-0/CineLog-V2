-- 20260802_follows_anon_read.sql
--
-- Allow anonymous (unauthenticated) users to read the follows table.
--
-- This is needed so that public profiles can show follower/following
-- counts to logged-out viewers. The social graph is public — anyone
-- can see who follows whom — so restricting reads to authenticated
-- users only prevents anonymous viewers from seeing counts on /u/[username].
--
-- The follows_read policy for authenticated users already exists
-- (see 20260730_add_social_and_profile_fields.sql). This adds a
-- parallel policy for the anon role.

DROP POLICY IF EXISTS follows_read_anon ON public.follows;
CREATE POLICY follows_read_anon
  ON public.follows FOR SELECT
  TO anon
  USING (true);
