import { createSignal } from "solid-js";

const [detailsId, setDetailsId] = createSignal<string | null>(null);
const [previewSource, setPreviewSource] = createSignal<string | null>(null);

export function useModalState() {
  return {
    detailsId,
    setDetailsId,
    previewSource,
    setPreviewSource
  };
}
