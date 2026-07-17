import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventManager } from './event-manager.js';
import { Logger } from '../utils/logger.js';
import { MemoryStorage } from '../storage/memory-storage.js';
import { HttpClient } from '../http/http-client.js';

function mockResponse(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('EventManager — Enterprise Features', () => {
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

  it('orders events by priority', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(mockResponse(200, { ok: true })),
    ) as unknown as typeof fetch;

    const em = new EventManager({
      http,
      storage,
      logger,
      applicationId: 'pos',
    });

    await em.send({ name: 'low.event', priority: 'low' });
    await em.send({ name: 'critical.event', priority: 'critical' });
    await em.send({ name: 'normal.event', priority: 'normal' });

    // Critical should be first in the queue
    await em.flush();
    const calls = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const firstCallBody = JSON.parse(calls[0][1].body as string);
    expect(firstCallBody.events[0].name).toBe('critical.event');
  });

  it('adds events to offline queue when offline', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(mockResponse(200, { ok: true })),
    ) as unknown as typeof fetch;

    const em = new EventManager({
      http,
      storage,
      logger,
      applicationId: 'pos',
    });

    em.setOffline();
    await em.send({ name: 'offline.event' });
    expect(em.getOfflineQueueSize()).toBe(1);
  });

  it('flushes offline queue when back online', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(mockResponse(200, { ok: true })),
    ) as unknown as typeof fetch;

    const em = new EventManager({
      http,
      storage,
      logger,
      applicationId: 'pos',
    });

    em.setOffline();
    await em.send({ name: 'offline.event' });
    expect(em.getOfflineQueueSize()).toBe(1);

    em.setOnline();
    // After setOnline, the offline queue should be flushed
    expect(em.getOfflineQueueSize()).toBe(0);
  });

  it('tracks queue size including offline', async () => {
    const em = new EventManager({
      http,
      storage,
      logger,
      applicationId: 'pos',
    });

    em.setOffline();
    await em.send({ name: 'event1' });
    await em.send({ name: 'event2' });
    expect(em.getQueueSize()).toBe(2);
  });
});
