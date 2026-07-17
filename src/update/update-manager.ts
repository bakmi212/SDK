import type { StorageAdapter } from '../storage/types.js';
import type { Logger } from '../utils/logger.js';
import type {
  RollbackResult,
  UpdateCheckResult,
  UpdateResourceType,
  VersionSnapshot,
} from '../types/index.js';

interface UpdateManagerDeps {
  storage: StorageAdapter;
  logger: Logger;
}

const SNAPSHOT_PREFIX = 'kasandra:update:snapshot:';

/**
 * Manages update checks for SDK, metadata, and configuration.
 * Supports version snapshots and rollback to previous versions.
 */
export class UpdateManager {
  private deps: UpdateManagerDeps;
  private snapshots = new Map<UpdateResourceType, VersionSnapshot[]>();
  private currentVersions = new Map<UpdateResourceType, number>();

  constructor(deps: UpdateManagerDeps) {
    this.deps = deps;
  }

  /** Save a snapshot of the current version for potential rollback. */
  async saveSnapshot(
    type: UpdateResourceType,
    version: number,
    data: unknown,
  ): Promise<void> {
    const snapshot: VersionSnapshot = {
      version,
      data,
      takenAt: Date.now(),
    };

    let list = this.snapshots.get(type) ?? [];
    list.push(snapshot);
    if (list.length > 5) list = list.slice(-5);
    this.snapshots.set(type, list);
    this.currentVersions.set(type, version);

    await this.deps.storage.set(
      `${SNAPSHOT_PREFIX}${type}`,
      JSON.stringify(list),
    );
    this.deps.logger.debug(`Snapshot saved for ${type} v${version}`);
  }

  /** Rollback to the previous version snapshot. */
  async rollback(type: UpdateResourceType): Promise<RollbackResult> {
    const list = this.snapshots.get(type);
    if (!list || list.length < 2) {
      return { success: false, restoredVersion: -1 };
    }
    const previous = list[list.length - 2]!;
    list.pop();
    this.snapshots.set(type, list);
    this.currentVersions.set(type, previous.version);
    await this.deps.storage.set(
      `${SNAPSHOT_PREFIX}${type}`,
      JSON.stringify(list),
    );
    this.deps.logger.info(`Rolled back ${type} to v${previous.version}`);
    return {
      success: true,
      restoredVersion: previous.version,
      data: previous.data,
    };
  }

  /** Get the current version for a resource type. */
  getCurrentVersion(type: UpdateResourceType): number {
    return this.currentVersions.get(type) ?? -1;
  }

  /** Get all snapshots for a resource type. */
  getSnapshots(type: UpdateResourceType): VersionSnapshot[] {
    return [...(this.snapshots.get(type) ?? [])];
  }

  /** Check if an update is available by comparing versions. */
  checkUpdate(
    type: UpdateResourceType,
    latestVersion: number,
  ): UpdateCheckResult {
    const current = this.getCurrentVersion(type);
    return {
      updateAvailable: latestVersion > current,
      currentVersion: current.toString(),
      latestVersion: latestVersion.toString(),
    };
  }

  async restore(): Promise<void> {
    const keys = await this.deps.storage.keys();
    for (const key of keys) {
      if (key.startsWith(SNAPSHOT_PREFIX)) {
        const type = key.replace(SNAPSHOT_PREFIX, '') as UpdateResourceType;
        const raw = await this.deps.storage.get(key);
        if (raw) {
          try {
            const list = JSON.parse(raw) as VersionSnapshot[];
            this.snapshots.set(type, list);
            if (list.length > 0) {
              this.currentVersions.set(type, list[list.length - 1]!.version);
            }
          } catch {
            await this.deps.storage.remove(key);
          }
        }
      }
    }
  }

  async clear(): Promise<void> {
    this.snapshots.clear();
    this.currentVersions.clear();
    const keys = await this.deps.storage.keys();
    for (const key of keys) {
      if (key.startsWith(SNAPSHOT_PREFIX)) {
        await this.deps.storage.remove(key);
      }
    }
  }
}
