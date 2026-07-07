// src/features/collections/CollectionsPage.tsx
import { For, Show, createSignal, createMemo } from "solid-js";
import { useNavigate } from "@solidjs/router";
import PageContainer from "~/shared/ui/PageContainer";
import ScrollToTop from "~/shared/ui/ScrollToTop";
import { useVault } from "~/features/watchlist/useVault";
import { useCollections } from "./hooks/useCollections";
import { useToast } from "~/shared/hooks/useToast";
import { tmdbImage } from "~/core/tmdb/tmdb";
import type { Collection } from "~/shared/types";

/**
 * CollectionsPage — the signature collections experience.
 *
 * Three sections:
 *   1. FEATURED CURATED — cinematic banners for CineLog curated collections
 *      (MCU Chronological, Star Wars Timeline, etc.) with progress rings
 *   2. YOUR COLLECTIONS — user-created folders (Favorites first)
 *      with create-new-folder CTA
 *   3. OFFICIAL — TMDB collections detected from the vault (future)
 *
 * Navigation: accessible via Vault header "Collections" button.
 * No bottom nav tab — this is a route, not a tab.
 */
export default function CollectionsPage() {
  const navigate = useNavigate();
  const { watchlist } = useVault();
  const { userCollections, curatedCollections, loading, createCollection, getCollectionProgress } = useCollections();
  const { showToast } = useToast();

  const [showCreate, setShowCreate] = createSignal(false);
  const [newName, setNewName] = createSignal("");

  const handleCreate = async () => {
    const name = newName().trim();
    if (!name) return;
    await createCollection(name);
    setNewName("");
    setShowCreate(false);
  };

  return (
    <PageContainer width="narrow" paddingBottom="var(--sp-12)">
      <ScrollToTop />

      {/* Header */}
      <div class="collections-eyebrow-block">
        <p class="collections-eyebrow">Collections</p>
        <h1 class="collections-page-title">Your Cinematic Universe</h1>
        <p class="collections-page-subtitle">
          Curated timelines, official collections, and your own folders — all in one place.
        </p>
      </div>

      {/* SECTION 1 — Featured Curated Collections */}
      <section class="collections-section">
        <div class="collections-section-label">
          <span class="material-symbols-outlined" style="font-size: 12px; color: var(--p)" aria-hidden="true">auto_awesome</span>
          Curated Collections
        </div>
        <div class="collections-featured-grid">
          <For each={curatedCollections()}>
            {(col) => {
              const progress = createMemo(() => getCollectionProgress(col, watchlist()));
              const backdrop = () => col.backdrop_path ? tmdbImage(col.backdrop_path, "w780") : "";
              return (
                <button
                  type="button"
                  class="collections-featured-card"
                  onClick={() => navigate(`/collections/${col.id}`)}
                  aria-label={`Open ${col.name}`}
                >
                  <Show when={backdrop()}>
                    <img
                      src={backdrop()}
                      class="collections-featured-backdrop"
                      loading="lazy"
                      decoding="async"
                      alt=""
                      aria-hidden="true"
                    />
                  </Show>
                  <div class="collections-featured-overlay" aria-hidden="true" />
                  <div class="collections-featured-content">
                    <p class="collections-featured-name">{col.name}</p>
                    <div class="collections-featured-meta">
                      <span>{col.entries.length} titles</span>
                      <Show when={progress().owned > 0}>
                        <span> · {progress().owned} in vault</span>
                      </Show>
                    </div>
                    {/* Progress ring */}
                    <Show when={progress().total > 0}>
                      <div
                        class="collections-featured-ring"
                        style={{ "--progress": `${progress().pct}%` }}
                      >
                        <span class="collections-featured-ring-pct">{progress().pct}%</span>
                      </div>
                    </Show>
                  </div>
                </button>
              );
            }}
          </For>
        </div>
      </section>

      {/* SECTION 2 — Your Collections (user folders) */}
      <section class="collections-section">
        <div class="collections-section-label">
          <span class="material-symbols-outlined" style="font-size: 12px; color: var(--p)" aria-hidden="true">folder</span>
          Your Collections
          <button
            type="button"
            class="collections-section-action"
            onClick={() => setShowCreate(true)}
            aria-label="Create new collection"
          >
            <span class="material-symbols-outlined" style="font-size: 14px" aria-hidden="true">add</span>
            New
          </button>
        </div>

        <Show when={showCreate()}>
          <div class="collections-create-bar">
            <input
              type="text"
              class="collections-create-input"
              placeholder="Collection name…"
              value={newName()}
              onInput={(e) => setNewName(e.currentTarget.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setShowCreate(false); }}
              aria-label="New collection name"
            />
            <button class="btn-primary" onClick={handleCreate} disabled={!newName().trim()}>Create</button>
            <button class="btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
          </div>
        </Show>

        <Show when={!loading() && userCollections().length > 0} fallback={
          <Show when={!loading()} fallback={
            <div class="collections-folder-skeleton" />
          }>
            <div class="collections-empty-folders">
              <p class="type-body-soft" style={{ "text-align": "center", "max-width": "260px" }}>
                No folders yet. Create one to organize your titles.
              </p>
            </div>
          </Show>
        }>
          <div class="collections-folder-grid">
            <For each={userCollections()}>
              {(col) => {
                const progress = createMemo(() => getCollectionProgress(col, watchlist()));
                return (
                  <button
                    type="button"
                    class={`collections-folder-card${col.isFavorites ? " collections-folder-favorites" : ""}`}
                    onClick={() => navigate(`/collections/${col.id}`)}
                    aria-label={`Open ${col.name}`}
                  >
                    <div class="collections-folder-icon">
                      <Show when={col.isFavorites} fallback={
                        <span class="material-symbols-outlined" style="font-size: 28px; color: var(--text-soft)" aria-hidden="true">folder</span>
                      }>
                        <span class="material-symbols-outlined" style="font-size: 28px; color: #f5c518; font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" aria-hidden="true">favorite</span>
                      </Show>
                    </div>
                    <p class="collections-folder-name">{col.name}</p>
                    <p class="collections-folder-count">
                      {col.entries.length} title{col.entries.length !== 1 ? "s" : ""}
                    </p>
                  </button>
                );
              }}
            </For>
          </div>
        </Show>
      </section>
    </PageContainer>
  );
}
