import { describe, it, expect } from 'vitest';
import { MemoryStorage } from '../storage/memory-storage.js';

describe('MemoryStorage', () => {
  it('stores and retrieves values', async () => {
    const storage = new MemoryStorage();
    await storage.set('key', 'value');
    expect(await storage.get('key')).toBe('value');
  });

  it('returns null for missing keys', async () => {
    const storage = new MemoryStorage();
    expect(await storage.get('missing')).toBeNull();
  });

  it('removes values', async () => {
    const storage = new MemoryStorage();
    await storage.set('key', 'value');
    await storage.remove('key');
    expect(await storage.get('key')).toBeNull();
  });

  it('clears all values', async () => {
    const storage = new MemoryStorage();
    await storage.set('a', '1');
    await storage.set('b', '2');
    await storage.clear();
    expect(await storage.keys()).toEqual([]);
  });

  it('lists keys', async () => {
    const storage = new MemoryStorage();
    await storage.set('a', '1');
    await storage.set('b', '2');
    const keys = await storage.keys();
    expect(keys.sort()).toEqual(['a', 'b']);
  });
});
