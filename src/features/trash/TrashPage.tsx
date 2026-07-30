// src/features/trash/TrashPage.tsx
//
// TrashPage — the recycle bin for soft-deleted vault items + collections.
//
// This is the redesigned v3 page. It uses the Glass design system
// (GlassCard, GlassButton, GlassEmptyState, GlassModal) consistently,
// groups items by deletion date bucket (Today / Yesterday / This Week /
// Older), and shows confirmation dialogs for every destructive action
// (Restore All, Clear Trash, Delete Forever).
//
// ── Architecture ──────────────────────────────────────────────
//   TrashPage (state owner + dialog wiring)
//     ├─ useTrashData (fetch + mutate)
//     ├─ TrashHeader (title + count badge)
//     ├─ TrashActionBar (Restore All + Clear Trash)
//     ├─ TrashItemCard × N (per-item Restore + Delete Forever)
//     ├─ TrashEmptyState (when trash is empty)
//     └─ ConfirmDialog × 4 (single item restore, single item delete,
//                            restore all, clear trash)
//
// ── Confirmation Flow ─────────────────────────────────────────
// Every destructive action goes through a ConfirmDialog:
//   • Restore single item   → "Restore {title}?" (warning, optional)
//   • Delete Forever single → "Permanently delete {title}?" (danger)
//   • Restore All           → "Restore all {N} items?" (warning)
//   • Clear Trash           → "Clear all {N} items?" (danger)
//
// The "Restore single item" confirmation is OPTIONAL — restore is
// non-destructive (the item just moves back to the vault), so we
// skip the dialog and restore immediately. Only destructive actions
// get a confirmation.
//
// ── Toast Feedback ────────────────────────────────────────────
// Every action shows a success or error toast:
//   • "Restored '{title}'"
//   • "Permanently deleted '{title}'"
//   • "Restored {N} items"
//   • "Cleared {N} items from trash"
//   • "Failed to {action}. Try again." (on error)
//

import { Show, For, createSignal, createMemo, type Component } from "solid-js";
import PageContainer from "~/shared/ui/PageContainer";
import ScrollToTop from "~/shared/ui/ScrollToTop";
import { useAuth } from "~/shared/hooks/useAuth";
import { useToast } from "~/shared/hooks/useToast";
import { useUserLibrary } from "~/shared/hooks/useUserLibrary";
import { GlassButton } from "~/shared/ui/glass";

import { useTrashData } from "./hooks/useTrashData";
import TrashHeader from "./components/TrashHeader";
import TrashActionBar from "./components/TrashActionBar";
import TrashEmptyState from "./components/TrashEmptyState";
import ConfirmDialog, { type ConfirmDialogVariant } from "./components/ConfirmDialog";
import {
  TrashVaultItemCard,
  TrashCollectionCard,
  TrashItemCardSkeleton,
  TrashGroupRenderer,
} from "./components/TrashItemCard";
import type { TrashedVaultItem, TrashedCollection } from "./trashAdapter";

// ── Confirm dialog state ──────────────────────────────────────
// A single discriminated-union state object holds whichever dialog
// is currently open. Only one dialog can be open at a time.

type ConfirmState =
  | { kind: "none" }
  | { kind: "deleteItem"; item: TrashedVaultItem }
  | { kind: "deleteCollection"; col: TrashedCollection }
  | { kind: "restoreAll" }
  | { kind: "clearTrash" };

