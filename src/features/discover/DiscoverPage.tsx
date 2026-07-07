// src/features/discover/DiscoverPage.tsx
import { createSignal, createMemo, Show, For } from "solid-js";
import { useVault } from "~/features/watchlist/useVault";
import { useToast } from "~/shared/hooks/useToast";
import { useModalState } from "~/shared/hooks/useModalState";
import { login } from "~/core/firebase/auth";
import { updateStatus as svcUpdateStatus, updateWatchProgress as svcUpdateWatchProgress } from "~/features/watchlist/watchlistService";
import { auth } from "~/core/firebase";
import PageContainer from "~/shared/ui/PageContainer";
import type { TMDBTitle, WatchlistItem } from "~/shared/types";
import { useDiscoverTaste } from "./hooks/useDiscoverTaste";
import { useSpotlight } from "./hooks/useSpotlight";
import { useTrajectories } from "./hooks/useTrajectories";
import { useTasteSurfaces } from "./hooks/useTasteSurfaces";
import { useCosmos } from "./hooks/useCosmos";
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
 * The mindset difference shows up in every decision:
 *   - Dashboard shows what the user already has. Discover shows what
 *     they don't have yet.
 *   - Dashboard's primary action is "Resume". Discover's primary actions
 *     are "Details" and "Add to Vault".
 *   - Dashboard has stats about the past. Discover has trajectories
 *     pointing forward.
 *
 * FOUR FOLDS:
 *   0. Spotlight     — one title, hand-picked, re-rollable
 *   1. Trajectories  — 4 intent-based clusters (Tonight's Pick, Because
 *                      You Watched, Hidden Gems, Continue the Franchise)
 *   2. Your Taste    — vault-derived surfaces ("Because you loved X",
 *                      "Continue the franchise", "Directors you love")
 *   3. Cosmos        — themed ambient browse (experimental, reframed
 *                      TMDB categories)
 *
 * ARCHITECTURE:
 *   Every hook consumes `TasteProfile` (from useDiscoverTaste), not the
 *   vault directly. This is the seam for future AI recommendations —
 *   swap the source of TasteProfile and the UI doesn't change.
 */
export default function DiscoverPage() {
  const { watchlist, isGuest } = useVault();
  const { showToast } = useToast();
  const { setSelectedItem } = useModalState();

  // The taste seam — every other hook consumes this
  const { profile: taste } = useDiscoverTaste({
    watchlist,
    isGuest
  });

  // Spotlight state
  const [spotlightSeed, setSpotlightSeed] = createSignal(0);
  const [spotlightExclude, setSpotlightExclude] = createSignal<number | null>(null);

  const { pick: spotlightPick, loading: spotlightLoading } = useSpotlight({
    taste,
    vault: watchlist,
    excludeId: spotlightExclude,
    seed: spotlightSeed
  });

  // Trajectories
  const { trajectories } = useTrajectories({ taste, vault: watchlist });

  // Taste surfaces
  const { surfaces } = useTasteSurfaces({ taste, vault: watchlist });

  // Cosmos
  const { clusters } = useCosmos({ taste });

  // Re-roll the Spotlight
  const handleReroll = () => {
    const current = spotlightPick();
    if (current) setSpotlightExclude(current.title.id);
    setSpotlightSeed((s) => s + Math.floor(Math.random() * 997) + 1);
  };

  // Open the Details modal for a TMDB title.
  // We convert the TMDBTitle to a minimal WatchlistItem shape so the
  // existing DetailsModal (which expects WatchlistItem) can render it.
  // The modal will fetch full TMDB details on its own.
  const openTitle = (title: TMDBTitle) => {
    const item: WatchlistItem = {
      id: String(title.id),
      title: title.title,
      name: title.name,
      media_type: title.media_type,
      poster_path: title.poster_path,
      backdrop_path: title.backdrop_path,
      status: "Planned", // default — the modal will show real status if it's in vault
      release_date: title.release_date,
      first_air_date: title.first_air_date,
      genresList: title.genres,
      director: title.director
    };
    // If the title is already in the vault, use the real vault item so
    // the modal shows the correct status, rating, progress, etc.
    const existing = watchlist().find((m) => String(m.id) === String(title.id));
    setSelectedItem(existing || item);
  };

  // Add a TMDB title to the vault as "Planned" (one-tap save).
  // This is the primary "save" action on every Discover card.
  const addToVault = async (title: TMDBTitle) => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      showToast("Sign in to save titles to your vault.", "error");
      return;
    }
    if (isGuest()) {
      try {
        await login();
        showToast("Signed in — try saving again.", "success");
      } catch {
        showToast("Sign in failed. Please try again.", "error");
      }
      return;
    }
    try {
      // Use the existing service — status "Planned" + a watchProgress
      // stub so the title shows up in the Vault's "Planned" shelf.
      await svcUpdateStatus(uid, String(title.id), "Planned");
      await svcUpdateWatchProgress(uid, String(title.id), {
        currentTime: 0,
        duration: 0,
        server: null,
        updatedAt: new Date().toISOString(),
        season: 1,
        episode: 1
      });
      const name = title.title || title.name || "Title";
      showToast(`Added "${name}" to your vault`, "success", 1800);
    } catch (err) {
      console.error("Failed to add to vault:", err);
      showToast("Failed to save. Try again.", "error");
    }
  };

  const handleLogin = async () => {
    try {
      await login();
      showToast("Signed in to CineLog", "success");
    } catch {
      showToast("Sign in failed. Please try again.", "error");
    }
  };

  // Loading state — show skeleton until taste profile is ready
  const isLoading = createMemo(() => taste() === undefined);

  return (
    <PageContainer width="narrow" paddingBottom="var(--sp-12)">
      <div class="ambient-glow" aria-hidden="true" />

      {/* Page-level eyebrow — sets the "discover" mindset, distinct from Dashboard's greeting */}
      <div class="discover-eyebrow-block">
        <p class="discover-eyebrow">Discover</p>
        <h1 class="discover-page-title">What's next?</h1>
        <p class="discover-page-subtitle">
          {isGuest()
            ? "Sign in to make this yours — Spotlight adapts to your taste."
            : taste().isColdStart
              ? "Add a few titles to your vault and Spotlight will learn your taste."
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
            onDetails={openTitle}
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
                      onOpenTitle={openTitle}
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
                    onOpenTitle={openTitle}
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
              onOpenTitle={openTitle}
            />
          </section>

          {/* Guest sign-in nudge — only for guests, only at the end */}
          <Show when={isGuest()}>
            <div class="discover-guest-nudge">
              <p class="type-body-soft" style={{ "text-align": "center", "max-width": "280px", margin: "0 auto var(--sp-3)" }}>
                Sign in to make Spotlight yours — every pick adapts to what you love.
              </p>
              <button class="btn-primary" onClick={handleLogin} style={{ margin: "0 auto", display: "flex" }}>
                <span class="material-symbols-outlined" style="font-size: 16px" aria-hidden="true">login</span>
                Sign In to Begin
              </button>
            </div>
          </Show>
        </div>
      </Show>
    </PageContainer>
  );
}
