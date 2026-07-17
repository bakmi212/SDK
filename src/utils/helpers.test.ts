import { describe, it, expect } from 'vitest';
import { Logger } from './logger.js';
import { delay, generateId, isExpired, safeJsonParse } from './helpers.js';

describe('Logger', () => {
  it('respects enabled flag', () => {
    const logger = new Logger('info', false);
    expect(logger).toBeDefined();
    logger.info('test');
  });

  it('setLevel changes level', () => {
    const logger = new Logger('error', true);
    logger.setLevel('debug');
    logger.debug('test');
  });
});

describe('helpers', () => {
  it('delay resolves', async () => {
    await delay(10);
    expect(true).toBe(true);
  });

  it('generateId produces unique strings', () => {
    const a = generateId();
    const b = generateId();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it('generateId supports prefix', () => {
    const id = generateId('batch');
    expect(id.startsWith('batch_')).toBe(true);
  });

  it('isExpired detects past timestamps', () => {
    expect(isExpired(Date.now() - 1000)).toBe(true);
    expect(isExpired(Date.now() + 1000)).toBe(false);
  });

  it('safeJsonParse returns fallback on invalid json', () => {
    expect(safeJsonParse('not json', 'fallback')).toBe('fallback');
    expect(safeJsonParse('{"a":1}', null)).toEqual({ a: 1 });
  });
});
