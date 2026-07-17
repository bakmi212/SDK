import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpClient } from './http-client.js';
import { Logger } from '../utils/logger.js';
import { NetworkError } from '../core/errors.js';

function mockResponse(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('HttpClient', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger('error', false);
  });

  it('sends a GET request and parses JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(200, { ok: true }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new HttpClient({
      baseUrl: 'https://api.example.com',
      apiKey: 'key',
      applicationId: 'app',
      timeout: 5000,
      maxRetries: 0,
      logger,
    });

    const res = await client.get('/test');
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('attaches API key and application id headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(200, {}));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new HttpClient({
      baseUrl: 'https://api.example.com',
      apiKey: 'secret-key',
      applicationId: 'pos-app',
      timeout: 5000,
      maxRetries: 0,
      logger,
    });

    await client.get('/test');
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({
      'X-Api-Key': 'secret-key',
      'X-Application-Id': 'pos-app',
    });
  });

  it('attaches bearer token when getAccessToken is provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(200, {}));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new HttpClient({
      baseUrl: 'https://api.example.com',
      timeout: 5000,
      maxRetries: 0,
      logger,
      getAccessToken: () => 'token-abc',
    });

    await client.get('/test');
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer token-abc',
    });
  });

  it('retries on 503 then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockResponse(503, {}))
      .mockResolvedValueOnce(mockResponse(200, { ok: true }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new HttpClient({
      baseUrl: 'https://api.example.com',
      timeout: 5000,
      maxRetries: 2,
      logger,
    });

    const res = await client.get('/test');
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws NetworkError when all retries fail', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(mockResponse(503, {})),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new HttpClient({
      baseUrl: 'https://api.example.com',
      timeout: 5000,
      maxRetries: 1,
      logger,
    });

    await expect(client.get('/test')).rejects.toThrow(NetworkError);
  });

  it('builds query string', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(200, {}));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new HttpClient({
      baseUrl: 'https://api.example.com',
      timeout: 5000,
      maxRetries: 0,
      logger,
    });

    await client.get('/test', { query: { page: 1, limit: 20 } });
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('page=1');
    expect(url).toContain('limit=20');
  });

  it('sends JSON body on POST', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(200, {}));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new HttpClient({
      baseUrl: 'https://api.example.com',
      timeout: 5000,
      maxRetries: 0,
      logger,
    });

    await client.post('/test', { name: 'foo' });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ name: 'foo' }));
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' });
  });
});
