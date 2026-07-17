/** Telemetry snapshot collected by the SDK. */
export interface TelemetrySnapshot {
  sdkVersion: string;
  platform: string;
  os: string;
  osVersion: string;
  memoryUsage: MemoryInfo;
  cpuUsage: CpuInfo;
  networkStatus: NetworkInfo;
  appVersion: string;
  timestamp: number;
}

export interface MemoryInfo {
  rss: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
}

export interface CpuInfo {
  cores: number;
  loadAverage: number[];
}

export interface NetworkInfo {
  online: boolean;
  latency: number | null;
}

/** Request duration record. */
export interface RequestDurationRecord {
  url: string;
  method: string;
  durationMs: number;
  status: number;
  timestamp: number;
}

/** Crash information. */
export interface CrashInfo {
  message: string;
  stack?: string;
  timestamp: number;
  sdkVersion: string;
}
