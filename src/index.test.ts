import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Kasandra } from './index.js';
import type { AuthSession, Configuration, Workspace, Device, LicenseCheckResult, Metadata, License } from './types/index.js';

function mockResponse(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const sampleSession: AuthSession = {
  accessToken: 'access-123',
  refreshToken: 'refresh-456',
  expiresAt: Date.now() + 3600_000,
  user: {
    id: 'u1',
    email: 'admin@kasandra.io',
    name: 'Admin',
    role: 'owner',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
};

describe('Kasandra SDK', () => {
  let sdk: Kasandra;

  beforeEach(() => {
    sdk = new Kasandra();
    vi.restoreAllMocks();
  });

  it('returns null user before initialize', () => {
    expect(sdk.getCurrentUser()).toBeNull();
  });

  it('initializes with valid config', async () => {
    await sdk.initialize({
      serverUrl: 'https://api.kasandra.io',
      applicationId: 'pos',
      apiKey: 'key-123',
      autoLifecycle: false,
    });
    expect(sdk.isInitialized()).toBe(true);
  });

  it('login stores session and sets current user', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse(200, sampleSession)) as unknown as typeof fetch;

    await sdk.initialize({
      serverUrl: 'https://api.kasandra.io',
      applicationId: 'pos',
      apiKey: 'key-123',
      autoLifecycle: false,
    });

    const session = await sdk.login({ email: 'admin@kasandra.io', password: 'pw' });
    expect(session.accessToken).toBe('access-123');
    expect(sdk.getCurrentUser()?.email).toBe('admin@kasandra.io');
    expect(sdk.isAuthenticated()).toBe(true);
  });

  it('logout clears the session', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockResponse(200, sampleSession))
      .mockResolvedValueOnce(mockResponse(200, { success: true })) as unknown as typeof fetch;

    await sdk.initialize({
      serverUrl: 'https://api.kasandra.io',
      applicationId: 'pos',
      apiKey: 'key-123',
      autoLifecycle: false,
    });

    await sdk.login({ email: 'admin@kasandra.io', password: 'pw' });
    await sdk.logout();
    expect(sdk.getCurrentUser()).toBeNull();
    expect(sdk.isAuthenticated()).toBe(false);
  });

  it('checkLicense returns check result', async () => {
    const result: LicenseCheckResult = { valid: true, status: 'active' };
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse(200, result)) as unknown as typeof fetch;

    await sdk.initialize({
      serverUrl: 'https://api.kasandra.io',
      applicationId: 'pos',
      apiKey: 'key-123',
      autoLifecycle: false,
    });

    const check = await sdk.checkLicense('LIC-123');
    expect(check.valid).toBe(true);
    expect(check.status).toBe('active');
  });

  it('downloadConfiguration returns config', async () => {
    const config: Configuration = {
      applicationId: 'pos',
      version: 2,
      data: { theme: 'dark' },
      updatedAt: '2024-01-01T00:00:00Z',
    };
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse(200, config)) as unknown as typeof fetch;

    await sdk.initialize({
      serverUrl: 'https://api.kasandra.io',
      applicationId: 'pos',
      apiKey: 'key-123',
      autoLifecycle: false,
    });

    const downloaded = await sdk.downloadConfiguration();
    expect(downloaded.version).toBe(2);
    expect(downloaded.data).toEqual({ theme: 'dark' });
  });

  it('syncMetadata returns metadata with version', async () => {
    const meta: Metadata = {
      applicationId: 'pos',
      version: 5,
      entries: { currency: 'IDR' },
      updatedAt: '2024-01-01T00:00:00Z',
    };
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse(200, meta)) as unknown as typeof fetch;

    await sdk.initialize({
      serverUrl: 'https://api.kasandra.io',
      applicationId: 'pos',
      apiKey: 'key-123',
      autoLifecycle: false,
    });

    const result = await sdk.syncMetadata();
    expect(result.metadata.version).toBe(5);
    expect(sdk.getMetadataVersion()).toBe(5);
  });

  it('registerDevice stores the device', async () => {
    const device: Device = {
      id: 'dev-1',
      applicationId: 'pos',
      name: 'POS-01',
      platform: 'windows',
      status: 'active',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse(200, device)) as unknown as typeof fetch;

    await sdk.initialize({
      serverUrl: 'https://api.kasandra.io',
      applicationId: 'pos',
      apiKey: 'key-123',
      autoLifecycle: false,
    });

    const reg = await sdk.registerDevice({
      name: 'POS-01',
      platform: 'windows',
    });
    expect(reg.id).toBe('dev-1');
    expect(sdk.getCurrentDevice()?.name).toBe('POS-01');
  });

  it('getWorkspace returns the workspace', async () => {
    const ws: Workspace = {
      id: 'ws-1',
      name: 'Toko A',
      slug: 'toko-a',
      plan: 'pro',
      status: 'active',
      features: ['pos', 'laundry'],
      limits: { maxUsers: 10, maxDevices: 5, maxApplications: 3, storageMb: 1024 },
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse(200, ws)) as unknown as typeof fetch;

    await sdk.initialize({
      serverUrl: 'https://api.kasandra.io',
      applicationId: 'pos',
      apiKey: 'key-123',
      autoLifecycle: false,
    });

    const workspace = await sdk.getWorkspace();
    expect(workspace.name).toBe('Toko A');
    expect(workspace.plan).toBe('pro');
  });

  it('sendEvent queues and flushes', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse(200, { ok: true })) as unknown as typeof fetch;

    await sdk.initialize({
      serverUrl: 'https://api.kasandra.io',
      applicationId: 'pos',
      apiKey: 'key-123',
      autoLifecycle: false,
    });

    await sdk.sendEvent({ name: 'pos.sale.completed', data: { total: 50000 } });
    await sdk.flushEvents();
    // Event should have been sent as a batch
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it('activateLicense returns the activated license', async () => {
    const license: License = {
      id: 'lic-1',
      key: 'LIC-123',
      applicationId: 'pos',
      deviceId: 'dev-1',
      status: 'active',
      plan: 'pro',
      activatedAt: '2024-01-01T00:00:00Z',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse(200, license)) as unknown as typeof fetch;

    await sdk.initialize({
      serverUrl: 'https://api.kasandra.io',
      applicationId: 'pos',
      apiKey: 'key-123',
      autoLifecycle: false,
    });

    const activated = await sdk.activateLicense({ key: 'LIC-123', deviceId: 'dev-1' });
    expect(activated.status).toBe('active');
  });

  it('dispose stops background timers without throwing', async () => {
    await sdk.initialize({
      serverUrl: 'https://api.kasandra.io',
      applicationId: 'pos',
      apiKey: 'key-123',
      autoLifecycle: false,
    });
    expect(() => sdk.dispose()).not.toThrow();
  });
});
