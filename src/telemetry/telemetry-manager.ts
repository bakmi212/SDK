import type {
  CrashInfo,
  RequestDurationRecord,
  TelemetrySnapshot,
} from '../types/index.js';
import type { Logger } from '../utils/logger.js';
import type { HttpClient } from '../http/http-client.js';
import type { ResolvedEndpointConfig } from '../types/config.js';
import { loadavg } from 'node:os';

const SDK_VERSION = '1.2.0';

interface TelemetryManagerDeps {
  http: HttpClient;
  logger: Logger;
  endpoints: ResolvedEndpointConfig;
  enabled: boolean;
  reportIntervalMs: number;
}

/**
 * Collects runtime telemetry (memory, CPU, network, crashes) and reports
 * it to the platform. Distinct from event tracking — this is system-level.
 */
export class TelemetryManager {
  private deps: TelemetryManagerDeps;
  private requestDurations: RequestDurationRecord[] = [];
  private crashes: CrashInfo[] = [];
  private reportTimer: ReturnType<typeof setInterval> | null = null;

  constructor(deps: TelemetryManagerDeps) {
    this.deps = deps;
  }

  /** Collect a telemetry snapshot. */
  collect(): TelemetrySnapshot {
    const mem = process.memoryUsage();
    return {
      sdkVersion: SDK_VERSION,
      platform: process.platform,
      os: process.platform,
      osVersion: process.version,
      memoryUsage: {
        rss: mem.rss,
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        external: mem.external,
      },
      cpuUsage: {
        cores: Math.max(1, (process.env.PROCESSOR_ARCHITECTURE ? 4 : 4)),
        loadAverage: process.platform !== 'win32' ? loadavg() : [0, 0, 0],
      },
      networkStatus: {
        online: true,
        latency: null,
      },
      appVersion: '',
      timestamp: Date.now(),
    };
  }

  /** Record a request duration. */
  recordRequestDuration(record: RequestDurationRecord): void {
    this.requestDurations.push(record);
    if (this.requestDurations.length > 100) {
      this.requestDurations.shift();
    }
  }

  /** Record a crash. */
  recordCrash(info: CrashInfo): void {
    this.crashes.push({ ...info, sdkVersion: SDK_VERSION });
    this.deps.logger.error('Crash recorded', info);
  }

  /** Get the average request duration. */
  getAverageRequestDuration(): number {
    if (this.requestDurations.length === 0) return 0;
    const total = this.requestDurations.reduce(
      (sum, r) => sum + r.durationMs,
      0,
    );
    return Math.round(total / this.requestDurations.length);
  }

  /** Get collected crashes. */
  getCrashes(): CrashInfo[] {
    return [...this.crashes];
  }

  /** Report telemetry to the platform. */
  async report(): Promise<void> {
    if (!this.deps.enabled) return;
    const snapshot = this.collect();
    try {
      await this.deps.http.post(this.deps.endpoints.telemetryReport, snapshot);
      this.deps.logger.debug('Telemetry reported');
    } catch (error) {
      this.deps.logger.warning('Telemetry report failed', error);
    }
  }

  /** Start periodic telemetry reporting. */
  startAutoReport(): void {
    if (!this.deps.enabled) return;
    this.stopAutoReport();
    this.reportTimer = setInterval(() => {
      void this.report().catch((error) => {
        this.deps.logger.warning('Auto telemetry report failed', error);
      });
    }, this.deps.reportIntervalMs);
  }

  stopAutoReport(): void {
    if (this.reportTimer) {
      clearInterval(this.reportTimer);
      this.reportTimer = null;
    }
  }

  /** Perform a ping to measure network latency. */
  async ping(): Promise<number | null> {
    const start = Date.now();
    try {
      await this.deps.http.get('/health');
      return Date.now() - start;
    } catch {
      return null;
    }
  }
}
