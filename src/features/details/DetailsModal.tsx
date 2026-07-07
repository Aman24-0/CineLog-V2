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
  updateWatchProgress as svcUpdateWatchProgress,
  updateSeasons as svcUpdateSeasons,
  addToVault as svcAddToVault
} from "~/features/watchlist/watchlistService";
import { findInVault } from "~/shared/utils/vaultMatch";
import type { CachedSeasonInfo, WatchlistItem } from "~/shared/types";
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
import YourActivityCard from "./components/YourActivityCard";

const SeasonNavigator = lazy(() => import("./components/SeasonNavigator"));
const SimilarTitles = lazy(() => import("./components/SimilarTitles"));
const FranchiseInfo = lazy(() => import("./components/FranchiseInfo"));

/**
 * DetailsModal — V2 Cinematic Details Page.
 *
 * OWNERSHIP BOUNDARY (Phase 2.x refactor):
 *   The modal now carries TWO items: `baseItem` (TMDB identity, always
 *   present) and `vaultItem` (user-owned state, null when not in vault).
 *   Every user-owned section (status pill, user rating, episode tracker,
 *   edit form, "Your Status" metadata cell) renders ONLY when vaultItem
 *   is present. Non-vault titles show pure TMDB metadata + an
 *   "Add to Vault" primary CTA in the ActionDock.
 *
 *   When the user adds a non-vault title from the modal, `handleAddToVault`
 *   writes the new vault entry via `addToVault` (setDoc merge — fixes the
 *   previous silent-fail bug) and updates the modal's vaultItem state in
 *   place. The modal re-renders with user-owned UI enabled — no remount.
 *
 * EPISODE EXPERIENCE (Phase 2.x):
 *   The old +/- EpisodeTracker is replaced by SeasonNavigator — an
 *   expandable season accordion with episode cards. "Mark as Watched"
 *   on an episode advances the tracker via the same handleEpisodeChange
 *   flow (single source of truth). For non-vault titles, episode cards
 *   show "Add to Vault to Track" instead.
 *
 * SIGNATURE INTERACTION: "Adaptive Backdrop"
 *  - The backdrop has parallax scroll (moves up at 0.3x speed, fades out)
 *  - The backdrop visually continues into content via cinematic-ambient layer
 *  - No hard cut-off — the hero fades into the content surface
 */
