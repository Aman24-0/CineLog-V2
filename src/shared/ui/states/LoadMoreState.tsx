// src/shared/ui/states/LoadMoreState.tsx
//
// Pagination / Load More state — shows at the bottom of a list
// when more items are available. Handles loading, error, end-of-list,
// and empty states. Existing items remain visible during loading.
//
// Usage:
//   <LoadMoreState
//     loading={loadingMore()}
//     hasMore={hasMore()}
//     error={loadMoreError()}
//     onLoadMore={() => loadMore()}
//     onRetry={() => retryLoadMore()}
//   />

import { Component, JSX, Show, splitProps, mergeProps } from "solid-js";

export interface LoadMoreStateProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** Whether the next page is currently loading */
  loading?: boolean;
  /** Whether there are more items to load */
  hasMore?: boolean;
  /** Error message if loading the next page failed */
  error?: string | null;
  /** Called to load the next page */
  onLoadMore?: () => void;
  /** Called to retry a failed load-more */
  onRetry?: () => void;
  /** End-of-list message. Default "You've reached the end." */
  endMessage?: string;
}

const defaultProps: Required<
  Pick<LoadMoreStateProps, "loading" | "hasMore" | "error" | "endMessage">
> = {
  loading: false,
  hasMore: true,
  error: null,
  endMessage: "You've reached the end."
};

const LoadMoreState: Component<LoadMoreStateProps> = (rawProps) => {
  const props = mergeProps(defaultProps, rawProps);
  const [local, rest] = splitProps(props, [
    "loading", "hasMore", "error", "onLoadMore", "onRetry", "endMessage", "class"
  ]);

  return (
    <div
      {...rest}
      class={[
        "flex items-center justify-center gap-2 py-6",
        local.class || ""
      ].join(" ")}
      role="status"
      aria-live="polite"
    >
      {/* Loading more */}
      <Show when={local.loading}>
        <span
          class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"
          aria-hidden="true"
        />
        <span class="font-body text-xs text-text-muted">Loading more\u2026</span>
      </Show>

      {/* Load more button (not loading, has more, no error) */}
      <Show when={!local.loading && local.hasMore && !local.error}>
        <button
          type="button"
          class="btn-ghost focus-ring inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold text-text-muted transition-transform active:scale-95"
          onClick={() => local.onLoadMore?.()}
          aria-label="Load more"
        >
          <span
            class="material-symbols-outlined text-sm"
            style={{ "font-variation-settings": "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
            aria-hidden="true"
          >
            expand_more
          </span>
          Load more
        </button>
      </Show>

      {/* Error loading more */}
      <Show when={local.error && !local.loading}>
        <span class="font-body text-xs text-red-400">{local.error}</span>
        <Show when={local.onRetry}>
          <button
            type="button"
            class="text-xs font-semibold text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary/60"
            onClick={() => local.onRetry?.()}
            aria-label="Retry loading more"
          >
            Try Again
          </button>
        </Show>
      </Show>

      {/* End of list */}
      <Show when={!local.loading && !local.hasMore && !local.error}>
        <span class="font-body text-xs text-text-muted">{local.endMessage}</span>
      </Show>
    </div>
  );
};

export { LoadMoreState };
export default LoadMoreState;
