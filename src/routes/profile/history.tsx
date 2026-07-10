// src/routes/profile/history.tsx
import { clientOnly } from "@solidjs/start";
import { Title } from "@solidjs/meta";

const HistoryPage = clientOnly(() => import("~/features/profile/HistoryPage"));

export default function HistoryRoute() {
  return (
    <>
      <Title>CineLog — History</Title>
      <HistoryPage />
    </>
  );
}
