import { describe, it, expect, beforeEach } from 'vitest';
import { SecurityModule } from './security-module.js';
import { createHmac } from 'node:crypto';

describe('SecurityModule', () => {
  let security: SecurityModule;

  beforeEach(() => {
    SecurityModule.clearNonceCache();
    security = new SecurityModule();
  });

  it('validates a correct HMAC signature', () => {
    const payload = '{"data":"test"}';
    const secret = 'my-secret';
    const signature = createHmac('sha256', secret).update(payload).digest('hex');

    const result = security.validateSignature({ payload, signature, secret });
    expect(result.passed).toBe(true);
  });

  it('rejects an incorrect signature', () => {
    const result = security.validateSignature({
      payload: 'test',
      signature: 'aabbccdd',
      secret: 'my-secret',
    });
    expect(result.passed).toBe(false);
    expect(result.message).toContain('mismatch');
  });

  it('rejects missing signature fields', () => {
    const result = security.validateSignature({
      payload: '',
      signature: '',
      secret: '',
    });
    expect(result.passed).toBe(false);
  });

  it('passes replay protection for fresh nonce', () => {
    const result = security.validateReplay({
      timestamp: Date.now(),
      nonce: 'unique-nonce-1',
    });
    expect(result.passed).toBe(true);
  });

  it('rejects replayed nonce', () => {
    const input = { timestamp: Date.now(), nonce: 'replay-test' };
    security.validateReplay(input);
    const result = security.validateReplay(input);
    expect(result.passed).toBe(false);
    expect(result.message).toContain('Nonce already seen');
  });

  it('rejects expired timestamp', () => {
    const result = security.validateReplay({
      timestamp: Date.now() - 10 * 60 * 1000,
      nonce: 'expired-nonce',
    });
    expect(result.passed).toBe(false);
    expect(result.message).toContain('expired');
  });

  it('validates a well-formed JWT token', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600, iss: 'kasandra', aud: 'kasandra-sdk' }),
    ).toString('base64url');
    const token = `${header}.${payload}.signature`;

    const result = security.validateToken({ token });
    expect(result.passed).toBe(true);
  });

  it('rejects an expired token', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ exp: Math.floor(Date.now() / 1000) - 100 }),
    ).toString('base64url');
    const token = `${header}.${payload}.signature`;

    const result = security.validateToken({ token });
    expect(result.passed).toBe(false);
    expect(result.message).toContain('expired');
  });

  it('rejects malformed token', () => {
    const result = security.validateToken({ token: 'not-a-jwt' });
    expect(result.passed).toBe(false);
    expect(result.message).toContain('Malformed');
  });

  it('validates a license key with application id', () => {
    const result = security.validateLicense({
      key: 'LIC-12345678',
      applicationId: 'pos',
    });
    expect(result.passed).toBe(true);
  });

  it('rejects a short license key', () => {
    const result = security.validateLicense({
      key: 'LIC',
      applicationId: 'pos',
    });
    expect(result.passed).toBe(false);
  });

  it('rejects missing license key', () => {
    const result = security.validateLicense({ key: '', applicationId: 'pos' });
    expect(result.passed).toBe(false);
  });

  it('aggregate validate returns all checks', () => {
    SecurityModule.clearNonceCache();
    const payload = '{"data":"test"}';
    const secret = 'my-secret';
    const signature = createHmac('sha256', secret).update(payload).digest('hex');
    const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url');
    const jwtPayload = Buffer.from(
      JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600, iss: 'kasandra', aud: 'kasandra-sdk' }),
    ).toString('base64url');
    const token = `${header}.${jwtPayload}.sig`;

    const result = security.validate(
      { payload, signature, secret },
      { timestamp: Date.now(), nonce: 'aggregate-test' },
      { token },
      { key: 'LIC-12345678', applicationId: 'pos' },
    );

    expect(result.valid).toBe(true);
    expect(result.checks).toHaveLength(4);
    expect(result.errors).toHaveLength(0);
  });
});
