// src/routes/profile/achievements.tsx
import { clientOnly } from "@solidjs/start";
import { Title } from "@solidjs/meta";

const AchievementsPage = clientOnly(() => import("~/features/profile/AchievementsPage"));

export default function AchievementsRoute() {
  return (
    <>
      <Title>CineLog — Achievements</Title>
      <AchievementsPage />
    </>
  );
}
