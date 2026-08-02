// src/routes/feed/index.tsx
//
// CineLog V2 — Activity Feed Page (/feed)
// ---------------------------------------------------------------------
// The 4th bottom-nav destination. Shows an aggregated activity feed
// of users the current viewer follows.
//
// STATES
// ------
//   • loading   — initial fetch in flight → skeleton list (5 rows)
//   • error     — fetch failed → empty state with Retry button
//   • signed-out — viewer not signed in → CTA to sign in
//   • empty     — signed in but follows nobody (or all follows have
//                 no activity) → CTA to discover users (links to
//                 /discover as the closest existing surface; a
//                 dedicated "Find Friends" page is a future enhancement)
//   • ready     — items render as FeedItem cards, with an
//                 IntersectionObserver sentinel that calls loadMore
//                 when the user scrolls near the bottom.
//
// PULL TO REFRESH
//   A "Refresh" button in the header calls `refresh()` on the useFeed
//   hook. This wipes the cached items and refetches page 1.

import { Title } from "@solidjs/meta";
import { useNavigate } from "@solidjs/router";
import { Show, For, onCleanup, type Component } from "solid-js";

import { PageContainer } from "~/shared/ui/layout";
import {
  GlassButton,
  GlassEmptyState,
  GlassSkeleton
} from "~/shared/ui/glass";
import { useAuth } from "~/shared/hooks/useAuth";
import { useToast } from "~/shared/hooks/useToast";

import { useFeed } from "~/shared/hooks/social/useFeed";
import FeedItem from "~/shared/ui/social/FeedItem";

const FeedPage: Component = () => {
  const navigate = useNavigate();
  const { isSignedIn } = useAuth();
  const { showToast } = useToast();

  const feed = useFeed(20);

  // IntersectionObserver sentinel for infinite scroll. We attach a
  // <div> ref at the end of the list; when it scrolls into view, we
  // call loadMore(). The observer disconnects when hasMore() becomes
  // false so we don't keep firing after the last page.
  let observer: IntersectionObserver | null = null;

  const attachObserver = (el: HTMLDivElement | null) => {
    if (!el) return;
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            void feed.loadMore();
          }
        }
      },
      { rootMargin: "200px 0px", threshold: 0 }
    );
    observer.observe(el);
  };

  onCleanup(() => {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  });

  const handleRefresh = async () => {
    showToast("Refreshing feed…", "info", 1200);
    await feed.refresh();
  };

  const handleDiscoverClick = () => {
    navigate("/people");
  };

  const handleSignInClick = () => {
    // The global AuthModal is opened by any component that calls
    // useAuthModal().openAuthModal(). Since the AppShell renders the
    // modal, we just navigate to /discover (which has its own guest
    // CTA) — that's the smoothest entry to sign-in from /feed.
    navigate("/discover");
  };

  return (
    <>
      <Title>Following — CineLog</Title>
      <PageContainer size="narrow" paddingBottom="var(--sp-12)">
        {/* ─── HEADER ──────────────────────────────────────────── */}
        <header class="feed-page-header">
          <div class="feed-page-header-text">
            <h1 class="feed-page-title">Following</h1>
            <p class="feed-page-subtitle">
              Activity from people you follow
            </p>
          </div>
          <Show when={isSignedIn() && !feed.loading()}>
            <GlassButton
              variant="ghost"
              size="compact"
              icon="refresh"
              onClick={handleRefresh}
              loading={feed.loadingMore()}
              aria-label="Refresh feed"
            >
              Refresh
            </GlassButton>
          </Show>
        </header>

        {/* ─── SIGNED-OUT ──────────────────────────────────────── */}
        <Show when={!isSignedIn()}>
          <GlassEmptyState
            icon="login"
            title="Sign in to see your feed"
            message="Follow other cinephiles to see what they're watching, rating, and adding to their collections."
            variant="default"
            action={
              <GlassButton
                variant="primary"
                onClick={handleSignInClick}
                icon="login"
              >
                Sign in
              </GlassButton>
            }
          />
        </Show>

        {/* ─── LOADING ─────────────────────────────────────────── */}
        <Show when={isSignedIn() && feed.loading()}>
          <div class="feed-list" role="status" aria-live="polite">
            <For each={Array.from({ length: 5 })}>
              {() => (
                <div class="feed-item-skeleton">
                  <GlassSkeleton class="feed-item-skeleton-avatar rounded-full" />
                  <div class="feed-item-skeleton-body">
                    <GlassSkeleton class="h-3 w-3/4 rounded" />
                    <GlassSkeleton class="mt-2 h-2 w-1/2 rounded" />
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>

        {/* ─── ERROR ──────────────────────────────────────────── */}
        <Show when={isSignedIn() && feed.error() && !feed.loading()}>
          <GlassEmptyState
            icon="error"
            title="Couldn't load feed"
            message={feed.error() ?? "Something went wrong."}
            variant="default"
            action={
              <GlassButton
                variant="primary"
                onClick={() => void feed.refresh()}
                aria-label="Retry"
              >
                Retry
              </GlassButton>
            }
          />
        </Show>

        {/* ─── EMPTY ──────────────────────────────────────────── */}
        <Show
          when={
            isSignedIn() &&
            !feed.loading() &&
            !feed.error() &&
            feed.items().length === 0
          }
        >
          <GlassEmptyState
            icon="group"
            title="No activity yet"
            message="Follow some cinephiles to see their latest watches, ratings, and collections here."
            variant="default"
            action={
              <GlassButton
                variant="primary"
                onClick={handleDiscoverClick}
                icon="person_search"
              >
                Find people to follow
              </GlassButton>
            }
          />
        </Show>

        {/* ─── READY ──────────────────────────────────────────── */}
        <Show
          when={
            isSignedIn() &&
            !feed.loading() &&
            !feed.error() &&
            feed.items().length > 0
          }
        >
          <div class="feed-list" role="feed" aria-label="Activity feed">
            <For each={feed.items()}>
              {(activity) => <FeedItem activity={activity} />}
            </For>

            {/* Loading-more spinner at the bottom of the list. */}
            <Show when={feed.loadingMore()}>
              <div class="feed-load-more-spinner" aria-live="polite">
                <span class="material-symbols-outlined feed-spin" aria-hidden="true">
                  progress_activity
                </span>
                <span class="feed-load-more-text">Loading more…</span>
              </div>
            </Show>

            {/* Infinite-scroll sentinel. When this div scrolls into
                view, the IntersectionObserver calls feed.loadMore().
                Once hasMore() is false, we stop rendering it so the
                observer disconnects. */}
            <Show when={feed.hasMore() && !feed.loadingMore()}>
              <div
                ref={attachObserver}
                class="feed-infinite-scroll-sentinel"
                aria-hidden="true"
              />
            </Show>

            {/* End-of-feed marker — shown when there are no more pages. */}
            <Show when={!feed.hasMore() && feed.items().length > 0}>
              <div class="feed-end-marker">
                <span class="feed-end-marker-line" aria-hidden="true" />
                <span class="feed-end-marker-text">You're all caught up</span>
                <span class="feed-end-marker-line" aria-hidden="true" />
              </div>
            </Show>
          </div>
        </Show>
      </PageContainer>
    </>
  );
};

export default FeedPage;
