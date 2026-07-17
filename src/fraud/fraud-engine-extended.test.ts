import { describe, it, expect } from 'vitest';
import { FraudEngine } from './fraud-engine.js';

describe('FraudEngine — Extended Detection', () => {
  const engine = new FraudEngine();

  it('detects modified APK', () => {
    const result = engine.assess({
      fingerprint: 'fp_abc',
      applicationId: 'pos',
      modifiedApk: true,
    });
    expect(result.signals).toContain('MODIFIED_APK');
    expect(result.score).toBeGreaterThanOrEqual(30);
  });

  it('detects tampered SDK', () => {
    const result = engine.assess({
      fingerprint: 'fp_abc',
      applicationId: 'pos',
      tamperedSdk: true,
    });
    expect(result.signals).toContain('TAMPERED_SDK');
  });

  it('detects root', () => {
    const result = engine.assess({
      fingerprint: 'fp_abc',
      applicationId: 'pos',
      rooted: true,
    });
    expect(result.signals).toContain('ROOT_DETECTED');
  });

  it('detects emulator', () => {
    const result = engine.assess({
      fingerprint: 'fp_abc',
      applicationId: 'pos',
      emulator: true,
    });
    expect(result.signals).toContain('EMULATOR_DETECTED');
  });

  it('detects debugger', () => {
    const result = engine.assess({
      fingerprint: 'fp_abc',
      applicationId: 'pos',
      debuggerAttached: true,
    });
    expect(result.signals).toContain('DEBUGGER_DETECTED');
  });

  it('detects VPN', () => {
    const result = engine.assess({
      fingerprint: 'fp_abc',
      applicationId: 'pos',
      vpnDetected: true,
    });
    expect(result.signals).toContain('VPN_DETECTED');
  });

  it('detects time manipulation', () => {
    const result = engine.assess({
      fingerprint: 'fp_abc',
      applicationId: 'pos',
      timeManipulated: true,
    });
    expect(result.signals).toContain('TIME_MANIPULATION');
  });

  it('detects fake device ID', () => {
    const result = engine.assess({
      fingerprint: 'fp_abc',
      applicationId: 'pos',
      fakeDeviceId: true,
    });
    expect(result.signals).toContain('FAKE_DEVICE_ID');
  });

  it('accumulates to CRITICAL with multiple high-risk signals', () => {
    const result = engine.assess({
      fingerprint: 'fp_abc',
      applicationId: 'pos',
      modifiedApk: true,
      tamperedSdk: true,
      fakeDeviceId: true,
    });
    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.category).toBe('CRITICAL');
  });

  it('allows custom rule injection', () => {
    engine.addRule({
      name: 'ROOT_DETECTED',
      weight: 50,
      evaluate: (input) => input.rooted === true,
    });
    const result = engine.assess({
      fingerprint: 'fp_abc',
      applicationId: 'pos',
      rooted: true,
    });
    // Custom rule adds on top of default
    expect(result.signals).toContain('ROOT_DETECTED');
    engine.removeRule('ROOT_DETECTED');
  });
});
