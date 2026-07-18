// src/features/details/DetailsModal/DetailsModal.tsx
import {
  Show,
  onMount,
  onCleanup,
  createSignal,
  createEffect,
  createMemo,
  on,
} from "solid-js";
import { Portal } from "solid-js/web";
import { useModalState, setSelectedItem as setSelectedItemDirect } from "~/shared/hooks/useModalState";
import { useVault } from "~/features/watchlist/useVault";
import { useUserLibrary } from "~/shared/hooks/useUserLibrary";
import { useDetails } from "~/features/details/useDetails";
import DetailsSkeleton from "~/features/details/components/DetailsSkeleton";
import DetailsError from "~/features/details/components/DetailsError";
import DetailSection from "~/features/details/components/DetailSection";
import DetailsEditForm from "~/features/details/components/DetailsEditForm";
import YourActivityCard from "~/features/details/components/YourActivityCard";
import AddToFolderSheet from "~/features/details/components/AddToFolderSheet";
import ConfirmRemoveSheet from "~/features/details/components/ConfirmRemoveSheet";

import DetailsHero from "./DetailsHero";
import DetailsHeader from "./DetailsHeader";
import DetailsActions from "./DetailsActions";
import DetailsRatings from "./DetailsRatings";
import DetailsOverview from "./DetailsOverview";
import DetailsMetadata from "./DetailsMetadata";
import DetailsCast from "./DetailsCast";
import DetailsSeasons from "./DetailsSeasons";
import DetailsRecommendations from "./DetailsRecommendations";
import WhereToWatch from "~/features/details/components/WhereToWatch";
import ScrollToTop from "~/shared/ui/ScrollToTop";
import { useDetailsForm } from "./useDetailsForm";
import { useDetailsActions } from "./useDetailsActions";

/**
 * DetailsModal — V2 Cinematic Details Page (orchestration only).
 *
 * Owns state + handlers + lifecycle, and composes section components.
 * Each section is a thin wrapper around the building-block components
 * in `../components/`.
 *
 * OWNERSHIP BOUNDARY:
 *   The modal carries TWO items: `baseItem` (TMDB identity, always present)
 *   and `vaultItem` (user-owned state, null when not in vault). User-owned
 *   sections gate on `vaultItem` — never on a fake default status.
 */
