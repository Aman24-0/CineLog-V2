// src/features/details/DetailsModal.tsx
import { Show, onMount, onCleanup, Portal, createSignal, createEffect, createMemo } from "solid-js";
import { auth } from "~/core/firebase";
import { useToast } from "~/shared/hooks/useToast";
import { useModalState } from "~/shared/hooks/useModalState";
import { useVault } from "~/features/watchlist/useVault";
import {
  updateStatus as svcUpdateStatus,
  updateRating as svcUpdateRating,
  updateNotes as svcUpdateNotes,
  updateWatchDate as svcUpdateWatchDate,
  updateSeasonEpisode as svcUpdateSeasonEpisode,
  updateWatchProgress as svcUpdateWatchProgress
} from "~/features/watchlist/watchlistService";
import { useDetails } from "./useDetails";
import DetailsHeader from "./components/DetailsHeader";
import DetailsOverview from "./components/DetailsOverview";
import DetailsSkeleton from "./components/DetailsSkeleton";
import DetailsError from "./components/DetailsError";
import DetailsEditForm from "./components/DetailsEditForm";
import EpisodeTracker from "./components/EpisodeTracker";
import SimilarTitles from "./components/SimilarTitles";
import FranchiseInfo from "./components/FranchiseInfo";
import Icon from "~/shared/ui/Icon";

