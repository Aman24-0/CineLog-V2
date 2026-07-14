// src/features/trash/TrashPage.tsx
import { Show, For, createSignal, onMount, createMemo } from "solid-js";
import PageContainer from "~/shared/ui/PageContainer";
import ScrollToTop from "~/shared/ui/ScrollToTop";
import { useAuth } from "~/shared/hooks/useAuth";
import { useToast } from "~/shared/hooks/useToast";
import { useUserLibrary } from "~/shared/hooks/useUserLibrary";
import { tmdbImage } from "~/core/tmdb/tmdb";
import {
  fetchTrashedVaultItems,
  fetchTrashedCollections,
  hardDeleteVaultItem,
  hardDeleteCollection,
  clearAllTrash,
  autoPurgeExpired,
  restoreVaultItemInSupabase,
  restoreCollectionInSupabase,
  type TrashedVaultItem,
  type TrashedCollection,
} from "./trashAdapter";

/**
 * TrashPage — the recycle bin for soft-deleted vault items + collections.
 *
 * BEHAVIOR:
 *   - Lists all soft-deleted vault items and collections, grouped.
 *   - Each item shows: poster/name, deletion date, auto-purge date
 *     (30 days from deletion), and Restore + Delete-forever buttons.
 *   - "Restore All" button at the top restores everything in trash.
 *   - "Clear Trash" (red) button permanently deletes everything.
 *   - Auto-purge: on mount, items older than 30 days are hard-deleted
 *     silently before the list is shown.
 *
 * RESTORE SEMANTICS:
 *   - Vault item restore: clears `deleted_at` → item reappears in watchlist
 *     with all its data (status, rating, notes, dates) intact.
 *   - Collection restore: clears `deleted_at` → folder reappears in
 *     Collections with all its entries intact (entries weren't deleted).
 *
 * AUTO-PURGE:
 *   - Since we don't have a server cron, auto-purge runs client-side on
 *     page load. Items past 30 days are hard-deleted before listing.
 */
