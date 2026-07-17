import type { SyncOperationType } from './config.js';

/** Sync operation types — re-exported from config.ts for convenience. */
export type { SyncOperationType };

/** Sync state. */
export type SyncState = 'idle' | 'syncing' | 'error' | 'offline';

/** Result of a sync operation. */
export interface SyncResult {
  operation: SyncOperationType;
  success: boolean;
  timestamp: number;
  error?: string;
  data?: unknown;
}

/** Sync scheduler config. */
export interface SyncSchedulerConfig {
  intervalMs: number;
  operations: SyncOperationType[];
  /** Sync on reconnect after offline. */
  syncOnReconnect: boolean;
}

/** Offline queue entry. */
export interface OfflineQueueEntry<T = unknown> {
  id: string;
  operation: SyncOperationType;
  payload: T;
  timestamp: number;
  attempts: number;
}

/** Retry queue entry. */
export interface RetryQueueEntry<T = unknown> {
  id: string;
  operation: string;
  payload: T;
  timestamp: number;
  nextAttempt: number;
  attempts: number;
  maxAttempts: number;
}

/** Sync state snapshot. */
export interface SyncStateSnapshot {
  state: SyncState;
  lastSync: Partial<Record<SyncOperationType, number | null>>;
  pendingOffline: number;
  pendingRetry: number;
  isOnline: boolean;
}