export default function DetailsModal() {
  const { selectedItem, closeTitle } = useModalState();
  const { watchlist } = useVault();
  const library = useUserLibrary();
  const { tmdb, omdb, loading, error, retry } = useDetails(selectedItem);

  const [showTrailer, setShowTrailer] = createSignal(false);
  const [showFolders, setShowFolders] = createSignal(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = createSignal(false);

  const baseItem = createMemo(() => selectedItem()?.baseItem ?? null);
  const vaultItem = createMemo(() => selectedItem()?.vaultItem ?? null);
  const inVault = createMemo(() => vaultItem() !== null);

  const { form, setForm, isDirty, resetTo, isEditing, setIsEditing } =
    useDetailsForm(vaultItem);

  /**
   * Called after a successful remove. Refreshes the library so every
   * consumer (watchlist, dashboard, collections, search, etc.) reacts
   * instantly, then closes the modal + the confirm sheet.
   */
  const handleRemoved = () => {
    void library.refresh();
    setShowRemoveConfirm(false);
    closeTitle();
  };

  const {
    hasTrailer,
    trailerKey,
    isAdding,
    isSaving,
    isRemoving,
    handleAddToVault,
    handleSave,
    handleCancel,
    handleStatusCycle,
    handleSetStatus,
    handleEpisodeChange,
    handleSelectItem,
    handleRemoveFromVault,
  } = useDetailsActions({
    baseItem,
    vaultItem,
    details: tmdb,
    watchlist,
    form,
    resetTo,
    setSelectedItem: (item) => {
      // The actions hook uses setSelectedItem to switch titles. We don't
      // need history sync here because the modal stays open — we're just
      // swapping the content. Import setSelectedItem directly for this.
      setSelectedItemDirect(item);
    },
    onRemoved: handleRemoved,
  });

  // Reset trailer state whenever the open title changes.
  createEffect(on(vaultItem, () => setShowTrailer(false)));

  const close = () => closeTitle();

  onMount(() => {
    document.body.style.overflow = "hidden";

    // Focus trap: keep keyboard focus inside the modal while it is open.
    // On open, move focus to the close button. On Tab/Shift+Tab at the
    // boundary, wrap around to the other end.
    const modalEl = document.querySelector(".cinematic-modal") as HTMLElement | null;
    const getFocusable = (): HTMLElement[] => {
      if (!modalEl) return [];
      return Array.from(
        modalEl.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.closest("[aria-hidden=true]"));
    };

    // Move initial focus to close button
    const closeBtn = document.querySelector(".cinematic-close-btn") as HTMLElement | null;
    closeBtn?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Priority: remove-confirm sheet → edit mode → trailer → modal
        if (showRemoveConfirm()) setShowRemoveConfirm(false);
        else if (isEditing()) handleCancel();
        else if (showTrailer()) setShowTrailer(false);
        else close();
        return;
      }
      if (e.key === "Tab") {
        const focusable = getFocusable();
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    onCleanup(() => {
      // Always restore body overflow on unmount — prevents black screen
      // if the modal unmounts unexpectedly (BUG 1 fix).
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    });
  });

  return (
    <Show when={selectedItem()}>
      <Portal>
        <div
          class="fixed inset-0 z-[999999] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-labelledby="details-modal-title"
        >
          {/* Ambient backdrop continuation — blurred tint behind the modal.
              The <img> is decorative; if the TMDB URL fails we hide it so
              no broken-image glyph bleeds through the blur + tint overlay. */}
          <div class="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
            <Show when={baseItem()?.backdrop_path}>
              <img
                src={`https://image.tmdb.org/t/p/w500${baseItem()?.backdrop_path}`}
                class="cinematic-ambient"
                alt=""
                aria-hidden="true"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            </Show>
            <div class="absolute inset-0" style={{ background: "rgba(0,0,0,0.75)" }} />
          </div>

          <div
            class="w-full max-w-xl lg:max-w-[800px] relative z-10"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button — rendered at the modal-container level (NOT inside
                the hero) so it stays fixed when the user scrolls. Previously
                the close button was inside .cinematic-hero which has
                overflow:hidden + scrolls out of view, causing the button to
                disappear (BUG 2 fix). position:fixed + z-index:30 keeps it
                above the hero (z:20) and always visible. */}
            <button
              onClick={close}
              class="cinematic-close-btn"
              aria-label="Close details"
              style={{ position: "fixed" }}
            >
              <span
                class="material-symbols-outlined"
                style={{ "font-size": "18px" }}
                aria-hidden="true"
              >
                close
              </span>
            </button>

            <Show when={!loading()} fallback={<DetailsSkeleton />}>
              <Show when={!error()} fallback={<DetailsError onRetry={retry} />}>
                <div class="cinematic-modal">
                  <div class="cinematic-scroll">
                    <DetailsHero
                      baseItem={baseItem}
                      details={tmdb}
                      trailerActive={() => showTrailer() && hasTrailer()}
                      trailerKey={trailerKey}
                      onClose={close}
                      onCloseTrailer={() => setShowTrailer(false)}
                    />
                    <DetailsHeader baseItem={baseItem} details={tmdb} vaultItem={vaultItem} />
                    <DetailsActions
                      baseItem={baseItem}
                      vaultItem={vaultItem}
                      hasTrailer={hasTrailer}
                      isAdding={isAdding}
                      onPlayTrailer={() => setShowTrailer((v) => !v)}
                      onEdit={() => (isEditing() ? handleCancel() : setIsEditing(true))}
                      onStatusCycle={handleStatusCycle}
                      onSetStatus={handleSetStatus}
                      onAddToVault={handleAddToVault}
                      onOpenFolders={() => setShowFolders(true)}
                      onRemove={() => setShowRemoveConfirm(true)}
                    />
                    <Show
                      when={!isEditing() || !inVault()}
                      fallback={
                        <DetailSection style={{ "margin-top": "1.5rem" }}>
                          <DetailsEditForm
                            form={form}
                            setForm={setForm}
                            onSave={handleSave}
                            onCancel={handleCancel}
                            isSaving={isSaving()}
                            isDirty={isDirty()}
                            details={tmdb}
                            isSeries={() => baseItem()?.media_type === "tv"}
                          />
                        </DetailSection>
                      }
                    >
                      <Show when={inVault() && vaultItem()}>
                        <DetailSection style={{ "margin-top": "1.5rem" }}>
                          <YourActivityCard vaultItem={vaultItem()!} />
                        </DetailSection>
                      </Show>
                      <DetailsRatings
                        baseItem={baseItem}
                        details={tmdb}
                        omdb={omdb}
                        vaultItem={vaultItem}
                      />
                      <DetailsOverview details={tmdb} />
                      <DetailsCast details={tmdb} />
                      <DetailsMetadata
                        baseItem={baseItem}
                        details={tmdb}
                        omdb={omdb}
                        vaultItem={vaultItem}
                      />
                      {/* Where to Watch — between Details and Episodes.
                          Country-filtered: only shows platforms available in
                          the user's set region (from Account settings). */}
                      <WhereToWatch baseItem={baseItem} details={tmdb} />
                      <DetailsSeasons
                        baseItem={baseItem}
                        details={tmdb}
                        vaultItem={vaultItem}
                        inVault={inVault}
                        onEpisodeChange={handleEpisodeChange}
                        onAddToVault={handleAddToVault}
                      />
                      <DetailsRecommendations
                        baseItem={baseItem}
                        watchlist={watchlist}
                        onSelect={handleSelectItem}
                      />
                    </Show>
                    {/* FAB scroll-to-top — scoped to this modal's scroll
                        container so it only appears when the user scrolls
                        inside the modal, not the page behind it. */}
                    <ScrollToTop scrollContainer=".cinematic-scroll" />
                  </div>
                </div>
              </Show>
            </Show>
          </div>
        </div>

        <Show when={showFolders() && vaultItem()}>
          <AddToFolderSheet item={vaultItem()!} onClose={() => setShowFolders(false)} />
        </Show>

        {/* Remove confirmation sheet — destructive action, requires explicit confirm */}
        <Show when={showRemoveConfirm() && vaultItem()}>
          <ConfirmRemoveSheet
            item={vaultItem()!}
            isRemoving={isRemoving()}
            onConfirm={handleRemoveFromVault}
            onClose={() => !isRemoving() && setShowRemoveConfirm(false)}
          />
        </Show>
      </Portal>
    </Show>
  );
}

