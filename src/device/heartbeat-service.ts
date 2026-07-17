import { SDKError } from '../core/errors.js';
import type { HttpClient } from '../http/http-client.js';
import type { Logger } from '../utils/logger.js';
import type {
  ResolvedEndpointConfig,
  ResolvedHeartbeatConfig,
} from '../types/config.js';

const SDK_VERSION = '1.2.0';

interface HeartbeatServiceDeps {
  http: HttpClient;
  logger: Logger;
  endpoints: ResolvedEndpointConfig;
  config: ResolvedHeartbeatConfig;
  getDeviceId: () => string | null;
  getWorkspaceId: () => string | null;
  getLicenseStatus: () => string;
  getMetadataVersion: () => number | null;
  getConfigurationVersion: () => number | null;
  getLastEventTimestamp: () => number | null;
  getLastSyncTimestamp: () => number | null;
  getPlatform: () => string;
}

/** Payload sent by the heartbeat service. */
export interface HeartbeatPayload {
  applicationId: string;
  deviceId: string;
  sdkVersion: string;
  platform: string;
  workspace: string | null;
  licenseStatus: string;
  metadataVersion: number | null;
  configurationVersion: number | null;
  lastEvent: number | null;
  lastSync: number | null;
  latency: number | null;
  timestamp: number;
}

/**
 * Standalone heartbeat service. Sends periodic health pings to the platform
 * with runtime context: device, workspace, license status, versions, and
 * last activity timestamps.
 */
export class HeartbeatService {
  private deps: HeartbeatServiceDeps;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastLatency: number | null = null;

  constructor(deps: HeartbeatServiceDeps) {
    this.deps = deps;
  }

  /** Send a single heartbeat. */
  async send(): Promise<void> {
    const deviceId = this.deps.getDeviceId();
    if (!deviceId) {
      throw new SDKError(
        'No device registered for heartbeat',
        'DEVICE_ERROR',
      );
    }

    const start = Date.now();
    const payload: HeartbeatPayload = {
      applicationId: '',
      deviceId,
      sdkVersion: SDK_VERSION,
      platform: this.deps.getPlatform(),
      workspace: this.deps.getWorkspaceId(),
      licenseStatus: this.deps.getLicenseStatus(),
      metadataVersion: this.deps.getMetadataVersion(),
      configurationVersion: this.deps.getConfigurationVersion(),
      lastEvent: this.deps.getLastEventTimestamp(),
      lastSync: this.deps.getLastSyncTimestamp(),
      latency: this.lastLatency,
      timestamp: Date.now(),
    };

    try {
      await this.deps.http.post(
        this.deps.endpoints.deviceHeartbeat,
        payload,
      );
      this.lastLatency = Date.now() - start;
      this.deps.logger.debug(`Heartbeat sent (${this.lastLatency}ms)`);
    } catch (error) {
      this.deps.logger.warning('Heartbeat failed', error);
      throw error;
    }
  }

  /** Start automatic heartbeat at the configured interval. */
  start(intervalMs?: number): void {
    this.stop();
    const interval = intervalMs ?? this.deps.config.intervalMs;
    this.timer = setInterval(() => {
      void this.send().catch((error) => {
        this.deps.logger.warning('Auto heartbeat failed', error);
      });
    }, interval);
    this.deps.logger.debug(`Heartbeat started (every ${interval}ms)`);
  }

  /** Stop the automatic heartbeat. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  isRunning(): boolean {
    return this.timer !== null;
  }

  getLastLatency(): number | null {
    return this.lastLatency;
  }
}