export default function DetailsModal() {
  const { selectedItem, setSelectedItem } = useModalState();
  const { watchlist } = useVault();
  const { showToast } = useToast();
  const { tmdb, omdb, loading, error, retry } = useDetails(selectedItem);

  const [isEditing, setIsEditing] = createSignal(false);
  const [isSaving, setIsSaving] = createSignal(false);
  const [isAdding, setIsAdding] = createSignal(false);
  const [showTrailer, setShowTrailer] = createSignal(false);
  const [form, setFormState] = createSignal({
    status: "Planned",
    rating: "",
    watchDate: "",
    notes: ""
  });

  // Derived: the baseItem and vaultItem from the new SelectedItem shape
  const baseItem = createMemo(() => selectedItem()?.baseItem ?? null);
  const vaultItem = createMemo(() => selectedItem()?.vaultItem ?? null);
  const inVault = createMemo(() => vaultItem() !== null);

  createEffect(() => {
    const v = vaultItem();
    if (v) {
      setFormState({
        status: v.status || "Planned",
        rating: v.rating?.toString() || "",
        watchDate: v.watchDate || "",
        notes: v.notes || ""
      });
    } else {
      // Non-vault title — reset the form to defaults (no user-owned state)
      setFormState({ status: "Planned", rating: "", watchDate: "", notes: "" });
    }
    setIsEditing(false);
    setShowTrailer(false);
  });

  const isDirty = createMemo(() => {
    const v = vaultItem();
    if (!v) return false;
    const currentRating = Number(form().rating);
    const itemRating = v.rating || 0;
    return (
      form().status !== (v.status || "Planned") ||
      currentRating !== itemRating ||
      form().notes !== (v.notes || "") ||
      form().watchDate !== (v.watchDate || "")
    );
  });

  const setForm = (key: string, value: string) => {
    setFormState((prev) => ({ ...prev, [key]: value }));
  };

  const close = () => setSelectedItem(null);

  const handleSelectItem = (item: WatchlistItem) => {
    // When navigating to a related title, use findInVault to respect the
    // ownership boundary AND avoid TMDB ID namespace collisions (movie/1398
    // vs tv/1398 are different titles).
    const existing = findInVault(watchlist(), item);
    setSelectedItem({ baseItem: existing ?? item, vaultItem: existing });
    const container = document.querySelector(".cinematic-scroll");
    if (container) container.scrollTo({ top: 0, behavior: "smooth" });
  };

  const hasTrailer = createMemo(() => pickTrailer(tmdb()) !== null);

  /**
   * Cache `details.seasons` onto the watchlist item — ONLY if the title
   * is in the vault (no point caching for non-vault titles; the cache is
   * consumed by the progress engine which only runs on vault items).
   */
  createEffect(() => {
    const v = vaultItem();
    const details = tmdb();
    const uid = auth.currentUser?.uid;
    if (!v || !details || !uid) return;
    if (v.media_type !== "tv") return;
    if (!details.seasons || details.seasons.length === 0) return;

    const fresh: CachedSeasonInfo[] = details.seasons
      .filter((s) => s.season_number > 0 && s.episode_count > 0)
      .map((s) => ({ number: s.season_number, count: s.episode_count }))
      .sort((a, b) => a.number - b.number);
    if (fresh.length === 0) return;

    const cached = v.seasons;
    const isStale =
      !cached ||
      cached.length !== fresh.length ||
      cached.some(
        (c, i) => c.number !== fresh[i].number || c.count !== fresh[i].count
      );
    if (!isStale) return;

    svcUpdateSeasons(uid, v.id, fresh).catch((err: unknown) =>
      console.warn("Failed to cache seasons on item:", err)
    );
  });

  /**
   * handleAddToVault — add the currently-open non-vault title to the vault.
   * Uses the new `addToVault` service (setDoc merge) which fixes the
   * previous silent-fail bug. After adding, updates the modal's vaultItem
   * state in place so the UI upgrades to vault-owned mode without a remount.
   */
  const handleAddToVault = async () => {
    const uid = auth.currentUser?.uid;
    const b = baseItem();
    if (!uid) {
      showToast("Sign in to save titles to your vault.", "error");
      return;
    }
    if (!b) return;

    setIsAdding(true);
    try {
      const newItem = await svcAddToVault(uid, b);
      // Upgrade the modal state: now the title IS in the vault.
      setSelectedItem({ baseItem: newItem, vaultItem: newItem });
      const name = b.title || b.name || "Title";
      showToast(`Added "${name}" to your vault`, "success", 1800);
    } catch (err) {
      console.error("Failed to add to vault:", err);
      showToast("Failed to add. Try again.", "error");
    } finally {
      setIsAdding(false);
    }
  };

  const handleSave = async () => {
    const uid = auth.currentUser?.uid;
    const v = vaultItem();
    if (!uid) {
      showToast("Please sign in to save changes.", "error");
      return;
    }
    if (!v) return;

    if (Number(form().rating) < 0 || Number(form().rating) > 10) {
      showToast("Rating must be between 0 and 10.", "error");
      return;
    }

    setIsSaving(true);
    try {
      const updates = [];
      if (form().status !== (v.status || "Planned")) {
        updates.push(svcUpdateStatus(uid, v.id, form().status));
      }
      if (Number(form().rating) !== (v.rating || 0)) {
        updates.push(svcUpdateRating(uid, v.id, Number(form().rating)));
      }
      if (form().notes !== (v.notes || "")) {
        updates.push(svcUpdateNotes(uid, v.id, form().notes));
      }
      if (form().watchDate !== (v.watchDate || "")) {
        updates.push(svcUpdateWatchDate(uid, v.id, form().watchDate));
      }

      await Promise.all(updates);
      showToast("Saved successfully!", "success");
      setIsEditing(false);
      // Update vaultItem in place so the UI reflects the saved state.
      // Cast form().status to the WatchlistItem status union — the form
      // is typed as string because DetailsEditForm uses a <select>, but
      // the values are always one of the 4 valid statuses.
      const updatedVault: WatchlistItem = {
        ...v,
        status: form().status as WatchlistItem["status"],
        rating: Number(form().rating) || v.rating,
        watchDate: form().watchDate,
        notes: form().notes
      };
      setSelectedItem({
        baseItem: { ...baseItem()!, ...updatedVault },
        vaultItem: updatedVault
      });
    } catch (err) {
      console.error("Save failed:", err);
      showToast("Failed to save changes.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    const v = vaultItem();
    if (v) {
      setFormState({
        status: v.status || "Planned",
        rating: v.rating?.toString() || "",
        watchDate: v.watchDate || "",
        notes: v.notes || ""
      });
    }
    setIsEditing(false);
  };

  // Status cycling: Planned → Watching → Completed → Planned (vault only)
  const handleStatusCycle = async () => {
    const uid = auth.currentUser?.uid;
    const v = vaultItem();
    if (!uid || !v) return;

    const currentStatus = v.status || "Planned";
    const nextStatus =
      currentStatus === "Planned" || currentStatus === "Plan to Watch"
        ? "Watching"
        : currentStatus === "Watching"
          ? "Completed"
          : "Planned";

    try {
      await svcUpdateStatus(uid, v.id, nextStatus);
      const updated: WatchlistItem = { ...v, status: nextStatus as WatchlistItem["status"] };
      setSelectedItem({ baseItem: { ...baseItem()!, ...updated }, vaultItem: updated });
      showToast(`Status: ${nextStatus}`, "success", 1500);
    } catch (err) {
      showToast("Failed to update status.", "error");
    }
  };

  const handleEpisodeChange = async (newSeason: number, newEpisode: number) => {
    const uid = auth.currentUser?.uid;
    const v = vaultItem();
    if (!uid || !v) return;

    try {
      await svcUpdateSeasonEpisode(uid, v.id, newSeason, newEpisode);
      await svcUpdateWatchProgress(uid, v.id, {
        currentTime: 0,
        duration: 0,
        server: null,
        updatedAt: new Date().toISOString(),
        season: newSeason,
        episode: newEpisode
      });

      // Opportunistically refresh the seasons cache (same as before)
      const details = tmdb();
      if (details?.seasons && v.media_type === "tv") {
        const fresh: CachedSeasonInfo[] = details.seasons
          .filter((s) => s.season_number > 0 && s.episode_count > 0)
          .map((s) => ({ number: s.season_number, count: s.episode_count }))
          .sort((a, b) => a.number - b.number);
        const cached = v.seasons || [];
        const needsRefresh =
          fresh.length > 0 &&
          (cached.length !== fresh.length ||
            cached.some(
              (c, i) =>
                i >= fresh.length ||
                c.number !== fresh[i].number ||
                c.count !== fresh[i].count
            ));
        if (needsRefresh) {
          svcUpdateSeasons(uid, v.id, fresh).catch(() => {});
        }
      }

      let updated: WatchlistItem;
      if (v.status === "Planned" || v.status === "Plan to Watch") {
        await svcUpdateStatus(uid, v.id, "Watching");
        updated = { ...v, status: "Watching", season: newSeason, episode: newEpisode };
      } else {
        updated = { ...v, season: newSeason, episode: newEpisode };
      }
      setSelectedItem({ baseItem: { ...baseItem()!, ...updated }, vaultItem: updated });
    } catch (err) {
      console.error("Failed to update episode:", err);
      showToast("Failed to update progress.", "error");
    }
  };

  const handleMarkCompleted = async () => {
    const uid = auth.currentUser?.uid;
    const v = vaultItem();
    if (!uid || !v) return;

    try {
      await svcUpdateStatus(uid, v.id, "Completed");
      const updated: WatchlistItem = { ...v, status: "Completed" };
      setSelectedItem({ baseItem: { ...baseItem()!, ...updated }, vaultItem: updated });
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
            <Show when={baseItem()?.backdrop_path}>
              <img
                src={`https://image.tmdb.org/t/p/w500${baseItem()?.backdrop_path}`}
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
                    {/* 1. Cinematic hero — full-bleed backdrop with parallax.
                        When trailer is active, the iframe replaces the backdrop. */}
                    <CinematicHero
                      baseItem={baseItem()}
                      details={tmdb()}
                      onClose={close}
                      trailerActive={showTrailer() && hasTrailer()}
                      trailerKey={pickTrailer(tmdb())?.key ?? null}
                      onCloseTrailer={() => setShowTrailer(false)}
                    />

                    {/* 2. Floating poster + title cluster (ownership-aware) */}
                    <HeroContentCluster
                      baseItem={baseItem()}
                      details={tmdb()}
                      vaultItem={vaultItem()}
                    />

                    {/* 3. Action dock — floating glass bar (ownership-aware) */}
                    <ActionDock
                      item={baseItem()}
                      vaultItem={vaultItem()}
                      hasTrailer={hasTrailer()}
                      onPlayTrailer={() => setShowTrailer((v) => !v)}
                      onEdit={() => (isEditing() ? handleCancel() : setIsEditing(true))}
                      onStatusCycle={handleStatusCycle}
                      onAddToVault={handleAddToVault}
                      isAdding={isAdding()}
                    />

                    {/* Content area — switches between view and edit (edit is vault-only) */}
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
                          />
                        </DetailSection>
                      }
                    >
                      {/* 4. Your Activity card — user-owned data (vault only).
                          Personal info (status, watch date, rating, notes)
                          lives HERE, separate from TMDB metadata. This is
                          the ownership boundary made visible. Pure info card —
                          Edit lives in the ActionDock to avoid duplication. */}
                      <Show when={inVault() && vaultItem()}>
                        <DetailSection style={{ "margin-top": "1.5rem" }}>
                          <YourActivityCard vaultItem={vaultItem()!} />
                        </DetailSection>
                      </Show>

                      {/* 5. Rating cluster — ownership-aware (user rating only when in vault) */}
                      <Show when={tmdb() || omdb()}>
                        <DetailSection style={{ "margin-top": "1.5rem" }}>
                          <RatingCluster
                            details={tmdb()}
                            omdb={omdb()}
                            baseItem={baseItem()}
                            vaultItem={vaultItem()}
                          />
                        </DetailSection>
                      </Show>

                      {/* 6. Overview */}
                      <Show when={tmdb()?.overview}>
                        <DetailSection label="Overview" icon="description">
                          <p class="type-body" style={{ color: "var(--text-soft)", "line-height": 1.65 }}>
                            {tmdb()!.overview}
                          </p>
                        </DetailSection>
                      </Show>

                      {/* 7. Cast & Crew (if available from OMDb) */}
                      <Show when={omdb()?.director || omdb()?.writer || omdb()?.actors}>
                        <DetailSection label="Cast & Crew" icon="groups">
                          <CastCrewGrid omdb={omdb()} />
                        </DetailSection>
                      </Show>

                      {/* 8. Metadata grid — ownership-aware */}
                      <Show when={tmdb()}>
                        <DetailSection label="Details" icon="info">
                          <MetadataGrid
                            baseItem={baseItem()}
                            details={tmdb()}
                            omdb={omdb()}
                            vaultItem={vaultItem()}
                          />
                        </DetailSection>
                      </Show>

                      {/* 9. Season Navigator (TV only) — replaces old EpisodeTracker */}
                      <Show when={baseItem()?.media_type === "tv" && tmdb()?.seasons}>
                        <DetailSection
                          label={inVault() ? "Episodes" : "Episode Guide"}
                          icon="video_library"
                        >
                          <Suspense fallback={<div class="h-48 v2-card animate-pulse"></div>}>
                            <SeasonNavigator
                              item={baseItem()!}
                              details={tmdb()}
                              vaultItem={vaultItem()}
                              onEpisodeChange={handleEpisodeChange}
                              onAddToVault={handleAddToVault}
                            />
                          </Suspense>
                        </DetailSection>
                      </Show>

                      {/* 10. Related — franchise + similar */}
                      <Show when={baseItem()}>
                        <Suspense fallback={<div class="h-24 v2-card animate-pulse"></div>}>
                          <FranchiseInfo
                            currentItem={baseItem()!}
                            watchlist={watchlist()}
                            onSelect={handleSelectItem}
                          />
                        </Suspense>
                      </Show>

                      <Show when={baseItem()}>
                        <Suspense fallback={<div class="h-24 v2-card animate-pulse"></div>}>
                          <SimilarTitles
                            currentItem={baseItem()!}
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
