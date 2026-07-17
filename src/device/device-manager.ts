import { DeviceError } from '../core/errors.js';
import type { HttpClient } from '../http/http-client.js';
import type { Logger } from '../utils/logger.js';
import type { StorageAdapter } from '../storage/types.js';
import type {
  Device,
  DeviceAction,
  DeviceDeactivateResult,
  DeviceHeartbeatPayload,
  DeviceHistoryEntry,
  DeviceProfile,
  DeviceRegistrationInput,
  DeviceRegistrationPayload,
  DeviceReplaceResult,
  DeviceVerifyResult,
  DuplicateCheckInput,
  DuplicateCheckResult,
  ExtendedDeviceStatus,
  FraudAssessmentInput,
  RiskAssessment,
} from '../types/index.js';
import { DuplicateEngine, FraudEngine } from '../fraud/fraud-engine.js';
import { generateId } from '../utils/helpers.js';

const STORAGE_KEY = 'kasandra:device';
const PROFILE_KEY = 'kasandra:device:profile';
const HISTORY_KEY = 'kasandra:device:history';
const SDK_VERSION = '1.1.0';

interface DeviceManagerDeps {
  http: HttpClient;
  storage: StorageAdapter;
  logger: Logger;
  applicationId: string;
  sdkVersion?: string;
  endpoints?: {
    register?: string;
    verify?: string;
    heartbeat?: string;
    replace?: string;
    deactivate?: string;
  };
}

/**
 * Full device lifecycle manager. Handles registration with device profiles,
 * heartbeats with runtime context, verification, replacement, deactivation,
 * duplicate detection, risk assessment, and activity history tracking.
 *
 * Maintains backward compatibility with the original register() / heartbeat()
 * API while adding the extended v1.1 methods.
 */
export class DeviceManager {
  private deps: DeviceManagerDeps;
  private currentDevice: Device | null = null;
  private currentProfile: DeviceProfile | null = null;
  private history: DeviceHistoryEntry[] = [];
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private duplicateEngine: DuplicateEngine;
  private fraudEngine: FraudEngine;

  constructor(deps: DeviceManagerDeps) {
    this.deps = deps;
    this.duplicateEngine = new DuplicateEngine();
    this.fraudEngine = new FraudEngine();
  }

  // ─── Registration ───────────────────────────────────────────

  /**
   * Register a device. Accepts the original simple payload or the extended
   * v1.1 profile input. When a fingerprint is provided, a full device profile
   * is created and stored.
   */
  async register(
    payload: DeviceRegistrationPayload | DeviceRegistrationInput,
  ): Promise<Device> {
    if (!payload.name || !payload.platform) {
      throw new DeviceError('Device name and platform are required');
    }

    const isExtended = 'fingerprint' in payload && !!payload.fingerprint;
    const body: Record<string, unknown> = {
      ...payload,
      applicationId: this.deps.applicationId,
    };

    const response = await this.deps.http.post<Device>(
      this.deps.endpoints?.register ?? '/devices/register',
      body,
    );
    if (!response.ok) {
      throw new DeviceError(
        'Device registration failed',
        response.status,
        response.data,
      );
    }

    this.currentDevice = response.data;
    await this.persist(response.data);

    if (isExtended) {
      const profile = this.buildProfile(response.data, payload as DeviceRegistrationInput);
      this.currentProfile = profile;
      await this.deps.storage.set(PROFILE_KEY, JSON.stringify(profile));
    }

    this.recordHistory(response.data.id, 'REGISTER');
    this.deps.logger.info(`Device registered: ${response.data.name}`);
    return response.data;
  }

  /**
   * Heartbeat. Accepts optional metadata for the original API or a full
   * heartbeat payload for v1.1.
   */
  async heartbeat(
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    if (!this.currentDevice) {
      throw new DeviceError('No device registered. Call register() first.');
    }

    const payload: DeviceHeartbeatPayload = {
      deviceId: this.currentDevice.id,
      fingerprint: this.currentProfile?.fingerprint ?? '',
      lastSeenAt: new Date().toISOString(),
      sdkVersion: this.deps.sdkVersion ?? SDK_VERSION,
      applicationVersion: this.currentProfile?.applicationVersion ?? '',
      workspaceId: this.currentProfile?.workspaceId,
      memberId: this.currentProfile?.memberId,
      metadata,
    };

    await this.deps.http.post(this.deps.endpoints?.heartbeat ?? '/devices/heartbeat', payload);

    if (this.currentProfile) {
      this.currentProfile.lastSeenAt = payload.lastSeenAt;
      await this.deps.storage.set(PROFILE_KEY, JSON.stringify(this.currentProfile));
    }

    this.recordHistory(this.currentDevice.id, 'HEARTBEAT');
    this.deps.logger.debug('Heartbeat sent');
  }

