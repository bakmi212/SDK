import { describe, it, expect } from 'vitest';
import { DuplicateEngine, FraudEngine, categoryFromScore } from './fraud-engine.js';
import type { DuplicateCheckInput } from '../types/index.js';

describe('DuplicateEngine', () => {
  const engine = new DuplicateEngine();

  it('detects identical fingerprints as HIGH', () => {
    const input: DuplicateCheckInput = {
      fingerprint: 'fp_abc123',
      applicationId: 'pos',
      workspaceId: 'ws-1',
      memberId: 'm-1',
    };
    const result = engine.check(input, { ...input });
    expect(result.isDuplicate).toBe(true);
    expect(result.level).toBe('HIGH');
    expect(result.matchedFields).toContain('fingerprint');
  });

  it('returns LOW for completely different devices', () => {
    const result = engine.check(
      { fingerprint: 'fp_aaa', applicationId: 'pos' },
      { fingerprint: 'fp_zzz', applicationId: 'laundry' },
    );
    expect(result.isDuplicate).toBe(false);
    expect(result.level).toBe('LOW');
  });

  it('matches on workspace and member', () => {
    const result = engine.check(
      {
        fingerprint: 'fp_aaa',
        applicationId: 'pos',
        workspaceId: 'ws-1',
        memberId: 'm-1',
        machineSignature: 'sig-1',
      },
      {
        fingerprint: 'fp_bbb',
        applicationId: 'pos',
        workspaceId: 'ws-1',
        memberId: 'm-1',
        machineSignature: 'sig-1',
      },
    );
    expect(result.matchedFields).toContain('machineSignature');
    expect(result.matchedFields).toContain('workspaceId');
    expect(result.matchedFields).toContain('memberId');
  });
});

describe('FraudEngine', () => {
  const engine = new FraudEngine();

  it('returns SAFE for clean input', () => {
    const result = engine.assess({
      fingerprint: 'fp_abc123',
      applicationId: 'pos',
      sdkVersion: '1.1.0',
      validSdkVersions: ['1.1.0'],
    });
    expect(result.score).toBe(0);
    expect(result.category).toBe('SAFE');
    expect(result.signals).toHaveLength(0);
  });

  it('detects frequent device changes', () => {
    const result = engine.assess({
      fingerprint: 'fp_abc',
      applicationId: 'pos',
      deviceCount: 10,
    });
    expect(result.signals).toContain('DEVICE_CHANGE_TOO_FREQUENT');
    expect(result.score).toBeGreaterThan(0);
  });

  it('detects shared license', () => {
    const result = engine.assess({
      fingerprint: 'fp_abc',
      applicationId: 'pos',
      licenseShared: true,
    });
    expect(result.signals).toContain('LICENSE_SHARED');
  });

  it('detects invalid SDK version', () => {
    const result = engine.assess({
      fingerprint: 'fp_abc',
      applicationId: 'pos',
      sdkVersion: '0.9.0',
      validSdkVersions: ['1.1.0', '1.0.0'],
    });
    expect(result.signals).toContain('INVALID_SDK_VERSION');
  });

  it('accumulates score across multiple signals', () => {
    const result = engine.assess({
      fingerprint: 'fp_abc',
      applicationId: 'pos',
      deviceCount: 10,
      loginDeviceCount: 5,
      licenseShared: true,
      workspaceConcurrent: true,
    });
    expect(result.score).toBeGreaterThanOrEqual(50);
    expect(['HIGH', 'CRITICAL']).toContain(result.category);
  });

  it('can add and remove custom rules', () => {
    engine.addRule({
      name: 'INVALID_CONFIGURATION',
      weight: 50,
      evaluate: (input) => input.configurationVersion === 99,
    });
    const result = engine.assess({
      fingerprint: 'fp_abc',
      applicationId: 'pos',
      configurationVersion: 99,
    });
    expect(result.signals).toContain('INVALID_CONFIGURATION');
    engine.removeRule('INVALID_CONFIGURATION');
  });
});

describe('categoryFromScore', () => {
  it('maps score ranges to categories', () => {
    expect(categoryFromScore(0)).toBe('SAFE');
    expect(categoryFromScore(25)).toBe('WARNING');
    expect(categoryFromScore(50)).toBe('HIGH');
    expect(categoryFromScore(75)).toBe('CRITICAL');
    expect(categoryFromScore(100)).toBe('CRITICAL');
  });
});
