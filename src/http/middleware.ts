import { NetworkError, SDKError } from '../core/errors.js';
import type {
  CircuitBreakerConfig,
  CircuitBreakerState,
  HttpMiddleware,
  RateLimiterConfig,
} from '../types/index.js';
import { delay } from '../utils/helpers.js';

/**
 * Circuit breaker. Opens after `threshold` consecutive failures,
 * blocks requests for `resetTimeoutMs`, then enters half-open.
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = 'closed';
  private failureCount = 0;
  private lastFailureTime = 0;
  private config: CircuitBreakerConfig;

  constructor(config: CircuitBreakerConfig) {
    this.config = config;
  }

  getState(): CircuitBreakerState {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime >= this.config.resetTimeoutMs) {
        this.state = 'half-open';
      }
    }
    return this.state;
  }

  canExecute(): boolean {
    const state = this.getState();
    return state === 'closed' || state === 'half-open';
  }

  recordSuccess(): void {
    this.failureCount = 0;
    this.state = 'closed';
  }

  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.config.threshold) {
      this.state = 'open';
    }
  }

  reset(): void {
    this.failureCount = 0;
    this.state = 'closed';
  }
}

/**
 * Sliding-window rate limiter. Blocks requests exceeding
 * `maxRequests` within `windowMs`.
 */
export class RateLimiter {
  private timestamps: number[] = [];
  private config: RateLimiterConfig;

  constructor(config: RateLimiterConfig) {
    this.config = config;
  }

  canExecute(): boolean {
    const now = Date.now();
    this.timestamps = this.timestamps.filter(
      (t) => now - t < this.config.windowMs,
    );
    return this.timestamps.length < this.config.maxRequests;
  }

  record(): void {
    this.timestamps.push(Date.now());
  }

  getRemaining(): number {
    const now = Date.now();
    this.timestamps = this.timestamps.filter(
      (t) => now - t < this.config.windowMs,
    );
    return Math.max(0, this.config.maxRequests - this.timestamps.length);
  }

  reset(): void {
    this.timestamps = [];
  }
}

/** Middleware that adds an X-Request-Id header. */
export function requestIdMiddleware(): HttpMiddleware {
  return async (config, next) => {
    if (!config.headers['X-Request-Id']) {
      config.headers['X-Request-Id'] =
        `req_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    }
    return next(config);
  };
}

/** Middleware that injects the Authorization header. */
export function authMiddleware(
  getAccessToken: () => string | null,
): HttpMiddleware {
  return async (config, next) => {
    const token = getAccessToken();
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return next(config);
  };
}

/** Middleware that logs requests and responses. */
export function loggerMiddleware(
  logger: {
    debug(message: string, ...args: unknown[]): void;
    warning(message: string, ...args: unknown[]): void;
  },
): HttpMiddleware {
  return async (config, next) => {
    const start = Date.now();
    logger.debug(`→ ${config.method} ${config.url}`);
    try {
      const result = await next(config);
      const duration = Date.now() - start;
      logger.debug(`← ${config.method} ${config.url} ${result.status} (${duration}ms)`);
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      logger.warning(`✕ ${config.method} ${config.url} failed (${duration}ms)`);
      throw error;
    }
  };
}

/** Middleware that retries failed requests with exponential backoff. */
export function retryMiddleware(maxRetries: number): HttpMiddleware {
  return async (config, next) => {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await next(config);
        if (result.ok || result.status < 500) return result;
        lastError = new NetworkError(`HTTP ${result.status}`, result.status);
      } catch (error) {
        lastError = error instanceof Error ? error : new SDKError(String(error));
      }
      if (attempt < maxRetries) {
        const backoff = Math.min(1000 * 2 ** attempt, 8000);
        await delay(backoff);
      }
    }
    throw lastError ?? new NetworkError('Request failed after retries');
  };
}

/** Middleware that enforces a timeout via AbortController. */
export function timeoutMiddleware(): HttpMiddleware {
  return async (config, next) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeout);
    try {
      return await next({ ...config, body: config.body });
    } finally {
      clearTimeout(timer);
    }
  };
}

/** Middleware that computes and attaches an HMAC request signature. */
export function signatureMiddleware(secret: string): HttpMiddleware {
  return async (config, next) => {
    if (config.body && typeof config.body === 'string') {
      const { createHmac } = await import('node:crypto');
      const sig = createHmac('sha256', secret)
        .update(config.body)
        .digest('hex');
      config.headers['X-Signature'] = sig;
    }
    return next(config);
  };
}

/** Middleware that adds circuit breaker protection. */
export function circuitBreakerMiddleware(
  breaker: CircuitBreaker,
): HttpMiddleware {
  return async (config, next) => {
    if (!breaker.canExecute()) {
      throw new NetworkError('Circuit breaker is open');
    }
    try {
      const result = await next(config);
      if (result.ok) {
        breaker.recordSuccess();
      } else {
        breaker.recordFailure();
      }
      return result;
    } catch (error) {
      breaker.recordFailure();
      throw error;
    }
  };
}

/** Middleware that enforces a rate limit. */
export function rateLimiterMiddleware(
  limiter: RateLimiter,
): HttpMiddleware {
  return async (config, next) => {
    if (!limiter.canExecute()) {
      throw new NetworkError('Rate limit exceeded');
    }
    limiter.record();
    return next(config);
  };
}