const TrashPage: Component = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const library = useUserLibrary();

  const uid = () => user()?.uid ?? null;
  const trash = useTrashData(uid);

  // ── Confirm dialog state ───────────────────────────────────
  const [confirm, setConfirm] = createSignal<ConfirmState>({ kind: "none" });

  const confirmOpen = createMemo(() => confirm().kind !== "none");

  const confirmTitle = createMemo((): string => {
    switch (confirm().kind) {
      case "deleteItem":
        return "Delete Forever?";
      case "deleteCollection":
        return "Delete Forever?";
      case "restoreAll":
        return "Restore All Items?";
      case "clearTrash":
        return "Clear All Trash?";
      default:
        return "";
    }
  });

  const confirmMessage = createMemo((): string => {
    const state = confirm();
    switch (state.kind) {
      case "deleteItem": {
        const t = state.item.title || state.item.name || "this item";
        return `"${t}" will be permanently deleted from your trash. This cannot be undone.`;
      }
      case "deleteCollection": {
        return `"${state.col.name}" and its ${state.col.entryCount} ${state.col.entryCount === 1 ? "title" : "titles"} will be permanently deleted. This cannot be undone.`;
      }
      case "restoreAll": {
        const n = trash.totalCount();
        return `Restore all ${n} item${n === 1 ? "" : "s"} from the trash back to your vault and collections?`;
      }
      case "clearTrash": {
        const n = trash.totalCount();
        return `Permanently delete all ${n} item${n === 1 ? "" : "s"} in the trash? This cannot be undone.`;
      }
      default:
        return "";
    }
  });

  const confirmVariant = createMemo((): ConfirmDialogVariant => {
    const k = confirm().kind;
    // Restore All is a warning (reversible, but bulk); everything
    // else here is destructive (danger).
    if (k === "restoreAll") return "warning";
    return "danger";
  });

  const confirmIcon = createMemo((): string => {
    switch (confirm().kind) {
      case "restoreAll":
        return "restore";
      case "clearTrash":
      case "deleteItem":
      case "deleteCollection":
        return "delete_forever";
      default:
        return "warning";
    }
  });

  const confirmLabel = createMemo((): string => {
    switch (confirm().kind) {
      case "restoreAll":
        return "Restore All";
      case "clearTrash":
        return "Clear All";
      case "deleteItem":
      case "deleteCollection":
        return "Delete Forever";
      default:
        return "Confirm";
    }
  });

  // ── Action handlers ────────────────────────────────────────

  /** Restore a single vault item — non-destructive, no confirmation. */
  const handleRestoreItem = async (item: TrashedVaultItem) => {
    const ok = await trash.restoreVaultItem(item);
    if (ok) {
      await library.refresh();
      const t = item.title || item.name || "item";
      showToast(`Restored "${t}"`, "success");
    } else {
      showToast("Failed to restore. Try again.", "error");
    }
  };

  /** Restore a single collection — non-destructive, no confirmation. */
  const handleRestoreCollection = async (col: TrashedCollection) => {
    const ok = await trash.restoreCollection(col);
    if (ok) {
      showToast(`Restored "${col.name}"`, "success");
    } else {
      showToast("Failed to restore. Try again.", "error");
    }
  };

  /** Permanently delete a vault item — opens confirm dialog. */
  const handleDeleteItemRequest = (item: TrashedVaultItem) => {
    setConfirm({ kind: "deleteItem", item });
  };

  /** Permanently delete a collection — opens confirm dialog. */
  const handleDeleteCollectionRequest = (col: TrashedCollection) => {
    setConfirm({ kind: "deleteCollection", col });
  };

  /** Restore All — opens confirm dialog. */
  const handleRestoreAllRequest = () => {
    setConfirm({ kind: "restoreAll" });
  };

  /** Clear Trash — opens confirm dialog. */
  const handleClearTrashRequest = () => {
    setConfirm({ kind: "clearTrash" });
  };

  /** Confirm button handler — dispatches based on dialog kind. */
  const handleConfirm = async () => {
    const state = confirm();
    switch (state.kind) {
      case "deleteItem": {
        const ok = await trash.deleteVaultItemPermanently(state.item);
        if (ok) {
          const t = state.item.title || state.item.name || "item";
          showToast(`Permanently deleted "${t}"`, "success");
        } else {
          showToast("Failed to delete. Try again.", "error");
        }
        break;
      }
      case "deleteCollection": {
        const ok = await trash.deleteCollectionPermanently(state.col);
        if (ok) {
          showToast(`Permanently deleted "${state.col.name}"`, "success");
        } else {
          showToast("Failed to delete. Try again.", "error");
        }
        break;
      }
      case "restoreAll": {
        const counts = await trash.restoreAll();
        const total = counts.vault + counts.collections;
        if (total > 0) {
          await library.refresh();
          showToast(`Restored ${total} item${total === 1 ? "" : "s"}`, "success");
        } else {
          showToast("Failed to restore. Try again.", "error");
        }
        break;
      }
      case "clearTrash": {
        const counts = await trash.clearAll();
        const total = counts.vault + counts.collections;
        if (total > 0) {
          showToast(`Cleared ${total} item${total === 1 ? "" : "s"} from trash`, "success");
        } else {
          showToast("Failed to clear trash. Try again.", "error");
        }
        break;
      }
      case "none":
        return;
    }
    setConfirm({ kind: "none" });
  };

  /** Cancel button / backdrop / ESC handler. */
  const handleCancelConfirm = () => {
    if (!trash.busy()) setConfirm({ kind: "none" });
  };

  // ── Render ─────────────────────────────────────────────────
  return (
    <PageContainer width="narrow" paddingTop="0" paddingBottom="var(--sp-12)">
      <ScrollToTop />

      <div class="trash-page sec-fade-in">
        <TrashHeader count={trash.totalCount()} loading={trash.loading()} />

        {/* Action bar — only when trash has items and is not loading */}
        <Show when={trash.totalCount() > 0 && !trash.loading()}>
          <TrashActionBar
            count={trash.totalCount()}
            busy={trash.busy()}
            onRestoreAll={handleRestoreAllRequest}
            onClearTrash={handleClearTrashRequest}
          />
        </Show>

        {/* Body */}
        <div class="trash-body">
          {/* Error state */}
          <Show when={trash.error() && !trash.loading()}>
            <div class="trash-error">
              <span
                class="material-symbols-outlined"
                style={{ "font-size": "48px", color: "#f87171" }}
                aria-hidden="true"
              >
                cloud_off
              </span>
              <p class="trash-error-title">Couldn't load trash</p>
              <p class="trash-error-desc">
                {trash.error()?.message || "Something went wrong. Please try again."}
              </p>
              <GlassButton
                variant="primary"
                size="default"
                icon="refresh"
                onClick={() => void trash.refetch()}
              >
                Retry
              </GlassButton>
            </div>
          </Show>

          {/* Loading state — skeleton cards */}
          <Show when={trash.loading()}>
            <div class="trash-skeleton-list">
              <For each={Array.from({ length: 4 })}>
                {() => <TrashItemCardSkeleton />}
              </For>
            </div>
          </Show>

          {/* Empty state */}
          <Show when={!trash.loading() && !trash.error() && trash.totalCount() === 0}>
            <TrashEmptyState />
          </Show>

          {/* Grouped trash items */}
          <Show when={!trash.loading() && !trash.error() && trash.totalCount() > 0}>
            <For each={trash.groupedItems()}>
              {(group) => (
                <TrashGroupRenderer
                  label={group.label}
                  count={group.vaultItems.length + group.collections.length}
                >
                  <For each={group.collections}>
                    {(col) => (
                      <TrashCollectionCard
                        collection={col}
                        busy={trash.busy()}
                        onRestore={handleRestoreCollection}
                        onDeleteForever={handleDeleteCollectionRequest}
                      />
                    )}
                  </For>
                  <For each={group.vaultItems}>
                    {(item) => (
                      <TrashVaultItemCard
                        item={item}
                        busy={trash.busy()}
                        onRestore={handleRestoreItem}
                        onDeleteForever={handleDeleteItemRequest}
                      />
                    )}
                  </For>
                </TrashGroupRenderer>
              )}
            </For>
          </Show>
        </div>
      </div>

      {/* ── Confirmation dialog ─────────────────────────────── */}
      <ConfirmDialog
        open={confirmOpen()}
        title={confirmTitle()}
        message={confirmMessage()}
        confirmLabel={confirmLabel()}
        cancelLabel="Cancel"
        variant={confirmVariant()}
        icon={confirmIcon()}
        busy={trash.busy()}
        onConfirm={() => void handleConfirm()}
        onCancel={handleCancelConfirm}
      />
    </PageContainer>
  );
};

export default TrashPage;
