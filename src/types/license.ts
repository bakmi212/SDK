/** License status returned by the license check endpoint. */
export type LicenseStatus =
  | 'active'
  | 'inactive'
  | 'expired'
  | 'revoked'
  | 'trialing';

/** A software license tied to a device and application. */
export interface License {
  id: string;
  key: string;
  applicationId: string;
  deviceId?: string;
  status: LicenseStatus;
  plan: string;
  expiresAt?: string;
  activatedAt?: string;
  createdAt: string;
  updatedAt: string;
  /** Package version this license grants access to. */
  packageVersion?: string;
  /** Workspace this license is bound to. */
  workspaceId?: string;
}

/** Payload for activating a license. */
export interface LicenseActivationPayload {
  key: string;
  deviceId: string;
  metadata?: Record<string, unknown>;
}

/** Result of a license check. */
export interface LicenseCheckResult {
  valid: boolean;
  status: LicenseStatus;
  license?: License;
  reason?: string;
}

/** Result of a full license validation. */
export interface LicenseValidationResult {
  valid: boolean;
  status: LicenseStatus;
  inGracePeriod: boolean;
  expiresAt?: string;
  workspaceValid: boolean;
  deviceValid: boolean;
  packageVersion?: string;
  reason?: string;
  /** The validated license, if returned by the server. */
  license?: License;
}

/** Offline grace period config. */
export interface LicenseGraceConfig {
  /** Grace period in milliseconds after expiry. */
  gracePeriodMs: number;
  /** Whether to allow offline usage during grace. */
  allowOffline: boolean;
}
