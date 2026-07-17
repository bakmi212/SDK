import { describe, it, expect } from 'vitest';
import {
  SDKError,
  DeviceError,
  FraudError,
  SecurityError,
  isSDKError,
} from './index.js';

describe('Errors module exports', () => {
  it('exports all error classes', async () => {
    expect(SDKError).toBeDefined();
    expect(DeviceError).toBeDefined();
    expect(FraudError).toBeDefined();
    expect(SecurityError).toBeDefined();
  });

  it('DeviceError has correct code', () => {
    const err = new DeviceError('device failed', 400);
    expect(err.code).toBe('DEVICE_ERROR');
    expect(err.name).toBe('DeviceError');
    expect(isSDKError(err)).toBe(true);
  });

  it('FraudError has correct code', () => {
    const err = new FraudError('fraud detected');
    expect(err.code).toBe('FRAUD_ERROR');
    expect(err.name).toBe('FraudError');
  });

  it('SecurityError has correct code', () => {
    const err = new SecurityError('security violation');
    expect(err.code).toBe('SECURITY_ERROR');
    expect(err.name).toBe('SecurityError');
  });
});
