import { ValidationError } from './errors.js';
import type {
  ResolvedSDKConfig,
  SDKConfig,
  SyncOperationType,
} from '../types/config.js';
import {
  DEFAULT_ENDPOINTS,
} from '../types/config.js';

const DEFAULTS = {
  timeout: 30000,
  debug: false,
  maxRetries: 3,
  storage: 'memory',
  autoLifecycle: true,
} as const;

const SYNC_DEFAULTS = {
  intervalMs: 300_000,
  operations: [
    'metadata',
    'configuration',
    'license',
    'device',
    'events',
  ] as SyncOperationType[],
  syncOnReconnect: true,
};

const HEARTBEAT_DEFAULTS = {
  intervalMs: 60_000,
  autoStart: true,
};

const TELEMETRY_DEFAULTS = {
  enabled: true,
  reportIntervalMs: 300_000,
};

const CACHE_DEFAULTS = {
  defaultTtl: 300_000,
  cleanupInterval: 60_000,
  metadataTtl: 300_000,
  configurationTtl: 300_000,
  licenseTtl: 120_000,
  deviceTtl: 120_000,
};

/**
 * Central SDK configuration store. Holds resolved config.
 * No business logic lives here — only configuration access.
 */
export class SDKCore {
  private config: ResolvedSDKConfig | null = null;

  /** Resolve and store the SDK configuration. Throws on invalid input. */
  initialize(options: SDKConfig): ResolvedSDKConfig {
    this.validate(options);
    const resolved: ResolvedSDKConfig = {
      serverUrl: options.serverUrl.replace(/\/+$/, ''),
      applicationId: options.applicationId,
      apiKey: options.apiKey,
      timeout: options.timeout ?? DEFAULTS.timeout,
      debug: options.debug ?? DEFAULTS.debug,
      maxRetries: options.maxRetries ?? DEFAULTS.maxRetries,
      storage: options.storage ?? DEFAULTS.storage,
      autoLifecycle: options.autoLifecycle ?? DEFAULTS.autoLifecycle,
      endpoints: { ...DEFAULT_ENDPOINTS, ...options.endpoints },
      sync: {
        intervalMs: options.sync?.intervalMs ?? SYNC_DEFAULTS.intervalMs,
        operations: options.sync?.operations ?? SYNC_DEFAULTS.operations,
        syncOnReconnect:
          options.sync?.syncOnReconnect ?? SYNC_DEFAULTS.syncOnReconnect,
      },
      heartbeat: {
        intervalMs:
          options.heartbeat?.intervalMs ?? HEARTBEAT_DEFAULTS.intervalMs,
        autoStart: options.heartbeat?.autoStart ?? HEARTBEAT_DEFAULTS.autoStart,
      },
      telemetry: {
        enabled: options.telemetry?.enabled ?? TELEMETRY_DEFAULTS.enabled,
        reportIntervalMs:
          options.telemetry?.reportIntervalMs ??
          TELEMETRY_DEFAULTS.reportIntervalMs,
      },
      cache: {
        defaultTtl: options.cache?.defaultTtl ?? CACHE_DEFAULTS.defaultTtl,
        cleanupInterval:
          options.cache?.cleanupInterval ?? CACHE_DEFAULTS.cleanupInterval,
        metadataTtl: options.cache?.metadataTtl ?? CACHE_DEFAULTS.metadataTtl,
        configurationTtl:
          options.cache?.configurationTtl ?? CACHE_DEFAULTS.configurationTtl,
        licenseTtl: options.cache?.licenseTtl ?? CACHE_DEFAULTS.licenseTtl,
        deviceTtl: options.cache?.deviceTtl ?? CACHE_DEFAULTS.deviceTtl,
      },
    };
    this.config = resolved;
    return resolved;
  }

  getConfig(): ResolvedSDKConfig {
    if (!this.config) {
      throw new ValidationError(
        'SDK not initialized. Call Kasandra.initialize() first.',
      );
    }
    return this.config;
  }

  isInitialized(): boolean {
    return this.config !== null;
  }

  /** Update a subset of configuration. Re-validates required fields. */
  updateConfig(patch: Partial<SDKConfig>): ResolvedSDKConfig {
    const current = this.getConfig();
    const merged: SDKConfig = {
      serverUrl: patch.serverUrl ?? current.serverUrl,
      applicationId: patch.applicationId ?? current.applicationId,
      apiKey: patch.apiKey ?? current.apiKey,
      timeout: patch.timeout ?? current.timeout,
      debug: patch.debug ?? current.debug,
      maxRetries: patch.maxRetries ?? current.maxRetries,
      storage: patch.storage ?? current.storage,
      endpoints: patch.endpoints ?? current.endpoints,
      sync: patch.sync ?? current.sync,
      heartbeat: patch.heartbeat ?? current.heartbeat,
      telemetry: patch.telemetry ?? current.telemetry,
      cache: patch.cache ?? current.cache,
      autoLifecycle: patch.autoLifecycle ?? current.autoLifecycle,
    };
    return this.initialize(merged);
  }

  reset(): void {
    this.config = null;
  }

  private validate(options: SDKConfig): void {
    if (!options.serverUrl) {
      throw new ValidationError('serverUrl is required');
    }
    try {
      new URL(options.serverUrl);
    } catch {
      throw new ValidationError('serverUrl must be a valid URL');
    }
    if (!options.applicationId) {
      throw new ValidationError('applicationId is required');
    }
    if (!options.apiKey) {
      throw new ValidationError('apiKey is required');
    }
    if (options.timeout !== undefined && options.timeout <= 0) {
      throw new ValidationError('timeout must be a positive number');
    }
    if (options.maxRetries !== undefined && options.maxRetries < 0) {
      throw new ValidationError('maxRetries must be >= 0');
    }
  }
}
