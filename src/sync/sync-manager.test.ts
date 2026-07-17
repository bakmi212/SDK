import { describe, it, expect, beforeEach } from 'vitest';
import { SyncManager } from './sync-manager.js';
import { MemoryStorage } from '../storage/memory-storage.js';
import { Logger } from '../utils/logger.js';
import type { SyncResult } from '../types/index.js';

describe('SyncManager', () => {
  let storage: MemoryStorage;
  let logger: Logger;

  beforeEach(() => {
    storage = new MemoryStorage();
    logger = new Logger('error', false);
  });

  it('registers and runs sync executors', async () => {
    const sm = new SyncManager({
      storage,
      logger,
      config: { intervalMs: 60000, operations: ['metadata'], syncOnReconnect: true },
    });

    sm.registerExecutor('metadata', async (op): Promise<SyncResult> => {
      return { operation: op, success: true, timestamp: Date.now() };
    });

    const result = await sm.runSync('metadata');
    expect(result.success).toBe(true);
    expect(result.operation).toBe('metadata');
  });

  it('queues operations when offline', async () => {
    const sm = new SyncManager({
      storage,
      logger,
      config: { intervalMs: 60000, operations: ['metadata'], syncOnReconnect: true },
    });

    sm.registerExecutor('metadata', async (op) => ({
      operation: op,
      success: true,
      timestamp: Date.now(),
    }));

    sm.setOffline();
    const result = await sm.runSync('metadata');
    expect(result.success).toBe(false);
    expect(sm.getOfflineQueue().length).toBe(1);
  });

  it('flushes offline queue when back online', async () => {
    const sm = new SyncManager({
      storage,
      logger,
      config: { intervalMs: 60000, operations: ['metadata'], syncOnReconnect: true },
    });

    sm.registerExecutor('metadata', async (op) => ({
      operation: op,
      success: true,
      timestamp: Date.now(),
    }));

    sm.setOffline();
    await sm.runSync('metadata');
    expect(sm.getOfflineQueue().length).toBe(1);

    await sm.setOnline();
    expect(sm.getOfflineQueue().length).toBe(0);
  });

  it('returns a state snapshot', () => {
    const sm = new SyncManager({
      storage,
      logger,
      config: { intervalMs: 60000, operations: ['metadata', 'configuration'], syncOnReconnect: true },
    });

    const snapshot = sm.getSnapshot();
    expect(snapshot.state).toBe('idle');
    expect(snapshot.isOnline).toBe(true);
    expect(snapshot.pendingOffline).toBe(0);
  });

  it('syncAll runs all configured operations', async () => {
    const sm = new SyncManager({
      storage,
      logger,
      config: { intervalMs: 60000, operations: ['metadata', 'configuration'], syncOnReconnect: true },
    });

    const ops: string[] = [];
    sm.registerExecutor('metadata', async (op) => {
      ops.push(op);
      return { operation: op, success: true, timestamp: Date.now() };
    });
    sm.registerExecutor('configuration', async (op) => {
      ops.push(op);
      return { operation: op, success: true, timestamp: Date.now() };
    });

    const results = await sm.syncAll();
    expect(results).toHaveLength(2);
    expect(ops).toContain('metadata');
    expect(ops).toContain('configuration');
  });
});
