import { describe, it, expect, beforeEach } from 'vitest';
import { SecurityModule } from './security-module.js';
import { createHmac } from 'node:crypto';

describe('SecurityModule — Crypto', () => {
  let security: SecurityModule;

  beforeEach(() => {
    SecurityModule.clearNonceCache();
    security = new SecurityModule();
  });

  it('encrypts and decrypts with AES', () => {
    const data = 'sensitive payload';
    const key = 'my-secret-key';
    const encrypted = security.encryptAES(data, key);
    expect(encrypted).not.toBe(data);
    const decrypted = security.decryptAES(encrypted, key);
    expect(decrypted).toBe(data);
  });

  it('generates and uses RSA key pairs', () => {
    const { publicKey, privateKey } = security.generateRSAKeyPair();
    const data = 'rsa test data';
    const encrypted = security.encryptRSA(data, publicKey);
    const decrypted = security.decryptRSA(encrypted, privateKey);
    expect(decrypted).toBe(data);
  });

  it('creates and verifies JWT tokens', () => {
    const payload = { userId: 'u1', role: 'admin' };
    const secret = 'jwt-secret';
    const token = security.createJWT(payload, secret, 3600);
    expect(token.split('.').length).toBe(3);

    const verified = security.verifyJWT(token, secret);
    expect(verified).not.toBeNull();
    expect(verified?.userId).toBe('u1');
  });

  it('rejects tampered JWT', () => {
    const token = security.createJWT({ userId: 'u1' }, 'secret');
    const tampered = token.slice(0, -2) + 'xx';
    const result = security.verifyJWT(tampered, 'secret');
    expect(result).toBeNull();
  });

  it('rejects expired JWT', () => {
    const token = security.createJWT({ userId: 'u1' }, 'secret', -1);
    const result = security.verifyJWT(token, 'secret');
    expect(result).toBeNull();
  });

  it('computes and verifies checksums', () => {
    const data = 'checksum test';
    const checksum = security.checksum(data);
    expect(security.verifyChecksum(data, checksum)).toBe(true);
    expect(security.verifyChecksum('tampered', checksum)).toBe(false);
  });

  it('generates unique nonces', () => {
    const nonce1 = security.generateNonce();
    const nonce2 = security.generateNonce();
    expect(nonce1).not.toBe(nonce2);
    expect(nonce1.length).toBe(64); // 32 bytes hex
  });

  it('validates HMAC signatures', () => {
    const payload = '{"data":"test"}';
    const secret = 'my-secret';
    const signature = createHmac('sha256', secret).update(payload).digest('hex');
    const result = security.validateSignature({ payload, signature, secret });
    expect(result.passed).toBe(true);
  });
});
