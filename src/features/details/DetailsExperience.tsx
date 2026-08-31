// src/features/details/DetailsExperience.tsx
import {
  Show,
  onMount,
  onCleanup,
  createSignal,
  createEffect,
  createMemo,
  on,
  type Accessor,
  type Setter
} from "solid-js";
import { Portal } from "solid-js/web";
import type { SelectedItem } from "~/shared/hooks/useModalState";
import type { WatchlistItem } from "~/shared/types";
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
import {
  canWebShare,
  buildShareUrl,
  buildShareTextBody,
  resolveTitle
} from "~/shared/utils/share";
import { useMdbListRatings } from "~/features/details/useMdbListRatings";
import { tmdbImage } from "~/core/tmdb/tmdb";
import { extractBackdropProfile } from "~/shared/utils/colorExtractor";

import DetailsHero from "./DetailsModal/DetailsHero";
import DetailsHeader from "./DetailsModal/DetailsHeader";
import DetailsActions from "./DetailsModal/DetailsActions";
import DetailsRatings from "./DetailsModal/DetailsRatings";
import DetailsOverview from "./DetailsModal/DetailsOverview";
import DetailsMetadata from "./DetailsModal/DetailsMetadata";
import DetailsCast from "./DetailsModal/DetailsCast";
import DetailsSeasons from "./DetailsModal/DetailsSeasons";
import DetailsRecommendations from "./DetailsModal/DetailsRecommendations";
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
import AnimeSections from "./DetailsModal/AnimeSections";
import AnimeCharacters from "./DetailsModal/AnimeCharacters";
import { useAnimeEnrichment } from "~/features/details/useAnimeEnrichment";

import { useDetailsForm } from "./DetailsModal/useDetailsForm";
import { useDetailsActions } from "./DetailsModal/useDetailsActions";

/**
 * DetailsExperience — shared title-detail orchestration for modal compatibility and dedicated pages.
 *
 * Owns state + handlers + lifecycle, and composes section components.
 * Each section is a thin wrapper around the building-block components
 * in `../components/`.
 *
 * OWNERSHIP BOUNDARY:
 *   The experience carries TWO items: `baseItem` (TMDB identity, always
 *   present) and `vaultItem` (user-owned state, null when not in vault).
 *   User-owned sections gate on `vaultItem` — never on a fake default status.
 */
export interface DetailsExperienceProps {
  selectedItem: Accessor<SelectedItem | null>;
  setSelectedItem: Setter<SelectedItem | null>;
  onClose: () => void;
  /** When supplied, related titles navigate to a dedicated route. */
  onNavigateRelated?: (item: WatchlistItem) => void;
  /** Page mode removes the fixed modal shell and uses normal document flow. */
  mode?: "modal" | "page";
}

type AmbientPalette = {
  primary: string;
  secondary: string;
  neutral: string;
  highlight: string;
  imageOpacity: string;
  imageBrightness: string;
  imageSaturation: string;
  surfaceMix: string;
  veilTop: string;
  veilMid: string;
  veilBottom: string;
};

