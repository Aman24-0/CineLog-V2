import {
  createMemo,
  createSignal,
  For,
  type Accessor,
  type Component
} from "solid-js";
import { hapticTap } from "~/shared/utils/haptic";
import type { WatchlistItem } from "~/shared/types";
import { calculateSeparatedStats } from "../utils/animeSeparator";
import { getNextFormat } from "../utils/timeFormatter";
import RuntimeValue from "./RuntimeValue";

export interface ExpandableStatsCardProps {
  titles: Accessor<WatchlistItem[]>;
}

const ExpandableStatsCard: Component<ExpandableStatsCardProps> = (props) => {
  const [isExpanded, setIsExpanded] = createSignal(false);
  const [movieFormat, setMovieFormat] = createSignal(0);
  const [seriesFormat, setSeriesFormat] = createSignal(0);
  const [animeFormat, setAnimeFormat] = createSignal(0);

  const stats = createMemo(() => calculateSeparatedStats(props.titles()));
  const categories = createMemo(() => [
    { label: "Movies", icon: "movie", count: stats().movieCount },
    { label: "Series", icon: "tv", count: stats().seriesCount },
    { label: "Anime", icon: "animation", count: stats().animeCount }
  ]);

  const toggleExpand = () => {
    hapticTap();
    setIsExpanded((expanded) => !expanded);
  };

  return (
    <section
      class="profile-expandable-stats-card"
      classList={{ "is-expanded": isExpanded() }}
      aria-label="Watching statistics summary"
    >
      <div class="profile-stats-category-grid">
        <For each={categories()}>
          {(category) => (
            <div class="profile-stats-category">
              <span
                class="material-symbols-outlined profile-stats-category-icon"
                aria-hidden="true"
              >
                {category.icon}
              </span>
              <span class="profile-stats-category-count">
                {category.count.toLocaleString()}
              </span>
              <span class="profile-stats-category-label">{category.label}</span>
            </div>
          )}
        </For>
      </div>

      <div
        class="profile-stats-runtime-grid"
        classList={{ "is-visible": isExpanded() }}
        aria-hidden={!isExpanded()}
      >
        <RuntimeValue
          category="Movies"
          seconds={stats().movieRuntime}
          formatState={movieFormat}
          onCycle={() => setMovieFormat((format) => getNextFormat(format))}
        />
        <RuntimeValue
          category="Series"
          seconds={stats().seriesRuntime}
          formatState={seriesFormat}
          onCycle={() => setSeriesFormat((format) => getNextFormat(format))}
        />
        <RuntimeValue
          category="Anime"
          seconds={stats().animeRuntime}
          formatState={animeFormat}
          onCycle={() => setAnimeFormat((format) => getNextFormat(format))}
        />
      </div>

      <button
        type="button"
        class="profile-stats-expand-toggle focus-ring"
        classList={{ "is-expanded": isExpanded() }}
        onClick={toggleExpand}
        aria-expanded={isExpanded()}
        aria-label={
          isExpanded() ? "Collapse runtime details" : "Expand runtime details"
        }
      >
        <span class="material-symbols-outlined" aria-hidden="true">
          expand_more
        </span>
      </button>
    </section>
  );
};

export default ExpandableStatsCard;
