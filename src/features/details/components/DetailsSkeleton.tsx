// src/features/details/components/DetailsSkeleton.tsx
export default function DetailsSkeleton() {
  return (
    <div
      class="w-full max-w-xl lg:max-w-[800px] bg-[#08090b]/80 backdrop-blur-3xl rounded-t-[2.5rem] sm:rounded-[2.5rem] overflow-hidden border relative max-h-[95vh] modal-sheet-enter flex flex-col"
      style="border-color: rgba(255,255,255,0.09);"
    >
      <div class="h-56 md:h-72 w-full skeleton-bg" />
      <div class="p-6 space-y-4">
        <div class="h-8 w-3/4 rounded-lg skeleton-bg" />
        <div class="h-4 w-1/2 rounded-lg skeleton-bg" />
        <div class="h-20 w-full rounded-lg skeleton-bg" />
        <div class="h-20 w-full rounded-lg skeleton-bg" />
      </div>
    </div>
  );
}
