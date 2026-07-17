/**
 * SDK initialization options passed to `Kasandra.initialize()`.
 */
export interface SDKConfig {
  /** Base URL of the KaSandra server, e.g. https://api.kasandra.io */
  serverUrl: string;
  /** Unique identifier for the consuming application. */
  applicationId: string;
  /** API key issued for the consuming application. */
  apiKey: string;
  /** Request timeout in milliseconds. Defaults to 30000. */
  timeout?: number;
  /** Enable verbose debug logging. Defaults to false. */
  debug?: boolean;
  /** Maximum number of retry attempts for failed HTTP requests. Defaults to 3. */
  maxRetries?: number;
  /** Optional storage adapter override. */
  storage?: 'memory' | 'browser' | 'electron' | 'react-native';
  /** Configurable API endpoint paths. */
  endpoints?: EndpointConfig;
  /** Sync scheduler configuration. */
  sync?: SyncConfig;
  /** Heartbeat configuration. */
  heartbeat?: HeartbeatConfig;
  /** Telemetry configuration. */
  telemetry?: TelemetryConfig;
  /** Cache configuration. */
  cache?: CacheTtlConfig;
  /** Whether to auto-run the full SDK lifecycle on init. Defaults to true. */
  autoLifecycle?: boolean;
}

/** Configurable API endpoint paths — all overridable. */
export interface EndpointConfig {
  authLogin?: string;
  authLogout?: string;
  authRefresh?: string;
  licenseCheck?: string;
  licenseActivate?: string;
  licenseDeactivate?: string;
  licenseValidate?: string;
  configurationDownload?: string;
  configurationPublish?: string;
  metadataSync?: string;
  deviceRegister?: string;
  deviceVerify?: string;
  deviceHeartbeat?: string;
  deviceReplace?: string;
  deviceDeactivate?: string;
  workspaceCurrent?: string;
  eventsBatch?: string;
  telemetryReport?: string;
}

/** Sync scheduler configuration. */
export interface SyncConfig {
  /** Sync interval in milliseconds. Defaults to 300000 (5 min). */
  intervalMs?: number;
  /** Which operations to sync. Defaults to all. */
  operations?: SyncOperationType[];
  /** Sync on reconnect after offline. Defaults to true. */
  syncOnReconnect?: boolean;
}

/** Heartbeat configuration. */
export interface HeartbeatConfig {
  /** Heartbeat interval in milliseconds. Defaults to 60000. */
  intervalMs?: number;
  /** Whether to auto-start heartbeat after init. Defaults to true. */
  autoStart?: boolean;
}

/** Telemetry configuration. */
export interface TelemetryConfig {
  /** Whether to enable telemetry collection. Defaults to true. */
  enabled?: boolean;
  /** Telemetry report interval in milliseconds. Defaults to 300000. */
  reportIntervalMs?: number;
}

/** Cache TTL configuration per domain. */
export interface CacheTtlConfig {
  /** Default TTL for all caches in ms. Defaults to 300000. */
  defaultTtl?: number;
  /** Cleanup interval in ms. Defaults to 60000. */
  cleanupInterval?: number;
  /** Metadata cache TTL override. */
  metadataTtl?: number;
  /** Configuration cache TTL override. */
  configurationTtl?: number;
  /** License cache TTL override. */
  licenseTtl?: number;
  /** Device cache TTL override. */
  deviceTtl?: number;
}

/** Sync operation type (also in sync.ts but needed here for config). */
export type SyncOperationType =
  | 'metadata'
  | 'configuration'
  | 'license'
  | 'device'
  | 'events';

/**
 * Internal resolved configuration with all defaults applied.
 */
export interface ResolvedSDKConfig {
  serverUrl: string;
  applicationId: string;
  apiKey: string;
  timeout: number;
  debug: boolean;
  maxRetries: number;
  storage: 'memory' | 'browser' | 'electron' | 'react-native';
  endpoints: ResolvedEndpointConfig;
  sync: ResolvedSyncConfig;
  heartbeat: ResolvedHeartbeatConfig;
  telemetry: ResolvedTelemetryConfig;
  cache: ResolvedCacheTtlConfig;
  autoLifecycle: boolean;
}

export interface ResolvedEndpointConfig extends Required<EndpointConfig> {}

export interface ResolvedSyncConfig {
  intervalMs: number;
  operations: SyncOperationType[];
  syncOnReconnect: boolean;
}

export interface ResolvedHeartbeatConfig {
  intervalMs: number;
  autoStart: boolean;
}

export interface ResolvedTelemetryConfig {
  enabled: boolean;
  reportIntervalMs: number;
}

export interface ResolvedCacheTtlConfig {
  defaultTtl: number;
  cleanupInterval: number;
  metadataTtl: number;
  configurationTtl: number;
  licenseTtl: number;
  deviceTtl: number;
}

/** Configuration update payload (all fields optional). */
export type SDKConfigUpdate = Partial<SDKConfig>;

/** Default endpoint paths — all configurable. */
export const DEFAULT_ENDPOINTS: ResolvedEndpointConfig = {
  authLogin: '/auth/login',
  authLogout: '/auth/logout',
  authRefresh: '/auth/refresh',
  licenseCheck: '/license/check',
  licenseActivate: '/license/activate',
  licenseDeactivate: '/license/deactivate',
  licenseValidate: '/license/validate',
  configurationDownload: '/configuration',
  configurationPublish: '/configuration/publish',
  metadataSync: '/metadata',
  deviceRegister: '/devices/register',
  deviceVerify: '/devices/verify',
  deviceHeartbeat: '/devices/heartbeat',
  deviceReplace: '/devices/replace',
  deviceDeactivate: '/devices/deactivate',
  workspaceCurrent: '/workspace',
  eventsBatch: '/events/batch',
  telemetryReport: '/telemetry/report',
};
