import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeviceManager } from './device-manager.js';
import { Logger } from '../utils/logger.js';
import { MemoryStorage } from '../storage/memory-storage.js';
import { HttpClient } from '../http/http-client.js';
import type { Device } from '../types/index.js';
import { DeviceError } from '../core/errors.js';

function mockResponse(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const sampleDevice: Device = {
  id: 'dev-1',
  applicationId: 'pos',
  name: 'POS-01',
  platform: 'windows',
  status: 'active',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

describe('DeviceManager', () => {
  let logger: Logger;
  let storage: MemoryStorage;
  let http: HttpClient;

  beforeEach(() => {
    logger = new Logger('error', false);
    storage = new MemoryStorage();
    http = new HttpClient({
      baseUrl: 'https://api.example.com',
      timeout: 5000,
      maxRetries: 0,
      logger,
    });
  });

  it('registers a device with extended profile input', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(mockResponse(200, sampleDevice)),
    ) as unknown as typeof fetch;

    const dm = new DeviceManager({
      http,
      storage,
      logger,
      applicationId: 'pos',
    });

    const device = await dm.register({
      name: 'POS-01',
      platform: 'windows',
      fingerprint: 'fp_abc123',
      os: 'Windows',
      osVersion: '11',
      architecture: 'x64',
      cpu: '8 cores',
      applicationVersion: '1.0.0',
    });

    expect(device.id).toBe('dev-1');
    expect(dm.getCurrentDevice()?.name).toBe('POS-01');
    expect(dm.current()?.fingerprint).toBe('fp_abc123');
  });

  it('throws DeviceError when name is missing', async () => {
    const dm = new DeviceManager({
      http,
      storage,
      logger,
      applicationId: 'pos',
    });

    await expect(
      dm.register({ name: '', platform: 'windows', fingerprint: 'fp' }),
    ).rejects.toThrow(DeviceError);
  });

  it('records history on register and heartbeat', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(mockResponse(200, sampleDevice)),
    ) as unknown as typeof fetch;

    const dm = new DeviceManager({
      http,
      storage,
      logger,
      applicationId: 'pos',
    });

    await dm.register({
      name: 'POS-01',
      platform: 'windows',
      fingerprint: 'fp_abc123',
    });

    await dm.heartbeat({ ip: '10.0.0.1' });

    const history = dm.getHistory();
    expect(history).toHaveLength(2);
    expect(history[0].action).toBe('REGISTER');
    expect(history[1].action).toBe('HEARTBEAT');
  });

  it('checkDuplicate detects matching fingerprints', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(mockResponse(200, sampleDevice)),
    ) as unknown as typeof fetch;

    const dm = new DeviceManager({
      http,
      storage,
      logger,
      applicationId: 'pos',
    });

    await dm.register({
      name: 'POS-01',
      platform: 'windows',
      fingerprint: 'fp_abc123',
    });

    const result = dm.checkDuplicate({
      fingerprint: 'fp_abc123',
      applicationId: 'pos',
      workspaceId: 'ws-1',
    });

    expect(result.isDuplicate).toBe(true);
    expect(result.matchedFields).toContain('fingerprint');
  });

  it('checkRisk returns a risk assessment', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(mockResponse(200, sampleDevice)),
    ) as unknown as typeof fetch;

    const dm = new DeviceManager({
      http,
      storage,
      logger,
      applicationId: 'pos',
    });

    await dm.register({
      name: 'POS-01',
      platform: 'windows',
      fingerprint: 'fp_abc123',
    });

    const risk = dm.checkRisk({ deviceCount: 10, loginDeviceCount: 5 });
    expect(risk.score).toBeGreaterThan(0);
    expect(risk.signals).toContain('DEVICE_CHANGE_TOO_FREQUENT');
    expect(risk.signals).toContain('LOGIN_FROM_MANY_DEVICES');
  });

  it('checkRisk returns SAFE for clean device', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(mockResponse(200, sampleDevice)),
    ) as unknown as typeof fetch;

    const dm = new DeviceManager({
      http,
      storage,
      logger,
      applicationId: 'pos',
    });

    await dm.register({
      name: 'POS-01',
      platform: 'windows',
      fingerprint: 'fp_abc123',
    });

    const risk = dm.checkRisk();
    expect(risk.score).toBe(0);
    expect(risk.category).toBe('SAFE');
  });

  it('throws DeviceError when no device for heartbeat', async () => {
    const dm = new DeviceManager({
      http,
      storage,
      logger,
      applicationId: 'pos',
    });

    await expect(dm.heartbeat()).rejects.toThrow(DeviceError);
  });

  it('throws DeviceError when no profile for checkDuplicate', async () => {
    const dm = new DeviceManager({
      http,
      storage,
      logger,
      applicationId: 'pos',
    });

    expect(() =>
      dm.checkDuplicate({ fingerprint: 'fp', applicationId: 'pos' }),
    ).toThrow(DeviceError);
  });

  it('deactivate clears the device and profile', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/deactivate')) {
        return Promise.resolve(mockResponse(200, { deviceId: 'dev-1', deactivated: true }));
      }
      return Promise.resolve(mockResponse(200, sampleDevice));
    }) as unknown as typeof fetch;

    const dm = new DeviceManager({
      http,
      storage,
      logger,
      applicationId: 'pos',
    });

    await dm.register({
      name: 'POS-01',
      platform: 'windows',
      fingerprint: 'fp_abc123',
    });

    const result = await dm.deactivate();
    expect(result.deactivated).toBe(true);
    expect(dm.getCurrentDevice()).toBeNull();
    expect(dm.current()).toBeNull();
  });
});
