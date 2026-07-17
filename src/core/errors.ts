/** Base error class for all SDK errors. */
export class SDKError extends Error {
  public readonly code: string;
  public readonly statusCode?: number;
  public readonly details?: unknown;

  constructor(
    message: string,
    code = 'SDK_ERROR',
    statusCode?: number,
    details?: unknown,
  ) {
    super(message);
    this.name = 'SDKError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, SDKError.prototype);
  }
}

/** Raised when authentication fails (invalid credentials, expired session). */
export class AuthenticationError extends SDKError {
  constructor(message: string, statusCode?: number, details?: unknown) {
    super(message, 'AUTH_ERROR', statusCode, details);
    this.name = 'AuthenticationError';
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

/** Raised when a license is invalid, expired, or revoked. */
export class LicenseError extends SDKError {
  constructor(message: string, statusCode?: number, details?: unknown) {
    super(message, 'LICENSE_ERROR', statusCode, details);
    this.name = 'LicenseError';
    Object.setPrototypeOf(this, LicenseError.prototype);
  }
}

/** Raised when a network request fails after retries or times out. */
export class NetworkError extends SDKError {
  constructor(message: string, statusCode?: number, details?: unknown) {
    super(message, 'NETWORK_ERROR', statusCode, details);
    this.name = 'NetworkError';
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}

/** Raised when input validation fails (bad config, malformed payload). */
export class ValidationError extends SDKError {
  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', undefined, details);
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/** Raised when a device operation fails (registration, verification, duplicate). */
export class DeviceError extends SDKError {
  constructor(message: string, statusCode?: number, details?: unknown) {
    super(message, 'DEVICE_ERROR', statusCode, details);
    this.name = 'DeviceError';
    Object.setPrototypeOf(this, DeviceError.prototype);
  }
}

/** Raised when fraud is detected or a risk threshold is exceeded. */
export class FraudError extends SDKError {
  constructor(message: string, details?: unknown) {
    super(message, 'FRAUD_ERROR', undefined, details);
    this.name = 'FraudError';
    Object.setPrototypeOf(this, FraudError.prototype);
  }
}

/** Raised when a security validation fails (signature, replay, token, license). */
export class SecurityError extends SDKError {
  constructor(message: string, details?: unknown) {
    super(message, 'SECURITY_ERROR', undefined, details);
    this.name = 'SecurityError';
    Object.setPrototypeOf(this, SecurityError.prototype);
  }
}

/** Type guard for any SDKError. */
export function isSDKError(error: unknown): error is SDKError {
  return error instanceof SDKError;
}
