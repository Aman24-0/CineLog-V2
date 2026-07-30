// src/features/stats/components/GenreChart.tsx
//
// GenreChart — a horizontal bar chart of the user's top 8 genres.
// Horizontal bars are used (rather than a pie) because genre names
// like "Science Fiction" are long and read better on a horizontal
// axis. The bar width encodes the count; the colour is a stable gold
// accent.
//
// Clicking a bar navigates to /discover with the genre as a `genre`
// query parameter. The Discover page reads the param and auto-expands
// the matching genre chip in the GenreExplorer so the user lands on a
// ready-filtered carousel of that genre.
//
// Implementation note: this previously used recharts (a React-only
// library). recharts' React hooks crashed inside SolidJS. We now use
// the pure-SolidJS BarChartH primitive.

import { Show, type Component, type Accessor } from "solid-js";
import { useNavigate } from "@solidjs/router";
import ChartContainer from "./ChartContainer";
import { BarChartH, type BarHItem } from "./SvgChart";
import type { GenreCount } from "~/lib/supabase/repositories/stats";

interface GenreChartProps {
  genres: Accessor<GenreCount[]>;
}

const PALETTE = [
  "#f5c518",
  "#ff9f43",
  "#7c8cff",
  "#5bc0eb",
  "#9bd17e",
  "#e574bc",
  "#f4845f",
  "#a4a4ff",
];

const GenreChart: Component<GenreChartProps> = (props) => {
  const navigate = useNavigate();

  // Top 8 genres (already sorted desc by the calculator).
  const data = (): GenreCount[] => props.genres().slice(0, 8);

  const items = (): BarHItem[] =>
    data().map((g, idx) => ({
      label: g.genre,
      value: g.count,
      color: PALETTE[idx % PALETTE.length],
      tooltipLabel: g.genre,
    }));

  const handleClick = (item: BarHItem) => {
    // Navigate to /discover?genre=<name>. The Discover page reads the
    // `genre` query param via useSearchParams() and auto-expands the
    // matching chip in the GenreExplorer so the user lands on a
    // ready-filtered carousel.
    navigate(`/discover?genre=${encodeURIComponent(item.label)}`);
  };

  return (
    <ChartContainer
      icon="palette"
      title="Top Genres"
      subtitle="Your taste profile — click a bar to explore"
      height="100%"
    >
      <Show
        when={data().length > 0}
        fallback={<p class="stats-chart-empty">No genre data yet — TMDB enrichment will populate this.</p>}
      >
        <BarChartH
          items={items()}
          onBarClick={handleClick}
          rowHeight={26}
          height={Math.max(120, data().length * 26 + 12)}
        />
      </Show>
    </ChartContainer>
  );
};

export default GenreChart;
