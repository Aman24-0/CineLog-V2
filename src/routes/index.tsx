// src/routes/index.tsx
import { lazy } from "solid-js";

const DashboardPage = lazy(() => import("~/features/dashboard/DashboardPage"));

export default function Home() {
  return <DashboardPage />;
}
