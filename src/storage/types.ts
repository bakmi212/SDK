/** A pluggable key-value storage adapter. */
export interface StorageAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
  keys(): Promise<string[]>;
}

/** Built-in storage adapter names. */
export type StorageAdapterType =
  | 'memory'
  | 'browser'
  | 'electron'
  | 'react-native';
