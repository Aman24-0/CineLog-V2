// src/features/collections/CollectionsPage.tsx
import { For, Show, createSignal, createMemo } from "solid-js";
import { useNavigate } from "@solidjs/router";
import PageContainer from "~/shared/ui/PageContainer";
import ScrollToTop from "~/shared/ui/ScrollToTop";
import { useVault } from "~/features/watchlist/useVault";
import { useCollections } from "./hooks/useCollections";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { findInVault } from "~/shared/utils/vaultMatch";
import FranchiseGrid from "./components/FranchiseGrid";
import UniverseSuggestions from "./components/UniverseSuggestions";
import FolderEditor from "./components/FolderEditor";
import SmartCollectionBuilder from "./components/SmartCollectionBuilder";
import type { Collection, CollectionEntry } from "~/shared/types";

export default function CollectionsPage() {
  const navigate = useNavigate();
  const { watchlist } = useVault();
  const {
    userCollections, curatedCollections, loading,
    createCollection, getCollectionProgress,
    pinnedUniverses, addedUniverses
  } = useCollections();

  const [showCreate, setShowCreate] = createSignal(false);
  const [newName, setNewName] = createSignal("");
  const [editingFolder, setEditingFolder] = createSignal<Collection | null>(null);
  const [showSmartBuilder, setShowSmartBuilder] = createSignal(false);

  // Featured universe — rotate daily
  const featured = createMemo(() => {
    const curated = curatedCollections();
    if (curated.length === 0) return null;
    const dayOfYear = Math.floor(Date.now() / 86400000);
    return curated[dayOfYear % curated.length];
  });

  const featuredProgress = createMemo(() => {
    const f = featured();
    return f ? getCollectionProgress(f, watchlist()) : { owned: 0, total: 0, pct: 0 };
  });

  const featuredBackdrop = createMemo(() => {
    const f = featured();
    return f?.backdrop_path ? tmdbImage(f.backdrop_path, "w1280") : "";
  });

  // Continue Your Universe — curated collections the user has started but not completed
  const inProgressUniverses = createMemo(() => {
    return curatedCollections()
      .map((col) => ({ col, progress: getCollectionProgress(col, watchlist()) }))
      .filter(({ progress }) => progress.owned > 0 && progress.pct < 100)
      .sort((a, b) => b.progress.pct - a.progress.pct);
  });

  // Find the next missing entry for a collection
  const nextMissing = (col: Collection): CollectionEntry | null => {
    return col.entries.find((e) => !findInVault(watchlist(), { id: e.id, media_type: e.media_type })) ?? null;
  };

  const handleCreate = async () => {
    const name = newName().trim();
    if (!name) return;
    await createCollection(name);
    setNewName("");
    setShowCreate(false);
  };

  const titleOf = (e: CollectionEntry) => e.title || e.name || "Untitled";

  return (
    <PageContainer width="narrow" paddingBottom="var(--sp-12)">
      <ScrollToTop />
      <div class="ambient-glow" aria-hidden="true" />

      <div class="page-enter relative">
        {/* Page eyebrow */}
        <div class="collections-eyebrow-block">
          <p class="collections-eyebrow">Collections</p>
          <h1 class="collections-page-title">Cinematic Universes</h1>
          <p class="collections-page-subtitle">
            Explore interconnected sagas, curated timelines, and your personal collections.
          </p>
        </div>

        {/* === FEATURED UNIVERSE HERO === */}
        <Show when={featured()}>
          <section
            class="universe-hero animate-fade-in"
            role="region"
            aria-label={`Featured universe: ${featured()!.name}`}
          >
            <Show when={featuredBackdrop()}>
              <img
                src={featuredBackdrop()}
                class="universe-hero-backdrop"
                loading="eager"
                decoding="async"
                {...{ fetchpriority: "high" } as any}
                alt=""
                aria-hidden="true"
              />
            </Show>
            <div class="universe-hero-overlay" aria-hidden="true" />

            <div class="universe-hero-badge" aria-label="Featured Universe">
              <span class="material-symbols-outlined" style={{ "font-size": "12px", color: "var(--p)" }} aria-hidden="true">
                auto_awesome
              </span>
              Featured Universe
            </div>

            <div class="universe-hero-content">
              <h2 class="universe-hero-title">{featured()!.name}</h2>
              <Show when={featured()!.description}>
                <p class="universe-hero-description">{featured()!.description}</p>
              </Show>

              <div class="universe-hero-footer">
                <div class="universe-hero-progress">
                  <div class="universe-hero-ring" style={{ "--progress": `${featuredProgress().pct}%` }}>
                    <span class="universe-hero-ring-pct">{featuredProgress().pct}%</span>
                  </div>
                  <div class="universe-hero-progress-text">
                    <span class="universe-hero-progress-owned">{featuredProgress().owned} of {featuredProgress().total}</span>
                    <span class="universe-hero-progress-label">in your vault</span>
                  </div>
                </div>
                <button
                  type="button"
                  class="btn-primary"
                  onClick={() => navigate(`/collections/${featured()!.id}`)}
                  aria-label={`Enter ${featured()!.name}`}
                >
                  <span class="material-symbols-outlined" style="font-size: 16px" aria-hidden="true">arrow_forward</span>
                  Enter Universe
                </button>
              </div>
            </div>
          </section>
        </Show>

        {/* === PINNED UNIVERSES === */}
        <Show when={pinnedUniverses().length > 0}>
          <section class="collections-fold">
            <div class="collections-fold-label">
              <span class="material-symbols-outlined" style="font-size: 12px; color: var(--p)" aria-hidden="true">push_pin</span>
              Pinned
            </div>
            <div class="universe-pinned-rail hide-scrollbar" role="list">
              <For each={pinnedUniverses()}>
                {(col) => {
                  const progress = createMemo(() => getCollectionProgress(col, watchlist()));
                  return (
                    <button
                      type="button"
                      class="universe-pinned-card"
                      role="listitem"
                      onClick={() => navigate(`/collections/${col.id}`)}
                      aria-label={`Open ${col.name}`}
                    >
                      <Show when={col.backdrop_path}>
                        <img
                          src={tmdbImage(col.backdrop_path, "w92")}
                          style={{ width: "32px", height: "20px", "object-fit": "cover", "border-radius": "4px" }}
                          loading="lazy"
                          decoding="async"
                          alt=""
                          aria-hidden="true"
                        />
                      </Show>
                      <span class="universe-pinned-name">{col.name}</span>
                      <span style={{ "font-size": "0.4375rem", color: "var(--text-muted)", "font-family": "'Azeret Mono', monospace" }}>
                        {progress().pct}%
                      </span>
                    </button>
                  );
                }}
              </For>
            </div>
          </section>
        </Show>

        {/* === CONTINUE YOUR UNIVERSE === */}
        <Show when={inProgressUniverses().length > 0}>
          <section class="collections-fold">
            <div class="collections-fold-label">
              <span class="material-symbols-outlined" style="font-size: 12px; color: var(--p)" aria-hidden="true">play_circle</span>
              Continue Your Universe
            </div>
            <div class="universe-continue-rail hide-scrollbar" role="list">
              <For each={inProgressUniverses().slice(0, 6)}>
                {({ col, progress }) => {
                  const next = nextMissing(col);
                  return (
                    <button
                      type="button"
                      class="universe-continue-card"
                      role="listitem"
                      onClick={() => navigate(`/collections/${col.id}`)}
                      aria-label={`Continue ${col.name} — ${progress.pct}% complete`}
                      style={{ "scroll-snap-align": "start" }}
                    >
                      <div class="universe-continue-poster">
                        <Show when={col.backdrop_path}>
                          <img
                            src={tmdbImage(col.backdrop_path, "w500")}
                            class="universe-continue-img"
                            loading="lazy"
                            decoding="async"
                            alt=""
                            aria-hidden="true"
                          />
                        </Show>
                        <div class="universe-continue-overlay" aria-hidden="true" />
                        <div class="universe-continue-ring" style={{ "--progress": `${progress.pct}%` }}>
                          <span class="universe-continue-ring-pct">{progress.pct}%</span>
                        </div>
                      </div>
                      <div class="universe-continue-info">
                        <p class="universe-continue-name">{col.name}</p>
                        <Show when={next}>
                          <p class="universe-continue-next">
                            Next: {titleOf(next!)}
                          </p>
                        </Show>
                      </div>
                    </button>
                  );
                }}
              </For>
            </div>
          </section>
        </Show>

        {/* === FRANCHISE EXPLORER (replaces flat "All Universes") === */}
        <section class="collections-fold">
          <div class="collections-fold-label">
            <span class="material-symbols-outlined" style="font-size: 12px; color: var(--p)" aria-hidden="true">auto_awesome</span>
            Explore Universes
          </div>
          <FranchiseGrid />
        </section>

        {/* === UNIVERSE SUGGESTIONS === */}
        <UniverseSuggestions />

        {/* === YOUR COLLECTIONS === */}
        <section class="collections-fold">
          <div class="collections-fold-label">
            <span class="material-symbols-outlined" style="font-size: 12px; color: var(--p)" aria-hidden="true">folder</span>
            Your Collections
            <button
              type="button"
              class="collections-fold-action"
              onClick={() => setShowCreate(true)}
              aria-label="Create new collection"
            >
              <span class="material-symbols-outlined" style="font-size: 14px" aria-hidden="true">add</span>
              New
            </button>
            <button
              type="button"
              class="collections-smart-btn"
              onClick={() => setShowSmartBuilder(true)}
              aria-label="Create smart collection"
              style={{ "margin-left": "auto" }}
            >
              <span class="material-symbols-outlined" style="font-size: 12px" aria-hidden="true">auto_awesome</span>
              Smart
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
              <button class="btn-primary" onClick={handleCreate} disabled={!newName().trim()} style={{ "font-size": "0.5625rem" }}>Create</button>
              <button class="btn-ghost" onClick={() => setShowCreate(false)} style={{ "font-size": "0.5625rem" }}>Cancel</button>
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
                {(col) => (
                  <button
                    type="button"
                    class={`collections-folder-card${col.isFavorites ? " collections-folder-favorites" : ""}`}
                    onClick={() => navigate(`/collections/${col.id}`)}
                    onContextMenu={(e) => { e.preventDefault(); setEditingFolder(col); }}
                    aria-label={`Open ${col.name}`}
                  >
                    {/* Poster collage preview */}
                    <Show when={col.entries.length > 0} fallback={
                      <div class="collections-folder-icon">
                        <Show when={col.isFavorites} fallback={
                          <span class="material-symbols-outlined" style="font-size: 28px; color: var(--text-soft)" aria-hidden="true">folder</span>
                        }>
                          <span class="material-symbols-outlined" style="font-size: 28px; color: #f5c518; font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" aria-hidden="true">favorite</span>
                        </Show>
                      </div>
                    }>
                      <div class="collections-folder-collage">
                        <For each={col.entries.slice(0, 3)}>
                          {(entry) => (
                            <Show when={entry.poster_path}>
                              <img
                                src={tmdbImage(entry.poster_path, "w92")}
                                class="collections-folder-collage-img"
                                loading="lazy"
                                decoding="async"
                                alt=""
                                aria-hidden="true"
                              />
                            </Show>
                          )}
                        </For>
                      </div>
                    </Show>
                    <div style={{ display: "flex", "align-items": "center", gap: "4px" }}>
                      <Show when={col.emoji}><span style={{ "font-size": "0.875rem" }}>{col.emoji}</span></Show>
                      <p class="collections-folder-name">{col.name}</p>
                    </div>
                    <p class="collections-folder-count">
                      {col.isSmart ? "Smart" : `${col.entries.length} title${col.entries.length !== 1 ? "s" : ""}`}
                    </p>
                    <Show when={col.accentColor}>
                      <div style={{ width: "8px", height: "8px", "border-radius": "50%", background: col.accentColor, "margin-left": "4px" }} aria-hidden="true" />
                    </Show>
                    {/* Edit button */}
                    <button
                      type="button"
                      class="timeline-edit-action"
                      style={{ "margin-left": "auto", "margin-top": "-4px" }}
                      onClick={(e) => { e.stopPropagation(); setEditingFolder(col); }}
                      aria-label={`Edit ${col.name}`}
                    >
                      <span class="material-symbols-outlined" style="font-size: 14px" aria-hidden="true">more_vert</span>
                    </button>
                  </button>
                )}
              </For>
            </div>
          </Show>
        </section>
      </div>

      {/* Folder editor modal */}
      <Show when={editingFolder()}>
        <FolderEditor
          collection={editingFolder()!}
          onClose={() => setEditingFolder(null)}
        />
      </Show>

      {/* Smart collection builder */}
      <Show when={showSmartBuilder()}>
        <SmartCollectionBuilder onClose={() => setShowSmartBuilder(false)} />
      </Show>
    </PageContainer>
  );
}
