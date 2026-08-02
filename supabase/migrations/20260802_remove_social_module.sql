-- ============================================================================
-- CineLog V2 — Remove Social Module: Database Migration
-- ----------------------------------------------------------------------------
-- This migration removes all database objects that were created EXCLUSIVELY
-- for the Social module. After removing all social features from the
-- application code, these objects are no longer referenced.
--
-- ⚠️  DO NOT EXECUTE THIS MIGRATION AUTOMATICALLY.
-- ⚠️  WAIT FOR EXPLICIT APPROVAL BEFORE RUNNING.
--
-- This file is a PROPOSAL. Review each section carefully.
-- ============================================================================
--
-- CATEGORIZATION
-- ==============
--
-- SAFE TO DELETE (used ONLY by the Social module):
--   • follows table                  — the social graph (followers/following)
--   • follows_read RLS policy        — authenticated read of follows
--   • follows_read_anon RLS policy   — anonymous read of follows
--   • follows_insert RLS policy      — authenticated insert of follow edges
--   • follows_delete RLS policy      — authenticated delete of follow edges
--   • follows_no_self_follow CHECK   — prevents self-follow
--   • idx_follows_following_id INDEX  — followers list query index
--   • idx_follows_follower_id INDEX   — following list query index
--   • get_public_profile_by_username  — SECURITY DEFINER function for /u/[username]
--   • get_public_vault_by_user        — SECURITY DEFINER function for /u/[username]
--   • profiles.social_links column    — JSONB map of social platform links
--   • profiles.is_public column       — boolean profile visibility toggle
--
-- KEEP (used by non-social features):
--   • profiles table                 — core user data
--   • profiles.username column       — used by account settings
--   • profiles.display_name column   — used throughout the app
--   • profiles.bio column            — used by personal profile
--   • profiles.avatar_url column     — used by personal profile
--   • profiles.banner_url column     — used by personal profile
--   • profiles.banner_type column    — used by personal profile
--   • profiles.favorite_* columns    — used by personal profile
--   • activity_log table             — used by admin analytics, NOT social
--   • is_username_available function — used by account settings
--   • vault table                    — core library data
--   • All other tables and functions — core features
--
-- DEPENDENCY REPORT
-- =================
--
-- 1. follows table
--    - Created by: 20260730_add_social_and_profile_fields.sql
--    - Referenced by: /api/follow (POST, DELETE), /api/follow/list (GET),
--      /api/follow/status (GET), /api/feed (GET), useSocialStats hook,
--      useFollow hook, useFollowList hook, FollowButton, UserListItem,
--      FollowListPage, FeedItem, /u/[username]/followers,
--      /u/[username]/following
--    - ALL referencing code has been removed.
--    - Safe to drop: YES
--
-- 2. follows_no_self_follow CHECK constraint
--    - Created by: 20260730_add_social_and_profile_fields.sql
--    - Part of the follows table, will be dropped with the table.
--    - Safe to drop: YES (dropped with table)
--
-- 3. idx_follows_following_id, idx_follows_follower_id
--    - Created by: 20260730_add_social_and_profile_fields.sql
--    - Part of the follows table, will be dropped with the table.
--    - Safe to drop: YES (dropped with table)
--
-- 4. follows_read, follows_read_anon, follows_insert, follows_delete RLS policies
--    - Created by: 20260730_add_social_and_profile_fields.sql,
--      20260802_follows_anon_read.sql
--    - Part of the follows table, will be dropped with the table.
--    - Safe to drop: YES (dropped with table)
--
-- 5. get_public_profile_by_username(text) function
--    - Created by: 20260731_public_profile_lookup.sql
--    - Referenced by: usePublicProfile hook (DELETED)
--    - The /u/[username] route has been deleted.
--    - is_username_available is NOT affected — it's a separate function.
--    - Safe to drop: YES
--
-- 6. get_public_vault_by_user(uuid) function
--    - Created by: 20260731_public_profile_lookup.sql
--    - Referenced by: usePublicProfile hook (DELETED)
--    - The vault table itself is NOT affected.
--    - Safe to drop: YES
--
-- 7. profiles.social_links column
--    - Created by: 20260730_add_social_and_profile_fields.sql
--    - Referenced by: EditProfileModal (social links editing REMOVED),
--      profile.repository.ts (socialLinks field REMOVED),
--      profile.types.ts (socialLinks field REMOVED),
--      profile.utils.ts (socialLinks mapping REMOVED)
--    - All application code referencing this column has been removed.
--    - Safe to drop: YES
--
-- 8. profiles.is_public column
--    - Created by: 20260730_add_social_and_profile_fields.sql
--    - Referenced by: EditProfileModal (visibility toggle REMOVED),
--      get_public_profile_by_username (being dropped above),
--      get_public_vault_by_user (being dropped above)
--    - All application code referencing this column has been removed.
--    - Safe to drop: YES
-- ============================================================================


-- ─── 1. Drop the follows table (cascades: indexes, constraints, RLS policies) ──

DROP TABLE IF EXISTS public.follows CASCADE;

-- When the table is dropped, the following are automatically removed:
--   • follows_no_self_follow CHECK constraint
--   • idx_follows_following_id index
--   • idx_follows_follower_id index
--   • follows_read RLS policy
--   • follows_read_anon RLS policy
--   • follows_insert RLS policy
--   • follows_delete RLS policy


-- ─── 2. Drop public profile lookup functions ──────────────────────────────────

DROP FUNCTION IF EXISTS public.get_public_profile_by_username(text);

DROP FUNCTION IF EXISTS public.get_public_vault_by_user(uuid);


-- ─── 3. Drop social columns from profiles table ───────────────────────────────

-- social_links — JSONB map of social platform links. No longer used
-- by any application code (EditProfileModal social links editing removed).
ALTER TABLE public.profiles DROP COLUMN IF EXISTS social_links;

-- is_public — boolean profile visibility toggle. No longer used
-- by any application code (EditProfileModal visibility toggle removed,
-- public profile route /u/[username] removed).
ALTER TABLE public.profiles DROP COLUMN IF EXISTS is_public;
