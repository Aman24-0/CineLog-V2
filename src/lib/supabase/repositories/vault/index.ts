/**
 * CineLog V2 — Vault Repository (Barrel)
 * ---------------------------------------------------------------------
 * Re-exports everything from the modular vault repository.
 * This replaces the old monolithic vaultRepository.ts.
 */

export { VaultRepository, getVaultRepository } from "./vault.repository";

export type {
  VaultRow,
  VaultInsert,
  VaultUpdate,
  MediaType,
  VaultStatus,
  VaultIdentity,
  CreateVaultItemPayload,
  VaultSortField,
  SortDirection,
  VaultPagination,
  VaultSort,
  VaultSearchQuery,
  VaultItemResult,
  VaultListResult
} from "./vault.types";
