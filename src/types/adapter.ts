/** Platform adapter for collecting runtime environment info. */
export interface PlatformAdapter {
  /** Adapter name, e.g. "node", "browser". */
  readonly name: string;
  /** Collect a device fingerprint from the environment. */
  getFingerprint(): Promise<string>;
  /** Gather platform info for the device profile. */
  getPlatformInfo(): Promise<PlatformInfo>;
}

/** Platform-specific runtime information. */
export interface PlatformInfo {
  platform: string;
  os: string;
  osVersion: string;
  architecture: string;
  cpu: string;
  timezone: string;
  locale: string;
  applicationVersion: string;
  sdkVersion: string;
}
