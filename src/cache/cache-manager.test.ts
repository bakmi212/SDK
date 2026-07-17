import { describe, it, expect, beforeEach } from 'vitest';
import { CacheManager } from './cache-manager.js';
import { TTLManager } from './ttl-manager.js';
import { MemoryStorage } from '../storage/memory-storage.js';

describe('TTLManager', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it('saves and loads values within TTL', async () => {
    const ttl = new TTLManager('metadata', 5000, storage);
    await ttl.save('key1', { version: 1 });
    const value = await ttl.load<{ version: number }>('key1');
    expect(value).toEqual({ version: 1 });
  });

  it('returns null after expiry', async () => {
    const ttl = new TTLManager('metadata', 10, storage);
    await ttl.save('key1', 'value');
    await new Promise((r) => setTimeout(r, 50));
    const value = await ttl.load('key1');
    expect(value).toBeNull();
  });

  it('invalidates a key', async () => {
    const ttl = new TTLManager('metadata', 5000, storage);
    await ttl.save('key1', 'value');
    await ttl.invalidate('key1');
    expect(await ttl.load('key1')).toBeNull();
  });

  it('checks expired status', async () => {
    const ttl = new TTLManager('metadata', 10, storage);
    await ttl.save('key1', 'value');
    expect(ttl.expired('key1')).toBe(false);
    await new Promise((r) => setTimeout(r, 50));
    expect(ttl.expired('key1')).toBe(true);
  });

  it('clears all entries', async () => {
    const ttl = new TTLManager('metadata', 5000, storage);
    await ttl.save('a', '1');
    await ttl.save('b', '2');
    await ttl.clear();
    expect(await ttl.load('a')).toBeNull();
    expect(await ttl.load('b')).toBeNull();
  });
});

describe('CacheManager', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it('registers domains and manages TTLs', async () => {
    const cm = new CacheManager({ storage, config: { defaultTtl: 5000, cleanupInterval: 60000 } });
    const metadataCache = cm.registerDomain('metadata', 5000);
    await metadataCache.save('key', { data: 'test' });
    const value = await metadataCache.load<{ data: string }>('key');
    expect(value).toEqual({ data: 'test' });
  });

  it('invalidates a specific domain', async () => {
    const cm = new CacheManager({ storage, config: { defaultTtl: 5000, cleanupInterval: 60000 } });
    const cache = cm.registerDomain('configuration', 5000);
    await cache.save('key', 'value');
    await cm.invalidateDomain('configuration');
    expect(await cache.load('key')).toBeNull();
  });

  it('clears all domains', async () => {
    const cm = new CacheManager({ storage, config: { defaultTtl: 5000, cleanupInterval: 60000 } });
    const meta = cm.registerDomain('metadata', 5000);
    const config = cm.registerDomain('configuration', 5000);
    await meta.save('key', 'value');
    await config.save('key', 'value');
    await cm.clearAll();
    expect(await meta.load('key')).toBeNull();
    expect(await config.load('key')).toBeNull();
  });
});
