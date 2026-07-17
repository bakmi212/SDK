import { AuthenticationError } from '../core/errors.js';
import type { HttpClient } from '../http/http-client.js';
import type { Logger } from '../utils/logger.js';
import type { StorageAdapter } from '../storage/types.js';
import type { AuthSession, LoginCredentials, LogoutResult, User } from '../types/index.js';
import { isExpired } from '../utils/helpers.js';

const STORAGE_KEY = 'kasandra:auth:session';
const REFRESH_SKEW_MS = 60_000;

interface AuthManagerDeps {
  http: HttpClient;
  storage: StorageAdapter;
  logger: Logger;
}

/**
 * Manages authentication: login, logout, token refresh, and current user.
 * Persists the session via the configured storage adapter.
 */
export class AuthManager {
  private deps: AuthManagerDeps;
  private session: AuthSession | null = null;
  private refreshPromise: Promise<AuthSession> | null = null;

  constructor(deps: AuthManagerDeps) {
    this.deps = deps;
  }

  /** Load persisted session from storage. Call during SDK initialize. */
  async restore(): Promise<void> {
    const raw = await this.deps.storage.get(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as AuthSession;
      if (!isExpired(parsed.expiresAt, REFRESH_SKEW_MS)) {
        this.session = parsed;
        this.deps.logger.debug('Auth session restored');
      } else {
        this.deps.logger.debug('Stored session expired, clearing');
        await this.deps.storage.remove(STORAGE_KEY);
      }
    } catch {
      await this.deps.storage.remove(STORAGE_KEY);
    }
  }

  async login(credentials: LoginCredentials): Promise<AuthSession> {
    if (!credentials.email || !credentials.password) {
      throw new AuthenticationError('Email and password are required');
    }
    const response = await this.deps.http.post<AuthSession>(
      '/auth/login',
      credentials,
      { skipAuth: true },
    );
    if (!response.ok) {
      throw new AuthenticationError(
        'Login failed',
        response.status,
        response.data,
      );
    }
    this.session = response.data;
    await this.persist();
    this.deps.logger.info(`Logged in as ${response.data.user.email}`);
    return response.data;
  }

  async logout(): Promise<LogoutResult> {
    try {
      await this.deps.http.post('/auth/logout', undefined, { skipAuth: false });
    } catch (error) {
      this.deps.logger.warning('Logout request failed', error);
    }
    this.session = null;
    await this.deps.storage.remove(STORAGE_KEY);
    this.deps.logger.info('Logged out');
    return { success: true };
  }

  async refresh(): Promise<AuthSession> {
    if (!this.session?.refreshToken) {
      throw new AuthenticationError('No refresh token available');
    }
    if (this.refreshPromise) {
      return this.refreshPromise;
    }
    this.refreshPromise = this.doRefresh()
      .finally(() => {
        this.refreshPromise = null;
      });
    return this.refreshPromise;
  }

  getCurrentUser(): User | null {
    return this.session?.user ?? null;
  }

  getSession(): AuthSession | null {
    return this.session;
  }

  getAccessToken(): string | null {
    return this.session?.accessToken ?? null;
  }

  /** True when the access token is still valid (with skew). */
  isAuthenticated(): boolean {
    if (!this.session) return false;
    return !isExpired(this.session.expiresAt, REFRESH_SKEW_MS);
  }

  private async doRefresh(): Promise<AuthSession> {
    const refreshToken = this.session!.refreshToken;
    const response = await this.deps.http.post<AuthSession>(
      '/auth/refresh',
      { refreshToken },
      { skipAuth: true },
    );
    if (!response.ok) {
      this.session = null;
      await this.deps.storage.remove(STORAGE_KEY);
      throw new AuthenticationError(
        'Token refresh failed',
        response.status,
        response.data,
      );
    }
    this.session = response.data;
    await this.persist();
    this.deps.logger.debug('Auth session refreshed');
    return response.data;
  }

  private async persist(): Promise<void> {
    if (!this.session) return;
    await this.deps.storage.set(STORAGE_KEY, JSON.stringify(this.session));
  }
}
