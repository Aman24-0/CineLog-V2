// src/features/stats/components/GenreChart.tsx
//
// GenreChart — a horizontal bar chart of the user's top 8 genres.
// Horizontal bars are used (rather than a pie) because genre names
// like "Science Fiction" are long and read better on a horizontal
// axis. The bar width encodes the count; the colour is a stable gold
// accent.
//
// Clicking a bar navigates to /search with the genre as a query
// parameter, so users can dive into the titles behind the bar.

import { For, type Component, type Accessor } from "solid-js";
import { useNavigate } from "@solidjs/router";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  LabelList,
} from "recharts";
import ChartContainer from "./ChartContainer";
import StatsTooltip from "./StatsTooltip";
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

  // recharts horizontal bar chart: layout="vertical" swaps X and Y axes.
  // We pass the top 8 genres (already sorted desc by the calculator).
  const data = (): GenreCount[] => props.genres().slice(0, 8);

  const handleClick = (genre: string) => {
    navigate(`/search?genre=${encodeURIComponent(genre)}`);
  };

  return (
    <ChartContainer
      icon="palette"
      title="Top Genres"
      subtitle="Your taste profile — click a bar to explore"
      height="340px"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          layout="vertical"
          data={data()}
          margin={{ top: 4, right: 32, left: 8, bottom: 4 }}
          barCategoryGap="22%"
        >
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
          <XAxis
            type="number"
            allowDecimals={false}
            tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11, fontFamily: "'Azeret Mono', monospace" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="genre"
            tick={{ fill: "rgba(255,255,255,0.75)", fontSize: 12, fontFamily: "'Outfit', sans-serif" }}
            axisLine={false}
            tickLine={false}
            width={104}
          />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
            content={<StatsTooltip valueFormatter={(v) => `${v} title${v === 1 ? "" : "s"}`} />}
          />
          <Bar dataKey="count" name="Titles" radius={[0, 4, 4, 0]} maxBarSize={28} cursor="pointer">
            <For each={data()}>
              {(_, idx) => <Cell fill={PALETTE[idx() % PALETTE.length]} onClick={() => handleClick(data()[idx()].genre)} />}
            </For>
            <LabelList
              dataKey="count"
              position="right"
              style={{ fill: "rgba(255,255,255,0.7)", fontSize: 11, fontFamily: "'Azeret Mono', monospace", fontWeight: 600 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
};

export default GenreChart;
