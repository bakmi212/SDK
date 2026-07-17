import { describe, it, expect, vi } from 'vitest';
import { Logger } from '../utils/logger.js';

describe('Logger module', () => {
  it('exports Logger from utils', async () => {
    const mod = await import('./index.js');
    expect(mod.Logger).toBeDefined();
  });

  it('info method calls console.info', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const logger = new Logger('info', true);
    logger.info('test message');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('warn method calls console.warn', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logger = new Logger('warning', true);
    logger.warning('warning message');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('error method calls console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logger = new Logger('error', true);
    logger.error('error message');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('debug is suppressed at info level', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const logger = new Logger('info', true);
    logger.debug('debug message');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('debug shows at debug level', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const logger = new Logger('debug', true);
    logger.debug('debug message');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
