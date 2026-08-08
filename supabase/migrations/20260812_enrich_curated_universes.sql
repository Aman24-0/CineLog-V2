-- ============================================================================
-- CineLog V2 — Phase 9 Chunk 5a: Rich Universe Schema
-- ----------------------------------------------------------------------------
-- Idempotent migration that enhances the curated universe system with:
--   • Lore, franchise_type, viewing_order_guide, color_theme, total_entries
--   • Phase enhancements: description, cover_url, sub_universe, viewing_order, lore
--   • Entry enhancements: sub_universe, viewing_order, story_note, key_events,
--     is_entry_point
--   • New `universe_viewing_orders` table for admin-defined custom orders
--   • New `universe_viewing_order_entries` join table (positions inside an order)
--
-- All new columns have sensible defaults so existing universes / phases /
-- entries continue to work without backfill.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 2a. Enhance `curated_universes`
-- ---------------------------------------------------------------------------
ALTER TABLE public.curated_universes
  ADD COLUMN IF NOT EXISTS lore TEXT,
  ADD COLUMN IF NOT EXISTS franchise_type TEXT DEFAULT 'franchise'
    CHECK (franchise_type IN (
      'cinematic_universe', 'franchise', 'anthology',
      'shared_universe', 'multiverse'
    )),
  ADD COLUMN IF NOT EXISTS viewing_order_guide TEXT,
  ADD COLUMN IF NOT EXISTS color_theme TEXT,
  ADD COLUMN IF NOT EXISTS total_entries INT DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 2b. Enhance `universe_phases`
-- ---------------------------------------------------------------------------
ALTER TABLE public.universe_phases
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS cover_url TEXT,
  ADD COLUMN IF NOT EXISTS sub_universe TEXT DEFAULT 'main',
  ADD COLUMN IF NOT EXISTS viewing_order INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lore TEXT;

-- ---------------------------------------------------------------------------
-- 2c. Enhance `curated_universe_entries`
-- ---------------------------------------------------------------------------
ALTER TABLE public.curated_universe_entries
  ADD COLUMN IF NOT EXISTS sub_universe TEXT DEFAULT 'main',
  ADD COLUMN IF NOT EXISTS viewing_order INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS story_note TEXT,
  ADD COLUMN IF NOT EXISTS key_events TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_entry_point BOOLEAN DEFAULT FALSE;

-- ---------------------------------------------------------------------------
-- 2d. Create `universe_viewing_orders`
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.universe_viewing_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  universe_id UUID NOT NULL REFERENCES public.curated_universes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.universe_viewing_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read viewing orders"
  ON public.universe_viewing_orders;
CREATE POLICY "Public can read viewing orders"
  ON public.universe_viewing_orders
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Admin can manage viewing orders"
  ON public.universe_viewing_orders;
CREATE POLICY "Admin can manage viewing orders"
  ON public.universe_viewing_orders
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND is_admin = true
        AND admin_disabled_at IS NULL
    )
  );

DROP TRIGGER IF EXISTS trg_universe_viewing_orders_updated_at
  ON public.universe_viewing_orders;
CREATE TRIGGER trg_universe_viewing_orders_updated_at
  BEFORE UPDATE ON public.universe_viewing_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2e. Create `universe_viewing_order_entries`
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.universe_viewing_order_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.universe_viewing_orders(id) ON DELETE CASCADE,
  entry_id UUID NOT NULL REFERENCES public.curated_universe_entries(id) ON DELETE CASCADE,
  position INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(order_id, entry_id)
);

ALTER TABLE public.universe_viewing_order_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read viewing order entries"
  ON public.universe_viewing_order_entries;
CREATE POLICY "Public can read viewing order entries"
  ON public.universe_viewing_order_entries
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Admin can manage viewing order entries"
  ON public.universe_viewing_order_entries;
CREATE POLICY "Admin can manage viewing order entries"
  ON public.universe_viewing_order_entries
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND is_admin = true
        AND admin_disabled_at IS NULL
    )
  );

CREATE INDEX IF NOT EXISTS idx_universe_viewing_order_entries_order
  ON public.universe_viewing_order_entries(order_id, position);

-- ---------------------------------------------------------------------------
-- Backfill `curated_universes.total_entries` for existing universes.
-- Recomputed from the entries table so admins get an accurate count without
-- a manual refresh.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  UPDATE public.curated_universes cu
  SET total_entries = (
    SELECT COUNT(*) FROM public.curated_universe_entries e
    WHERE e.universe_id = cu.id
  )
  WHERE cu.total_entries = 0
    AND EXISTS (
      SELECT 1 FROM public.curated_universe_entries e
      WHERE e.universe_id = cu.id
    );
END $$;
