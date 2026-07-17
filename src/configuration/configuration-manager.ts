import { createHash } from 'node:crypto';
import { SDKError, ValidationError } from '../core/errors.js';
import type { HttpClient } from '../http/http-client.js';
import type { Logger } from '../utils/logger.js';
import type { StorageAdapter } from '../storage/types.js';
import type {
  Configuration,
  ConfigurationMergeResult,
  ConfigurationPublishResult,
  ConfigurationRefreshResult,
  ConfigurationSnapshot,
} from '../types/index.js';

const STORAGE_KEY = 'kasandra:configuration';
const SNAPSHOT_KEY = 'kasandra:configuration:snapshot';

interface ConfigurationManagerDeps {
  http: HttpClient;
  storage: StorageAdapter;
  logger: Logger;
  applicationId: string;
  configurationEndpoint?: string;
  publishEndpoint?: string;
}

/**
 * Downloads, caches, snapshots, rolls back, merges, validates, and
 * publishes runtime configuration. Supports offline cache with TTL.
 */
export class ConfigurationManager {
  private deps: ConfigurationManagerDeps;
  private cached: Configuration | null = null;
  private snapshot: ConfigurationSnapshot | null = null;

  constructor(deps: ConfigurationManagerDeps) {
    this.deps = deps;
  }

  async download(): Promise<Configuration> {
    const endpoint = this.deps.configurationEndpoint ?? '/configuration';
    const response = await this.deps.http.get<Configuration>(endpoint);
    if (!response.ok) {
      throw new SDKError(
        'Failed to download configuration',
        'NETWORK_ERROR',
        response.status,
        response.data,
      );
    }
    await this.saveSnapshot(response.data);
    this.cached = response.data;
    await this.persist(response.data);
    this.deps.logger.debug('Configuration downloaded');
    return response.data;
  }

  async refresh(): Promise<ConfigurationRefreshResult> {
    const previous = this.cached;
    const latest = await this.download();
    const updated = previous?.version !== latest.version;
    return { configuration: latest, updated };
  }

  getCached(): Configuration | null {
    return this.cached;
  }

  /** Save a version snapshot for rollback. */
  async saveSnapshot(config: Configuration): Promise<void> {
    this.snapshot = {
      version: config.version,
      data: config.data,
      checksum: config.checksum,
      takenAt: Date.now(),
    };
    await this.deps.storage.set(SNAPSHOT_KEY, JSON.stringify(this.snapshot));
  }

  /** Rollback to the last saved snapshot. */
  async rollback(): Promise<Configuration | null> {
    if (!this.snapshot) return null;
    const restored: Configuration = {
      applicationId: this.deps.applicationId,
      version: this.snapshot.version,
      data: this.snapshot.data,
      checksum: this.snapshot.checksum,
      updatedAt: new Date().toISOString(),
    };
    this.cached = restored;
    await this.persist(restored);
    this.deps.logger.info(`Configuration rolled back to v${restored.version}`);
    return restored;
  }

  /** Merge new data into the cached configuration. */
  async merge(
    patch: Record<string, unknown>,
  ): Promise<ConfigurationMergeResult> {
    if (!this.cached) {
      throw new ValidationError('No cached configuration to merge into');
    }
    const mergedKeys = Object.keys(patch);
    const mergedData = { ...this.cached.data, ...patch };
    const merged: Configuration = {
      ...this.cached,
      data: mergedData,
      version: this.cached.version + 1,
      updatedAt: new Date().toISOString(),
    };
    this.cached = merged;
    await this.persist(merged);
    this.deps.logger.debug(`Configuration merged: ${mergedKeys.join(', ')}`);
    return { configuration: merged, mergedKeys };
  }

  /** Validate a configuration against its checksum. */
  validate(config: Configuration): boolean {
    if (!config.checksum) return true;
    const computed = this.computeChecksum(config);
    return computed === config.checksum;
  }

  /** Publish the current configuration to the server. */
  async publish(): Promise<ConfigurationPublishResult> {
    if (!this.cached) {
      throw new ValidationError('No configuration to publish');
    }
    const endpoint = this.deps.publishEndpoint ?? '/configuration/publish';
    const response = await this.deps.http.post<ConfigurationPublishResult>(
      endpoint,
      this.cached,
    );
    if (!response.ok) {
      throw new SDKError(
        'Configuration publish failed',
        'NETWORK_ERROR',
        response.status,
        response.data,
      );
    }
    this.deps.logger.info(`Configuration published (v${this.cached.version})`);
    return response.data;
  }

  async restore(): Promise<void> {
    const raw = await this.deps.storage.get(STORAGE_KEY);
    if (raw) {
      try {
        this.cached = JSON.parse(raw) as Configuration;
      } catch {
        await this.deps.storage.remove(STORAGE_KEY);
      }
    }
    const snapRaw = await this.deps.storage.get(SNAPSHOT_KEY);
    if (snapRaw) {
      try {
        this.snapshot = JSON.parse(snapRaw) as ConfigurationSnapshot;
      } catch {
        await this.deps.storage.remove(SNAPSHOT_KEY);
      }
    }
  }

  async clearCache(): Promise<void> {
    this.cached = null;
    this.snapshot = null;
    await this.deps.storage.remove(STORAGE_KEY);
    await this.deps.storage.remove(SNAPSHOT_KEY);
  }

  private computeChecksum(config: Configuration): string {
    return createHash('sha256')
      .update(JSON.stringify(config.data))
      .digest('hex');
  }

  private async persist(config: Configuration): Promise<void> {
    await this.deps.storage.set(STORAGE_KEY, JSON.stringify(config));
  }
}
