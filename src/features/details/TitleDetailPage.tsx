import {
  createEffect,
  createResource,
  createSignal,
  Show,
  type Component
} from "solid-js";
import { useNavigate, useParams } from "@solidjs/router";
import { Meta, Title } from "@solidjs/meta";
import { fetchTmdbMetadata, tmdbImage } from "~/core/tmdb/tmdb";
import DetailsExperience from "~/features/details/DetailsExperience";
import { useVault } from "~/features/watchlist/useVault";
import { useAuth } from "~/shared/hooks/useAuth";
import { findInVault } from "~/shared/utils/vaultMatch";
import type { SelectedItem } from "~/shared/hooks/useModalState";
import type { WatchlistItem } from "~/shared/types";
import { GlassLoadingState } from "~/shared/ui/glass";
import { NotFoundState } from "~/shared/ui/states";
import { getBaseUrl } from "~/shared/utils/share";
import { titleDetailPath } from "~/shared/utils/titleRoutes";

export interface TitleDetailPageProps {
  mediaType: "movie" | "tv";
}

type DetailMetadata = {
  id: number;
  title?: string;
  name?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  genres?: string[];
  overview?: string;
};

function buildBaseItem(
  metadata: DetailMetadata,
  mediaType: TitleDetailPageProps["mediaType"]
): WatchlistItem {
  return {
    id: String(metadata.id),
    title: metadata.title,
    name: metadata.name,
    media_type: mediaType,
    poster_path: metadata.poster_path ?? null,
    backdrop_path: metadata.backdrop_path ?? null,
    status: "Planned",
    release_date: metadata.release_date,
    first_air_date: metadata.first_air_date,
    genresList: metadata.genres
  };
}

const TitleDetailPage: Component<TitleDetailPageProps> = (props) => {
  const params = useParams();
  const navigate = useNavigate();
  const { watchlist, loading: vaultLoading } = useVault();
  const { isSignedIn, authReady } = useAuth();
  const [selectedItem, setSelectedItem] = createSignal<SelectedItem | null>(
    null
  );

  const [metadata] = createResource(
    () => params.id,
    async (id: string) => {
      if (!id || !/^\d+$/.test(id)) return null;
      try {
        return (await fetchTmdbMetadata(props.mediaType, id)) as DetailMetadata;
      } catch (error) {
        console.warn(
          `[${props.mediaType}/[id]] TMDB metadata failed for ${id}:`,
          error
        );
        return null;
      }
    },
    { deferStream: true }
  );

  createEffect(() => {
    const metadataValue = metadata();
    if (!metadataValue || vaultLoading() || !authReady()) return;

    const baseItem = buildBaseItem(metadataValue, props.mediaType);
    const vaultItem = findInVault(watchlist(), baseItem);
    const current = selectedItem();
    if (
      !current ||
      current.baseItem.id !== baseItem.id ||
      current.baseItem.media_type !== baseItem.media_type ||
      current.vaultItem?.id !== vaultItem?.id
    ) {
      setSelectedItem({
        baseItem: vaultItem ?? baseItem,
        vaultItem
      });
    }
  });

  const closePage = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      navigate(-1);
    } else {
      navigate(isSignedIn() ? "/library" : "/discover", { replace: true });
    }
  };

  const navigateRelated = (item: WatchlistItem) => {
    navigate(titleDetailPath(item));
  };

  const titleValue = () => metadata()?.title || metadata()?.name || "CineLog";
  const ogTitle = () => `${titleValue()} — CineLog`;
  const ogDescription = () =>
    metadata()?.overview ?? "Track your movies and shows on CineLog.";
  const ogImage = () =>
    metadata()?.poster_path ? tmdbImage(metadata()!.poster_path, "w500") : "";
  const routePath = () => `/${props.mediaType}/${params.id}`;
  const resourceType = () => (props.mediaType === "tv" ? "Series" : "Movie");
  const ogType = () =>
    props.mediaType === "tv" ? "video.episode" : "video.movie";

  return (
    <>
      <Title>{ogTitle()}</Title>
      <Meta name="description" content={ogDescription()} />
      <Meta property="og:title" content={ogTitle()} />
      <Meta property="og:type" content={ogType()} />
      <Meta property="og:description" content={ogDescription()} />
      <Meta property="og:url" content={`${getBaseUrl()}${routePath()}`} />
      <Meta property="og:site_name" content="CineLog" />
      <Meta property="og:locale" content="en_US" />
      <Show when={ogImage()}>
        <Meta property="og:image" content={ogImage()} />
        <Meta property="og:image:secure_url" content={ogImage()} />
        <Meta property="og:image:type" content="image/jpeg" />
        <Meta property="og:image:width" content="500" />
        <Meta property="og:image:height" content="750" />
        <Meta
          property="og:image:alt"
          content={`${titleValue()} ${resourceType().toLowerCase()} poster`}
        />
      </Show>
      <Meta name="twitter:card" content="summary_large_image" />
      <Meta name="twitter:title" content={ogTitle()} />
      <Meta name="twitter:description" content={ogDescription()} />
      <Meta name="twitter:image" content={ogImage()} />

      <Show
        when={!metadata.loading}
        fallback={
          <GlassLoadingState
            message={`Loading ${resourceType().toLowerCase()}…`}
            fullHeight
          />
        }
      >
        <Show
          when={metadata()}
          fallback={
            <NotFoundState
              resourceType={resourceType()}
              message={`The link may be broken or this ${resourceType().toLowerCase()} may have been removed from TMDB.`}
              backHref="/discover"
              backLabel="Back to Discover"
            />
          }
        >
          <Show
            when={selectedItem()}
            fallback={
              <div class="details-page-opening" role="status">
                Opening {resourceType().toLowerCase()} details…
              </div>
            }
          >
            <DetailsExperience
              selectedItem={selectedItem}
              setSelectedItem={setSelectedItem}
              onClose={closePage}
              onNavigateRelated={navigateRelated}
              mode="page"
            />
          </Show>
        </Show>
      </Show>
    </>
  );
};

export default TitleDetailPage;
