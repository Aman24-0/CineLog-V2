// src/routes/index.tsx
import { lazy } from "solid-js";
import { Title } from "@solidjs/meta";

const DashboardPage = lazy(() => import("~/features/dashboard/DashboardPage"));

export default function Home() {
  return (
    <>
      <Title>CineLog — Dashboard</Title>
      <DashboardPage />
    </>
  );
}
