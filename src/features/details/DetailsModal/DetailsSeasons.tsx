// src/features/details/DetailsModal/DetailsSeasons.tsx
import { Show, Suspense, lazy } from "solid-js";
import type { Accessor } from "solid-js";
import DetailSection from "~/features/details/components/DetailSection";
import type { WatchlistItem, TMDBDetails } from "~/shared/types";

const SeasonNavigator = lazy(
  () => import("~/features/details/components/SeasonNavigator"),
);

/**
 * DetailsSeasons — wraps the lazy-loaded SeasonNavigator inside a
 * DetailSection. Renders only for TV titles with seasons metadata.
 *
 * The section label is ownership-aware: vault titles see "Episodes",
 * non-vault titles see "Episode Guide" (read-only browsing).
 */
export interface DetailsSeasonsProps {
  baseItem: Accessor<WatchlistItem | null>;
  details: Accessor<TMDBDetails | null>;
  vaultItem: Accessor<WatchlistItem | null>;
  inVault: Accessor<boolean>;
  onEpisodeChange: (season: number, episode: number) => void;
  onAddToVault: () => void;
}

export default function DetailsSeasons(props: DetailsSeasonsProps) {
  return (
    <Show when={props.baseItem()?.media_type === "tv" && props.details()?.seasons}>
      <DetailSection
        label={props.inVault() ? "Episodes" : "Episode Guide"}
        icon="video_library"
      >
        <Suspense fallback={<div class="h-48 v2-card animate-pulse" />}>
          <SeasonNavigator
            item={props.baseItem()!}
            details={props.details()}
            vaultItem={props.vaultItem()}
            onEpisodeChange={props.onEpisodeChange}
            onAddToVault={props.onAddToVault}
          />
        </Suspense>
      </DetailSection>
    </Show>
  );
}
