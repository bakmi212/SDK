/** Result of a security validation. */
export interface SecurityValidationResult {
  valid: boolean;
  checks: SecurityCheckResult[];
  errors: string[];
}

/** Individual check within a security validation. */
export interface SecurityCheckResult {
  name: SecurityCheckName;
  passed: boolean;
  message?: string;
}

/** Named security checks. */
export type SecurityCheckName =
  | 'SIGNATURE'
  | 'REPLAY_PROTECTION'
  | 'TOKEN_VALIDITY'
  | 'LICENSE_VALIDITY';

/** Payload for signature validation. */
export interface SignatureValidationInput {
  payload: string;
  signature: string;
  secret: string;
}

/** Payload for replay protection validation. */
export interface ReplayProtectionInput {
  timestamp: number;
  nonce: string;
  maxAgeMs?: number;
}

/** Payload for token validation. */
export interface TokenValidationInput {
  token: string;
  expectedAudience?: string;
  expectedIssuer?: string;
}

/** Payload for license validation. */
export interface LicenseValidationInput {
  key: string;
  applicationId: string;
  deviceId?: string;
}
