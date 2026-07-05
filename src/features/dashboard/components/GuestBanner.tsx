// src/features/dashboard/components/GuestBanner.tsx
import Icon from "~/shared/ui/Icon";

interface GuestBannerProps {
  onLogin: () => void;
}

export default function GuestBanner(props: GuestBannerProps) {
  return (
    <div
      class="p-6 rounded-3xl border relative overflow-hidden animate-fade-up mt-8"
      style="background: linear-gradient(145deg, #181818, #111); border-color: rgba(255,255,255,0.08); box-shadow: var(--shadow-raised)"
    >
      <div
        style="position: absolute; top: -40px; right: -40px; width: 180px; height: 180px; border-radius: 50%; background: radial-gradient(circle, var(--p-glow) 0%, transparent 70%); pointer-events: none"
        aria-hidden="true"
      />
      <h3 class="font-headline text-3xl text-white mb-2 relative z-10">Welcome to CineLog</h3>
      <p class="type-metadata text-gray-400 mb-5 max-w-sm relative z-10 leading-relaxed">
        Explore in Preview Mode. Sign in to build your personal cinematic universe, track progress, and get recommendations.
      </p>
      <button
        onClick={() => props.onLogin()}
        class="type-button px-6 py-3 rounded-full text-black active:scale-95 relative z-10"
        style="background: var(--p); box-shadow: 0 0 20px var(--p-glow), 0 4px 16px rgba(0,0,0,0.4)"
      >
        Start Building Vault
      </button>
    </div>
  );
}
