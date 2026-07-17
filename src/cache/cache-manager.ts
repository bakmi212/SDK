import type { StorageAdapter } from '../storage/types.js';
import type { CacheDomain, CacheConfig } from '../types/index.js';
import { TTLManager } from './ttl-manager.js';

interface CacheManagerDeps {
  storage: StorageAdapter;
  config: CacheConfig;
}

/**
 * Central cache manager. Owns TTLManager instances for each domain
 * (metadata, configuration, license, device) and runs periodic cleanup.
 */
export class CacheManager {
  private deps: CacheManagerDeps;
  private managers = new Map<CacheDomain, TTLManager>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(deps: CacheManagerDeps) {
    this.deps = deps;
  }

  /** Register a cache domain with its TTL. */
  registerDomain(domain: CacheDomain, ttl: number): TTLManager {
    const manager = new TTLManager(
      domain,
      ttl,
      this.deps.storage,
      () => {
        void this.cleanupExpired();
      },
    );
    this.managers.set(domain, manager);
    return manager;
  }

  /** Get the TTLManager for a domain. */
  getDomain(domain: CacheDomain): TTLManager {
    const manager = this.managers.get(domain);
    if (!manager) {
      throw new Error(`Cache domain "${domain}" is not registered`);
    }
    return manager;
  }

  /** Run cleanup across all domains. */
  async cleanupExpired(): Promise<void> {
    for (const manager of this.managers.values()) {
      await manager.cleanup();
    }
  }

  /** Start periodic cleanup of expired entries. */
  startCleanup(): void {
    this.stopCleanup();
    this.cleanupTimer = setInterval(() => {
      for (const manager of this.managers.values()) {
        void manager.cleanup();
      }
    }, this.deps.config.cleanupInterval);
  }

  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /** Invalidate all entries in a single domain. */
  async invalidateDomain(domain: CacheDomain): Promise<void> {
    const manager = this.managers.get(domain);
    if (manager) {
      await manager.clear();
    }
  }

  /** Clear all cache domains. */
  async clearAll(): Promise<void> {
    for (const manager of this.managers.values()) {
      await manager.clear();
    }
  }

  /** Get a snapshot of cache state. */
  getSnapshot(): Record<CacheDomain, { ttl: number; expired: boolean }> {
    const result = {} as Record<CacheDomain, { ttl: number; expired: boolean }>;
    for (const [domain, manager] of this.managers) {
      result[domain] = { ttl: manager.getTtl(), expired: false };
    }
    return result;
  }

  dispose(): void {
    this.stopCleanup();
  }
}
