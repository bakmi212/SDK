import { NetworkError, SDKError } from '../core/errors.js';
import { Logger } from '../utils/logger.js';
import { delay, generateId } from '../utils/helpers.js';
import type {
  HttpQuery,
  HttpRequestOptions,
  HttpResponse,
  MultipartFields,
} from './types.js';
import type { HttpMiddleware, HttpMiddlewareConfig, HttpMiddlewareResult } from '../types/index.js';

interface HttpClientDeps {
  baseUrl: string;
  apiKey?: string;
  applicationId?: string;
  timeout: number;
  maxRetries: number;
  logger: Logger;
  /** Returns the current access token, or null when unauthenticated. */
  getAccessToken?: () => string | null;
}

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

/**
 * Fetch-based HTTP client with JSON + multipart support, timeout via
 * AbortController, and exponential-backoff retries for transient errors.
 */
export class HttpClient {
  private deps: HttpClientDeps;
  private middleware: HttpMiddleware[] = [];

  constructor(deps: HttpClientDeps) {
    this.deps = deps;
  }

  /** Register a middleware in the request pipeline. */
  use(middleware: HttpMiddleware): this {
    this.middleware.push(middleware);
    return this;
  }

  updateDeps(patch: Partial<HttpClientDeps>): void {
    this.deps = { ...this.deps, ...patch };
  }

  async request<T = unknown>(
    path: string,
    options: HttpRequestOptions = {},
  ): Promise<HttpResponse<T>> {
    const url = this.buildUrl(path, options.query);
    const headers = this.buildHeaders(options);
    const body = this.buildBody(options, headers);
    const timeout = options.timeout ?? this.deps.timeout;
    const requestId = generateId('req');

    const config: HttpMiddlewareConfig = {
      url,
      method: options.method ?? 'GET',
      headers,
      body,
      timeout,
      requestId,
    };

    // Build middleware chain with the core sender as the terminal handler
    const chain = this.buildChain();
    const result = await chain(config);
    return {
      status: result.status,
      ok: result.ok,
      headers: new Headers(result.headers),
      data: result.data as T,
    };
  }

  private buildChain(): (config: HttpMiddlewareConfig) => Promise<HttpMiddlewareResult> {
    const terminal = async (config: HttpMiddlewareConfig): Promise<HttpMiddlewareResult> => {
      return this.sendWithRetry(config);
    };

    let chain = terminal;
    for (let i = this.middleware.length - 1; i >= 0; i--) {
      const mw = this.middleware[i]!;
      const next = chain;
      chain = (config) => mw(config, next);
    }
    return chain;
  }

  private async sendWithRetry(config: HttpMiddlewareConfig): Promise<HttpMiddlewareResult> {
    const maxRetries = this.deps.maxRetries;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const { status, ok, headers, data } = await this.sendOnce(config);
        if (ok || !RETRYABLE_STATUS.has(status)) {
          return { status, ok, headers, data };
        }
        lastError = new NetworkError(`HTTP ${status}`, status);
        this.deps.logger.warning(
          `Request to ${config.url} returned ${status}, attempt ${attempt + 1}/${maxRetries + 1}`,
        );
      } catch (error) {
        lastError = error instanceof Error ? error : new SDKError(String(error));
        this.deps.logger.warning(
          `Request to ${config.url} failed, attempt ${attempt + 1}/${maxRetries + 1}`,
          (lastError as Error).message,
        );
      }

      if (attempt < maxRetries) {
        const backoff = Math.min(1000 * 2 ** attempt, 8000);
        await delay(backoff);
      }
    }

    throw lastError ?? new NetworkError(`Request to ${config.url} failed`);
  }

  get<T = unknown>(
    path: string,
    options?: Omit<HttpRequestOptions, 'method' | 'body' | 'multipart'>,
  ): Promise<HttpResponse<T>> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  post<T = unknown>(
    path: string,
    body?: unknown,
    options?: Omit<HttpRequestOptions, 'method' | 'body'>,
  ): Promise<HttpResponse<T>> {
    return this.request<T>(path, { ...options, method: 'POST', body });
  }

  put<T = unknown>(
    path: string,
    body?: unknown,
    options?: Omit<HttpRequestOptions, 'method' | 'body'>,
  ): Promise<HttpResponse<T>> {
    return this.request<T>(path, { ...options, method: 'PUT', body });
  }

  patch<T = unknown>(
    path: string,
    body?: unknown,
    options?: Omit<HttpRequestOptions, 'method' | 'body'>,
  ): Promise<HttpResponse<T>> {
    return this.request<T>(path, { ...options, method: 'PATCH', body });
  }

  delete<T = unknown>(
    path: string,
    options?: Omit<HttpRequestOptions, 'method' | 'body' | 'multipart'>,
  ): Promise<HttpResponse<T>> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }

  private async sendOnce(config: HttpMiddlewareConfig): Promise<HttpMiddlewareResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeout);

    try {
      this.deps.logger.debug(`${config.method} ${config.url}`);
      const response = await fetch(config.url, {
        method: config.method,
        headers: config.headers,
        body: config.body,
        signal: controller.signal,
      });

      const data = await this.parseBody<unknown>(response);
      const headers: Record<string, string> = {};
      response.headers.forEach((v, k) => { headers[k] = v; });
      return {
        status: response.status,
        ok: response.ok,
        headers,
        data,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new NetworkError(`Request to ${config.url} timed out after ${config.timeout}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  private buildUrl(path: string, query?: HttpQuery): string {
    const base = this.deps.baseUrl.replace(/\/+$/, '');
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const url = `${base}${cleanPath}`;
    if (!query) return url;

    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) params.append(key, String(value));
    }
    const qs = params.toString();
    return qs ? `${url}?${qs}` : url;
  }

  private buildHeaders(options: HttpRequestOptions): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...options.headers,
    };

    if (this.deps.applicationId) {
      headers['X-Application-Id'] = this.deps.applicationId;
    }
    if (this.deps.apiKey) {
      headers['X-Api-Key'] = this.deps.apiKey;
    }

    const token = !options.skipAuth ? this.deps.getAccessToken?.() : null;
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
  }

  private buildBody(
    options: HttpRequestOptions,
    headers: Record<string, string>,
  ): string | FormData | undefined {
    if (options.multipart) {
      return this.buildMultipart(options.multipart, headers);
    }
    if (options.body === undefined || options.body === null) {
      return undefined;
    }
    headers['Content-Type'] = 'application/json';
    return JSON.stringify(options.body);
  }

  private buildMultipart(
    fields: MultipartFields,
    headers: Record<string, string>,
  ): FormData {
    const form = new FormData();
    for (const [name, value] of Object.entries(fields)) {
      form.append(name, value);
    }
    // Let the platform set the multipart boundary.
    delete headers['Content-Type'];
    return form;
  }

  private async parseBody<T>(response: Response): Promise<T> {
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const text = await response.text();
      if (!text) return undefined as T;
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new SDKError('Failed to parse JSON response', 'NETWORK_ERROR');
      }
    }
    const text = await response.text();
    return (text || undefined) as unknown as T;
  }
}
