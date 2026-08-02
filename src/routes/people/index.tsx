// src/routes/people/index.tsx
//
// CineLog V2 — Find People Page (/people)
// ---------------------------------------------------------------------
// A dedicated user-search page. Lets users discover other cinephiles
// by username or display name, with Follow/Unfollow buttons inline.
//
// This page is linked from:
//   • The Feed empty state ("Find people to follow" button)
//   • The Feed header (people icon — future enhancement)
//
// The search is debounced 300ms + requires at least 2 characters.

import { Title } from "@solidjs/meta";
import { For, Show, createSignal, type Component } from "solid-js";

import { PageContainer } from "~/shared/ui/layout";
import {
  GlassEmptyState,
  GlassInput,
  GlassSkeleton
} from "~/shared/ui/glass";

import { useUserSearch } from "~/shared/hooks/social/useUserSearch";
import UserListItem from "~/shared/ui/social/UserListItem";

const FindPeoplePage: Component = () => {
  const { results, loading, error, search } = useUserSearch();
  const [query, setQuery] = createSignal("");

  const handleInput = (value: string) => {
    setQuery(value);
    search(value);
  };

  const hasQuery = () => query().trim().length >= 2;

  return (
    <>
      <Title>Find People — CineLog</Title>
      <PageContainer size="narrow" paddingBottom="var(--sp-12)">
        {/* ─── HEADER ──────────────────────────────────────────── */}
        <header class="people-header">
          <h1 class="people-title">Find People</h1>
          <p class="people-subtitle">
            Discover cinephiles to follow and see their activity in your feed
          </p>
        </header>

        {/* ─── SEARCH BAR ─────────────────────────────────────── */}
        <div class="people-search-wrap">
          <GlassInput
            value={query()}
            onInput={(e: Event) =>
              handleInput((e.currentTarget as HTMLInputElement).value)
            }
            placeholder="Search by username or name…"
            aria-label="Search users"
            icon="search"
            autocomplete="off"
          />
        </div>

        {/* ─── RESULTS ────────────────────────────────────────── */}
        <Show when={!hasQuery()}>
          <GlassEmptyState
            icon="person_search"
            title="Search for people"
            message="Type a username or display name above to find cinephiles to follow."
            variant="compact"
          />
        </Show>

        <Show when={hasQuery() && loading()}>
          <div class="people-list" role="status" aria-live="polite">
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

        <Show when={hasQuery() && !loading() && error()}>
          <GlassEmptyState
            icon="error"
            title="Search failed"
            message={error() ?? "Something went wrong."}
            variant="compact"
          />
        </Show>

        <Show
          when={
            hasQuery() && !loading() && !error() && results().length === 0
          }
        >
          <GlassEmptyState
            icon="person_off"
            title="No users found"
            message={`No cinephiles match "${query()}". Try a different search.`}
            variant="compact"
          />
        </Show>

        <Show
          when={
            hasQuery() && !loading() && !error() && results().length > 0
          }
        >
          <div class="people-list" role="list" aria-label="Search results">
            <For each={results()}>{(user) => <UserListItem user={user} />}</For>
          </div>
        </Show>
      </PageContainer>
    </>
  );
};

export default FindPeoplePage;
