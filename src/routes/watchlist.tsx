// src/routes/watchlist.tsx
import { lazy } from "solid-js";

const WatchlistView = lazy(() => import("~/features/watchlist/WatchlistView"));

export default function WatchlistRoute() {
  return <WatchlistView />;
}
