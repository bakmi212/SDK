import { SDKError } from '../core/errors.js';
import type { HttpClient } from '../http/http-client.js';
import type { Logger } from '../utils/logger.js';
import type { StorageAdapter } from '../storage/types.js';
import type {
  EnrichedEvent,
  EventBatch,
  EventOfflineEntry,
  EventPriority,
  SDKEvent,
} from '../types/index.js';
import { generateId, delay } from '../utils/helpers.js';

const QUEUE_KEY = 'kasandra:events:queue';
const OFFLINE_KEY = 'kasandra:events:offline';
const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_FLUSH_INTERVAL = 10_000;
const MAX_RETRY_ATTEMPTS = 3;

const PRIORITY_ORDER: Record<EventPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

interface EventManagerDeps {
  http: HttpClient;
  storage: StorageAdapter;
  logger: Logger;
  applicationId: string;
  eventsBatchEndpoint?: string;
}

/**
 * Enterprise event queue with priority ordering, offline persistence,
 * retry queue, batch sending, and auto flush. Events are never lost —
 * failed sends are persisted and retried.
 */
export class EventManager {
  private deps: EventManagerDeps;
  private queue: EnrichedEvent[] = [];
  private offlineQueue: EventOfflineEntry[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private batchSize: number;
  private flushInterval: number;
  private sending = false;
  private isOnline = true;

  constructor(deps: EventManagerDeps, batchSize = DEFAULT_BATCH_SIZE) {
    this.deps = deps;
    this.batchSize = batchSize;
    this.flushInterval = DEFAULT_FLUSH_INTERVAL;
  }

  async send(event: SDKEvent): Promise<void> {
    const enriched = this.enrich(event);
    if (this.isOnline) {
      this.enqueue(enriched);
      this.deps.logger.debug(`Event queued: ${event.name} (priority: ${enriched.priority})`);
      if (this.queue.length >= this.batchSize) {
        await this.flush();
      }
    } else {
      this.addToOfflineQueue([enriched]);
      this.deps.logger.debug(`Event queued offline: ${event.name}`);
    }
  }

  /** Enqueue with priority ordering — critical events go first. */
  private enqueue(event: EnrichedEvent): void {
    this.queue.push(event);
    this.queue.sort(
      (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority],
    );
  }

  async flush(): Promise<void> {
    if (this.sending || this.queue.length === 0) return;
    this.sending = true;
    try {
      while (this.queue.length > 0) {
        const batchEvents = this.queue.splice(0, this.batchSize);
        if (this.isOnline) {
          await this.sendBatch(batchEvents, 0);
        } else {
          this.addToOfflineQueue(batchEvents);
        }
      }
      await this.persistQueue();
    } finally {
      this.sending = false;
    }
  }

  startAutoFlush(intervalMs?: number): void {
    this.stopAutoFlush();
    if (intervalMs) this.flushInterval = intervalMs;
    this.flushTimer = setInterval(() => {
      void this.flush().catch((error) => {
        this.deps.logger.warning('Auto flush failed', error);
      });
    }, this.flushInterval);
  }

  stopAutoFlush(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  setOnline(): void {
    this.isOnline = true;
    void this.flushOfflineQueue();
  }

  setOffline(): void {
    this.isOnline = false;
  }

  getQueueSize(): number {
    return this.queue.length + this.offlineQueue.length;
  }

  getOfflineQueueSize(): number {
    return this.offlineQueue.length;
  }

  async restore(): Promise<void> {
    const raw = await this.deps.storage.get(QUEUE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as EnrichedEvent[];
        this.queue.push(...parsed);
        this.queue.sort(
          (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority],
        );
      } catch {
        await this.deps.storage.remove(QUEUE_KEY);
      }
    }
    const offlineRaw = await this.deps.storage.get(OFFLINE_KEY);
    if (offlineRaw) {
      try {
        this.offlineQueue = JSON.parse(offlineRaw) as EventOfflineEntry[];
      } catch {
        await this.deps.storage.remove(OFFLINE_KEY);
      }
    }
  }

  private enrich(event: SDKEvent): EnrichedEvent {
    return {
      ...event,
      applicationId: this.deps.applicationId,
      timestamp: event.timestamp ?? Date.now(),
      level: event.level ?? 'info',
      priority: event.priority ?? 'normal',
    };
  }

  private async sendBatch(
    events: EnrichedEvent[],
    attempt: number,
  ): Promise<void> {
    const batch: EventBatch = {
      events,
      batchId: generateId('batch'),
    };
    const endpoint = this.deps.eventsBatchEndpoint ?? '/events/batch';
    try {
      const response = await this.deps.http.post(endpoint, batch);
      if (!response.ok) {
        throw new SDKError(
          `Event batch rejected (${response.status})`,
          'NETWORK_ERROR',
          response.status,
        );
      }
      this.deps.logger.debug(`Batch ${batch.batchId} sent (${events.length} events)`);
    } catch (error) {
      if (attempt < MAX_RETRY_ATTEMPTS) {
        const backoff = Math.min(1000 * 2 ** attempt, 8000);
        this.deps.logger.warning(
          `Batch ${batch.batchId} failed (attempt ${attempt + 1}), retrying in ${backoff}ms`,
        );
        await delay(backoff);
        this.queue.unshift(...events);
        await this.persistQueue();
      } else {
        this.deps.logger.error(
          `Batch ${batch.batchId} permanently failed after ${MAX_RETRY_ATTEMPTS + 1} attempts`,
          error,
        );
        this.addToOfflineQueue(events);
      }
    }
  }

  private addToOfflineQueue(events: EnrichedEvent[]): void {
    for (const event of events) {
      this.offlineQueue.push({
        id: generateId('evt'),
        event,
        timestamp: Date.now(),
        attempts: 0,
      });
    }
    void this.persistOffline();
  }

  private async flushOfflineQueue(): Promise<void> {
    while (this.offlineQueue.length > 0) {
      const entry = this.offlineQueue.shift()!;
      this.queue.push(entry.event);
    }
    this.queue.sort(
      (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority],
    );
    await this.persistOffline();
    await this.flush();
  }

  private async persistQueue(): Promise<void> {
    if (this.queue.length === 0) {
      await this.deps.storage.remove(QUEUE_KEY);
    } else {
      await this.deps.storage.set(QUEUE_KEY, JSON.stringify(this.queue));
    }
  }

  private async persistOffline(): Promise<void> {
    if (this.offlineQueue.length === 0) {
      await this.deps.storage.remove(OFFLINE_KEY);
    } else {
      await this.deps.storage.set(OFFLINE_KEY, JSON.stringify(this.offlineQueue));
    }
  }
}
