import type { StorageAdapter } from '../storage/types.js';
import type { CacheEntry, CacheDomain } from '../types/index.js';

const KEY_PREFIX = 'kasandra:cache:';

/** Manages TTL-based cache entries for a single domain. */
export class TTLManager {
  private entries = new Map<string, CacheEntry>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private ttl: number;
  private storage: StorageAdapter;
  private domain: CacheDomain;
  private onExpire?: (key: string) => void;

  constructor(
    domain: CacheDomain,
    ttl: number,
    storage: StorageAdapter,
    onExpire?: (key: string) => void,
  ) {
    this.domain = domain;
    this.ttl = ttl;
    this.storage = storage;
    this.onExpire = onExpire;
  }

  async save<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    const expiresAt = Date.now() + (ttlMs ?? this.ttl);
    const entry: CacheEntry<T> = {
      value,
      expiresAt,
      createdAt: Date.now(),
    };
    this.entries.set(key, entry as CacheEntry);
    await this.storage.set(this.storageKey(key), JSON.stringify(entry));
    this.setExpiryTimer(key, ttlMs ?? this.ttl);
  }

  async load<T>(key: string): Promise<T | null> {
    const cached = this.entries.get(key);
    if (cached) {
      if (this.expired(key)) {
        await this.invalidate(key);
        return null;
      }
      return cached.value as T;
    }
    const raw = await this.storage.get(this.storageKey(key));
    if (!raw) return null;
    try {
      const entry = JSON.parse(raw) as CacheEntry<T>;
      if (Date.now() >= entry.expiresAt) {
        await this.storage.remove(this.storageKey(key));
        return null;
      }
      this.entries.set(key, entry as CacheEntry);
      return entry.value;
    } catch {
      await this.storage.remove(this.storageKey(key));
      return null;
    }
  }

  expired(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry) return true;
    return Date.now() >= entry.expiresAt;
  }

  async invalidate(key: string): Promise<void> {
    this.entries.delete(key);
    this.clearExpiryTimer(key);
    await this.storage.remove(this.storageKey(key));
  }

  async clear(): Promise<void> {
    for (const key of Array.from(this.entries.keys())) {
      this.clearExpiryTimer(key);
    }
    this.entries.clear();
    const keys = await this.storage.keys();
    for (const k of keys) {
      if (k.startsWith(this.storagePrefix())) {
        await this.storage.remove(k);
      }
    }
  }

  /** Clean up all expired entries. */
  async cleanup(): Promise<void> {
    for (const key of Array.from(this.entries.keys())) {
      if (this.expired(key)) {
        await this.invalidate(key);
      }
    }
  }

  getDomain(): CacheDomain {
    return this.domain;
  }

  getTtl(): number {
    return this.ttl;
  }

  setTtl(ttl: number): void {
    this.ttl = ttl;
  }

  private setExpiryTimer(key: string, ttlMs: number): void {
    this.clearExpiryTimer(key);
    const timer = setTimeout(() => {
      this.entries.delete(key);
      void this.storage.remove(this.storageKey(key));
      this.onExpire?.(key);
    }, ttlMs);
    this.timers.set(key, timer);
  }

  private clearExpiryTimer(key: string): void {
    const timer = this.timers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(key);
    }
  }

  private storageKey(key: string): string {
    return `${this.storagePrefix()}${key}`;
  }

  private storagePrefix(): string {
    return `${KEY_PREFIX}${this.domain}:`;
  }
}
