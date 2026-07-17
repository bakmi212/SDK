import type { StorageAdapter } from '../storage/types.js';
import type {
  OfflineQueueEntry,
  RetryQueueEntry,
  SyncOperationType,
  SyncResult,
  SyncSchedulerConfig,
  SyncState,
  SyncStateSnapshot,
} from '../types/index.js';
import type { Logger } from '../utils/logger.js';
import { generateId } from '../utils/helpers.js';

const OFFLINE_KEY = 'kasandra:sync:offline';
const RETRY_KEY = 'kasandra:sync:retry';
const STATE_KEY = 'kasandra:sync:state';

interface SyncManagerDeps {
  storage: StorageAdapter;
  logger: Logger;
  config: SyncSchedulerConfig;
}

type SyncExecutor = (operation: SyncOperationType) => Promise<SyncResult>;

/**
 * Central sync manager. Coordinates all sync operations through a single
 * scheduler, offline queue, and retry queue. Domain managers
 * (metadata, configuration, license, device, events) delegate to this.
 */
export class SyncManager {
  private deps: SyncManagerDeps;
  private state: SyncState = 'idle';
  private lastSync: Partial<Record<SyncOperationType, number | null>> = {};
  private offlineQueue: OfflineQueueEntry[] = [];
  private retryQueue: RetryQueueEntry[] = [];
  private schedulerTimer: ReturnType<typeof setInterval> | null = null;
  private isOnline = true;
  private executors = new Map<SyncOperationType, SyncExecutor>();

  constructor(deps: SyncManagerDeps) {
    this.deps = deps;
    for (const op of this.deps.config.operations) {
      this.lastSync[op] = null;
    }
  }

  /** Register an executor for a sync operation type. */
  registerExecutor(op: SyncOperationType, executor: SyncExecutor): void {
    this.executors.set(op, executor);
    this.deps.logger.debug(`Sync executor registered: ${op}`);
  }

  /** Run a single sync operation. */
  async runSync(op: SyncOperationType): Promise<SyncResult> {
    const executor = this.executors.get(op);
    if (!executor) {
      return {
        operation: op,
        success: false,
        timestamp: Date.now(),
        error: `No executor for ${op}`,
      };
    }

    if (!this.isOnline) {
      this.addToOfflineQueue(op, undefined);
      return {
        operation: op,
        success: false,
        timestamp: Date.now(),
        error: 'Offline — queued',
      };
    }

    this.state = 'syncing';
    try {
      const result = await executor(op);
      this.lastSync[op] = Date.now();
      this.state = result.success ? 'idle' : 'error';
      await this.persistState();
      return result;
    } catch (error) {
      this.state = 'error';
      this.addToRetryQueue(op, undefined, (error as Error).message);
      return {
        operation: op,
        success: false,
        timestamp: Date.now(),
        error: (error as Error).message,
      };
    }
  }

  /** Run all configured sync operations. */
  async syncAll(): Promise<SyncResult[]> {
    const results: SyncResult[] = [];
    for (const op of this.deps.config.operations) {
      results.push(await this.runSync(op));
    }
    return results;
  }

  /** Start the periodic sync scheduler. */
  startScheduler(): void {
    this.stopScheduler();
    this.schedulerTimer = setInterval(() => {
      void this.syncAll().catch((error) => {
        this.deps.logger.warning('Scheduled sync failed', error);
      });
    }, this.deps.config.intervalMs);
    this.deps.logger.debug('Sync scheduler started');
  }

  stopScheduler(): void {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }

  /** Mark the SDK as offline. Queues subsequent syncs. */
  setOffline(): void {
    this.isOnline = false;
    this.state = 'offline';
    this.deps.logger.warning('SDK went offline');
  }

  /** Mark the SDK as online and flush the offline queue. */
  async setOnline(): Promise<void> {
    this.isOnline = true;
    this.state = 'idle';
    this.deps.logger.info('SDK back online — flushing offline queue');
    if (this.deps.config.syncOnReconnect) {
      await this.flushOfflineQueue();
      await this.processRetryQueue();
    }
  }