export default function TrashPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const library = useUserLibrary();

  const [vaultItems, setVaultItems] = createSignal<TrashedVaultItem[]>([]);
  const [collections, setCollections] = createSignal<TrashedCollection[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [busy, setBusy] = createSignal(false);
  const [confirmClearAll, setConfirmClearAll] = createSignal(false);

  const uid = () => user()?.uid ?? null;

  const loadTrash = async () => {
    if (!uid()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    // Auto-purge expired items first (silent)
    try {
      await autoPurgeExpired(uid()!);
    } catch (err) {
      console.warn("[TrashPage] Auto-purge failed:", err);
    }
    // Then fetch remaining trash
    try {
      const [vItems, cols] = await Promise.all([
        fetchTrashedVaultItems(uid()!),
        fetchTrashedCollections(uid()!),
      ]);
      setVaultItems(vItems);
      setCollections(cols);
    } catch (err) {
      console.error("[TrashPage] Failed to load trash:", err);
      showToast("Failed to load trash.", "error");
    } finally {
      setLoading(false);
    }
  };

  onMount(() => { void loadTrash(); });

  const totalCount = createMemo(() => vaultItems().length + collections().length);

  /** Format an ISO date as "Jul 14, 2026". */
  const formatDate = (iso: string): string => {
    try {
      return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch {
      return iso;
    }
  };

  /** Days remaining until auto-purge. Returns "Today" if <= 0. */
  const daysRemaining = (expiresAt: string): string => {
    const ms = new Date(expiresAt).getTime() - Date.now();
    const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
    if (days <= 0) return "Today";
    if (days === 1) return "1 day";
    return `${days} days`;
  };

  // ── Restore handlers ──
  const handleRestoreVaultItem = async (item: TrashedVaultItem) => {
    if (!uid() || busy()) return;
    setBusy(true);
    try {
      await restoreVaultItemInSupabase(uid()!, item.id, item.media_type);
      setVaultItems((prev) => prev.filter((v) => v.id !== item.id));
      await library.refresh();
      showToast(`Restored "${item.title || item.name || "title"}"`, "success");
    } catch (err) {
      console.error("[TrashPage] Restore vault item failed:", err);
      showToast("Failed to restore. Try again.", "error");
    } finally {
      setBusy(false);
    }
  };

  const handleRestoreCollection = async (col: TrashedCollection) => {
    if (busy()) return;
    setBusy(true);
    try {
      await restoreCollectionInSupabase(col.id);
      setCollections((prev) => prev.filter((c) => c.id !== col.id));
      showToast(`Restored "${col.name}"`, "success");
    } catch (err) {
      console.error("[TrashPage] Restore collection failed:", err);
      showToast("Failed to restore. Try again.", "error");
    } finally {
      setBusy(false);
    }
  };

  const handleRestoreAll = async () => {
    if (!uid() || busy()) return;
    setBusy(true);
    try {
      // Restore all vault items
      for (const item of vaultItems()) {
        await restoreVaultItemInSupabase(uid()!, item.id, item.media_type);
      }
      // Restore all collections
      for (const col of collections()) {
        await restoreCollectionInSupabase(col.id);
      }
      const total = vaultItems().length + collections().length;
      setVaultItems([]);
      setCollections([]);
      await library.refresh();
      showToast(`Restored ${total} item${total === 1 ? "" : "s"}`, "success");
    } catch (err) {
      console.error("[TrashPage] Restore all failed:", err);
      showToast("Failed to restore all. Try again.", "error");
    } finally {
      setBusy(false);
    }
  };

  // ── Hard-delete handlers ──
  const handleHardDeleteVaultItem = async (item: TrashedVaultItem) => {
    if (!uid() || busy()) return;
    setBusy(true);
    try {
      await hardDeleteVaultItem(uid()!, item.id, item.media_type);
      setVaultItems((prev) => prev.filter((v) => v.id !== item.id));
      showToast(`Permanently deleted "${item.title || item.name || "title"}"`, "success");
    } catch (err) {
      console.error("[TrashPage] Hard-delete vault item failed:", err);
      showToast("Failed to delete. Try again.", "error");
    } finally {
      setBusy(false);
    }
  };

  const handleHardDeleteCollection = async (col: TrashedCollection) => {
    if (busy()) return;
    setBusy(true);
    try {
      await hardDeleteCollection(col.id);
      setCollections((prev) => prev.filter((c) => c.id !== col.id));
      showToast(`Permanently deleted "${col.name}"`, "success");
    } catch (err) {
      console.error("[TrashPage] Hard-delete collection failed:", err);
      showToast("Failed to delete. Try again.", "error");
    } finally {
      setBusy(false);
    }
  };

  const handleClearAll = async () => {
    if (!uid() || busy()) return;
    setBusy(true);
    try {
      const counts = await clearAllTrash(uid()!);
      setVaultItems([]);
      setCollections([]);
      setConfirmClearAll(false);
      const total = counts.vault + counts.collections;
      showToast(`Cleared ${total} item${total === 1 ? "" : "s"} from trash`, "success");
    } catch (err) {
      console.error("[TrashPage] Clear all failed:", err);
      showToast("Failed to clear trash. Try again.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageContainer width="narrow" paddingTop="0" paddingBottom="var(--sp-12)">
      <ScrollToTop />

      {/* Header */}
      <div class="sec-page sec-fade-in">
        <div class="sec-header">
          <a href="/profile" class="sec-back focus-ring" aria-label="Back to profile">
            <span class="material-symbols-outlined" style={{ "font-size": "14px" }} aria-hidden="true">
              arrow_back
            </span>
            Profile
          </a>
          <p class="sec-eyebrow">Trash</p>
          <h1 class="sec-title">Recycle Bin</h1>
          <p class="sec-subtitle">
            Deleted items are kept for 30 days. Restore them or clear trash to free space.
          </p>
        </div>

        {/* Action bar — Restore All + Clear Trash */}
        <Show when={totalCount() > 0 && !loading()}>
          <div class="trash-action-bar">
            <button
              type="button"
              class="trash-action-restore-all focus-ring"
              onClick={handleRestoreAll}
              disabled={busy()}
              aria-label="Restore all items in trash"
            >
              <span class="material-symbols-outlined" style={{ "font-size": "16px" }} aria-hidden="true">restore</span>
              Restore All ({totalCount()})
            </button>
            <button
              type="button"
              class="trash-action-clear focus-ring"
              onClick={() => setConfirmClearAll(true)}
              disabled={busy()}
              aria-label="Clear all trash permanently"
            >
              <span class="material-symbols-outlined" style={{ "font-size": "16px" }} aria-hidden="true">delete_forever</span>
              Clear Trash
            </button>
          </div>
        </Show>

        {/* Body */}
        <div class="sec-body">
          <Show when={!loading()} fallback={
            <div class="trash-loading">
              <div class="trash-skeleton" />
              <div class="trash-skeleton" />
              <div class="trash-skeleton" />
            </div>
          }>
            <Show when={totalCount() === 0}>
              <div class="trash-empty">
                <div class="trash-empty-icon" aria-hidden="true">
                  <span class="material-symbols-outlined" style={{ "font-size": "48px", color: "var(--text-dim)" }} aria-hidden="true">
                    delete
                  </span>
                </div>
                <p class="trash-empty-title">Trash is Empty</p>
                <p class="trash-empty-desc">
                  Deleted titles and collections will appear here for 30 days before being permanently removed.
                </p>
              </div>
            </Show>

            {/* Trashed collections */}
            <Show when={collections().length > 0}>
              <section class="sec-section">
                <p class="sec-section-label">Collections ({collections().length})</p>
                <div class="trash-list">
                  <For each={collections()}>
                    {(col) => (
                      <div class="trash-item trash-item-collection">
                        <div class="trash-item-icon" aria-hidden="true">
                          <span class="material-symbols-outlined" style={{ "font-size": "28px", color: "var(--text-soft)" }} aria-hidden="true">folder</span>
                        </div>
                        <div class="trash-item-info">
                          <p class="trash-item-title">{col.name}</p>
                          <p class="trash-item-meta">
                            {col.entryCount} {col.entryCount === 1 ? "title" : "titles"} · Deleted {formatDate(col.deletedAt)}
                          </p>
                          <p class="trash-item-expiry">
                            <span class="material-symbols-outlined" style={{ "font-size": "11px" }} aria-hidden="true">schedule</span>
                            Auto-deletes in {daysRemaining(col.expiresAt)}
                          </p>
                        </div>
                        <div class="trash-item-actions">
                          <button
                            type="button"
                            class="trash-restore-btn focus-ring"
                            onClick={() => handleRestoreCollection(col)}
                            disabled={busy()}
                            aria-label={`Restore ${col.name}`}
                          >
                            <span class="material-symbols-outlined" style={{ "font-size": "16px" }} aria-hidden="true">restore</span>
                            Restore
                          </button>
                          <button
                            type="button"
                            class="trash-delete-btn focus-ring"
                            onClick={() => handleHardDeleteCollection(col)}
                            disabled={busy()}
                            aria-label={`Permanently delete ${col.name}`}
                          >
                            <span class="material-symbols-outlined" style={{ "font-size": "16px" }} aria-hidden="true">delete_forever</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </section>
            </Show>

            {/* Trashed vault items */}
            <Show when={vaultItems().length > 0}>
              <section class="sec-section">
                <p class="sec-section-label">Titles ({vaultItems().length})</p>
                <div class="trash-list">
                  <For each={vaultItems()}>
                    {(item) => (
                      <div class="trash-item">
                        <div class="trash-item-poster">
                          <Show
                            when={item.poster_path}
                            fallback={
                              <div class="trash-item-poster-fallback" aria-hidden="true">
                                <span class="material-symbols-outlined" style={{ "font-size": "20px", color: "var(--text-dim)" }} aria-hidden="true">
                                  {item.media_type === "tv" ? "tv" : "movie"}
                                </span>
                              </div>
                            }
                          >
                            <img
                              src={tmdbImage(item.poster_path, "w92")}
                              class="trash-item-poster-img"
                              loading="lazy"
                              decoding="async"
                              alt=""
                              aria-hidden="true"
                              onError={(e) => { e.currentTarget.style.display = "none"; }}
                            />
                          </Show>
                        </div>
                        <div class="trash-item-info">
                          <p class="trash-item-title">{item.title || item.name || "Untitled"}</p>
                          <p class="trash-item-meta">
                            {item.media_type === "tv" ? "Series" : "Movie"} · Deleted {formatDate(item.deletedAt)}
                          </p>
                          <p class="trash-item-expiry">
                            <span class="material-symbols-outlined" style={{ "font-size": "11px" }} aria-hidden="true">schedule</span>
                            Auto-deletes in {daysRemaining(item.expiresAt)}
                          </p>
                        </div>
                        <div class="trash-item-actions">
                          <button
                            type="button"
                            class="trash-restore-btn focus-ring"
                            onClick={() => handleRestoreVaultItem(item)}
                            disabled={busy()}
                            aria-label={`Restore ${item.title || item.name || "title"}`}
                          >
                            <span class="material-symbols-outlined" style={{ "font-size": "16px" }} aria-hidden="true">restore</span>
                            Restore
                          </button>
                          <button
                            type="button"
                            class="trash-delete-btn focus-ring"
                            onClick={() => handleHardDeleteVaultItem(item)}
                            disabled={busy()}
                            aria-label={`Permanently delete ${item.title || item.name || "title"}`}
                          >
                            <span class="material-symbols-outlined" style={{ "font-size": "16px" }} aria-hidden="true">delete_forever</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </section>
            </Show>
          </Show>
        </div>
      </div>

      {/* Clear All confirmation */}
      <Show when={confirmClearAll()}>
        <div
          class="fixed inset-0 z-[999999] flex items-center justify-center p-4 animate-fade-in"
          style={{ background: "rgba(0,0,0,0.85)", "backdrop-filter": "blur(8px)", "-webkit-backdrop-filter": "blur(8px)" }}
          onClick={() => !busy() && setConfirmClearAll(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Confirm clear all trash"
        >
          <div
            class="modal-surface w-full max-w-sm p-6"
            style={{ "border-radius": "var(--radius-xl)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ "text-align": "center", "margin-bottom": "var(--sp-5)" }}>
              <div class="empty-premium-icon" aria-hidden="true" style={{ margin: "0 auto var(--sp-3)" }}>
                <span class="material-symbols-outlined" style={{ "font-size": "32px", color: "#f87171" }} aria-hidden="true">
                  delete_forever
                </span>
              </div>
              <h3 style={{ "font-family": "'Bebas Neue', sans-serif", "font-size": "1.5rem", color: "var(--text-strong)", margin: "0 0 var(--sp-2)" }}>
                Clear All Trash?
              </h3>
              <p style={{ "font-family": "'Outfit', sans-serif", "font-size": "0.8125rem", color: "var(--text-soft)", margin: "0", "line-height": "1.5" }}>
                This permanently deletes all {totalCount()} item{totalCount() === 1 ? "" : "s"} in trash. This cannot be undone.
              </p>
            </div>
            <div style={{ display: "flex", gap: "var(--sp-2)" }}>
              <button
                type="button"
                class="btn-ghost focus-ring"
                onClick={() => setConfirmClearAll(false)}
                disabled={busy()}
                style={{ flex: "1" }}
              >
                Cancel
              </button>
              <button
                type="button"
                class="btn-primary focus-ring"
                onClick={handleClearAll}
                disabled={busy()}
                style={{ flex: "1", background: "#f87171", "box-shadow": "0 0 0 1px #f87171, 0 4px 16px rgba(248,113,113,0.3)" }}
              >
                {busy() ? "Clearing..." : "Clear All"}
              </button>
            </div>
          </div>
        </div>
      </Show>
    </PageContainer>
  );
}
