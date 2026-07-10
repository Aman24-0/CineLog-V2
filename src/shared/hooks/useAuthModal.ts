// src/shared/hooks/useAuthModal.ts
//
// Global auth modal state — any component can open the auth modal
// by calling openAuthModal(). The modal is rendered once in AppShell.

import { createSignal } from "solid-js";

const [authModalOpen, setAuthModalOpen] = createSignal(false);

export function useAuthModal() {
  return {
    authModalOpen,
    openAuthModal: () => setAuthModalOpen(true),
    closeAuthModal: () => setAuthModalOpen(false),
  };
}