  /** Start an interval that sends heartbeats at the given cadence (ms). */
  startHeartbeat(intervalMs = 60_000): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      void this.heartbeat().catch((error) => {
        this.deps.logger.warning('Heartbeat failed', error);
      });
    }, intervalMs);
  }

  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /** Return the current device (legacy Device shape). */
  getCurrentDevice(): Device | null {
    return this.currentDevice;
  }

  /** Return the extended device profile, or null. */
  current(): DeviceProfile | null {
    return this.currentProfile;
  }

  // ─── Verification ───────────────────────────────────────────

  /** Verify the current device's fingerprint and status. */
  async verify(): Promise<DeviceVerifyResult> {
    if (!this.currentProfile) {
      throw new DeviceError('No device profile. Register with a fingerprint first.');
    }
    const response = await this.deps.http.get<DeviceVerifyResult>(
      `/devices/${this.currentDevice?.id ?? this.currentProfile.id}/verify`,
    );
    if (!response.ok) {
      throw new DeviceError(
        'Device verification failed',
        response.status,
        response.data,
      );
    }
    this.recordHistory(this.currentProfile.id, 'DEVICE_CHANGE');
    return response.data;
  }

  // ─── Replace ────────────────────────────────────────────────

  /** Replace the current device with a new one. The old device is deactivated. */
  async replace(
    input: DeviceRegistrationInput,
  ): Promise<DeviceReplaceResult> {
    if (!this.currentProfile) {
      throw new DeviceError('No current device to replace.');
    }

    const oldDeviceId = this.currentProfile.id;
    const response = await this.deps.http.post<Device>(
      this.deps.endpoints?.replace ?? '/devices/replace',
      {
        oldDeviceId,
        ...input,
        applicationId: this.deps.applicationId,
      },
    );
    if (!response.ok) {
      throw new DeviceError(
        'Device replacement failed',
        response.status,
        response.data,
      );
    }

    const newProfile = this.buildProfile(response.data, input);
    this.currentDevice = response.data;
    this.currentProfile = newProfile;
    await this.persist(response.data);
    await this.deps.storage.set(PROFILE_KEY, JSON.stringify(newProfile));

    this.recordHistory(oldDeviceId, 'DEVICE_REPLACED', {
      newDeviceId: response.data.id,
    });
    this.recordHistory(response.data.id, 'REGISTER');

    this.deps.logger.info(`Device replaced: ${oldDeviceId} → ${response.data.id}`);
    return { oldDeviceId, newDevice: newProfile };
  }

  // ─── Deactivate ─────────────────────────────────────────────

  /** Deactivate the current device. */
  async deactivate(): Promise<DeviceDeactivateResult> {
    const deviceId = this.currentDevice?.id ?? this.currentProfile?.id;
    if (!deviceId) {
      throw new DeviceError('No device to deactivate.');
    }

    const response = await this.deps.http.post<DeviceDeactivateResult>(
      this.deps.endpoints?.deactivate ?? '/devices/deactivate',
      { deviceId, applicationId: this.deps.applicationId },
    );
    if (!response.ok) {
      throw new DeviceError(
        'Device deactivation failed',
        response.status,
        response.data,
      );
    }

    this.recordHistory(deviceId, 'DEVICE_REMOVED');
    this.stopHeartbeat();
    this.currentDevice = null;
    this.currentProfile = null;
    await this.deps.storage.remove(STORAGE_KEY);
    await this.deps.storage.remove(PROFILE_KEY);

    this.deps.logger.info(`Device deactivated: ${deviceId}`);
    return response.data;
  }

  // ─── Duplicate Detection ────────────────────────────────────

  /** Check the current device against a known device for duplication. */
  checkDuplicate(known: DuplicateCheckInput): DuplicateCheckResult {
    if (!this.currentProfile) {
      throw new DeviceError('No device profile for duplicate check.');
    }
    const input: DuplicateCheckInput = {
      fingerprint: this.currentProfile.fingerprint,
      applicationId: this.deps.applicationId,
      workspaceId: this.currentProfile.workspaceId,
      memberId: this.currentProfile.memberId,
    };
    const result = this.duplicateEngine.check(input, known);
    if (result.isDuplicate) {
      this.recordHistory(this.currentProfile.id, 'DEVICE_DUPLICATE', {
        level: result.level,
        score: result.score,
      });
    }
    return result;
  }

  // ─── Risk Assessment ────────────────────────────────────────

  /** Assess fraud risk for the current device context. */
  checkRisk(
    overrides?: Partial<FraudAssessmentInput>,
  ): RiskAssessment {
    if (!this.currentProfile) {
      throw new DeviceError('No device profile for risk assessment.');
    }
    const input: FraudAssessmentInput = {
      deviceId: this.currentProfile.id,
      fingerprint: this.currentProfile.fingerprint,
      applicationId: this.deps.applicationId,
      workspaceId: this.currentProfile.workspaceId,
      memberId: this.currentProfile.memberId,
      sdkVersion: this.currentProfile.sdkVersion,
      ...overrides,
    };
    const assessment = this.fraudEngine.assess(input);
    if (assessment.category === 'HIGH' || assessment.category === 'CRITICAL') {
      this.recordHistory(this.currentProfile.id, 'DEVICE_FRAUD_DETECTED', {
        score: assessment.score,
        category: assessment.category,
        signals: assessment.signals,
      });
    }
    return assessment;
  }

  // ─── History ────────────────────────────────────────────────

  /** Return the full device activity history. */
  getHistory(): DeviceHistoryEntry[] {
    return [...this.history];
  }

  /** Record an activity in device history and persist it. */
  recordHistory(
    deviceId: string,
    action: DeviceAction,
    metadata?: Record<string, unknown>,
  ): DeviceHistoryEntry {
    const entry: DeviceHistoryEntry = {
      id: generateId('hist'),
      deviceId,
      action,
      timestamp: Date.now(),
      workspaceId: this.currentProfile?.workspaceId,
      memberId: this.currentProfile?.memberId,
      metadata,
    };
    this.history.push(entry);
    void this.persistHistory();
    return entry;
  }

  // ─── Persistence ────────────────────────────────────────────

  async restore(): Promise<void> {
    const raw = await this.deps.storage.get(STORAGE_KEY);
    if (raw) {
      try {
        this.currentDevice = JSON.parse(raw) as Device;
      } catch {
        await this.deps.storage.remove(STORAGE_KEY);
      }
    }
    const profileRaw = await this.deps.storage.get(PROFILE_KEY);
    if (profileRaw) {
      try {
        this.currentProfile = JSON.parse(profileRaw) as DeviceProfile;
      } catch {
        await this.deps.storage.remove(PROFILE_KEY);
      }
    }
    const historyRaw = await this.deps.storage.get(HISTORY_KEY);
    if (historyRaw) {
      try {
        this.history = JSON.parse(historyRaw) as DeviceHistoryEntry[];
      } catch {
        await this.deps.storage.remove(HISTORY_KEY);
      }
    }
  }

  async clear(): Promise<void> {
    this.stopHeartbeat();
    this.currentDevice = null;
    this.currentProfile = null;
    this.history = [];
    await this.deps.storage.remove(STORAGE_KEY);
    await this.deps.storage.remove(PROFILE_KEY);
    await this.deps.storage.remove(HISTORY_KEY);
  }

  private async persist(device: Device): Promise<void> {
    await this.deps.storage.set(STORAGE_KEY, JSON.stringify(device));
  }

  private async persistHistory(): Promise<void> {
    await this.deps.storage.set(HISTORY_KEY, JSON.stringify(this.history));
  }

  private buildProfile(
    device: Device,
    input: DeviceRegistrationInput,
  ): DeviceProfile {
    return {
      id: device.id,
      fingerprint: input.fingerprint,
      name: input.name,
      platform: input.platform,
      os: input.os ?? 'unknown',
      osVersion: input.osVersion ?? 'unknown',
      architecture: input.architecture ?? 'unknown',
      cpu: input.cpu ?? 'unknown',
      applicationVersion: input.applicationVersion ?? '',
      sdkVersion: this.deps.sdkVersion ?? SDK_VERSION,
      timezone: input.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      locale: input.locale ?? 'en-US',
      firstRegisteredAt: device.createdAt,
      lastSeenAt: device.updatedAt,
      status: 'ACTIVE' as ExtendedDeviceStatus,
      workspaceId: input.workspaceId,
      memberId: input.memberId,
      metadata: input.metadata,
    };
  }
}
