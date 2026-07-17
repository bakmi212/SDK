import type { StorageAdapter } from './types.js';
import { MemoryStorage } from './memory-storage.js';
import { SDKError } from '../core/errors.js';

/** Minimal localStorage-like interface to stay platform-agnostic. */
interface LocalStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
  key(index: number): string | null;
  readonly length: number;
}

/**
 * Browser localStorage adapter. Falls back to an in-memory map when
 * localStorage is unavailable (SSR, restricted contexts).
 */
export class BrowserStorage implements StorageAdapter {
  private backend: LocalStorageLike | null;
  private fallback = new Map<string, string>();

  constructor() {
    this.backend =
      typeof globalThis !== 'undefined' &&
      'localStorage' in globalThis
        ? ((globalThis as unknown as Record<string, unknown>).localStorage as LocalStorageLike)
        : null;
  }

  async get(key: string): Promise<string | null> {
    if (this.backend) {
      try {
        return this.backend.getItem(key);
      } catch {
        return this.fallback.get(key) ?? null;
      }
    }
    return this.fallback.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    if (this.backend) {
      try {
        this.backend.setItem(key, value);
        return;
      } catch {
        this.fallback.set(key, value);
        return;
      }
    }
    this.fallback.set(key, value);
  }

  async remove(key: string): Promise<void> {
    if (this.backend) {
      try {
        this.backend.removeItem(key);
      } catch {
        this.fallback.delete(key);
      }
    }
    this.fallback.delete(key);
  }

  async clear(): Promise<void> {
    if (this.backend) {
      try {
        this.backend.clear();
      } catch {
        // ignore
      }
    }
    this.fallback.clear();
  }

  async keys(): Promise<string[]> {
    if (this.backend) {
      try {
        return Array.from({ length: this.backend.length }, (_, i) =>
          this.backend!.key(i),
        ).filter((k): k is string => k !== null);
      } catch {
        return Array.from(this.fallback.keys());
      }
    }
    return Array.from(this.fallback.keys());
  }
}

/**
 * Resolve a storage adapter instance by name.
 * Throws SDKError for unknown adapter types.
 */
export function resolveStorageAdapter(
  type: 'memory' | 'browser' | 'electron' | 'react-native',
): StorageAdapter {
  switch (type) {
    case 'memory':
      return new MemoryStorage();
    case 'browser':
      return new BrowserStorage();
    case 'electron':
      return new ElectronStorage();
    case 'react-native':
      return new ReactNativeStorage();
    default:
      throw new SDKError(`Unknown storage adapter: ${type}`, 'VALIDATION_ERROR');
  }
}

class ElectronStorage implements StorageAdapter {
  private store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.store.delete(key);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  async keys(): Promise<string[]> {
    return Array.from(this.store.keys());
  }
}

class ReactNativeStorage implements StorageAdapter {
  private store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.store.delete(key);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  async keys(): Promise<string[]> {
    return Array.from(this.store.keys());
  }
}
