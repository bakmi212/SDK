import { SDKError } from '../core/errors.js';
import type { HttpClient } from '../http/http-client.js';
import type { Logger } from '../utils/logger.js';
import type { StorageAdapter } from '../storage/types.js';
import type {
  Metadata,
  MetadataModule,
  MetadataMenu,
  MetadataPermission,
  MetadataLimits,
  MetadataSyncResult,
} from '../types/index.js';

const STORAGE_KEY = 'kasandra:metadata';

interface MetadataManagerDeps {
  http: HttpClient;
  storage: StorageAdapter;
  logger: Logger;
  applicationId: string;
  metadataEndpoint?: string;
}

/**
 * Syncs and caches application metadata from the Membership Server.
 * Provides typed access to modules, menus, features, permissions,
 * limits, and event bindings.
 */
export class MetadataManager {
  private deps: MetadataManagerDeps;
  private current: Metadata | null = null;

  constructor(deps: MetadataManagerDeps) {
    this.deps = deps;
  }

  async sync(): Promise<MetadataSyncResult> {
    const previousVersion = this.current?.version;
    const endpoint = this.deps.metadataEndpoint ?? '/metadata';
    const response = await this.deps.http.get<Metadata>(
      endpoint,
      previousVersion ? { query: { since: previousVersion } } : undefined,
    );
    if (!response.ok) {
      throw new SDKError(
        'Metadata sync failed',
        'NETWORK_ERROR',
        response.status,
        response.data,
      );
    }
    const metadata = response.data;
    const updated = metadata.version !== previousVersion;
    this.current = metadata;
    await this.persist(metadata);
    this.deps.logger.debug(
      `Metadata synced (v${metadata.version}, updated=${updated})`,
    );
    return { metadata, updated, previousVersion };
  }

  async refresh(): Promise<Metadata> {
    const result = await this.sync();
    return result.metadata;
  }

  getVersion(): number | null {
    return this.current?.version ?? null;
  }

  getMetadata(): Metadata | null {
    return this.current;
  }

  // ─── Typed accessors ────────────────────────────────────────

  /** Get available modules for this application. */
  getModules(): MetadataModule[] {
    return this.current?.modules ?? [];
  }

  /** Get navigation menus. */
  getMenus(): MetadataMenu[] {
    return this.current?.menus ?? [];
  }

  /** Get enabled feature flags. */
  getFeatures(): string[] {
    return this.current?.features ?? [];
  }

  /** Check if a feature is enabled. */
  hasFeature(feature: string): boolean {
    return this.getFeatures().includes(feature);
  }

  /** Get permissions for all roles. */
  getPermissions(): MetadataPermission[] {
    return this.current?.permissions ?? [];
  }

  /** Get workspace limits. */
  getLimits(): MetadataLimits | null {
    return this.current?.limits ?? null;
  }

  /** Get event bindings defined by the server. */
  getEventBindings() {
    return this.current?.events ?? [];
  }

  /** Get a specific metadata entry by key. */
  getEntry<T>(key: string): T | null {
    const value = this.current?.entries?.[key];
    return (value as T) ?? null;
  }

  async restore(): Promise<void> {
    const raw = await this.deps.storage.get(STORAGE_KEY);
    if (!raw) return;
    try {
      this.current = JSON.parse(raw) as Metadata;
    } catch {
      await this.deps.storage.remove(STORAGE_KEY);
    }
  }

  async clear(): Promise<void> {
    this.current = null;
    await this.deps.storage.remove(STORAGE_KEY);
  }

  private async persist(metadata: Metadata): Promise<void> {
    await this.deps.storage.set(STORAGE_KEY, JSON.stringify(metadata));
  }
}
