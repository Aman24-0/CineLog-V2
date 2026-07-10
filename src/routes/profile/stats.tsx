// src/routes/profile/stats.tsx
import { clientOnly } from "@solidjs/start";
import { Title } from "@solidjs/meta";

const StatsPage = clientOnly(() => import("~/features/profile/StatsPage"));

export default function StatsRoute() {
  return (
    <>
      <Title>CineLog — Statistics</Title>
      <StatsPage />
    </>
  );
}
