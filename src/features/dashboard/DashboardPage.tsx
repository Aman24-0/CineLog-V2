import DashboardHeader from "./components/DashboardHeader";
import HeroSection from "./components/HeroSection";

export default function DashboardPage() {
  return (
    <div class="min-h-screen bg-black text-white">
      <DashboardHeader />

      <HeroSection />

      <main class="px-6 pb-24">
        <div class="rounded-2xl border border-zinc-800 p-10 text-center">
          <h2 class="text-2xl font-bold">
            Dashboard Modules Coming Next
          </h2>

          <p class="mt-3 text-zinc-500">
            Watchlist • Continue Watching • Recently Added • Analytics
          </p>
        </div>
      </main>
    </div>
  );
}
