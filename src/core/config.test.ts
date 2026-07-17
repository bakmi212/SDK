import { describe, it, expect } from 'vitest';
import { SDKCore } from './config.js';
import { ValidationError } from './errors.js';

describe('SDKCore', () => {
  it('initializes with valid config', () => {
    const core = new SDKCore();
    const config = core.initialize({
      serverUrl: 'https://api.kasandra.io/',
      applicationId: 'pos',
      apiKey: 'key-123',
    });
    expect(config.serverUrl).toBe('https://api.kasandra.io');
    expect(config.applicationId).toBe('pos');
    expect(config.timeout).toBe(30000);
    expect(config.maxRetries).toBe(3);
    expect(config.storage).toBe('memory');
    expect(core.isInitialized()).toBe(true);
  });

  it('throws on missing serverUrl', () => {
    const core = new SDKCore();
    expect(() =>
      core.initialize({ serverUrl: '', applicationId: 'pos', apiKey: 'k' }),
    ).toThrow(ValidationError);
  });

  it('throws on invalid URL', () => {
    const core = new SDKCore();
    expect(() =>
      core.initialize({
        serverUrl: 'not-a-url',
        applicationId: 'pos',
        apiKey: 'k',
      }),
    ).toThrow(ValidationError);
  });

  it('throws on missing applicationId', () => {
    const core = new SDKCore();
    expect(() =>
      core.initialize({
        serverUrl: 'https://api.kasandra.io',
        applicationId: '',
        apiKey: 'k',
      }),
    ).toThrow(ValidationError);
  });

  it('throws on missing apiKey', () => {
    const core = new SDKCore();
    expect(() =>
      core.initialize({
        serverUrl: 'https://api.kasandra.io',
        applicationId: 'pos',
        apiKey: '',
      }),
    ).toThrow(ValidationError);
  });

  it('getConfig throws before initialize', () => {
    const core = new SDKCore();
    expect(() => core.getConfig()).toThrow(ValidationError);
  });

  it('updateConfig merges with current', () => {
    const core = new SDKCore();
    core.initialize({
      serverUrl: 'https://api.kasandra.io',
      applicationId: 'pos',
      apiKey: 'k',
    });
    const updated = core.updateConfig({ timeout: 5000 });
    expect(updated.timeout).toBe(5000);
    expect(updated.applicationId).toBe('pos');
  });

  it('reset clears config', () => {
    const core = new SDKCore();
    core.initialize({
      serverUrl: 'https://api.kasandra.io',
      applicationId: 'pos',
      apiKey: 'k',
    });
    core.reset();
    expect(core.isInitialized()).toBe(false);
  });
});
