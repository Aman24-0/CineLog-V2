// src/features/discover/DiscoverPage.tsx
//
// Phase 10.2 — Discover Migration
// --------------------------------
// Discover now uses the shared useUserLibrary hook (same vault data
// source as Dashboard). No useVault(). No Firebase auth shim.
//
// Architecture:
//   DiscoverPage → useUserLibrary → userLibraryAdapter → DashboardRepository → Supabase
import { createSignal, createMemo, Show, For } from "solid-js";
import { useUserLibrary } from "~/shared/hooks/useUserLibrary";
import PageContainer from "~/shared/ui/PageContainer";
import { useDiscoverTaste } from "./hooks/useDiscoverTaste";
import { useSpotlight } from "./hooks/useSpotlight";
import { useTrajectories } from "./hooks/useTrajectories";
import { useTasteSurfaces } from "./hooks/useTasteSurfaces";
import { useCosmos } from "./hooks/useCosmos";
import { useDiscoverActions } from "./useDiscoverActions";
import Spotlight from "./components/Spotlight";
import TrajectoryCard from "./components/TrajectoryCard";
import TasteSurface from "./components/TasteSurface";
import CosmosView from "./components/CosmosView";
import DiscoverSkeleton from "./components/DiscoverSkeleton";

/**
 * DiscoverPage — "What incredible movie or TV show should I discover next?"
 *
 * This page is intentionally NOT Dashboard 2.0. The Dashboard answers
 * "What should I continue watching?" — it's about *commitment* and
 * *progress*. Discover answers "What should I discover?" — it's about
 * *serendipity* and *taste expansion*.
 *
 * FOUR FOLDS:
 *   0. Spotlight     — one title, hand-picked, re-rollable
 *   1. Trajectories  — 4 intent-based clusters (Tonight's Pick, Because
 *                      You Watched, Hidden Gems, Continue the Franchise)
 *   2. Your Taste    — vault-derived surfaces ("Because you loved X",
 *                      "Continue the franchise", "Directors you love")
 *   3. Cosmos        — themed ambient browse (experimental)
 *
 * ARCHITECTURE:
 *   Every hook consumes `TasteProfile` (from useDiscoverTaste), not the
 *   vault directly. This is the seam for future AI recommendations —
 *   swap the source of TasteProfile and the UI doesn't change.
 *
 * Action handlers (openTitle / addToVault / login) live in
 * `useDiscoverActions` to keep this file under the 250-line limit.
 */
export default function DiscoverPage() {
  const { watchlist, isGuest } = useUserLibrary();

  // The taste seam — every other hook consumes this
  const { profile: taste } = useDiscoverTaste({ watchlist, isGuest });

  // Spotlight state
  const [spotlightSeed, setSpotlightSeed] = createSignal(0);
  const [spotlightExclude, setSpotlightExclude] = createSignal<number | null>(null);

  const { pick: spotlightPick, loading: spotlightLoading } = useSpotlight({
    taste,
    vault: watchlist,
    excludeId: spotlightExclude,
    seed: spotlightSeed,
  });

  const { trajectories } = useTrajectories({ taste, vault: watchlist });
  const { surfaces } = useTasteSurfaces({ taste, vault: watchlist });
  const { clusters } = useCosmos({ taste });

  const { handleOpenTitle, addToVault, handleLogin } = useDiscoverActions({
    watchlist,
    isGuest,
  });

  // Re-roll the Spotlight
  const handleReroll = () => {
    const current = spotlightPick();
    if (current) setSpotlightExclude(current.title.id);
    setSpotlightSeed((s) => s + Math.floor(Math.random() * 997) + 1);
  };

  // Loading state — show skeleton until taste profile is ready
  const isLoading = createMemo(() => taste() === undefined);

  return (
    <PageContainer width="narrow" paddingBottom="var(--sp-12)">
      <div class="ambient-glow" aria-hidden="true" />

      {/* Page-level eyebrow — sets the "discover" mindset */}
      <div class="discover-eyebrow-block">
        <p class="discover-eyebrow">Discover</p>
        <h1 class="discover-page-title">What's next?</h1>
        <p class="discover-page-subtitle">
          {isGuest()
            ? "Sign in to make this yours — Spotlight adapts to your taste."
            : taste().isColdStart
              ? "Add a few titles to your watchlist and Spotlight will learn your taste."
              : "Hand-picked from your taste graph. Save what catches your eye."}
        </p>
      </div>

      <Show when={!isLoading()} fallback={<DiscoverSkeleton />}>
        <div class="page-enter relative discover-folds">
          {/* FOLD 0 — Spotlight (the signature) */}
          <Spotlight
            pick={spotlightPick}
            loading={spotlightLoading}
            isGuest={isGuest()}
            vault={watchlist()}
            onDetails={handleOpenTitle}
            onAddToVault={addToVault}
            onReroll={handleReroll}
          />

          {/* FOLD 1 — Trajectories */}
          <section class="discover-fold" aria-label="Trajectories — intent-based picks">
            <div class="discover-fold-label">
              <span class="material-symbols-outlined" style={{ "font-size": "12px", color: "var(--p)" }} aria-hidden="true">
                explore
              </span>
              Tonight's Trajectories
            </div>
            <Show
              when={(trajectories()?.length ?? 0) > 0}
              fallback={
                <Show when={!trajectories.loading} fallback={
                  <div class="discover-fold-skeleton" aria-hidden="true" />
                }>
                  <p class="type-body-soft" style={{ "text-align": "center", padding: "var(--sp-6)" }}>
                    No trajectories available right now.
                  </p>
                </Show>
              }
            >
              <div class="trajectories-list">
                <For each={trajectories()}>
                  {(traj) => (
                    <TrajectoryCard
                      trajectory={traj}
                      vault={watchlist()}
                      onOpenTitle={handleOpenTitle}
                      onAddToVault={addToVault}
                    />
                  )}
                </For>
              </div>
            </Show>
          </section>

          {/* FOLD 2 — Your Taste, Expanded */}
          <Show when={(surfaces()?.length ?? 0) > 0}>
            <section class="discover-fold" aria-label="Your taste, expanded">
              <div class="discover-fold-label">
                <span class="material-symbols-outlined" style={{ "font-size": "12px", color: "var(--p)" }} aria-hidden="true">
                  auto_awesome
                </span>
                Your Taste, Expanded
              </div>
              <For each={surfaces()}>
                {(surface) => (
                  <TasteSurface
                    surface={surface}
                    vault={watchlist()}
                    onOpenTitle={handleOpenTitle}
                    onAddToVault={addToVault}
                  />
                )}
              </For>
            </section>
          </Show>

          {/* FOLD 3 — The Cosmos (experimental) */}
          <section class="discover-fold" aria-label="The wider universe">
            <CosmosView
              clusters={clusters}
              loading={clusters.loading}
              vault={watchlist()}
              onOpenTitle={handleOpenTitle}
            />
          </section>

          {/* Guest sign-in nudge — only for guests, only at the end */}
          <Show when={isGuest()}>
            <div class="discover-guest-nudge">
              <p class="type-body-soft" style={{ "text-align": "center", "max-width": "280px", margin: "0 auto var(--sp-3)" }}>
                Sign in to make Spotlight yours — every pick adapts to what you love.
              </p>
              <button class="btn-primary focus-ring" onClick={handleLogin} style={{ margin: "0 auto", display: "flex" }}>
                <span class="material-symbols-outlined" style={{"font-size":"16px"}} aria-hidden="true">login</span>
                Sign In to Begin
              </button>
            </div>
          </Show>
        </div>
      </Show>
    </PageContainer>
  );
}
