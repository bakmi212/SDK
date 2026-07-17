import {
  createHmac,
  timingSafeEqual,
  createCipheriv,
  createDecipheriv,
  randomBytes,
  generateKeyPairSync,
  publicEncrypt,
  privateDecrypt,
  createHash,
} from 'node:crypto';
import type {
  LicenseValidationInput,
  ReplayProtectionInput,
  SecurityCheckResult,
  SecurityValidationResult,
  SignatureValidationInput,
  TokenValidationInput,
} from '../types/index.js';

const DEFAULT_REPLAY_MAX_AGE = 5 * 60 * 1000;
const seenNonces = new Map<string, number>();

/**
 * Security module. Performs signature validation, replay protection,
 * token validation, and license validation without touching the network.
 */
export class SecurityModule {
  private defaultIssuer: string;
  private defaultAudience: string;

  constructor(options?: { issuer?: string; audience?: string }) {
    this.defaultIssuer = options?.issuer ?? 'kasandra';
    this.defaultAudience = options?.audience ?? 'kasandra-sdk';
  }

  /** Run all four security checks and aggregate the result. */
  validate(
    signature: SignatureValidationInput,
    replay: ReplayProtectionInput,
    token: TokenValidationInput,
    license: LicenseValidationInput,
  ): SecurityValidationResult {
    const checks: SecurityCheckResult[] = [];
    const errors: string[] = [];

    const sigCheck = this.validateSignature(signature);
    checks.push(sigCheck);
    if (!sigCheck.passed) errors.push(sigCheck.message ?? 'Signature invalid');

    const replayCheck = this.validateReplay(replay);
    checks.push(replayCheck);
    if (!replayCheck.passed) errors.push(replayCheck.message ?? 'Replay detected');

    const tokenCheck = this.validateToken(token);
    checks.push(tokenCheck);
    if (!tokenCheck.passed) errors.push(tokenCheck.message ?? 'Token invalid');

    const licenseCheck = this.validateLicense(license);
    checks.push(licenseCheck);
    if (!licenseCheck.passed) errors.push(licenseCheck.message ?? 'License invalid');

    return {
      valid: checks.every((c) => c.passed),
      checks,
      errors,
    };
  }

  validateSignature(input: SignatureValidationInput): SecurityCheckResult {
    if (!input.payload || !input.signature || !input.secret) {
      return { name: 'SIGNATURE', passed: false, message: 'Missing fields' };
    }
    const expected = createHmac('sha256', input.secret)
      .update(input.payload)
      .digest('hex');
    try {
      const a = Buffer.from(input.signature, 'hex');
      const b = Buffer.from(expected, 'hex');
      if (a.length !== b.length) {
        return { name: 'SIGNATURE', passed: false, message: 'Signature mismatch' };
      }
      const match = timingSafeEqual(a, b);
      return {
        name: 'SIGNATURE',
        passed: match,
        message: match ? undefined : 'Signature mismatch',
      };
    } catch {
      return { name: 'SIGNATURE', passed: false, message: 'Invalid signature format' };
    }
  }

  validateReplay(input: ReplayProtectionInput): SecurityCheckResult {
    const maxAge = input.maxAgeMs ?? DEFAULT_REPLAY_MAX_AGE;
    const now = Date.now();
    const age = now - input.timestamp;

    if (age > maxAge) {
      return {
        name: 'REPLAY_PROTECTION',
        passed: false,
        message: `Timestamp expired by ${age - maxAge}ms`,
      };
    }

    const seen = seenNonces.get(input.nonce);
    if (seen !== undefined) {
      return {
        name: 'REPLAY_PROTECTION',
        passed: false,
        message: 'Nonce already seen',
      };
    }

    seenNonces.set(input.nonce, now);
    return { name: 'REPLAY_PROTECTION', passed: true };
  }

  validateToken(input: TokenValidationInput): SecurityCheckResult {
    if (!input.token) {
      return { name: 'TOKEN_VALIDITY', passed: false, message: 'Token missing' };
    }

    const parts = input.token.split('.');
    if (parts.length !== 3) {
      return {
        name: 'TOKEN_VALIDITY',
        passed: false,
        message: 'Malformed token',
      };
    }

    try {
      const payload = JSON.parse(
        Buffer.from(parts[1], 'base64url').toString('utf8'),
      ) as Record<string, unknown>;

      const exp = payload.exp as number | undefined;
      if (exp && Date.now() >= exp * 1000) {
        return {
          name: 'TOKEN_VALIDITY',
          passed: false,
          message: 'Token expired',
        };
      }

      if (input.expectedIssuer && payload.iss !== input.expectedIssuer) {
        return {
          name: 'TOKEN_VALIDITY',
          passed: false,
          message: 'Issuer mismatch',
        };
      }

      if (
        input.expectedAudience &&
        payload.aud !== input.expectedAudience
      ) {
        return {
          name: 'TOKEN_VALIDITY',
          passed: false,
          message: 'Audience mismatch',
        };
      }

      if (payload.iss && payload.iss !== this.defaultIssuer) {
        return {
          name: 'TOKEN_VALIDITY',
          passed: false,
          message: 'Unexpected issuer',
        };
      }

      if (payload.aud && payload.aud !== this.defaultAudience) {
        return {
          name: 'TOKEN_VALIDITY',
          passed: false,
          message: 'Unexpected audience',
        };
      }

      return { name: 'TOKEN_VALIDITY', passed: true };
    } catch {
      return {
        name: 'TOKEN_VALIDITY',
        passed: false,
        message: 'Invalid token payload',
      };
    }
  }

