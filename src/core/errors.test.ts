import { describe, it, expect } from 'vitest';
import {
  SDKError,
  AuthenticationError,
  LicenseError,
  NetworkError,
  ValidationError,
  isSDKError,
} from './errors.js';

describe('Error classes', () => {
  it('SDKError carries code and statusCode', () => {
    const err = new SDKError('boom', 'CUSTOM', 500);
    expect(err.message).toBe('boom');
    expect(err.code).toBe('CUSTOM');
    expect(err.statusCode).toBe(500);
    expect(err.name).toBe('SDKError');
  });

  it('AuthenticationError extends SDKError', () => {
    const err = new AuthenticationError('bad creds', 401);
    expect(err.code).toBe('AUTH_ERROR');
    expect(err.statusCode).toBe(401);
    expect(isSDKError(err)).toBe(true);
  });

  it('LicenseError extends SDKError', () => {
    const err = new LicenseError('expired', 403);
    expect(err.code).toBe('LICENSE_ERROR');
    expect(isSDKError(err)).toBe(true);
  });

  it('NetworkError extends SDKError', () => {
    const err = new NetworkError('timeout');
    expect(err.code).toBe('NETWORK_ERROR');
    expect(isSDKError(err)).toBe(true);
  });

  it('ValidationError extends SDKError', () => {
    const err = new ValidationError('bad input');
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(isSDKError(err)).toBe(true);
  });

  it('isSDKError returns false for plain errors', () => {
    expect(isSDKError(new Error('plain'))).toBe(false);
  });
});
