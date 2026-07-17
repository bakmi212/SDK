import { describe, it, expect, vi } from 'vitest';
import { PluginManager } from './plugin-manager.js';
import { SDKError } from '../core/errors.js';
import { Logger } from '../utils/logger.js';
import type { SDKPlugin } from '../types/index.js';

describe('PluginManager', () => {
  it('registers and installs a plugin', async () => {
    const logger = new Logger('error', false);
    const pm = new PluginManager({
      applicationId: 'pos',
      logger,
      sendEvent: vi.fn().mockResolvedValue(undefined),
    });

    let installed = false;
    const plugin: SDKPlugin = {
      name: 'cloudflare',
      version: '1.0.0',
      install: () => {
        installed = true;
      },
    };

    const result = await pm.register(plugin);
    expect(result.installed).toBe(true);
    expect(installed).toBe(true);
    expect(pm.isRegistered('cloudflare')).toBe(true);
  });

  it('throws on duplicate registration', async () => {
    const logger = new Logger('error', false);
    const pm = new PluginManager({
      applicationId: 'pos',
      logger,
      sendEvent: vi.fn().mockResolvedValue(undefined),
    });

    const plugin: SDKPlugin = { name: 'firebase', version: '1.0.0' };
    await pm.register(plugin);
    await expect(pm.register(plugin)).rejects.toThrow(SDKError);
  });

  it('unregisters a plugin', async () => {
    const logger = new Logger('error', false);
    const pm = new PluginManager({
      applicationId: 'pos',
      logger,
      sendEvent: vi.fn().mockResolvedValue(undefined),
    });

    const plugin: SDKPlugin = {
      name: 'onesignal',
      version: '1.0.0',
      uninstall: vi.fn(),
    };
    await pm.register(plugin);
    const removed = await pm.unregister('onesignal');
    expect(removed).toBe(true);
    expect(pm.isRegistered('onesignal')).toBe(false);
  });

  it('lists registered plugins', async () => {
    const logger = new Logger('error', false);
    const pm = new PluginManager({
      applicationId: 'pos',
      logger,
      sendEvent: vi.fn().mockResolvedValue(undefined),
    });

    await pm.register({ name: 'resend', version: '1.0.0' });
    await pm.register({ name: 'midtrans', version: '2.0.0' });
    const list = pm.list();
    expect(list).toHaveLength(2);
    expect(list.map((p) => p.name).sort()).toEqual(['midtrans', 'resend']);
  });
});
