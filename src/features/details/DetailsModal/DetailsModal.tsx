// src/features/details/DetailsModal/DetailsModal.tsx
import DetailsExperience from "~/features/details/DetailsExperience";
import { useModalState } from "~/shared/hooks/useModalState";

/**
 * Legacy modal compatibility shell.
 *
 * The primary title experience now renders through `/movie/:id` and
 * `/tv/:id`. This wrapper remains for collection/legacy callers that still
 * use the global modal state, while sharing the same detail orchestration and
 * action logic as dedicated pages.
 */
export default function DetailsModal() {
  const { selectedItem, setSelectedItem, closeTitle } = useModalState();

  return (
    <DetailsExperience
      selectedItem={selectedItem}
      setSelectedItem={setSelectedItem}
      onClose={closeTitle}
      mode="modal"
    />
  );
}
