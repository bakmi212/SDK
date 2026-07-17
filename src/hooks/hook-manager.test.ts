import { describe, it, expect, beforeEach } from 'vitest';
import { HookManager } from './hook-manager.js';
import { Logger } from '../utils/logger.js';

describe('HookManager', () => {
  let hooks: HookManager;

  beforeEach(() => {
    const logger = new Logger('error', false);
    hooks = new HookManager({ logger });
  });

  it('registers and triggers hooks', async () => {
    let called = false;
    hooks.on('beforeSync', () => {
      called = true;
    });
    await hooks.trigger('beforeSync', { operation: 'metadata' });
    expect(called).toBe(true);
  });

  it('passes data to handlers', async () => {
    let received: string | undefined;
    hooks.on('beforeEvent', (ctx) => {
      received = ctx.data?.eventName as string;
    });
    await hooks.trigger('beforeEvent', { eventName: 'test.event' });
    expect(received).toBe('test.event');
  });

  it('supports async handlers', async () => {
    let result = 0;
    hooks.on('afterInit', async () => {
      await new Promise((r) => setTimeout(r, 10));
      result = 42;
    });
    await hooks.trigger('afterInit');
    expect(result).toBe(42);
  });

  it('aborts when handler sets abort', async () => {
    let secondCalled = false;
    hooks.on('beforeLicenseValidation', (ctx) => {
      ctx.abort = true;
    });
    hooks.on('beforeLicenseValidation', () => {
      secondCalled = true;
    });
    const result = await hooks.trigger('beforeLicenseValidation');
    expect(result).toBe(false);
    expect(secondCalled).toBe(false);
  });

  it('removes hooks via registration.remove()', async () => {
    let callCount = 0;
    const reg = hooks.on('afterSync', () => { callCount++; });
    await hooks.trigger('afterSync');
    expect(callCount).toBe(1);
    reg.remove();
    await hooks.trigger('afterSync');
    expect(callCount).toBe(1);
  });

  it('lists registered hooks', () => {
    hooks.on('beforeInit', () => {});
    hooks.on('afterInit', () => {});
    const list = hooks.listHooks();
    expect(list).toContain('beforeInit');
    expect(list).toContain('afterInit');
  });
});
