// src/features/details/components/DetailsError.tsx
import Icon from "~/shared/ui/Icon";

interface DetailsErrorProps {
  onRetry: () => void;
}

export default function DetailsError(props: DetailsErrorProps) {
  return (
    <div class="w-full max-w-xl bg-[#08090b]/80 backdrop-blur-3xl sm:rounded-[2.5rem] rounded-t-[2.5rem] border border-white/10 p-10 flex flex-col items-center justify-center text-center">
      <Icon name="cloud_off" class="text-5xl text-red-500 mb-4" aria-hidden="true" />
      <h3 class="text-xl font-bold text-white mb-2">Failed to Load</h3>
      <p class="text-sm text-gray-400 mb-6">
        Could not fetch details. Check your connection.
      </p>
      <button
        onClick={() => props.onRetry()}
        class="px-6 py-2 rounded-full bg-white/10 text-white font-bold active:scale-95 transition-transform"
      >
        Retry
      </button>
    </div>
  );
}
