// src/features/collections/CollectionDetailPage.tsx
import { For, Show, createMemo, createSignal } from "solid-js";
import { useParams, useNavigate } from "@solidjs/router";
import PageContainer from "~/shared/ui/PageContainer";
import ScrollToTop from "~/shared/ui/ScrollToTop";
import { useVault } from "~/features/watchlist/useVault";
import { useCollections } from "./hooks/useCollections";
import { useModalState } from "~/shared/hooks/useModalState";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { findInVault } from "~/shared/utils/vaultMatch";
import { CURATED_COLLECTIONS } from "~/shared/data/curatedCollections";
import type { Collection, CollectionEntry, ViewingOrder, WatchlistItem } from "~/shared/types";

export default function CollectionDetailPage() {
  const params = useParams();
  const navigate = useNavigate();
  const { watchlist } = useVault();
  const { userCollections, getCollectionProgress } = useCollections();
  const { openTitle } = useModalState();

  const [activeOrder, setActiveOrder] = createSignal<ViewingOrder>("chronological");

  const collection = createMemo<Collection | null>(() => {
    const id = params.id;
    const curated = CURATED_COLLECTIONS.find((c) => c.id === id);
    if (curated) return curated;
    const user = userCollections().find((c) => c.id === id);
    if (user) return user;
    return null;
  });

  let lastCollectionId: string | null = null;
  const currentCollection = createMemo(() => {
    const col = collection();
    if (col && col.id !== lastCollectionId) {
      lastCollectionId = col.id;
      setActiveOrder(col.defaultOrder ?? "chronological");
    }
    return col;
  });

  const progress = createMemo(() => {
    const col = currentCollection();
    if (!col) return { owned: 0, total: 0, pct: 0 };
    return getCollectionProgress(col, watchlist());
  });

  const backdropUrl = createMemo(() => {
    const col = currentCollection();
    if (!col?.backdrop_path) return "";
    return tmdbImage(col.backdrop_path, "w1280");
  });

  const sortedEntries = createMemo(() => {
    const col = currentCollection();
    if (!col) return [];
    const order = activeOrder();
    const entries = [...col.entries];

    if (order === "release") {
      entries.sort((a, b) => {
        const dateA = a.release_date || a.first_air_date || "";
        const dateB = b.release_date || b.first_air_date || "";
        return dateA.localeCompare(dateB);
      });
    } else if (order === "saga") {
      entries.sort((a, b) => {
        const phaseA = a.phase ?? "Other";
        const phaseB = b.phase ?? "Other";
        if (phaseA !== phaseB) return phaseA.localeCompare(phaseB);
        return (a.order ?? 0) - (b.order ?? 0);
      });
    }

    return entries.map((e) => {
      const vaultItem = findInVault(watchlist(), { id: e.id, media_type: e.media_type });
      return {
        entry: e,
        vaultItem,
        inVault: vaultItem !== null,
        status: vaultItem?.status ?? null,
        rating: vaultItem?.rating ?? null
      };
    });
  });

  const groupedEntries = createMemo(() => {
    if (activeOrder() !== "saga") return null;
    const items = sortedEntries();
    const groups: { phase: string; items: typeof items }[] = [];
    let current: { phase: string; items: typeof items } | null = null;
    for (const item of items) {
      const phase = item.entry.phase ?? "Other";
      if (!current || current.phase !== phase) {
        current = { phase, items: [] };
        groups.push(current);
      }
      current.items.push(item);
    }
    return groups;
  });

  const stats = createMemo(() => {
    const items = sortedEntries();
    const owned = items.filter((i) => i.inVault).length;
    const completed = items.filter((i) => i.status === "Completed").length;
    const watching = items.filter((i) => i.status === "Watching").length;
    return { owned, completed, watching, total: items.length };
  });

  const availableOrders = createMemo(() => currentCollection()?.viewingOrders ?? []);

  const handleOpenEntry = (entry: CollectionEntry) => {
    const baseItem: WatchlistItem = {
      id: String(entry.id),
      title: entry.title,
      name: entry.name,
      media_type: entry.media_type,
      poster_path: entry.poster_path,
      backdrop_path: entry.backdrop_path,
      status: "Planned",
      release_date: entry.release_date,
      first_air_date: entry.first_air_date
    };
    openTitle(baseItem, watchlist());
  };

  const titleOf = (e: CollectionEntry) => e.title || e.name || "Untitled";
  const yearOf = (e: CollectionEntry) => (e.release_date || e.first_air_date || "").split("-")[0] || "";

  return (
    <PageContainer width="narrow" paddingBottom="var(--sp-12)">
      <ScrollToTop />
      <div class="ambient-glow" aria-hidden="true" />

      <Show when={currentCollection()} fallback={
        <div class="page-enter">
          <button
            type="button"
            class="collections-back-btn"
            onClick={() => navigate("/collections")}
            aria-label="Back to Collections"
          >
            <span class="material-symbols-outlined" style="font-size: 18px" aria-hidden="true">arrow_back</span>
          </button>
          <div class="collections-detail-empty">
            <p class="type-body-soft" style={{ "text-align": "center" }}>Collection not found.</p>
            <button class="btn-ghost" onClick={() => navigate("/collections")}>Back to Collections</button>
          </div>
        </div>
      }>
        <div class="page-enter relative">
          {/* === CINEMATIC HERO === */}
          <div class="universe-detail-hero">
            <Show when={backdropUrl()}>
              <img
                src={backdropUrl()}
                class="universe-detail-hero-backdrop"
                loading="eager"
                decoding="async"
                {...{ fetchpriority: "high" } as any}
                alt=""
                aria-hidden="true"
              />
            </Show>
            <div class="universe-detail-hero-overlay" aria-hidden="true" />

            {/* Back button — safe-area aware */}
            <button
              type="button"
              class="universe-detail-back-btn"
              onClick={() => navigate("/collections")}
              aria-label="Back to Collections"
            >
              <span class="material-symbols-outlined" style="font-size: 18px" aria-hidden="true">arrow_back</span>
            </button>

            <div class="universe-detail-hero-content">
              <p class="universe-detail-hero-eyebrow">
                {currentCollection()!.type === "curated" ? "Cinematic Universe" :
                 currentCollection()!.type === "user" ? "Your Collection" : "Official Collection"}
              </p>
              <h1 class="universe-detail-hero-title">{currentCollection()!.name}</h1>
              <Show when={currentCollection()!.description}>
                <p class="universe-detail-hero-description">{currentCollection()!.description}</p>
              </Show>

              {/* Progress + stats */}
              <div class="universe-detail-hero-stats">
                <div class="universe-detail-ring" style={{ "--progress": `${progress().pct}%` }}>
                  <span class="universe-detail-ring-pct">{progress().pct}%</span>
                </div>
                <div class="universe-detail-stat-strip">
                  <div class="universe-detail-stat-cell">
                    <span class="universe-detail-stat-value">{stats().total}</span>
                    <span class="universe-detail-stat-label">Total</span>
                  </div>
                  <div class="universe-detail-stat-cell">
                    <span class="universe-detail-stat-value" style={{ color: "var(--p)" }}>{stats().owned}</span>
                    <span class="universe-detail-stat-label">Owned</span>
                  </div>
                  <div class="universe-detail-stat-cell">
                    <span class="universe-detail-stat-value" style={{ color: "#4ade80" }}>{stats().completed}</span>
                    <span class="universe-detail-stat-label">Completed</span>
                  </div>
                  <div class="universe-detail-stat-cell">
                    <span class="universe-detail-stat-value" style={{ color: "#60a5fa" }}>{stats().watching}</span>
                    <span class="universe-detail-stat-label">Watching</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* === VIEWING ORDER SWITCH === */}
          <Show when={availableOrders().length > 1}>
            <div class="universe-order-switch">
              <For each={availableOrders()}>
                {(order) => (
                  <button
                    type="button"
                    class="universe-order-btn"
                    data-active={activeOrder() === order.id}
                    onClick={() => setActiveOrder(order.id)}
                    aria-label={order.description ?? order.label}
                    aria-pressed={activeOrder() === order.id}
                  >
                    {order.label}
                  </button>
                )}
              </For>
            </div>
          </Show>

          {/* === TIMELINE === */}
          <div class="universe-timeline-section">
            <div class="universe-timeline-label">
              <span class="material-symbols-outlined" style="font-size: 12px; color: var(--p)" aria-hidden="true">timeline</span>
              {activeOrder() === "saga" ? "By Phase" : activeOrder() === "release" ? "Release Order" : "Timeline"}
            </div>

            {/* Saga mode — grouped by phase with accordion headers */}
            <Show when={groupedEntries()} fallback={
              /* Default mode — flat timeline with connecting rail */
              <div class="universe-timeline-wrap">
                <div class="universe-timeline-rail" aria-hidden="true" />
                <div class="universe-timeline" role="list">
                  <For each={sortedEntries()}>
                    {(item, i) => (
                      <TimelineEntry
                        item={item}
                        index={i() + 1}
                        onOpen={() => handleOpenEntry(item.entry)}
                        titleOf={titleOf}
                        yearOf={yearOf}
                      />
                    )}
                  </For>
                </div>
              </div>
            }>
              <For each={groupedEntries()!}>
                {(group) => (
                  <div class="universe-phase-group">
                    <div class="universe-phase-header">
                      <span class="universe-phase-name">{group.phase}</span>
                      <span class="universe-phase-count">{group.items.length} titles</span>
                    </div>
                    <div class="universe-timeline-wrap">
                      <div class="universe-timeline-rail" aria-hidden="true" />
                      <div class="universe-timeline" role="list">
                        <For each={group.items}>
                          {(item, i) => (
                            <TimelineEntry
                              item={item}
                              index={i() + 1}
                              onOpen={() => handleOpenEntry(item.entry)}
                              titleOf={titleOf}
                              yearOf={yearOf}
                            />
                          )}
                        </For>
                      </div>
                    </div>
                  </div>
                )}
              </For>
            </Show>
          </div>
        </div>
      </Show>
    </PageContainer>
  );
}

