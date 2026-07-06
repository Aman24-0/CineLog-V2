// src/features/details/DetailsModal.tsx
import { Show, onMount, onCleanup, createSignal, createEffect, createMemo, lazy, Suspense } from "solid-js";
import { Portal } from "solid-js/web";
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
import { pickTrailer } from "~/core/tmdb/tmdb";
import { useDetails } from "./useDetails";
import CinematicHero from "./components/CinematicHero";
import HeroContentCluster from "./components/HeroContentCluster";
import ActionDock from "./components/ActionDock";
import RatingCluster from "./components/RatingCluster";
import MetadataGrid from "./components/MetadataGrid";
import DetailSection from "./components/DetailSection";
import DetailsSkeleton from "./components/DetailsSkeleton";
import DetailsError from "./components/DetailsError";
import DetailsEditForm from "./components/DetailsEditForm";

const EpisodeTracker = lazy(() => import("./components/EpisodeTracker"));
const SimilarTitles = lazy(() => import("./components/SimilarTitles"));
const FranchiseInfo = lazy(() => import("./components/FranchiseInfo"));
const TrailerSection = lazy(() => import("./components/TrailerSection"));

/**
 * DetailsModal — V2 Cinematic Details Page.
 *
 * NEW INFORMATION ARCHITECTURE:
 *  1. CinematicHero — full-bleed backdrop with multi-layer gradients + parallax
 *  2. HeroContentCluster — floating poster + title + tagline + quick-meta
 *  3. ActionDock — floating glass bar: Status | Trailer | Rate | Edit
 *  4. RatingCluster — user rating prominent, IMDb/RT secondary
 *  5. Overview — paragraph (DetailSection)
 *  6. MetadataGrid — responsive grid of metadata cells (DetailSection)
 *  7. EpisodeTracker — TV only (DetailSection)
 *  8. Related — Franchise + Similar (DetailSection)
 *
 * SIGNATURE INTERACTION: "Adaptive Backdrop"
 *  - The backdrop has parallax scroll (moves up at 0.3x speed, fades out)
 *  - The backdrop visually continues into content via cinematic-ambient layer
 *  - No hard cut-off — the hero fades into the content surface
 *
 * TRAILER INTEGRATION:
 *  - Trailer button lives in the ActionDock (not a separate section)
 *  - Clicking expands an inline player below the action dock
 *  - If no trailer: button is hidden, no empty space
 *
 * STATUS CYCLING:
 *  - The primary action button cycles: Planned → Watching → Completed → Planned
 *  - Updates Firestore immediately (no need to open edit mode for status changes)
 */
