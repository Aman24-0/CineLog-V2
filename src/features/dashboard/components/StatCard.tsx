type Props = {
  title: string;
  value: string | number;
};

export default function StatCard(props: Props) {
  return (
    <div class="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <p class="text-xs uppercase tracking-[0.2em] text-zinc-500">
        {props.title}
      </p>

      <h3 class="mt-3 text-4xl font-black">
        {props.value}
      </h3>
    </div>
  );
}
