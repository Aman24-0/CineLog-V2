// src/shared/ui/social/FollowListPage.tsx
//
// FollowListPage — shared page component for the followers + following
// lists. Renders a paginated list of users with avatars, names, and
// Follow buttons.
//
// Used by:
//   src/routes/u/[username]/followers/index.tsx
//   src/routes/u/[username]/following/index.tsx
//
// The component takes the list `type` ("followers" | "following") as a
// prop and resolves the target user's id from the username in the URL
// (via the existing usePublicProfile hook + get_public_profile_by_username
// SECURITY DEFINER function).
//
// STATES
// ------
//   • loading-profile — resolving username → user id
//   • loading-list    — fetching the first page of users
//   • error           — fetch failed → retry button
//   • empty           — the user has 0 followers / 0 following
//   • ready           — list renders with infinite scroll

import { Title } from "@solidjs/meta";
import { useNavigate, useParams } from "@solidjs/router";
import {
  Show,
  For,
  createMemo,
  onCleanup,
  type Component
} from "solid-js";

import { PageContainer } from "~/shared/ui/layout";
import {
  GlassButton,
  GlassEmptyState,
  GlassSkeleton
} from "~/shared/ui/glass";

import { usePublicProfile } from "~/features/profile/hooks/usePublicProfile";
import { useFollowList, type FollowListType } from "~/shared/hooks/social/useFollowList";
import UserListItem from "~/shared/ui/social/UserListItem";

export interface FollowListPageProps {
  /** Which list to show — "followers" or "following". */
  type: FollowListType;
}

const FollowListPage: Component<FollowListPageProps> = (props) => {
  const navigate = useNavigate();
  const params = useParams();

  const username = createMemo(() => params.username ?? "");

  // eslint-disable-next-line solid/reactivity
  const publicProfile = usePublicProfile(username);
  const targetUserId = createMemo(() => publicProfile.profile()?.id ?? null);
  const listType = createMemo<FollowListType>(() => props.type);

  // eslint-disable-next-line solid/reactivity
  const list = useFollowList(targetUserId, listType);

  // Infinite scroll sentinel.
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
            void list.loadMore();
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

  const pageTitle = () =>
    props.type === "followers" ? "Followers" : "Following";

  const profileName = () =>
    publicProfile.profile()?.display_name ?? `@${username()}`;

  const handleBack = () => {
    const uname = username();
    if (uname) {
      navigate(`/u/${encodeURIComponent(uname)}`);
    } else {
      navigate("/discover");
    }
  };

  return (
    <>
      <Title>{`${pageTitle()} — ${profileName()} — CineLog`}</Title>
      <PageContainer size="narrow" paddingBottom="var(--sp-12)">
        {/* ─── HEADER ──────────────────────────────────────────── */}
        <header class="follow-list-header">
          <button
            type="button"
            class="follow-list-back-btn focus-ring"
            onClick={handleBack}
            aria-label="Back to profile"
          >
            <span class="material-symbols-outlined" aria-hidden="true">
              arrow_back
            </span>
          </button>
          <div class="follow-list-header-text">
            <h1 class="follow-list-title">{pageTitle()}</h1>
            <p class="follow-list-subtitle">{profileName()}</p>
          </div>
        </header>

        {/* ─── PROFILE LOADING ──────────────────────────────────── */}
        <Show when={publicProfile.status() === "loading"}>
          <div class="follow-list-skeleton" role="status" aria-live="polite">
            <For each={Array.from({ length: 5 })}>
              {() => (
                <div class="user-list-item-skeleton">
                  <GlassSkeleton class="user-list-item-skeleton-avatar rounded-full" />
                  <div class="user-list-item-skeleton-text">
                    <GlassSkeleton class="h-3 w-32 rounded" />
                    <GlassSkeleton class="mt-1 h-2 w-24 rounded" />
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>

        {/* ─── PROFILE NOT FOUND ────────────────────────────────── */}
        <Show when={publicProfile.status() === "not_found"}>
          <GlassEmptyState
            icon="person_off"
            title="User not found"
            message={`We couldn't find a CineLog profile for "@${username()}".`}
          />
        </Show>

        {/* ─── PROFILE PRIVATE ──────────────────────────────────── */}
        <Show when={publicProfile.status() === "private"}>
          <GlassEmptyState
            icon="lock"
            title="This profile is private"
            message={`@${username()}'s ${pageTitle().toLowerCase()} list is only visible to them.`}
          />
        </Show>

        {/* ─── LIST LOADING ─────────────────────────────────────── */}
        <Show
          when={
            publicProfile.status() === "ready" && list.loading()
          }
        >
          <div class="follow-list-skeleton" role="status" aria-live="polite">
            <For each={Array.from({ length: 5 })}>
              {() => (
                <div class="user-list-item-skeleton">
                  <GlassSkeleton class="user-list-item-skeleton-avatar rounded-full" />
                  <div class="user-list-item-skeleton-text">
                    <GlassSkeleton class="h-3 w-32 rounded" />
                    <GlassSkeleton class="mt-1 h-2 w-24 rounded" />
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>

        {/* ─── LIST ERROR ──────────────────────────────────────── */}
        <Show
          when={
            publicProfile.status() === "ready" &&
            !list.loading() &&
            list.error()
          }
        >
          <GlassEmptyState
            icon="error"
            title="Couldn't load list"
            message={list.error() ?? "Something went wrong."}
            action={
              <GlassButton
                variant="primary"
                onClick={() => void list.refresh()}
                aria-label="Retry"
              >
                Retry
              </GlassButton>
            }
          />
        </Show>

        {/* ─── LIST EMPTY ──────────────────────────────────────── */}
        <Show
          when={
            publicProfile.status() === "ready" &&
            !list.loading() &&
            !list.error() &&
            list.users().length === 0
          }
        >
          <GlassEmptyState
            icon={props.type === "followers" ? "group" : "person_search"}
            title={
              props.type === "followers"
                ? "No followers yet"
                : "Not following anyone yet"
            }
            message={
              props.type === "followers"
                ? `When people follow ${profileName()}, they'll appear here.`
                : `When ${profileName()} follows people, they'll appear here.`
            }
          />
        </Show>

        {/* ─── LIST READY ──────────────────────────────────────── */}
        <Show
          when={
            publicProfile.status() === "ready" &&
            !list.loading() &&
            !list.error() &&
            list.users().length > 0
          }
        >
          <div class="follow-list" role="list" aria-label={pageTitle()}>
            <For each={list.users()}>
              {(user) => <UserListItem user={user} />}
            </For>

            {/* Loading-more spinner. */}
            <Show when={list.loadingMore()}>
              <div class="follow-list-load-more" aria-live="polite">
                <span class="material-symbols-outlined feed-spin" aria-hidden="true">
                  progress_activity
                </span>
                <span>Loading more…</span>
              </div>
            </Show>

            {/* Infinite-scroll sentinel. */}
            <Show when={list.hasMore() && !list.loadingMore()}>
              <div
                ref={attachObserver}
                class="follow-list-sentinel"
                aria-hidden="true"
              />
            </Show>

            {/* End-of-list marker. */}
            <Show when={!list.hasMore() && list.users().length > 0}>
              <div class="follow-list-end">
                <span class="follow-list-end-line" aria-hidden="true" />
                <span class="follow-list-end-text">End of list</span>
                <span class="follow-list-end-line" aria-hidden="true" />
              </div>
            </Show>
          </div>
        </Show>
      </PageContainer>
    </>
  );
};

export default FollowListPage;
