import DashboardHeader from "./components/DashboardHeader";

export default function DashboardPage() {
  return (
    <div class="min-h-screen bg-black text-white">
      <DashboardHeader />

      <main class="p-6">
        <div class="rounded-2xl border border-zinc-800 p-10 text-center">
          <h2 class="text-3xl font-bold">
            Dashboard
          </h2>

          <p class="mt-4 text-zinc-500">
            Phase 2 Migration in Progress...
          </p>
        </div>
      </main>
    </div>
  );
}