const DEFAULT_AMBIENT_PALETTE: AmbientPalette = {
  primary: "24 32 44",
  secondary: "18 25 36",
  neutral: "28 34 44",
  highlight: "42 50 62",
  imageOpacity: "0.25",
  imageBrightness: "0.7",
  imageSaturation: "0.78",
  surfaceMix: "8%",
  veilTop: "0.14",
  veilMid: "0.22",
  veilBottom: "0.58"
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const hexToRgb = (hex: string): [number, number, number] | null => {
  const normalized = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return null;
  return [
    parseInt(normalized.slice(0, 2), 16),
    parseInt(normalized.slice(2, 4), 16),
    parseInt(normalized.slice(4, 6), 16)
  ];
};

const toRgbVariable = (rgb: [number, number, number]) =>
  rgb.map((channel) => Math.round(clamp(channel, 0, 255))).join(" ");

const scaleRgb = (rgb: [number, number, number], scale: number) =>
  rgb.map((channel) => channel * scale) as [number, number, number];

function paletteFromProfile(profile: {
  palette: string[];
  averageRgb: [number, number, number];
  luminance: number;
  saturation: number;
}): AmbientPalette {
  const colors = profile.palette
    .filter((color) => color.toLowerCase() !== "#ffd700")
    .map(hexToRgb)
    .filter((color): color is [number, number, number] => color !== null);
  const primary = colors[0] ?? profile.averageRgb;
  const secondary = colors[1] ?? profile.averageRgb;
  const highlight = profile.averageRgb;
  const luminance = clamp(profile.luminance, 0, 1);
  const saturation = clamp(profile.saturation, 0, 1);
  const toneScale = 0.62 + luminance * 0.2;

  return {
    primary: toRgbVariable(scaleRgb(primary, toneScale)),
    secondary: toRgbVariable(scaleRgb(secondary, toneScale * 0.92)),
    neutral: toRgbVariable(
      scaleRgb(profile.averageRgb, 0.7 + luminance * 0.18)
    ),
    highlight: toRgbVariable(scaleRgb(highlight, 0.72 + luminance * 0.22)),
    imageOpacity: clamp(0.48 + luminance * 0.24, 0.48, 0.72).toFixed(3),
    imageBrightness: clamp(0.88 + (luminance - 0.5) * 0.34, 0.78, 1.06).toFixed(
      3
    ),
    imageSaturation: clamp(0.94 + saturation * 0.3, 0.94, 1.16).toFixed(3),
    surfaceMix: clamp(18 + luminance * 18, 18, 36).toFixed(1) + "%",
    veilTop: clamp(0.04 + (1 - luminance) * 0.03, 0.04, 0.07).toFixed(3),
    veilMid: clamp(0.07 + (1 - luminance) * 0.06, 0.07, 0.13).toFixed(3),
    veilBottom: clamp(0.18 + (1 - luminance) * 0.1, 0.18, 0.28).toFixed(3)
  };
}

export default function DetailsExperience(props: DetailsExperienceProps) {
  const { watchlist } = useVault();
  const library = useUserLibrary();
  const { tmdb, loading, error, retry } = useDetails(props.selectedItem);
  // AniList enrichment (Phase 4). The hook is self-gating — it returns
  // null for non-anime titles and respects the admin anime_settings
  // toggles. AnimeSections renders nothing when anilist is null.
  const animeEnrichment = useAnimeEnrichment(props.selectedItem, tmdb);

  const [showTrailer, setShowTrailer] = createSignal(false);
  const [showFolders, setShowFolders] = createSignal(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = createSignal(false);
  const [showShare, setShowShare] = createSignal(false);

  const baseItem = createMemo(() => props.selectedItem()?.baseItem ?? null);
  const vaultItem = createMemo(() => props.selectedItem()?.vaultItem ?? null);
  const inVault = createMemo(() => vaultItem() !== null);
  const ambientBackdropUrl = createMemo(() => {
    const path = baseItem()?.backdrop_path || tmdb()?.backdrop_path;
    return path ? tmdbImage(path, "w1280") : "";
  });
  const [ambientPalette, setAmbientPalette] = createSignal(
    DEFAULT_AMBIENT_PALETTE
  );
  const [ambientProfileReady, setAmbientProfileReady] = createSignal(false);

  // Sample the same TMDB backdrop already used by the Detail page. The
  // sampling is intentionally tiny and best-effort: the CSS artwork layer
  // remains the source of truth, while these values make the surrounding
  // surface adapt to the title's dominant color and luminance. Modal mode
  // never mounts this page-owned palette.
  createEffect(() => {
    const url = ambientBackdropUrl();
    if (props.mode !== "page" || !url) {
      setAmbientProfileReady(false);
      setAmbientPalette(DEFAULT_AMBIENT_PALETTE);
      return;
    }

    setAmbientProfileReady(false);
    let cancelled = false;
    void extractBackdropProfile(url, 3).then((profile) => {
      if (!cancelled) {
        setAmbientPalette(
          profile.palette.length
            ? paletteFromProfile(profile)
            : profile.averageRgb.join(" ") !== DEFAULT_AMBIENT_PALETTE.neutral
              ? paletteFromProfile(profile)
              : DEFAULT_AMBIENT_PALETTE
        );
        setAmbientProfileReady(true);
      }
    });
    onCleanup(() => {
      cancelled = true;
    });
  });

  // Derived values for the ShareSheet — the TMDB id, media_type, and
  // the rich details payload (genres, vote_average, seasons, etc.).
  // The sheet uses these to build the deep-link URL and the green
  // share card preview.
  // ESLint: shareTmdbId and shareMediaType are used inside event handlers
  // (handleSmartShare) which are tracked scopes — the lint rule can't see
  // through the handler boundary.

  const shareTmdbId = createMemo(() => baseItem()?.id ?? "");

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
        console.warn(
          "[DetailsExperience] Native share failed, opening sheet:",
          err
        );
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
   * instantly, then closes the current detail context and confirm sheet.
   */
  const handleRemoved = () => {
    void library.refresh();
    setShowRemoveConfirm(false);
    props.onClose();
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
    handleEpisodeRating,
    handleEpisodeFeedback,
    episodeRatings,
    episodeFeedbacks,
    hydrateEpisodeRatings,
    handleSelectItem,
    handleRemoveFromVault
  } = useDetailsActions({
    baseItem,
    vaultItem,
    details: tmdb,
    watchlist,
    form,
    resetTo,
    setSelectedItem: props.setSelectedItem,
    onSelectRelatedItem: props.onNavigateRelated,
    onRemoved: handleRemoved,
    // Part 5 — When the user sets status to "Completed" or "Watching",
    // automatically open the Activity/Edit modal so they can fill in
    // their viewing metadata. The status is already saved before this
    // fires — closing the edit modal without saving does NOT revert
    // the status.
    // IMPORTANT: We use queueMicrotask to defer the setIsEditing(true)
    // call to AFTER the useDetailsForm createEffect has fired. The
    // effect calls resetTo(vaultItem) which calls setIsEditing(false).
    // If we call setIsEditing(true) synchronously, the effect fires
    // AFTER us and overrides it to false. By deferring to the next
    // microtask, we guarantee our setIsEditing(true) runs AFTER the
    // effect's setIsEditing(false).
    onCompletedAutoOpenEdit: () => {
      queueMicrotask(() => setIsEditing(true));
    },
    // Critical fix — update the GLOBAL user-library watchlist after
    // save so consumers (Library, Search, YourActivityCard) see the
    // new activity fields immediately. Without this, the modal's local
    // state is updated but the global watchlist stays stale —
    // reopening the modal shows the OLD values.
    updateLibraryItem: library.updateItem
  });

  // Reset trailer state whenever the open title changes.
  createEffect(on(vaultItem, () => setShowTrailer(false)));

  // Phase 6 Task 2 — Hydrate episode ratings whenever the vault item
  // changes (modal opens, or user navigates to a related title). This
  // fetches all episode_progress rows for the open TV title so the
  // EpisodeCards can render their persisted star ratings. Movies and
  // non-vault titles short-circuit inside the hydrator.
  createEffect(
    on(vaultItem, () => {
      void hydrateEpisodeRatings();
    })
  );

  const close = () => props.onClose();

  onMount(() => {
    if (props.mode === "page") return;
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

  const renderDetailRoot = () => (
    <div
      class={
        props.mode === "page"
          ? "details-page-shell"
          : "animate-fade-in fixed inset-0 z-[999999] flex items-end justify-center p-0 sm:items-center sm:p-4"
      }
      data-detail-mode={props.mode ?? "modal"}
      style={
        props.mode === "page"
          ? ({
              "--detail-ambient-image": ambientBackdropUrl()
                ? `url("${ambientBackdropUrl()}")`
                : "none",
              "--detail-ambient-primary": ambientPalette().primary,
              "--detail-ambient-secondary": ambientPalette().secondary,
              "--detail-ambient-neutral": ambientPalette().neutral,
              "--detail-ambient-highlight": ambientPalette().highlight,
              "--detail-ambient-image-opacity": ambientPalette().imageOpacity,
              "--detail-ambient-image-brightness":
                ambientPalette().imageBrightness,
              "--detail-ambient-image-saturation":
                ambientPalette().imageSaturation,
              "--detail-ambient-surface-mix": ambientPalette().surfaceMix,
              "--detail-ambient-veil-top": ambientPalette().veilTop,
              "--detail-ambient-veil-mid": ambientPalette().veilMid,
              "--detail-ambient-veil-bottom": ambientPalette().veilBottom,
              "--detail-ambient-profile-ready": ambientProfileReady()
                ? "1"
                : "0"
            } as Record<string, string>)
          : undefined
      }
      onClick={props.mode === "page" ? undefined : close}
      role={props.mode === "page" ? "region" : "dialog"}
      aria-modal={props.mode === "page" ? undefined : "true"}
      aria-labelledby={
        props.mode === "page" ? undefined : "details-modal-title"
      }
    >
      <Show when={props.mode !== "page"}>
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
      </Show>

      <div
        class={
          props.mode === "page"
            ? "details-page-content"
            : "relative z-10 w-full max-w-xl lg:max-w-[1000px]"
        }
        onClick={
          props.mode === "page" ? undefined : (event) => event.stopPropagation()
        }
      >
        <Show when={props.mode !== "page" && !showTrailer()}>
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
            <div
              class={`cinematic-modal${props.mode === "page" ? " details-page-modal" : ""}`}
            >
              <div
                class={`cinematic-scroll${props.mode === "page" ? " details-page-scroll" : ""}`}
              >
                <DetailsHero
                  baseItem={baseItem}
                  details={tmdb}
                  trailerActive={() => showTrailer() && hasTrailer()}
                  trailerKey={trailerKey}
                  hasTrailer={hasTrailer}
                  onPlayTrailer={() => setShowTrailer(true)}
                  onClose={close}
                  onCloseTrailer={() => setShowTrailer(false)}
                  pageMode={props.mode === "page"}
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
                  <Show when={inVault() && vaultItem()}>
                    <DetailSection style={{ "margin-top": "1.5rem" }}>
                      <YourActivityCard vaultItem={vaultItem()!} />
                    </DetailSection>
                  </Show>

                  <DetailsRatings
                    baseItem={baseItem}
                    details={tmdb}
                    vaultItem={vaultItem}
                  />
                  <DetailsOverview
                    details={tmdb}
                    anilist={animeEnrichment.anilist}
                  />
                  <Show when={animeEnrichment.isAnime()}>
                    <AnimeCharacters
                      anilist={animeEnrichment.anilist}
                      enabled={animeEnrichment.settings.charactersStaff}
                      details={tmdb}
                    />
                  </Show>
                  <Show when={!animeEnrichment.isAnime()}>
                    <DetailsCast details={tmdb} />
                  </Show>
                  <DetailsMetadata
                    baseItem={baseItem}
                    details={tmdb}
                    vaultItem={vaultItem}
                    anilist={animeEnrichment.anilist}
                    isAnime={animeEnrichment.isAnime}
                  />
                  <Show when={baseItem()}>
                    <UserCollectionInfo
                      currentItem={baseItem()!}
                      onBeforeNavigate={
                        props.mode === "modal" ? close : undefined
                      }
                    />
                  </Show>
                  <WhereToWatch baseItem={baseItem} details={tmdb} />
                  <DetailsSeasons
                    baseItem={baseItem}
                    details={tmdb}
                    vaultItem={vaultItem}
                    inVault={inVault}
                    onEpisodeChange={handleEpisodeChange}
                    onEpisodeUnmark={handleEpisodeUnmark}
                    onAddToVault={handleAddToVault}
                    onRateEpisode={handleEpisodeRating}
                    onFeedbackEpisode={handleEpisodeFeedback}
                    episodeRatings={episodeRatings}
                    episodeFeedbacks={episodeFeedbacks}
                  />
                  <AnimeSections
                    anilist={animeEnrichment.anilist}
                    settings={() => ({
                      charactersStaff:
                        animeEnrichment.settings.charactersStaff(),
                      relations: animeEnrichment.settings.relations(),
                      airingSchedule: animeEnrichment.settings.airingSchedule(),
                      openingEndingThemes:
                        animeEnrichment.settings.openingEndingThemes()
                    })}
                  />
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

      <Show when={showFolders() && vaultItem()}>
        <AddToFolderSheet
          item={vaultItem()!}
          onClose={() => setShowFolders(false)}
        />
      </Show>
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
      <ShareSheet
        show={showShare}
        onClose={() => setShowShare(false)}
        details={tmdb}
        mediaType={shareMediaType}
        tmdbId={shareTmdbId}
        vaultItem={vaultItem}
      />
    </div>
  );

  return (
    <Show when={props.selectedItem()}>
      {props.mode === "page" ? (
        renderDetailRoot()
      ) : (
        <Portal>{renderDetailRoot()}</Portal>
      )}
    </Show>
  );
}
