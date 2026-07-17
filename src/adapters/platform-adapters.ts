import type { PlatformAdapter, PlatformInfo } from '../types/index.js';
import { generateId } from '../utils/helpers.js';

/** Node.js platform adapter — collects runtime info from the Node process. */
export class NodePlatformAdapter implements PlatformAdapter {
  readonly name = 'node';

  async getFingerprint(): Promise<string> {
    const parts = [
      this.name,
      process.platform,
      process.arch,
      process.version,
      process.env.USER ?? 'unknown',
    ];
    return hashParts(parts);
  }

  async getPlatformInfo(): Promise<PlatformInfo> {
    return {
      platform: 'node',
      os: process.platform,
      osVersion: process.version,
      architecture: process.arch,
      cpu: `${process.env.PROCESSOR_ARCHITECTURE ?? process.arch}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      locale: Intl.DateTimeFormat().resolvedOptions().locale,
      applicationVersion: '',
      sdkVersion: SDK_VERSION,
    };
  }
}

const gt = globalThis as unknown as Record<string, unknown>;

/** Browser platform adapter — collects fingerprint from navigator. */
export class BrowserPlatformAdapter implements PlatformAdapter {
  readonly name = 'browser';

  async getFingerprint(): Promise<string> {
    const nav = gt.navigator as NavigatorLike | undefined;
    const screen = gt.screen as ScreenLike | undefined;
    const parts = [
      this.name,
      nav?.userAgent ?? 'unknown',
      nav?.language ?? 'unknown',
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      screen?.width?.toString() ?? '0',
      screen?.height?.toString() ?? '0',
    ];
    return hashParts(parts);
  }

  async getPlatformInfo(): Promise<PlatformInfo> {
    const nav = gt.navigator as NavigatorLike | undefined;
    return {
      platform: 'browser',
      os: parseOs(nav?.userAgent ?? ''),
      osVersion: parseOsVersion(nav?.userAgent ?? ''),
      architecture: 'unknown',
      cpu: `${nav?.hardwareConcurrency ?? 'unknown'} cores`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      locale: nav?.language ?? 'en-US',
      applicationVersion: '',
      sdkVersion: SDK_VERSION,
    };
  }
}

/** Electron platform adapter — combines Node + browser signals. */
export class ElectronPlatformAdapter implements PlatformAdapter {
  readonly name = 'electron';

  async getFingerprint(): Promise<string> {
    const nav = gt.navigator as NavigatorLike | undefined;
    const parts = [
      this.name,
      process.platform,
      process.arch,
      nav?.userAgent ?? 'electron',
    ];
    return hashParts(parts);
  }

  async getPlatformInfo(): Promise<PlatformInfo> {
    return {
      platform: 'electron',
      os: process.platform,
      osVersion: process.version,
      architecture: process.arch,
      cpu: process.env.PROCESSOR_ARCHITECTURE ?? process.arch,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      locale: Intl.DateTimeFormat().resolvedOptions().locale,
      applicationVersion: '',
      sdkVersion: SDK_VERSION,
    };
  }
}

/** React Native platform adapter — uses available globals. */
export class ReactNativePlatformAdapter implements PlatformAdapter {
  readonly name = 'react-native';

  async getFingerprint(): Promise<string> {
    const nav = gt.navigator as NavigatorLike | undefined;
    const parts = [
      this.name,
      nav?.userAgent ?? 'react-native',
      nav?.language ?? 'unknown',
      generateId('rn'),
    ];
    return hashParts(parts);
  }

  async getPlatformInfo(): Promise<PlatformInfo> {
    const nav = gt.navigator as NavigatorLike | undefined;
    return {
      platform: 'react-native',
      os: parseOs(nav?.userAgent ?? ''),
      osVersion: parseOsVersion(nav?.userAgent ?? ''),
      architecture: 'unknown',
      cpu: 'unknown',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      locale: nav?.language ?? 'en-US',
      applicationVersion: '',
      sdkVersion: SDK_VERSION,
    };
  }
}

/** Resolve a platform adapter by name. */
export function resolvePlatformAdapter(
  name: 'node' | 'browser' | 'electron' | 'react-native',
): PlatformAdapter {
  switch (name) {
    case 'node':
      return new NodePlatformAdapter();
    case 'browser':
      return new BrowserPlatformAdapter();
    case 'electron':
      return new ElectronPlatformAdapter();
    case 'react-native':
      return new ReactNativePlatformAdapter();
  }
}

const SDK_VERSION = '1.1.0';

interface NavigatorLike {
  userAgent?: string;
  language?: string;
  hardwareConcurrency?: number;
}

interface ScreenLike {
  width?: number;
  height?: number;
}

function hashParts(parts: string[]): string {
  let hash = 0;
  const joined = parts.join('|');
  for (let i = 0; i < joined.length; i++) {
    hash = (hash << 5) - hash + joined.charCodeAt(i);
    hash |= 0;
  }
  return `fp_${Math.abs(hash).toString(36)}`;
}

function parseOs(ua: string): string {
  if (ua.includes('Windows')) return 'Windows';
  if (ua.includes('Mac')) return 'macOS';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
  if (ua.includes('Linux')) return 'Linux';
  return 'Unknown';
}

function parseOsVersion(ua: string): string {
  const match = ua.match(/(Windows NT|Mac OS X|Android|CPU OS|Linux)\s([\d_.]+)/);
  return match ? match[2].replace(/_/g, '.') : 'unknown';
}
