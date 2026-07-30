// src/features/details/components/DetailsError.tsx
import Icon from "~/shared/ui/Icon";

interface DetailsErrorProps {
  onRetry: () => void;
}

export default function DetailsError(props: DetailsErrorProps) {
  return (
    <div class="flex w-full max-w-xl flex-col items-center justify-center rounded-t-[2.5rem] border border-white/10 bg-[#08090b]/80 p-10 text-center backdrop-blur-3xl sm:rounded-[2.5rem]">
      <Icon
        name="cloud_off"
        class="mb-4 text-5xl text-red-500"
        aria-hidden="true"
      />
      <h3 class="mb-2 text-xl font-bold text-white">Failed to Load</h3>
      <p class="mb-6 text-sm text-gray-400">
        Could not fetch details. Check your connection.
      </p>
      <button
        onClick={() => props.onRetry()}
        class="rounded-full bg-white/10 px-6 py-2 font-bold text-white transition-transform active:scale-95"
      >
        Retry
      </button>
    </div>
  );
}
