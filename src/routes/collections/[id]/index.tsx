// src/routes/collections/[id].tsx
import { lazy, ErrorBoundary, createMemo } from "solid-js";
import { useParams } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { useCollections } from "~/features/collections/hooks/useCollections";
const CollectionDetailPage = lazy(
  () => import("~/features/collections/CollectionDetailPage")
);

export default function CollectionDetailRoute() {
  // Render a <Title> tag with the collection name so the browser tab
  // and any shared-link previews show "My Marvel Collection · CineLog"
  // instead of the generic app-wide title. We resolve the collection
  // name from the CollectionsProvider (already mounted at the app root)
  // — if the collection isn't loaded yet (async fetch), the title falls
  // back to "CineLog" until the data arrives and the Title re-renders.
  //
  // This is a route-level concern (not a page-level concern) because
  // the <Title> must be set even when the lazy CollectionDetailPage
  // chunk is still loading — otherwise the SSR HTML ships with the
  // generic title and only updates after hydration + chunk load +
  // collection fetch, which is too late for link-preview scrapers.
  const params = useParams();
  const { userCollections } = useCollections();

  const collectionName = createMemo(() => {
    const id = params.id;
    if (!id) return null;
    const col = userCollections().find((c) => c.id === id);
    return col?.name ?? null;
  });

  return (
    <ErrorBoundary
      fallback={(error, reset) => (
        <div class="sec-page" style={{ padding: "var(--sp-12) var(--sp-5)" }}>
          <Title>Collection · CineLog</Title>
          <div class="glass-empty-state" role="alert" aria-live="assertive">
            <div class="glass-empty-state-icon" aria-hidden="true">
              <span
                class="material-symbols-outlined"
                style={{ "font-size": "32px", color: "#f87171" }}
                aria-hidden="true"
              >
                error
              </span>
            </div>
            <h3 class="glass-empty-state-title">Couldn't load collection</h3>
            <p class="glass-empty-state-body">
              {error.message || "Something went wrong loading this collection."}
            </p>
            <button
              type="button"
              class="btn-primary focus-ring"
              onClick={() => reset()}
              style={{ "margin-top": "var(--sp-2)" }}
              aria-label="Retry loading collection"
            >
              Retry
            </button>
          </div>
        </div>
      )}
    >
      {/* Title tag — uses the resolved collection name if available,
          otherwise falls back to a generic "Collection" label. The
          `· CineLog` suffix is appended for brand consistency with
          every other page title in the app. */}
      <Title>
        {collectionName() ? `${collectionName()} · CineLog` : "Collection · CineLog"}
      </Title>
      <CollectionDetailPage />
    </ErrorBoundary>
  );
}
