// src/core/preferences/vaultStatus.ts
// Default Vault Status — what status to assign when adding to vault

import { createSignal, createEffect } from "solid-js";
import { readStored, writeStored } from "./_storage";

export type VaultStatus =
  "Planned" | "Watching" | "Completed" | "Plan to Watch" | "Dropped";

const DEFAULT_VAULT_STATUS_KEY = "cinelog_default_vault_status";

function isVaultStatus(v: string | null): v is VaultStatus {
  return (
    v === "Planned" ||
    v === "Watching" ||
    v === "Completed" ||
    v === "Plan to Watch" ||
    v === "Dropped"
  );
}

const storedDVS = readStored<string>(DEFAULT_VAULT_STATUS_KEY, "Planned");

export const [defaultVaultStatus, setDefaultVaultStatus] =
  createSignal<VaultStatus>(isVaultStatus(storedDVS) ? storedDVS : "Planned");

createEffect(() => {
  writeStored(DEFAULT_VAULT_STATUS_KEY, defaultVaultStatus());
});
