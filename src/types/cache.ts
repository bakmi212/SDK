/** A cache entry with TTL. */
export interface CacheEntry<T = unknown> {
  value: T;
  expiresAt: number;
  createdAt: number;
}

/** Cache configuration. */
export interface CacheConfig {
  /** Default TTL in milliseconds. */
  defaultTtl: number;
  /** Interval for automatic cleanup in milliseconds. */
  cleanupInterval: number;
}

/** Cache domain keys. */
export type CacheDomain =
  | 'metadata'
  | 'configuration'
  | 'license'
  | 'device';

/** Result of a cache invalidation. */
export interface CacheInvalidateResult {
  domain: CacheDomain;
  cleared: boolean;
}