  validateLicense(input: LicenseValidationInput): SecurityCheckResult {
    if (!input.key) {
      return {
        name: 'LICENSE_VALIDITY',
        passed: false,
        message: 'License key missing',
      };
    }
    if (!input.applicationId) {
      return {
        name: 'LICENSE_VALIDITY',
        passed: false,
        message: 'Application ID missing',
      };
    }
    if (input.key.length < 8) {
      return {
        name: 'LICENSE_VALIDITY',
        passed: false,
        message: 'License key too short',
      };
    }
    return { name: 'LICENSE_VALIDITY', passed: true };
  }

  /** Clear the in-memory nonce cache. Useful for testing. */
  static clearNonceCache(): void {
    seenNonces.clear();
  }

  // ─── AES Encryption ─────────────────────────────────────────

  /** Encrypt data using AES-256-CBC. Returns base64-encoded ciphertext + IV. */
  encryptAES(data: string, key: string): string {
    const keyBuf = Buffer.from(key.padEnd(32, '0').slice(0, 32), 'utf8');
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-cbc', keyBuf, iv);
    const encrypted = Buffer.concat([
      cipher.update(data, 'utf8'),
      cipher.final(),
    ]);
    return `${iv.toString('base64')}:${encrypted.toString('base64')}`;
  }

  /** Decrypt AES-256-CBC encrypted data. */
  decryptAES(encryptedData: string, key: string): string {
    const [ivB64, dataB64] = encryptedData.split(':');
    if (!ivB64 || !dataB64) {
      throw new Error('Invalid encrypted data format');
    }
    const keyBuf = Buffer.from(key.padEnd(32, '0').slice(0, 32), 'utf8');
    const iv = Buffer.from(ivB64, 'base64');
    const decipher = createDecipheriv('aes-256-cbc', keyBuf, iv);
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }

  // ─── RSA Encryption ─────────────────────────────────────────

  /** Generate an RSA key pair. Returns PEM-encoded keys. */
  generateRSAKeyPair(): { publicKey: string; privateKey: string } {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    return { publicKey, privateKey };
  }

  /** Encrypt data using an RSA public key. */
  encryptRSA(data: string, publicKey: string): string {
    const encrypted = publicEncrypt(publicKey, Buffer.from(data, 'utf8'));
    return encrypted.toString('base64');
  }

  /** Decrypt data using an RSA private key. */
  decryptRSA(encryptedData: string, privateKey: string): string {
    const decrypted = privateDecrypt(
      privateKey,
      Buffer.from(encryptedData, 'base64'),
    );
    return decrypted.toString('utf8');
  }

  // ─── JWT ────────────────────────────────────────────────────

  /** Create a simple JWT token (HS256). */
  createJWT(
    payload: Record<string, unknown>,
    secret: string,
    expiresInSec?: number,
  ): string {
    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const fullPayload = {
      ...payload,
      iat: now,
      ...(expiresInSec ? { exp: now + expiresInSec } : {}),
    };
    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
    const signature = createHmac('sha256', secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');
    return `${headerB64}.${payloadB64}.${signature}`;
  }

  /** Verify a JWT token signature and return the payload. */
  verifyJWT(token: string, secret: string): Record<string, unknown> | null {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, signature] = parts;
    const expected = createHmac('sha256', secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');
    try {
      const a = Buffer.from(signature, 'base64url');
      const b = Buffer.from(expected, 'base64url');
      if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    } catch {
      return null;
    }
    const payload = JSON.parse(
      Buffer.from(payloadB64!, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
    const exp = payload.exp as number | undefined;
    if (exp && Date.now() >= exp * 1000) return null;
    return payload;
  }

  // ─── Checksum ───────────────────────────────────────────────

  /** Compute a SHA-256 checksum of the input data. */
  checksum(data: string): string {
    return createHash('sha256').update(data).digest('hex');
  }

  /** Verify a SHA-256 checksum matches the input data. */
  verifyChecksum(data: string, expectedChecksum: string): boolean {
    return this.checksum(data) === expectedChecksum;
  }

  // ─── Nonce ──────────────────────────────────────────────────

  /** Generate a cryptographically random nonce. */
  generateNonce(length = 32): string {
    return randomBytes(length).toString('hex');
  }
}
