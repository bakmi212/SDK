import { describe, it, expect, beforeEach } from 'vitest';
import { UpdateManager } from './update-manager.js';
import { MemoryStorage } from '../storage/memory-storage.js';
import { Logger } from '../utils/logger.js';

describe('UpdateManager', () => {
  let storage: MemoryStorage;
  let logger: Logger;
  let manager: UpdateManager;

  beforeEach(() => {
    storage = new MemoryStorage();
    logger = new Logger('error', false);
    manager = new UpdateManager({ storage, logger });
  });

  it('saves snapshots and tracks versions', async () => {
    await manager.saveSnapshot('configuration', 1, { theme: 'dark' });
    expect(manager.getCurrentVersion('configuration')).toBe(1);
    expect(manager.getSnapshots('configuration')).toHaveLength(1);
  });

  it('rolls back to previous version', async () => {
    await manager.saveSnapshot('configuration', 1, { theme: 'dark' });
    await manager.saveSnapshot('configuration', 2, { theme: 'light' });
    expect(manager.getCurrentVersion('configuration')).toBe(2);

    const result = await manager.rollback('configuration');
    expect(result.success).toBe(true);
    expect(result.restoredVersion).toBe(1);
  });

  it('returns failure when no snapshot to rollback', async () => {
    const result = await manager.rollback('metadata');
    expect(result.success).toBe(false);
  });

  it('checks for available updates', async () => {
    await manager.saveSnapshot('sdk', 1, {});
    const check = manager.checkUpdate('sdk', 2);
    expect(check.updateAvailable).toBe(true);
    expect(check.currentVersion).toBe('1');
    expect(check.latestVersion).toBe('2');
  });

  it('reports no update when versions match', async () => {
    await manager.saveSnapshot('sdk', 2, {});
    const check = manager.checkUpdate('sdk', 2);
    expect(check.updateAvailable).toBe(false);
  });

  it('restores snapshots from storage', async () => {
    await manager.saveSnapshot('metadata', 3, { data: 'test' });
    const newManager = new UpdateManager({ storage, logger });
    await newManager.restore();
    expect(newManager.getCurrentVersion('metadata')).toBe(3);
  });
});
