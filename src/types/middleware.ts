import type { HttpMethod } from '../http/types.js';

/** HTTP middleware function signature. */
export type HttpMiddleware = (
  config: HttpMiddlewareConfig,
  next: HttpMiddlewareNext,
) => Promise<HttpMiddlewareResult>;

/** Configuration passed to middleware. */
export interface HttpMiddlewareConfig {
  url: string;
  method: HttpMethod;
  headers: Record<string, string>;
  body: string | FormData | undefined;
  timeout: number;
  requestId: string;
}

/** Next function in the middleware chain. */
export type HttpMiddlewareNext = (
  config: HttpMiddlewareConfig,
) => Promise<HttpMiddlewareResult>;

/** Result returned from the middleware chain. */
export interface HttpMiddlewareResult {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  data: unknown;
}

/** Circuit breaker state. */
export type CircuitBreakerState = 'closed' | 'open' | 'half-open';

/** Circuit breaker config. */
export interface CircuitBreakerConfig {
  threshold: number;
  resetTimeoutMs: number;
}

/** Rate limiter config. */
export interface RateLimiterConfig {
  maxRequests: number;
  windowMs: number;
}
