/** A registered device within a workspace. */
export interface Device {
  id: string;
  applicationId: string;
  workspaceId?: string;
  name: string;
  platform: DevicePlatform;
  osVersion?: string;
  appVersion?: string;
  lastSeenAt?: string;
  status: DeviceStatus;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export type DevicePlatform =
  | 'web'
  | 'ios'
  | 'android'
  | 'windows'
  | 'macos'
  | 'linux'
  | 'electron'
  | 'react-native';

export type DeviceStatus = 'active' | 'idle' | 'offline' | 'revoked';

/** Payload for registering a new device. */
export interface DeviceRegistrationPayload {
  name: string;
  platform: DevicePlatform;
  osVersion?: string;
  appVersion?: string;
  metadata?: Record<string, unknown>;
}

/** Heartbeat payload sent periodically by a registered device. */
export interface DeviceHeartbeat {
  deviceId: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}
