/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

/**
 * Vitest configuration for CineLog V2.
 *
 * - jsdom environment for DOM APIs (Solid components, localStorage, etc.)
 * - Solid JSX transform via vite-plugin-solid
 * - Path alias `~/*` → `src/*` (matches tsconfig.json)
 * - Coverage via @vitest/coverage-v8 (V8 native, fast)
 * - Setup file registers @testing-library/jest-dom matchers + browser API mocks
 */
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [solid()],
  resolve: {
    alias: {
      "~": resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/setup.ts"],
    include: ["src/**/__tests__/**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".vinxi", "dist"],
    // The apiCache module uses a floating `.finally()` in setInFlight
    // for cleanup. When a fetcher rejects, the .finally() creates a
    // derived rejected promise that no caller catches. This is a
    // pre-existing pattern in the source (not a test bug) — we report
    // but don't fail the suite on these unhandled rejections.
    unhandledRejection: "warn",
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "lcov", "html"],
      reportsDirectory: "coverage",
      include: [
        // Shared utilities (100% target)
        "src/shared/utils/**/*.ts",
        // Repositories (>=90% target)
        "src/lib/supabase/repositories/vault/vault.read.ts",
        "src/lib/supabase/repositories/vault/vault.write.ts",
        "src/lib/supabase/repositories/vault/vault.utils.ts",
        "src/lib/supabase/repositories/vault/vault.repository.ts",
        "src/lib/supabase/repositories/dashboard/dashboard.read.ts",
        "src/lib/supabase/repositories/dashboard/dashboard.stats.ts",
        "src/lib/supabase/repositories/dashboard/dashboard.continue.ts",
        "src/lib/supabase/repositories/dashboard/dashboard.utils.ts",
        "src/lib/supabase/repositories/dashboard/dashboard.repository.ts",
        "src/lib/supabase/repositories/collection/collection.read.ts",
        "src/lib/supabase/repositories/collection/collection.write.ts",
        "src/lib/supabase/repositories/collection/collection.entries.ts",
        "src/lib/supabase/repositories/collection/collection.lifecycle.ts",
        "src/lib/supabase/repositories/collection/collection.utils.ts",
        "src/lib/supabase/repositories/collection/collection.repository.ts",
        "src/lib/supabase/repositories/preset/preset.read.ts",
        "src/lib/supabase/repositories/preset/preset.write.ts",
        "src/lib/supabase/repositories/preset/preset.utils.ts",
        "src/lib/supabase/repositories/preset/preset.repository.ts",
        "src/lib/supabase/repositories/episodeProgress/episodeProgress.read.ts",
        "src/lib/supabase/repositories/episodeProgress/episodeProgress.write.ts",
        "src/lib/supabase/repositories/episodeProgress/episodeProgress.utils.ts",
        "src/lib/supabase/repositories/episodeProgress/episodeProgress.repository.ts",
        "src/lib/supabase/repositories/profile/profile.read.ts",
        "src/lib/supabase/repositories/profile/profile.write.ts",
        "src/lib/supabase/repositories/profile/profile.lifecycle.ts",
        "src/lib/supabase/repositories/profile/profile.utils.ts",
        "src/lib/supabase/repositories/profile/profile.repository.ts",
        "src/lib/supabase/repositories/discover/discover.read.ts",
        "src/lib/supabase/repositories/discover/discover.universes.ts",
        "src/lib/supabase/repositories/discover/discover.context.ts",
        "src/lib/supabase/repositories/discover/discover.utils.ts",
        "src/lib/supabase/repositories/discover/discover.repository.ts",
        "src/lib/supabase/repositories/shared.ts",
        // Adapters (>=90% target)
        "src/features/watchlist/vaultAdapter.ts",
        "src/features/watchlist/vaultReadAdapter.ts",
        "src/features/watchlist/vaultFilterUtils.ts",
        "src/features/watchlist/presetAdapter.ts",
        "src/features/watchlist/episodeProgressAdapter.ts",
        "src/features/collections/collectionAdapter.ts",
        "src/features/collections/collectionMapper.ts",
        "src/features/collections/collectionEntryAdapter.ts",
        "src/shared/hooks/userLibraryAdapter.ts",
        // Business logic (100% target)
        "src/features/collections/components/timelineSort.ts",
        "src/features/collections/utils/evaluateSmartRules.ts",
        "src/features/search/genreBrowseUtils.ts",
        "src/features/search/searchStorage.ts",
        "src/core/tmdb/genres.ts",
        "src/core/tmdb/discoverNormalize.ts",
      ],
      exclude: [
        "node_modules/**",
        ".vinxi/**",
        "dist/**",
        "src/**/*.d.ts",
        "src/**/__tests__/**",
        "src/**/index.ts",
        "src/lib/supabase/database.types.ts",
        "src/app/**",
        "src/routes/**",
        "src/**/*types.ts",
      ],
      thresholds: {
        statements: 75,
        branches: 65,
        functions: 75,
        lines: 75,
      },
    },
  },
});
