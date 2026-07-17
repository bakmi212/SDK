import type { DevicePlatform } from './device.js';

/** Extended device profile with fingerprint and hardware metadata. */
export interface DeviceProfile {
  /** Unique device identifier issued by the platform. */
  id: string;
  /** Stable fingerprint hash identifying the physical device. */
  fingerprint: string;
  /** Human-readable device name. */
  name: string;
  platform: DevicePlatform;
  /** Operating system family, e.g. Windows, macOS, iOS, Android. */
  os: string;
  osVersion: string;
  /** CPU architecture, e.g. x64, arm64. */
  architecture: string;
  /** CPU model or core count summary. */
  cpu: string;
  applicationVersion: string;
  sdkVersion: string;
  timezone: string;
  locale: string;
  firstRegisteredAt: string;
  lastSeenAt: string;
  status: ExtendedDeviceStatus;
  workspaceId?: string;
  memberId?: string;
  /** Additional platform-specific metadata. */
  metadata?: Record<string, unknown>;
}

/** Extended device status including fraud-related states. */
export type ExtendedDeviceStatus =
  | 'ACTIVE'
  | 'INACTIVE'
  | 'BLOCKED'
  | 'SUSPENDED'
  | 'DUPLICATE'
  | 'UNKNOWN';

/** Payload for registering a device with a full profile. */
export interface DeviceRegistrationInput {
  name: string;
  platform: DevicePlatform;
  fingerprint: string;
  os?: string;
  osVersion?: string;
  architecture?: string;
  cpu?: string;
  applicationVersion?: string;
  timezone?: string;
  locale?: string;
  workspaceId?: string;
  memberId?: string;
  metadata?: Record<string, unknown>;
}

/** Heartbeat payload enriched with runtime context. */
export interface DeviceHeartbeatPayload {
  deviceId: string;
  fingerprint: string;
  lastSeenAt: string;
  currentIp?: string;
  sdkVersion: string;
  applicationVersion: string;
  workspaceId?: string;
  memberId?: string;
  metadata?: Record<string, unknown>;
}

/** Result of replacing a device. */
export interface DeviceReplaceResult {
  oldDeviceId: string;
  newDevice: DeviceProfile;
}

/** Result of deactivating a device. */
export interface DeviceDeactivateResult {
  deviceId: string;
  deactivated: boolean;
}

/** Result of device verification. */
export interface DeviceVerifyResult {
  verified: boolean;
  fingerprintMatch: boolean;
  status: ExtendedDeviceStatus;
  reason?: string;
}

/** A single entry in the device activity history. */
export interface DeviceHistoryEntry {
  id: string;
  deviceId: string;
  action: DeviceAction;
  timestamp: number;
  workspaceId?: string;
  memberId?: string;
  metadata?: Record<string, unknown>;
}

/** Known device activity actions. */
export type DeviceAction =
  | 'LOGIN'
  | 'LOGOUT'
  | 'REGISTER'
  | 'HEARTBEAT'
  | 'LICENSE_CHECK'
  | 'CONFIGURATION_DOWNLOAD'
  | 'METADATA_SYNC'
  | 'DEVICE_CHANGE'
  | 'DEVICE_REPLACED'
  | 'DEVICE_REMOVED'
  | 'DEVICE_DUPLICATE'
  | 'DEVICE_FRAUD_DETECTED';