  getOnlineStatus(): boolean {
    return this.isOnline;
  }

  getState(): SyncState {
    return this.state;
  }

  getSnapshot(): SyncStateSnapshot {
    return {
      state: this.state,
      lastSync: { ...this.lastSync },
      pendingOffline: this.offlineQueue.length,
      pendingRetry: this.retryQueue.length,
      isOnline: this.isOnline,
    };
  }

  getOfflineQueue(): OfflineQueueEntry[] {
    return [...this.offlineQueue];
  }

  getRetryQueue(): RetryQueueEntry[] {
    return [...this.retryQueue];
  }

  async restore(): Promise<void> {
    const offlineRaw = await this.deps.storage.get(OFFLINE_KEY);
    if (offlineRaw) {
      try {
        this.offlineQueue = JSON.parse(offlineRaw) as OfflineQueueEntry[];
      } catch {
        await this.deps.storage.remove(OFFLINE_KEY);
      }
    }
    const retryRaw = await this.deps.storage.get(RETRY_KEY);
    if (retryRaw) {
      try {
        this.retryQueue = JSON.parse(retryRaw) as RetryQueueEntry[];
      } catch {
        await this.deps.storage.remove(RETRY_KEY);
      }
    }
  }

  // ─── Offline Queue ──────────────────────────────────────────

  private addToOfflineQueue(op: SyncOperationType, payload: unknown): void {
    const entry: OfflineQueueEntry = {
      id: generateId('offline'),
      operation: op,
      payload,
      timestamp: Date.now(),
      attempts: 0,
    };
    this.offlineQueue.push(entry);
    void this.persistOffline();
  }

  private async flushOfflineQueue(): Promise<void> {
    while (this.offlineQueue.length > 0) {
      const entry = this.offlineQueue.shift()!;
      const result = await this.runSync(entry.operation);
      if (!result.success) {
        entry.attempts++;
        this.offlineQueue.unshift(entry);
        break;
      }
    }
    await this.persistOffline();
  }

  private async persistOffline(): Promise<void> {
    if (this.offlineQueue.length === 0) {
      await this.deps.storage.remove(OFFLINE_KEY);
    } else {
      await this.deps.storage.set(OFFLINE_KEY, JSON.stringify(this.offlineQueue));
    }
  }

  // ─── Retry Queue ────────────────────────────────────────────

  private addToRetryQueue(
    op: string,
    payload: unknown,
    _error: string,
  ): void {
    const entry: RetryQueueEntry = {
      id: generateId('retry'),
      operation: op,
      payload,
      timestamp: Date.now(),
      nextAttempt: Date.now() + 5000,
      attempts: 0,
      maxAttempts: 3,
    };
    this.retryQueue.push(entry);
    void this.persistRetry();
  }

  private async processRetryQueue(): Promise<void> {
    const now = Date.now();
    const due = this.retryQueue.filter((e) => e.nextAttempt <= now);
    this.retryQueue = this.retryQueue.filter((e) => e.nextAttempt > now);

    for (const entry of due) {
      const op = entry.operation as SyncOperationType;
      const result = await this.runSync(op);
      if (!result.success && entry.attempts < entry.maxAttempts) {
        entry.attempts++;
        entry.nextAttempt = Date.now() + Math.min(5000 * 2 ** entry.attempts, 30000);
        this.retryQueue.push(entry);
      }
    }
    await this.persistRetry();
  }

  private async persistRetry(): Promise<void> {
    if (this.retryQueue.length === 0) {
      await this.deps.storage.remove(RETRY_KEY);
    } else {
      await this.deps.storage.set(RETRY_KEY, JSON.stringify(this.retryQueue));
    }
  }

  private async persistState(): Promise<void> {
    await this.deps.storage.set(
      STATE_KEY,
      JSON.stringify({ state: this.state, lastSync: this.lastSync }),
    );
  }
}
