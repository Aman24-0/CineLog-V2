// src/features/details/DetailsModal/DetailsModal.tsx
import {
  Show,
  onMount,
  onCleanup,
  createSignal,
  createEffect,
  createMemo,
  on
} from "solid-js";
import { Portal } from "solid-js/web";
import {
  useModalState,
  setSelectedItem as setSelectedItemDirect
} from "~/shared/hooks/useModalState";
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
import ShareSheet from "~/features/details/ShareSheet";
import { canWebShare, buildShareUrl, buildShareTextBody, resolveTitle } from "~/shared/utils/share";
import { useMdbListRatings } from "~/features/details/useMdbListRatings";

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
import UserCollectionInfo from "~/features/details/components/UserCollectionInfo";
// AniList enrichment (Phase 4) — renders Relations, Source Material,
// OP/ED themes, Airing Schedule ONLY for anime titles. Self-gating:
// the hook returns null for non-anime, and AnimeSections renders
// nothing when anilist is null.
//
// Stats, Studio, and Characters sections have been MOVED out of
// AnimeSections into the main flow:
//   - Stats → merged into MetadataGrid as unified Detail cells
//   - Studio → merged into MetadataGrid Studio cell
//   - Characters → AnimeCharacters replaces DetailsCast for anime
//   - Crew → merged into AnimeCharacters as a horizontal carousel
//
// Recommendations use TMDB for ALL titles (movies, TV, anime).
// AniList recommendations removed — TMDB has better artwork,
// larger pool, more diverse results. AniList still provides:
// Relations, Characters, Voice Actors, Metadata, Source Material.
import AnimeSections from "./AnimeSections";
import AnimeCharacters from "./AnimeCharacters";
import { useAnimeEnrichment } from "~/features/details/useAnimeEnrichment";

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
  // AniList enrichment (Phase 4). The hook is self-gating — it returns
  // null for non-anime titles and respects the admin anime_settings
  // toggles. AnimeSections renders nothing when anilist is null.
  const animeEnrichment = useAnimeEnrichment(selectedItem, tmdb);

  const [showTrailer, setShowTrailer] = createSignal(false);
  const [showFolders, setShowFolders] = createSignal(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = createSignal(false);
  const [showShare, setShowShare] = createSignal(false);

  const baseItem = createMemo(() => selectedItem()?.baseItem ?? null);
  const vaultItem = createMemo(() => selectedItem()?.vaultItem ?? null);
  const inVault = createMemo(() => vaultItem() !== null);

  // Derived values for the ShareSheet — the TMDB id, media_type, and
  // the rich details payload (genres, vote_average, seasons, etc.).
  // The sheet uses these to build the deep-link URL and the green
  // share card preview.
  // ESLint: shareTmdbId and shareMediaType are used inside event handlers
  // (handleSmartShare) which are tracked scopes — the lint rule can't see
  // through the handler boundary.
  // eslint-disable-next-line solid/reactivity
  const shareTmdbId = createMemo(() => baseItem()?.id ?? "");
  // eslint-disable-next-line solid/reactivity
  const shareMediaType = createMemo<"movie" | "tv">(() => {
    const mt = baseItem()?.media_type;
    return mt === "tv" ? "tv" : "movie";
  });

  // ── MDBList ratings (for share content) ───────────────────────
  // Fetches IMDb / Rotten Tomatoes / Metacritic ratings from MDBList
  // via our /api/media/ratings server route. Reuses the same data
  // that the RatingPanel already shows — no extra API calls.
  // ESLint: shareTmdbId and shareMediaType are Accessors passed by
  // reference to useMdbListRatings, which tracks them inside its own
  // createResource. The lint rule can't see through the hook boundary.
  // eslint-disable-next-line solid/reactivity
  const mdbRatings = useMdbListRatings(shareTmdbId, shareMediaType);

  // ── Smart Share ────────────────────────────────────────────────
  // If the browser supports the Web Share API, use native share
  // directly (no bottom sheet). Otherwise, open the premium
  // bottom sheet. Never fail silently.
  //
  // The share text includes MDBList ratings (IMDb / RT / MC) when
  // available, formatted beautifully with each service on its own
  // line. If no MDBList ratings are available, falls back to the
  // TMDB vote_average.
  const handleSmartShare = async () => {
    if (canWebShare()) {
      try {
        const d = tmdb();
        const url = buildShareUrl(shareMediaType(), shareTmdbId());
        const text = d
          ? buildShareTextBody(d, shareMediaType(), mdbRatings.ratings())
          : `Check this out on CineLog: ${url}`;
        const shareTitle = d ? resolveTitle(d) : "CineLog";
        await navigator.share({ title: shareTitle, text, url });
        return; // Shared successfully
      } catch (err) {
        const name = (err as DOMException)?.name;
        if (name === "AbortError") return; // User cancelled — do nothing
        // Non-AbortError — fall through to bottom sheet
        console.warn("[DetailsModal] Native share failed, opening sheet:", err);
      }
    }
    // No native share, or native share failed — open the bottom sheet
    setShowShare(true);
  };

  const { form, setForm, isDirty, resetTo, isEditing, setIsEditing } =
    // ESLint: vaultItem is an Accessor passed by reference to useDetailsForm,
    // which tracks it inside its own memos / createEffects. The lint rule
    // can't see through the hook boundary.
    // eslint-disable-next-line solid/reactivity
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
    handleEpisodeUnmark,
    handleSelectItem,
    handleRemoveFromVault
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
    onRemoved: handleRemoved
  });

  // Reset trailer state whenever the open title changes.
  createEffect(on(vaultItem, () => setShowTrailer(false)));

  const close = () => closeTitle();

  onMount(() => {
    document.body.style.overflow = "hidden";

    // Focus trap: keep keyboard focus inside the modal while it is open.
    // On open, move focus to the close button. On Tab/Shift+Tab at the
    // boundary, wrap around to the other end.
    const modalEl = document.querySelector(
      ".cinematic-modal"
    ) as HTMLElement | null;
    const getFocusable = (): HTMLElement[] => {
      if (!modalEl) return [];
      return Array.from(
        modalEl.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.closest("[aria-hidden=true]"));
    };

    // Move initial focus to close button
    const closeBtn = document.querySelector(
      ".cinematic-close-btn"
    ) as HTMLElement | null;
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
          class="animate-fade-in fixed inset-0 z-[999999] flex items-end justify-center p-0 sm:items-center sm:p-4"
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-labelledby="details-modal-title"
        >
          {/* Ambient backdrop continuation — blurred tint behind the modal.
              The <img> is decorative; if the TMDB URL fails we hide it so
              no broken-image glyph bleeds through the blur + tint overlay. */}
          <div
            class="pointer-events-none absolute inset-0 overflow-hidden"
            aria-hidden="true"
          >
            <Show when={baseItem()?.backdrop_path}>
              <img
                src={`https://image.tmdb.org/t/p/w500${baseItem()?.backdrop_path}`}
                class="cinematic-ambient"
                alt=""
                aria-hidden="true"
                loading="lazy"
                decoding="async"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            </Show>
            <div
              class="absolute inset-0"
              style={{ background: "rgba(0,0,0,0.75)" }}
            />
          </div>

          <div
            class="relative z-10 w-full max-w-xl lg:max-w-[800px]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button — rendered at the modal-container level (NOT inside
                the hero) so it stays fixed when the user scrolls. Previously
                the close button was inside .cinematic-hero which has
                overflow:hidden + scrolls out of view, causing the button to
                disappear (BUG 2 fix). position:fixed + z-index:30 keeps it
                above the hero (z:20) and always visible.

                TRAILER CONFLICT FIX (v2.5):
                When a trailer is actively playing, the hero already shows
                its own "close trailer" button (top-left). Rendering the
                modal's main X button at the same time produced two close
                affordances side-by-side, confusing users about which one
                closes the trailer vs. the whole modal. Now the modal X is
                hidden while `showTrailer()` is true — the hero's trailer
                close button takes over. Pressing the modal X again (after
                the trailer is closed) closes the modal as before. */}
            <Show when={!showTrailer()}>
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
            </Show>

            <Show when={!loading()} fallback={<DetailsSkeleton />}>
              <Show when={!error()} fallback={<DetailsError onRetry={retry} />}>
                <div class="cinematic-modal">
                  <div class="cinematic-scroll">
                    <DetailsHero
                      baseItem={baseItem}
                      details={tmdb}
                      trailerActive={() => showTrailer() && hasTrailer()}
                      trailerKey={trailerKey}
                      hasTrailer={hasTrailer}
                      onPlayTrailer={() => setShowTrailer(true)}
                      onClose={close}
                      onCloseTrailer={() => setShowTrailer(false)}
                    />
                    <DetailsHeader
                      baseItem={baseItem}
                      details={tmdb}
                      vaultItem={vaultItem}
                    />
                    <DetailsActions
                      baseItem={baseItem}
                      vaultItem={vaultItem}
                      hasTrailer={hasTrailer}
                      isAdding={isAdding}
                      onPlayTrailer={() => setShowTrailer((v) => !v)}
                      onEdit={() =>
                        isEditing() ? handleCancel() : setIsEditing(true)
                      }
                      onStatusCycle={handleStatusCycle}
                      onSetStatus={handleSetStatus}
                      onAddToVault={handleAddToVault}
                      onOpenFolders={() => setShowFolders(true)}
                      onRemove={() => setShowRemoveConfirm(true)}
                      onShare={handleSmartShare}
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
                      {/* ── 3. Your Activity ───────────────────────── */}
                      <Show when={inVault() && vaultItem()}>
                        <DetailSection style={{ "margin-top": "1.5rem" }}>
                          <YourActivityCard vaultItem={vaultItem()!} />
                        </DetailSection>
                      </Show>

                      {/* ── 4. Ratings (IMDb / RT / MC from MDBList) ── */}
                      <DetailsRatings
                        baseItem={baseItem}
                        details={tmdb}
                        omdb={omdb}
                        vaultItem={vaultItem}
                      />

                      {/* ── 5. Overview ────────────────────────────────
                          For anime: prefers AniList description (richer),
                          falls back to TMDB. Never shows both. */}
                      <DetailsOverview
                        details={tmdb}
                        anilist={animeEnrichment.anilist}
                      />

                      {/* ── 6. Characters & Crew ──────────────────────
                          For anime: AniList Characters & Voice Actors +
                          Crew carousel (replaces TMDB Cast & Crew).
                          For movies/TV: TMDB Cast & Crew as before. */}
                      <DetailsCast
                        details={tmdb}
                        isAnime={animeEnrichment.isAnime}
                      />
                      <AnimeCharacters
                        anilist={animeEnrichment.anilist}
                        enabled={animeEnrichment.settings.charactersStaff}
                        details={tmdb}
                      />

                      {/* ── 7. Unified Details Grid ───────────────────
                          For anime: merges AniList data (Episodes, Season,
                          Studio, Popularity, Favourites, Ranking, Source)
                          into the grid alongside TMDB data.
                          Format and Duration are excluded — already in Hero.
                          Episodes hidden for anime movies (always 1). */}
                      <DetailsMetadata
                        baseItem={baseItem}
                        details={tmdb}
                        omdb={omdb}
                        vaultItem={vaultItem}
                        anilist={animeEnrichment.anilist}
                        isAnime={animeEnrichment.isAnime}
                      />

                      {/* User Collection — only shows if this title belongs to
                          a user-created folder or subscribed universe. TMDB
                          belongs_to_collection is deliberately NOT rendered
                          here — it refers to franchise bundles, not personal
                          organization. */}
                      <Show when={baseItem()}>
                        <UserCollectionInfo currentItem={baseItem()!} />
                      </Show>

                      {/* ── 8. Where to Watch ─────────────────────────
                          Country-filtered: only shows platforms available in
                          the user's set region (from Account settings). */}
                      <WhereToWatch baseItem={baseItem} details={tmdb} />

                      {/* ── TV Seasons / Episodes ────────────────────── */}
                      <DetailsSeasons
                        baseItem={baseItem}
                        details={tmdb}
                        vaultItem={vaultItem}
                        inVault={inVault}
                        onEpisodeChange={handleEpisodeChange}
                        onEpisodeUnmark={handleEpisodeUnmark}
                        onAddToVault={handleAddToVault}
                      />

                      {/* ── 9. Relations ──────────────────────────────
                          AniList-only: Prequels, Sequels, OVAs, etc.
                          Rendered by AnimeSections (self-gating). */}

                      {/* ── 10. Source Material ────────────────────────
                          AniList-only: Manga, Light Novel, etc. + AniList link.
                          Rendered by AnimeSections (self-gating). */}

                      {/* ── Theme Songs & Airing Schedule ─────────────
                          AniList-only. Rendered by AnimeSections (self-gating). */}
                      <AnimeSections
                        anilist={animeEnrichment.anilist}
                        settings={() => ({
                          charactersStaff: animeEnrichment.settings.charactersStaff(),
                          relations: animeEnrichment.settings.relations(),
                          airingSchedule: animeEnrichment.settings.airingSchedule(),
                          openingEndingThemes: animeEnrichment.settings.openingEndingThemes()
                        })}
                      />

                      {/* ── 11. You May Also Like ──────────────────────
                          TMDB recommendations for ALL titles (movies, TV,
                          anime). AniList recommendations removed — TMDB
                          has better artwork, larger pool, more diverse.
                          AniList still provides: Relations, Characters,
                          Voice Actors, Metadata, Source Material. */}
                      <DetailsRecommendations
                        baseItem={baseItem}
                        watchlist={watchlist}
                        onSelect={handleSelectItem}
                      />
                    </Show>
                  </div>
                </div>
              </Show>
            </Show>
          </div>
        </div>

        <Show when={showFolders() && vaultItem()}>
          <AddToFolderSheet
            item={vaultItem()!}
            onClose={() => setShowFolders(false)}
          />
        </Show>

        {/* Remove confirmation sheet — destructive action, requires explicit confirm */}
        <Show when={showRemoveConfirm() && vaultItem()}>
          <ConfirmRemoveSheet
            itemId={String(vaultItem()!.id)}
            title={vaultItem()!.title || vaultItem()!.name || "this title"}
            posterPath={vaultItem()!.poster_path ?? null}
            isRemoving={isRemoving()}
            onConfirm={handleRemoveFromVault}
            onClose={() => !isRemoving() && setShowRemoveConfirm(false)}
          />
        </Show>

        {/* Share sheet — visible to both logged-in and guest users.
            Renders the green share card preview + action buttons
            (Share Image / Copy Link / Share Text). */}
        <ShareSheet
          show={showShare}
          onClose={() => setShowShare(false)}
          details={tmdb}
          mediaType={shareMediaType}
          tmdbId={shareTmdbId}
          vaultItem={vaultItem}
        />
      </Portal>
    </Show>
  );
}
