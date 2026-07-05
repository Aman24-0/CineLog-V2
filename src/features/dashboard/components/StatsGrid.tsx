import StatCard from "./StatCard";

export default function StatsGrid() {
  return (
    <section class="grid grid-cols-2 gap-4 px-6 pb-6">
      <StatCard title="Movies" value="0" />
      <StatCard title="Series" value="0" />
      <StatCard title="Completed" value="0" />
      <StatCard title="Hours" value="0" />
    </section>
  );
}
