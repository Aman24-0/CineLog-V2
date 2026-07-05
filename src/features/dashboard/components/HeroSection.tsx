export default function HeroSection() {
  return (
    <section class="px-6 py-8">
      <div class="rounded-3xl border border-zinc-800 bg-zinc-900 p-8">
        <p
          class="text-xs font-bold uppercase tracking-[0.25em]"
          style="color: var(--p)"
        >
          Welcome Back
        </p>

        <h2 class="mt-3 text-5xl font-black leading-none">
          Your
          <br />
          Movie Vault
        </h2>

        <p class="mt-5 max-w-md text-sm leading-7 text-zinc-400">
          Track movies, TV shows, franchises and everything you love
          from one beautiful personal library.
        </p>
      </div>
    </section>
  );
}
