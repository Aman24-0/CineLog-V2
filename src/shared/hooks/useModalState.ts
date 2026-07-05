// src/shared/hooks/useModalState.ts
import { createSignal } from "solid-js";
import type { WatchlistItem } from "~/shared/types";

const [selectedItem, setSelectedItem] = createSignal<WatchlistItem | null>(null);

export function useModalState() {
  return {
    selectedItem,
    setSelectedItem
  };
}
