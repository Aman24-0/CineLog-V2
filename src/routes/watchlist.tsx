// src/routes/watchlist.tsx
import { lazy } from "solid-js";
import { Title } from "@solidjs/meta";

const WatchlistView = lazy(() => import("~/features/watchlist/WatchlistView"));

export default function WatchlistRoute() {
  return (
    <>
      <Title>CineLog — Watchlist</Title>
      <WatchlistView />
    </>
  );
}