/* ---------- Timeline Entry Component ---------- */
interface TimelineEntryProps {
  item: {
    entry: CollectionEntry;
    inVault: boolean;
    status: string | null;
    rating: number | null;
  };
  index: number;
  onOpen: () => void;
  titleOf: (e: CollectionEntry) => string;
  yearOf: (e: CollectionEntry) => string;
}

function TimelineEntry(props: TimelineEntryProps) {
  return (
    <button
      type="button"
      class={`universe-timeline-item${!props.item.inVault ? " universe-timeline-missing" : ""}`}
      role="listitem"
      onClick={() => props.onOpen()}
      aria-label={`${props.titleOf(props.item.entry)}${props.yearOf(props.item.entry) ? `, ${props.yearOf(props.item.entry)}` : ""} — open details`}
    >
      {/* Numbered node — sits on the connecting rail */}
      <div class={`universe-timeline-node${props.item.status === "Completed" ? " universe-timeline-node-completed" : ""}${props.item.status === "Watching" ? " universe-timeline-node-watching" : ""}`}>
        {props.index}
      </div>

      {/* Poster */}
      <div class="universe-timeline-poster">
        <Show
          when={props.item.entry.poster_path}
          fallback={
            <div class="universe-timeline-poster-fallback" aria-hidden="true">
              <span class="material-symbols-outlined" style="font-size: 20px; color: var(--text-dim)" aria-hidden="true">movie</span>
            </div>
          }
        >
          <img
            src={tmdbImage(props.item.entry.poster_path, "w185")}
            class="universe-timeline-poster-img"
            loading="lazy"
            decoding="async"
            alt=""
            aria-hidden="true"
          />
        </Show>
        {/* Status indicators */}
        <Show when={props.item.status === "Completed"}>
          <span class="universe-timeline-status universe-timeline-status-completed" aria-label="Completed">
            <span class="material-symbols-outlined" style="font-size: 10px" aria-hidden="true">check</span>
          </span>
        </Show>
        <Show when={props.item.status === "Watching"}>
          <span class="universe-timeline-status universe-timeline-status-watching" aria-label="Watching" />
        </Show>
      </div>

      {/* Info */}
      <div class="universe-timeline-info">
        <p class="universe-timeline-title">{props.titleOf(props.item.entry)}</p>
        <div class="universe-timeline-meta-row">
          <span class="universe-timeline-meta">
            {props.yearOf(props.item.entry) ? `${props.yearOf(props.item.entry)} · ` : ""}
            {props.item.entry.media_type === "tv" ? "Series" : "Movie"}
          </span>
          <Show when={props.item.entry.entryType}>
            <span class="universe-timeline-entry-type">{props.item.entry.entryType}</span>
          </Show>
        </div>
        <Show when={props.item.rating && props.item.rating > 0}>
          <p class="universe-timeline-user-rating">
            <span style="color: var(--p)">★ Your {props.item.rating}</span>
          </p>
        </Show>
      </div>

      {/* Missing badge — the "next to watch" CTA */}
      <Show when={!props.item.inVault}>
        <span class="universe-timeline-missing-badge" aria-label="Not in vault">
          <span class="material-symbols-outlined" style="font-size: 14px" aria-hidden="true">add</span>
        </span>
      </Show>
    </button>
  );
}
