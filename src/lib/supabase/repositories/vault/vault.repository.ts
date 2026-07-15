/**
 * CineLog V2 — Vault Repository
 * ---------------------------------------------------------------------
 * Composes read + write modules. The SOLE data-access layer for the
 * `vault` table (Database Bible §03).
 *
 * Pattern: Component → Hook → Adapter → VaultRepository → Supabase
 */

import { getClient } from "../../client";
import type { TypedSupabaseClient } from "./vault.types";
import {
  getVaultByStatus, getVaultByTmdbId, getVaultItem,
  getFavorites, getPinned, getRecentlyUpdated, searchVault
} from "./vault.read";
import {
  createVaultItem, upsertVaultItem, upsertVaultItemsBatch, deleteVaultItem, restoreVaultItem,
  updateNotes, updateProgress, updateRating, updateStatus, updateVaultItem
} from "./vault.write";
import type {
  CreateVaultItemPayload, VaultIdentity, VaultItemResult,
  VaultListResult, VaultPagination, VaultSearchQuery,
  VaultSort, VaultStatus
} from "./vault.types";

export class VaultRepository {
  private readonly supabase: TypedSupabaseClient;

  constructor(client: TypedSupabaseClient = getClient()) {
    this.supabase = client;
  }

  // ---- Writes ----
  createVaultItem(payload: CreateVaultItemPayload): Promise<VaultItemResult> {
    return createVaultItem(this.supabase, payload);
  }
  upsertVaultItem(payload: CreateVaultItemPayload): Promise<VaultItemResult> {
    return upsertVaultItem(this.supabase, payload);
  }
  upsertVaultItemsBatch(payloads: CreateVaultItemPayload[]): Promise<{ count: number; error: Error | null }> {
    return upsertVaultItemsBatch(this.supabase, payloads);
  }
  updateVaultItem(identity: VaultIdentity, update: import("./vault.types").VaultUpdate): Promise<VaultItemResult> {
    return updateVaultItem(this.supabase, identity, update);
  }
  updateStatus(identity: VaultIdentity, status: VaultStatus): Promise<VaultItemResult> {
    return updateStatus(this.supabase, identity, status);
  }
  updateRating(identity: VaultIdentity, rating: number): Promise<VaultItemResult> {
    return updateRating(this.supabase, identity, rating);
  }
  updateNotes(identity: VaultIdentity, notes: string): Promise<VaultItemResult> {
    return updateNotes(this.supabase, identity, notes);
  }
  updateProgress(identity: VaultIdentity, minutes: number): Promise<VaultItemResult> {
    return updateProgress(this.supabase, identity, minutes);
  }
  deleteVaultItem(identity: VaultIdentity): Promise<VaultItemResult> {
    return deleteVaultItem(this.supabase, identity);
  }
  restoreVaultItem(identity: VaultIdentity): Promise<VaultItemResult> {
    return restoreVaultItem(this.supabase, identity);
  }

  // ---- Reads ----
  getVaultItem(identity: VaultIdentity): Promise<VaultItemResult> {
    return getVaultItem(this.supabase, identity);
  }
  getVaultByTmdbId(userId: string, tmdbId: number, mediaType: import("./vault.types").MediaType): Promise<VaultItemResult> {
    return getVaultByTmdbId(this.supabase, userId, tmdbId, mediaType);
  }
  getVaultByStatus(userId: string, status: VaultStatus, options?: { sort?: VaultSort; pagination?: VaultPagination }): Promise<VaultListResult> {
    return getVaultByStatus(this.supabase, userId, status, options);
  }
  getFavorites(userId: string, options?: { sort?: VaultSort; pagination?: VaultPagination }): Promise<VaultListResult> {
    return getFavorites(this.supabase, userId, options);
  }
  getPinned(userId: string, options?: { sort?: VaultSort; pagination?: VaultPagination }): Promise<VaultListResult> {
    return getPinned(this.supabase, userId, options);
  }
  getRecentlyUpdated(userId: string, pagination?: VaultPagination): Promise<VaultListResult> {
    return getRecentlyUpdated(this.supabase, userId, pagination);
  }
  searchVault(query: VaultSearchQuery): Promise<VaultListResult> {
    return searchVault(this.supabase, query);
  }
}

// ---- Singleton ----
let _defaultInstance: VaultRepository | null = null;

export function getVaultRepository(): VaultRepository {
  if (typeof window === "undefined") return new VaultRepository();
  if (!_defaultInstance) _defaultInstance = new VaultRepository();
  return _defaultInstance;
}