export default function DetailsModal() {
  const { selectedItem, setSelectedItem } = useModalState();
  const { watchlist } = useVault();
  const { showToast } = useToast();
  const { tmdb, omdb, loading, error, retry } = useDetails(selectedItem);

  const [isEditing, setIsEditing] = createSignal(false);
  const [isSaving, setIsSaving] = createSignal(false);
  const [showTrailer, setShowTrailer] = createSignal(false);
  const [form, setFormState] = createSignal({
    status: "Planned",
    rating: "",
    watchDate: "",
    notes: ""
  });

  createEffect(() => {
    const item = selectedItem();
    if (item) {
      setFormState({
        status: item.status || "Planned",
        rating: item.rating?.toString() || "",
        watchDate: item.watchDate || "",
        notes: item.notes || ""
      });
      setIsEditing(false);
      setShowTrailer(false);
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
    const container = document.querySelector(".cinematic-scroll");
    if (container) container.scrollTo({ top: 0, behavior: "smooth" });
  };

  const hasTrailer = createMemo(() => pickTrailer(tmdb()) !== null);

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

  // Status cycling: Planned → Watching → Completed → Planned
  const handleStatusCycle = async () => {
    const uid = auth.currentUser?.uid;
    const item = selectedItem();
    if (!uid || !item) return;

    const currentStatus = item.status || "Planned";
    const nextStatus =
      currentStatus === "Planned" || currentStatus === "Plan to Watch"
        ? "Watching"
        : currentStatus === "Watching"
          ? "Completed"
          : "Planned";

    try {
      await svcUpdateStatus(uid, item.id, nextStatus);
      setSelectedItem({ ...item, status: nextStatus });
      showToast(`Status: ${nextStatus}`, "success", 1500);
    } catch (err) {
      showToast("Failed to update status.", "error");
    }
  };

  const handleEpisodeChange = async (newSeason: number, newEpisode: number) => {
    const uid = auth.currentUser?.uid;
    const item = selectedItem();
    if (!uid || !item) return;

    try {
      await svcUpdateSeasonEpisode(uid, item.id, newSeason, newEpisode);
      // V2: No streaming playback progress. Only season/episode is tracked.
      // The watchProgress object is kept for updatedAt sorting (used by
      // Continue Watching ordering), but currentTime/duration are always 0.
      await svcUpdateWatchProgress(uid, item.id, {
        currentTime: 0,
        duration: 0,
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
        } else if (showTrailer()) {
          setShowTrailer(false);
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
          {/* Ambient backdrop continuation — blurred tint behind the modal */}
          <div class="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
            <Show when={selectedItem()?.backdrop_path}>
              <img
                src={`https://image.tmdb.org/t/p/w500${selectedItem()?.backdrop_path}`}
                class="cinematic-ambient"
                alt=""
                aria-hidden="true"
              />
            </Show>
            <div class="absolute inset-0" style={{ background: "rgba(0,0,0,0.75)" }} />
          </div>

          <div
            class="w-full max-w-xl lg:max-w-[800px] relative z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <Show when={!loading()} fallback={<DetailsSkeleton />}>
              <Show when={!error()} fallback={<DetailsError onRetry={retry} />}>
                <div class="cinematic-modal modal-sheet-enter">
                  {/* Scrollable content area */}
                  <div class="cinematic-scroll">
                    {/* 1. Cinematic hero — full-bleed backdrop with parallax */}
                    <CinematicHero
                      baseItem={selectedItem()}
                      details={tmdb()}
                      onClose={close}
                    />

                    {/* 2. Floating poster + title cluster */}
                    <HeroContentCluster
                      baseItem={selectedItem()}
                      details={tmdb()}
                    />

                    {/* 3. Action dock — floating glass bar */}
                    <ActionDock
                      item={selectedItem()}
                      hasTrailer={hasTrailer()}
                      onPlayTrailer={() => setShowTrailer((v) => !v)}
                      onEdit={() => (isEditing() ? handleCancel() : setIsEditing(true))}
                      onStatusCycle={handleStatusCycle}
                    />

                    {/* Inline trailer expansion */}
                    <Show when={showTrailer() && hasTrailer()}>
                      <div class="detail-section" style={{ "margin-top": "1rem" }}>
                        <Suspense fallback={<div class="h-48 v2-card animate-pulse"></div>}>
                          <TrailerSection details={tmdb()} inline />
                        </Suspense>
                      </div>
                    </Show>

                    {/* Content area — switches between view and edit */}
                    <Show
                      when={!isEditing()}
                      fallback={
                        <DetailSection style={{ "margin-top": "1.5rem" }}>
                          <DetailsEditForm
                            form={form}
                            setForm={setForm}
                            onSave={handleSave}
                            onCancel={handleCancel}
                            isSaving={isSaving()}
                            isDirty={isDirty()}
                          />
                        </DetailSection>
                      }
                    >
                      {/* 4. Rating cluster — user rating prominent */}
                      <Show when={tmdb() || omdb()}>
                        <DetailSection style={{ "margin-top": "1.5rem" }}>
                          <RatingCluster
                            details={tmdb()}
                            omdb={omdb()}
                            baseItem={selectedItem()}
                          />
                        </DetailSection>
                      </Show>

                      {/* 5. Overview */}
                      <Show when={tmdb()?.overview}>
                        <DetailSection label="Overview" icon="description">
                          <p class="type-body" style={{ color: "var(--text-soft)", "line-height": 1.65 }}>
                            {tmdb()!.overview}
                          </p>
                        </DetailSection>
                      </Show>

                      {/* 6. Cast & Crew (if available from OMDb) */}
                      <Show when={omdb()?.director || omdb()?.writer || omdb()?.actors}>
                        <DetailSection label="Cast & Crew" icon="groups">
                          <CastCrewGrid omdb={omdb()} />
                        </DetailSection>
                      </Show>

                      {/* 7. Metadata grid */}
                      <Show when={tmdb()}>
                        <DetailSection label="Details" icon="info">
                          <MetadataGrid
                            baseItem={selectedItem()}
                            details={tmdb()}
                            omdb={omdb()}
                          />
                        </DetailSection>
                      </Show>

                      {/* 8. Episode tracker (TV only) */}
                      <Show when={selectedItem()?.media_type === "tv"}>
                        <DetailSection label="Progress" icon="video_library">
                          <Suspense fallback={<div class="h-48 v2-card animate-pulse"></div>}>
                            <EpisodeTracker
                              item={selectedItem()!}
                              details={tmdb()}
                              onChange={handleEpisodeChange}
                              onMarkCompleted={handleMarkCompleted}
                            />
                          </Suspense>
                        </DetailSection>
                      </Show>

                      {/* 9. Related — franchise + similar */}
                      <Show when={selectedItem()}>
                        <Suspense fallback={<div class="h-24 v2-card animate-pulse"></div>}>
                          <FranchiseInfo
                            currentItem={selectedItem()!}
                            watchlist={watchlist()}
                            onSelect={handleSelectItem}
                          />
                        </Suspense>
                      </Show>

                      <Show when={selectedItem()}>
                        <Suspense fallback={<div class="h-24 v2-card animate-pulse"></div>}>
                          <SimilarTitles
                            currentItem={selectedItem()!}
                            watchlist={watchlist()}
                            onSelect={handleSelectItem}
                          />
                        </Suspense>
                      </Show>
                    </Show>
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

/**
 * CastCrewGrid — inline cast & crew display using v2-meta-row system.
 * Extracted here to keep DetailsModal readable.
 */
function CastCrewGrid(props: { omdb: any }) {
  const cast = () =>
    (props.omdb?.actors || "")
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean);

  const director = () => props.omdb?.director?.trim();
  const writer = () => props.omdb?.writer?.trim();

  return (
    <div class="space-y-2.5">
      <Show when={director()}>
        <div class="v2-meta-row">
          <span class="v2-meta-label">Director</span>
          <span class="v2-meta-value">{director()}</span>
        </div>
      </Show>
      <Show when={writer()}>
        <div class="v2-meta-row">
          <span class="v2-meta-label">Writer</span>
          <span class="v2-meta-value">{writer()}</span>
        </div>
      </Show>
      <Show when={cast().length > 0}>
        <div class="v2-meta-row">
          <span class="v2-meta-label">Cast</span>
          <div class="flex flex-wrap gap-1.5">
            {cast().map((name: string) => (
              <span class="v2-pill">{name}</span>
            ))}
          </div>
        </div>
      </Show>
    </div>
  );
}
