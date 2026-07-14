// src/features/details/DetailsModal/DetailsActions.tsx
import type { Accessor } from "solid-js";
import ActionDock from "~/features/details/components/ActionDock";
import type { WatchlistItem } from "~/shared/types";

/**
 * DetailsActions — wraps ActionDock (floating glass bar).
 *
 * The dock is ownership-aware: when vaultItem is null, it shows
 * "Add to Vault" as the primary action; when present, it shows
 * the status row (Planned/Watching/Completed/Dropped) and action row
 * (Trailer/Folder/Edit/Delete).
 */
export interface DetailsActionsProps {
  baseItem: Accessor<WatchlistItem | null>;
  vaultItem: Accessor<WatchlistItem | null>;
  hasTrailer: Accessor<boolean>;
  isAdding: Accessor<boolean>;
  onPlayTrailer: () => void;
  onEdit: () => void;
  onStatusCycle: () => void;
  /** Set status directly to a specific value (Planned / Watching / Completed / Dropped). */
  onSetStatus?: (status: WatchlistItem["status"]) => void;
  onAddToVault: () => void;
  onOpenFolders: () => void;
  onRemove: () => void;
}

export default function DetailsActions(props: DetailsActionsProps) {
  return (
    <ActionDock
      item={props.baseItem()}
      vaultItem={props.vaultItem()}
      hasTrailer={props.hasTrailer()}
      onPlayTrailer={props.onPlayTrailer}
      onEdit={props.onEdit}
      onStatusCycle={props.onStatusCycle}
      onSetStatus={props.onSetStatus}
      onAddToVault={props.onAddToVault}
      onOpenFolders={props.onOpenFolders}
      onRemove={props.onRemove}
      isAdding={props.isAdding()}
    />
  );
}
