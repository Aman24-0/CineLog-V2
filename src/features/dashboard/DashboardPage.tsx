import DashboardHeader from "./components/DashboardHeader";
import HeroSection from "./components/HeroSection";
import StatsGrid from "./components/StatsGrid";

export default function DashboardPage() {
  return (
    <div class="min-h-screen bg-black text-white">
      <DashboardHeader />

      <HeroSection />

      <StatsGrid />

      <main class="px-6 pb-24">
        <div class="rounded-2xl border border-zinc-800 p-10 text-center">
          <h2 class="text-2xl font-bold">
            Migration in Progress
          </h2>

          <p class="mt-3 text-zinc-500">
            Dashboard widgets will appear here.
          </p>
        </div>
      </main>
    </div>
  );
}