export default function DetailsModal() {
  const { selectedItem, setSelectedItem } = useModalState();
  const { watchlist } = useVault();
  const { showToast } = useToast();
  const { tmdb, omdb, loading, error, retry } = useDetails(selectedItem);

  const [isEditing, setIsEditing] = createSignal(false);
  const [isSaving, setIsSaving] = createSignal(false);
  const [form, setFormState] = createSignal({
    status: "Planned",
    rating: "",
    watchDate: "",
    notes: ""
  });

  let resetTick = 0;

  createEffect(() => {
    const item = selectedItem();
    if (item) {
      resetTick++;
      setFormState({
        status: item.status || "Planned",
        rating: item.rating?.toString() || "",
        watchDate: item.watchDate || "",
        notes: item.notes || ""
      });
      setIsEditing(false);
    }
  });

  const isDirty = createMemo(() => {
    const item = selectedItem();
    if (!item) return false;
    const currentRating = Number(form().rating);
    const itemRating = item.rating || 0;
    return (
      form().status !== (item.status || "Planned") ||
      currentRating !== itemRating ||
      form().notes !== (item.notes || "") ||
      form().watchDate !== (item.watchDate || "")
    );
  });

  const setForm = (key: string, value: string) => {
    setFormState((prev) => ({ ...prev, [key]: value }));
  };

  const close = () => setSelectedItem(null);

  const handleSelectItem = (item: any) => {
    setSelectedItem(item);
    const container = document.querySelector(".overflow-y-auto.hide-scrollbar.w-full");
    if (container) container.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSave = async () => {
    const uid = auth.currentUser?.uid;
    const item = selectedItem();
    if (!uid) {
      showToast("Please sign in to save changes.", "error");
      return;
    }
    if (!item) return;

    if (Number(form().rating) < 0 || Number(form().rating) > 10) {
      showToast("Rating must be between 0 and 10.", "error");
      return;
    }

    setIsSaving(true);
    try {
      const updates = [];
      if (form().status !== (item.status || "Planned")) {
        updates.push(svcUpdateStatus(uid, item.id, form().status));
      }
      if (Number(form().rating) !== (item.rating || 0)) {
        updates.push(svcUpdateRating(uid, item.id, Number(form().rating)));
      }
      if (form().notes !== (item.notes || "")) {
        updates.push(svcUpdateNotes(uid, item.id, form().notes));
      }
      if (form().watchDate !== (item.watchDate || "")) {
        updates.push(svcUpdateWatchDate(uid, item.id, form().watchDate));
      }

      await Promise.all(updates);
      showToast("Saved successfully!", "success");
      setIsEditing(false);
    } catch (err) {
      console.error("Save failed:", err);
      showToast("Failed to save changes.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    const item = selectedItem();
    if (item) {
      setFormState({
        status: item.status || "Planned",
        rating: item.rating?.toString() || "",
        watchDate: item.watchDate || "",
        notes: item.notes || ""
      });
    }
    setIsEditing(false);
  };

  const handleEpisodeChange = async (newSeason: number, newEpisode: number) => {
    const uid = auth.currentUser?.uid;
    const item = selectedItem();
    if (!uid || !item) return;

    try {
      await svcUpdateSeasonEpisode(uid, item.id, newSeason, newEpisode);
      await svcUpdateWatchProgress(uid, item.id, {
        currentTime: 0,
        duration: (item.runtime || 0) * 60,
        server: null,
        updatedAt: new Date().toISOString(),
        season: newSeason,
        episode: newEpisode
      });

      if (item.status === "Planned" || item.status === "Plan to Watch") {
        await svcUpdateStatus(uid, item.id, "Watching");
        setSelectedItem({ ...item, status: "Watching", season: newSeason, episode: newEpisode });
      } else {
        setSelectedItem({ ...item, season: newSeason, episode: newEpisode });
      }
    } catch (err) {
      console.error("Failed to update episode:", err);
      showToast("Failed to update progress.", "error");
    }
  };

  const handleMarkCompleted = async () => {
    const uid = auth.currentUser?.uid;
    const item = selectedItem();
    if (!uid || !item) return;

    try {
      await svcUpdateStatus(uid, item.id, "Completed");
      setSelectedItem({ ...item, status: "Completed" });
      showToast("Marked as Completed!", "success");
    } catch (err) {
      showToast("Failed to update status.", "error");
    }
  };

  onMount(() => {
    document.body.style.overflow = "hidden";
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isEditing()) {
          handleCancel();
        } else {
          close();
        }
      }
    };
    window.addEventListener("keydown", handleEsc);
    onCleanup(() => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleEsc);
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
        >
          <div class="absolute inset-0 bg-[#08090b] overflow-hidden pointer-events-none">
            <Show when={selectedItem()?.backdrop_path}>
              <img
                src={`https://image.tmdb.org/t/p/w500${selectedItem()?.backdrop_path}`}
                class="backdrop-ambient"
                alt=""
                aria-hidden="true"
              />
            </Show>
            <div class="absolute inset-0 bg-black/80" />
          </div>

          <div
            class="w-full max-w-xl lg:max-w-[800px] relative z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <Show
              when={!loading()}
              fallback={<DetailsSkeleton />}
            >
              <Show
                when={!error()}
                fallback={<DetailsError onRetry={retry} />}
              >
                <div
                  class="bg-[#08090b]/80 backdrop-blur-3xl rounded-t-[2.5rem] sm:rounded-[2.5rem] overflow-hidden border border-white/10 relative max-h-[95vh] modal-sheet-enter flex flex-col"
                >
                  <button
                    onClick={close}
                    class="absolute top-4 right-4 z-[100] bg-black/50 backdrop-blur-md border border-white/10 p-2.5 rounded-full hover:bg-black/80 active:scale-95 transition-all"
                    aria-label="Close details"
                  >
                    <Icon name="close" class="text-sm text-white" aria-hidden="true" />
                  </button>

                  <div class="overflow-y-auto hide-scrollbar w-full">
                    <DetailsHeader 
                      baseItem={selectedItem()} 
                      details={tmdb()} 
                      isEditing={isEditing()}
                      onEditToggle={() => (isEditing() ? handleCancel() : setIsEditing(true))}
                    />
                    <div class="px-6 md:px-8 pb-10 relative z-10">
                      <Show 
                        when={!isEditing()}
                        fallback={
                          <DetailsEditForm
                            form={form}
                            setForm={setForm}
                            onSave={handleSave}
                            onCancel={handleCancel}
                            isSaving={isSaving()}
                            isDirty={isDirty()}
                          />
                        }
                      >
                        <DetailsOverview details={tmdb()} omdb={omdb()} />
                      </Show>

                      <Show when={selectedItem()?.media_type === "tv"}>
                        <div class="mt-6">
                          <EpisodeTracker
                            item={selectedItem()!}
                            details={tmdb()}
                            onChange={handleEpisodeChange}
                            onMarkCompleted={handleMarkCompleted}
                          />
                        </div>
                      </Show>

                      <Show when={selectedItem()}>
                        <FranchiseInfo
                          currentItem={selectedItem()!}
                          watchlist={watchlist()}
                          onSelect={handleSelectItem}
                        />
                      </Show>

                      <Show when={selectedItem()}>
                        <SimilarTitles
                          currentItem={selectedItem()!}
                          watchlist={watchlist()}
                          onSelect={handleSelectItem}
                        />
                      </Show>
                    </div>
                  </div>
                </div>
              </Show>
            </Show>
          </div>
        </div>
      </Portal>
    </Show>
  );
}
