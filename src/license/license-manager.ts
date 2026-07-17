import { LicenseError } from '../core/errors.js';
import type { HttpClient } from '../http/http-client.js';
import type { Logger } from '../utils/logger.js';
import type { StorageAdapter } from '../storage/types.js';
import type {
  License,
  LicenseActivationPayload,
  LicenseCheckResult,
  LicenseGraceConfig,
  LicenseValidationResult,
} from '../types/index.js';

const LICENSE_KEY = 'kasandra:license:cached';

interface LicenseManagerDeps {
  http: HttpClient;
  storage: StorageAdapter;
  logger: Logger;
  applicationId: string;
  licenseCheckEndpoint?: string;
  licenseActivateEndpoint?: string;
  licenseDeactivateEndpoint?: string;
  licenseValidateEndpoint?: string;
}

const DEFAULT_GRACE: LicenseGraceConfig = {
  gracePeriodMs: 24 * 60 * 60 * 1000, // 24 hours
  allowOffline: true,
};

/**
 * Full license manager: check, activate, deactivate, validate with
 * workspace/device validation, offline grace period, and expire detection.
 */
export class LicenseManager {
  private deps: LicenseManagerDeps;
  private cachedLicense: License | null = null;
  private graceConfig: LicenseGraceConfig = DEFAULT_GRACE;
  private lastValidatedAt: number | null = null;

  constructor(deps: LicenseManagerDeps) {
    this.deps = deps;
  }

  setGraceConfig(config: LicenseGraceConfig): void {
    this.graceConfig = config;
  }

  async check(key: string): Promise<LicenseCheckResult> {
    if (!key) {
      throw new LicenseError('License key is required');
    }
    const endpoint = this.deps.licenseCheckEndpoint ?? '/license/check';
    const response = await this.deps.http.post<LicenseCheckResult>(
      endpoint,
      { key, applicationId: this.deps.applicationId },
    );
    if (!response.ok) {
      throw new LicenseError(
        'License check failed',
        response.status,
        response.data,
      );
    }
    this.deps.logger.debug(
      `License check: ${response.data.valid ? 'valid' : 'invalid'}`,
    );
    return response.data;
  }

  async activate(payload: LicenseActivationPayload): Promise<License> {
    if (!payload.key || !payload.deviceId) {
      throw new LicenseError('License key and deviceId are required');
    }
    const endpoint = this.deps.licenseActivateEndpoint ?? '/license/activate';
    const response = await this.deps.http.post<License>(
      endpoint,
      { ...payload, applicationId: this.deps.applicationId },
    );
    if (!response.ok) {
      throw new LicenseError(
        'License activation failed',
        response.status,
        response.data,
      );
    }
    this.cachedLicense = response.data;
    await this.persist(response.data);
    this.deps.logger.info(`License activated: ${payload.key}`);
    return response.data;
  }

  async deactivate(key: string, deviceId: string): Promise<void> {
    if (!key || !deviceId) {
      throw new LicenseError('License key and deviceId are required');
    }
    const endpoint = this.deps.licenseDeactivateEndpoint ?? '/license/deactivate';
    const response = await this.deps.http.post(endpoint, {
      key,
      deviceId,
      applicationId: this.deps.applicationId,
    });
    if (!response.ok) {
      throw new LicenseError(
        'License deactivation failed',
        response.status,
        response.data,
      );
    }
    this.cachedLicense = null;
    await this.deps.storage.remove(LICENSE_KEY);
    this.deps.logger.info(`License deactivated: ${key}`);
  }

  /**
   * Full license validation: status, workspace binding, device binding,
   * expiry, and offline grace period.
   */
  async validate(
    key: string,
    options?: {
      expectedWorkspaceId?: string;
      expectedDeviceId?: string;
    },
  ): Promise<LicenseValidationResult> {
    const endpoint = this.deps.licenseValidateEndpoint ?? '/license/validate';
    const response = await this.deps.http.post<LicenseValidationResult>(
      endpoint,
      {
        key,
        applicationId: this.deps.applicationId,
        workspaceId: options?.expectedWorkspaceId,
        deviceId: options?.expectedDeviceId,
      },
    );
    if (!response.ok) {
      throw new LicenseError(
        'License validation failed',
        response.status,
        response.data,
      );
    }
    const result = response.data;
    this.lastValidatedAt = Date.now();

    if (result.license) {
      this.cachedLicense = result.license;
      await this.persist(result.license);
    }

    this.deps.logger.debug(
      `License validated: valid=${result.valid}, grace=${result.inGracePeriod}`,
    );
    return result;
  }

  /** Check if a cached license is within its grace period. */
  isInGracePeriod(): boolean {
    if (!this.cachedLicense?.expiresAt) return false;
    const expiry = new Date(this.cachedLicense.expiresAt).getTime();
    if (Date.now() < expiry) return false;
    return Date.now() - expiry < this.graceConfig.gracePeriodMs;
  }

  /** Detect if the cached license has expired. */
  isExpired(): boolean {
    if (!this.cachedLicense?.expiresAt) return false;
    return new Date(this.cachedLicense.expiresAt).getTime() < Date.now();
  }

  /** Get the cached license. */
  getCachedLicense(): License | null {
    return this.cachedLicense;
  }

  /** Time of the last successful validation. */
  getLastValidatedAt(): number | null {
    return this.lastValidatedAt;
  }

  async restore(): Promise<void> {
    const raw = await this.deps.storage.get(LICENSE_KEY);
    if (raw) {
      try {
        this.cachedLicense = JSON.parse(raw) as License;
      } catch {
        await this.deps.storage.remove(LICENSE_KEY);
      }
    }
  }

  async clear(): Promise<void> {
    this.cachedLicense = null;
    this.lastValidatedAt = null;
    await this.deps.storage.remove(LICENSE_KEY);
  }

  private async persist(license: License): Promise<void> {
    await this.deps.storage.set(LICENSE_KEY, JSON.stringify(license));
  }
}
