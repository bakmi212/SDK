import { SDKCore } from './core/config.js';
import { Logger } from './utils/logger.js';
import type { LogLevel } from './utils/logger.js';
import { HttpClient } from './http/http-client.js';
import {
  CircuitBreaker,
  RateLimiter,
  requestIdMiddleware,
  authMiddleware,
  loggerMiddleware,
  circuitBreakerMiddleware,
  rateLimiterMiddleware,
} from './http/middleware.js';
import { resolveStorageAdapter } from './storage/browser-storage.js';
import type { StorageAdapter } from './storage/types.js';
import { AuthManager } from './auth/auth-manager.js';
import { ConfigurationManager } from './configuration/configuration-manager.js';
import { DeviceManager } from './device/device-manager.js';
import { HeartbeatService } from './device/heartbeat-service.js';
import { EventManager } from './events/event-manager.js';
import { LicenseManager } from './license/license-manager.js';
import { MetadataManager } from './metadata/metadata-manager.js';
import { WorkspaceManager } from './workspace/workspace-manager.js';
import { SecurityModule } from './security/security-module.js';
import { PluginManager } from './plugins/plugin-manager.js';
import { HookManager } from './hooks/hook-manager.js';
import { CacheManager } from './cache/cache-manager.js';
import { SyncManager } from './sync/sync-manager.js';
import { TelemetryManager } from './telemetry/telemetry-manager.js';
import { UpdateManager } from './update/update-manager.js';
import { NodePlatformAdapter } from './adapters/platform-adapters.js';
import type { PlatformAdapter } from './types/index.js';
import type {
  AuthSession,
  Configuration,
  ConfigurationMergeResult,
  ConfigurationPublishResult,
  ConfigurationRefreshResult,
  Device,
  DeviceDeactivateResult,
  DeviceProfile,
  DeviceRegistrationInput,
  DeviceRegistrationPayload,
  DeviceReplaceResult,
  DeviceVerifyResult,
  DuplicateCheckInput,
  DuplicateCheckResult,
  FraudAssessmentInput,
  License,
  LicenseActivationPayload,
  LicenseCheckResult,
  LicenseValidationResult,
  LoginCredentials,
  LogoutResult,
  MetadataSyncResult,
  PluginRegistryResult,
  RiskAssessment,
  SDKConfig,
  SDKEvent,
  SDKPlugin,
  SecurityValidationResult,
  SignatureValidationInput,
  ReplayProtectionInput,
  TokenValidationInput,
  LicenseValidationInput,
  SyncStateSnapshot,
  TelemetrySnapshot,
  UpdateCheckResult,
  User,
  Workspace,
  HookName,
  HookHandler,
} from './types/index.js';

/** Built-in SDK event names for device lifecycle and security. */
export const SDK_EVENTS = {
  DEVICE_REGISTERED: 'device.registered',
  DEVICE_LOGIN: 'device.login',
  DEVICE_LOGOUT: 'device.logout',
  DEVICE_DUPLICATE: 'device.duplicate',
  DEVICE_BLOCKED: 'device.blocked',
  DEVICE_REPLACED: 'device.replaced',
  DEVICE_REMOVED: 'device.removed',
  DEVICE_HEARTBEAT: 'device.heartbeat',
  DEVICE_FRAUD_DETECTED: 'device.fraud_detected',
  SECURITY_WARNING: 'security.warning',
  LICENSE_VALIDATED: 'license.validated',
} as const;

/**
 * KaSandra Platform SDK — the single entry point for the entire ecosystem.
 *
 * All modules read configuration from `initialize()` and share a common
 * HTTP client, storage adapter, logger, cache, and sync manager.
 *
 * The full lifecycle runs automatically on `init()`:
 *   load cache → authenticate → register device → validate license →
 *   sync metadata → sync configuration → start heartbeat → start events →
 *   start fraud detection → SDK ready
 */
export class Kasandra {
  private core: SDKCore;
  private loggerInstance: Logger;
  private storage: StorageAdapter;
  private http: HttpClient;
  private auth: AuthManager;
  private configuration: ConfigurationManager;
  private deviceManager: DeviceManager;
  private heartbeatService: HeartbeatService | null = null;
  private events: EventManager;
  private license: LicenseManager;
  private metadata: MetadataManager;
  private workspace: WorkspaceManager;
  private securityModule: SecurityModule;
  private pluginManager: PluginManager;
  private hookManager: HookManager;
  private cacheManager: CacheManager;
  private syncManager: SyncManager;
  private telemetryManager: TelemetryManager;
  private updateManager: UpdateManager;
  private platformAdapter: PlatformAdapter;
  private circuitBreaker: CircuitBreaker;
  private rateLimiter: RateLimiter;
  private lastEventTimestamp: number | null = null;
  private lastSyncTimestamp: number | null = null;
  private initialized = false;
  private sdkReady = false;

  constructor() {
    this.core = new SDKCore();
    this.loggerInstance = new Logger('info', false);
    this.storage = resolveStorageAdapter('memory');
    this.http = new HttpClient({
      baseUrl: 'http://localhost',
      timeout: 30000,
      maxRetries: 3,
      logger: this.loggerInstance,
    });
    this.auth = new AuthManager({
      http: this.http,
      storage: this.storage,
      logger: this.loggerInstance,
    });
    this.configuration = new ConfigurationManager({
      http: this.http,
      storage: this.storage,
      logger: this.loggerInstance,
      applicationId: '',
    });
    this.deviceManager = new DeviceManager({
      http: this.http,
      storage: this.storage,
      logger: this.loggerInstance,
      applicationId: '',
    });
    this.events = new EventManager({
      http: this.http,
      storage: this.storage,
      logger: this.loggerInstance,
      applicationId: '',
    });
    this.license = new LicenseManager({
      http: this.http,
      storage: this.storage,
      logger: this.loggerInstance,
      applicationId: '',
    });
    this.metadata = new MetadataManager({
      http: this.http,
      storage: this.storage,
      logger: this.loggerInstance,
      applicationId: '',
    });
    this.workspace = new WorkspaceManager({
      http: this.http,
      storage: this.storage,
      logger: this.loggerInstance,
    });
    this.securityModule = new SecurityModule();
    this.pluginManager = new PluginManager({
      applicationId: '',
      logger: this.loggerInstance,
      sendEvent: (event) => this.events.send(event),
    });
    this.hookManager = new HookManager({ logger: this.loggerInstance });
    this.cacheManager = new CacheManager({
      storage: this.storage,
      config: { defaultTtl: 300_000, cleanupInterval: 60_000 },
    });
    this.syncManager = new SyncManager({
      storage: this.storage,
      logger: this.loggerInstance,
      config: { intervalMs: 300_000, operations: ['metadata', 'configuration', 'license', 'device', 'events'], syncOnReconnect: true },
    });
    this.telemetryManager = new TelemetryManager({
      http: this.http,
      logger: this.loggerInstance,
      endpoints: {} as never,
      enabled: true,
      reportIntervalMs: 300_000,
    });
    this.updateManager = new UpdateManager({
      storage: this.storage,
      logger: this.loggerInstance,
    });
    this.platformAdapter = new NodePlatformAdapter();
    this.circuitBreaker = new CircuitBreaker({ threshold: 5, resetTimeoutMs: 30_000 });
    this.rateLimiter = new RateLimiter({ maxRequests: 100, windowMs: 60_000 });
  }

  /**
   * Initialize the SDK and run the full lifecycle automatically.
   *
   * Lifecycle: load cache → authenticate (if stored session) → register device →
   * validate license → sync metadata → sync configuration → start heartbeat →
   * start event queue → start fraud detection → SDK ready
   */
  async initialize(options: SDKConfig): Promise<this> {
    // ── Phase 1: Resolve config and wire infrastructure ────────
    await this.hookManager.trigger('beforeInit', { options });
    const config = this.core.initialize(options);

    this.loggerInstance = new Logger(
      config.debug ? 'debug' : 'info',
      true,
    );
    this.storage = resolveStorageAdapter(config.storage);

    this.http = new HttpClient({
      baseUrl: config.serverUrl,
      apiKey: config.apiKey,
      applicationId: config.applicationId,
      timeout: config.timeout,
      maxRetries: config.maxRetries,
      logger: this.loggerInstance,
      getAccessToken: () => this.auth.getAccessToken(),
    });

    // Register HTTP middleware
    this.http
      .use(requestIdMiddleware())
      .use(authMiddleware(() => this.auth.getAccessToken()))
      .use(loggerMiddleware(this.loggerInstance))
      .use(circuitBreakerMiddleware(this.circuitBreaker))
      .use(rateLimiterMiddleware(this.rateLimiter));

    // Wire all managers with resolved config
    this.auth = new AuthManager({
      http: this.http,
      storage: this.storage,
      logger: this.loggerInstance,
    });
    this.configuration = new ConfigurationManager({
      http: this.http,
      storage: this.storage,
      logger: this.loggerInstance,
      applicationId: config.applicationId,
      configurationEndpoint: config.endpoints.configurationDownload,
      publishEndpoint: config.endpoints.configurationPublish,
    });
    this.deviceManager = new DeviceManager({
      http: this.http,
      storage: this.storage,
      logger: this.loggerInstance,
      applicationId: config.applicationId,
      endpoints: {
        register: config.endpoints.deviceRegister,
        verify: config.endpoints.deviceVerify,
        heartbeat: config.endpoints.deviceHeartbeat,
        replace: config.endpoints.deviceReplace,
        deactivate: config.endpoints.deviceDeactivate,
      },
    });
    this.events = new EventManager({
      http: this.http,
      storage: this.storage,
      logger: this.loggerInstance,
      applicationId: config.applicationId,
      eventsBatchEndpoint: config.endpoints.eventsBatch,
    });
    this.license = new LicenseManager({
      http: this.http,
      storage: this.storage,
      logger: this.loggerInstance,
      applicationId: config.applicationId,
      licenseCheckEndpoint: config.endpoints.licenseCheck,
      licenseActivateEndpoint: config.endpoints.licenseActivate,
      licenseDeactivateEndpoint: config.endpoints.licenseDeactivate,
      licenseValidateEndpoint: config.endpoints.licenseValidate,
    });
    this.metadata = new MetadataManager({
      http: this.http,
      storage: this.storage,
      logger: this.loggerInstance,
      applicationId: config.applicationId,
      metadataEndpoint: config.endpoints.metadataSync,
    });
    this.workspace = new WorkspaceManager({
      http: this.http,
      storage: this.storage,
      logger: this.loggerInstance,
    });
    this.pluginManager = new PluginManager({
      applicationId: config.applicationId,
      logger: this.loggerInstance,
      sendEvent: (event) => this.events.send(event),
    });
    this.cacheManager = new CacheManager({
      storage: this.storage,
      config: {
        defaultTtl: config.cache.defaultTtl,
        cleanupInterval: config.cache.cleanupInterval,
      },
    });
    this.cacheManager.registerDomain('metadata', config.cache.metadataTtl);
    this.cacheManager.registerDomain('configuration', config.cache.configurationTtl);
    this.cacheManager.registerDomain('license', config.cache.licenseTtl);
    this.cacheManager.registerDomain('device', config.cache.deviceTtl);
    this.cacheManager.startCleanup();

    this.syncManager = new SyncManager({
      storage: this.storage,
      logger: this.loggerInstance,
      config: {
        intervalMs: config.sync.intervalMs,
        operations: config.sync.operations,
        syncOnReconnect: config.sync.syncOnReconnect,
      },
    });
    this.registerSyncExecutors();

    this.telemetryManager = new TelemetryManager({
      http: this.http,
      logger: this.loggerInstance,
      endpoints: config.endpoints,
      enabled: config.telemetry.enabled,
      reportIntervalMs: config.telemetry.reportIntervalMs,
    });
    this.updateManager = new UpdateManager({
      storage: this.storage,
      logger: this.loggerInstance,
    });

    this.heartbeatService = new HeartbeatService({
      http: this.http,
      logger: this.loggerInstance,
      endpoints: config.endpoints,
      config: config.heartbeat,
      getDeviceId: () => this.deviceManager.getCurrentDevice()?.id ?? null,
      getWorkspaceId: () => this.workspace.getCached()?.id ?? null,
      getLicenseStatus: () => this.license.getCachedLicense()?.status ?? 'unknown',
      getMetadataVersion: () => this.metadata.getVersion(),
      getConfigurationVersion: () => this.configuration.getCached()?.version ?? null,
      getLastEventTimestamp: () => this.lastEventTimestamp,
      getLastSyncTimestamp: () => this.lastSyncTimestamp,
      getPlatform: () => config.applicationId,
    });

    this.initialized = true;

    // ── Phase 2: Load local cache ──────────────────────────────
    this.loggerInstance.sdk('Loading local cache');
    await Promise.all([
      this.auth.restore(),
      this.configuration.restore(),
      this.deviceManager.restore(),
      this.events.restore(),
      this.metadata.restore(),
      this.workspace.restore(),
      this.license.restore(),
      this.updateManager.restore(),
      this.syncManager.restore(),
    ]);

    // ── Phase 3: Run lifecycle if autoLifecycle ────────────────
    if (config.autoLifecycle) {
      await this.runLifecycle();
    }

    await this.hookManager.trigger('afterInit', { config });
    this.loggerInstance.sdk(`SDK initialized for application ${config.applicationId}`);
    return this;
  }

  /** Run the full SDK lifecycle sequence. */
  private async runLifecycle(): Promise<void> {
    // Authenticate (if stored session)
    if (this.auth.isAuthenticated()) {
      this.loggerInstance.sdk('Session restored — authenticated');
    }

    // Start event queue
    this.events.startAutoFlush();
    this.loggerInstance.sdk('Event queue started');

    // Sync metadata
    await this.runSyncOperation('metadata');

    // Sync configuration
    await this.runSyncOperation('configuration');

    // Start heartbeat
    if (this.heartbeatService) {
      this.heartbeatService.start();
      this.loggerInstance.sdk('Heartbeat started');
    }

    // Start sync scheduler
    this.syncManager.startScheduler();
    this.loggerInstance.sdk('Sync scheduler started');

    // Start telemetry
    this.telemetryManager.startAutoReport();
    this.loggerInstance.sdk('Telemetry started');

    // Start fraud detection (passive — checks run on-demand)
    this.loggerInstance.sdk('Fraud detection ready');

    this.sdkReady = true;
    this.loggerInstance.sdk('SDK ready');
  }

  private registerSyncExecutors(): void {
    this.syncManager.registerExecutor('metadata', async () => {
      const result = await this.metadata.sync();
      this.lastSyncTimestamp = Date.now();
      return { operation: 'metadata' as const, success: true, timestamp: Date.now(), data: result };
    });
    this.syncManager.registerExecutor('configuration', async () => {
      const result = await this.configuration.download();
      this.lastSyncTimestamp = Date.now();
      return { operation: 'configuration' as const, success: true, timestamp: Date.now(), data: result };
    });
    this.syncManager.registerExecutor('license', async () => {
      const cached = this.license.getCachedLicense();
      if (cached) {
        const result = await this.license.validate(cached.key);
        this.lastSyncTimestamp = Date.now();
        return { operation: 'license' as const, success: result.valid, timestamp: Date.now(), data: result };
      }
      return { operation: 'license' as const, success: true, timestamp: Date.now() };
    });
    this.syncManager.registerExecutor('device', async () => {
      if (this.deviceManager.getCurrentDevice()) {
        await this.deviceManager.heartbeat();
        this.lastSyncTimestamp = Date.now();
      }
      return { operation: 'device' as const, success: true, timestamp: Date.now() };
    });
    this.syncManager.registerExecutor('events', async () => {
      await this.events.flush();
      this.lastSyncTimestamp = Date.now();
      return { operation: 'events' as const, success: true, timestamp: Date.now() };
    });
  }

  private async runSyncOperation(op: 'metadata' | 'configuration' | 'license' | 'device' | 'events'): Promise<void> {
    await this.hookManager.trigger('beforeSync', { operation: op });
    try {
      await this.syncManager.runSync(op);
    } catch (error) {
      this.loggerInstance.warning(`Sync ${op} failed`, error);
    }
    await this.hookManager.trigger('afterSync', { operation: op });
  }

  // ─── Auth ───────────────────────────────────────────────────

  async login(credentials: LoginCredentials): Promise<AuthSession> {
    this.ensureInitialized();
    const session = await this.auth.login(credentials);
    this.events.send({ name: SDK_EVENTS.DEVICE_LOGIN, data: { userId: session.user.id } });
    return session;
  }

  async logout(): Promise<LogoutResult> {
    this.ensureInitialized();
    const result = await this.auth.logout();
    this.events.send({ name: SDK_EVENTS.DEVICE_LOGOUT });
    return result;
  }

  async refresh(): Promise<AuthSession> {
    this.ensureInitialized();
    return this.auth.refresh();
  }

  getCurrentUser(): User | null {
    return this.auth.getCurrentUser();
  }

  // ─── License ────────────────────────────────────────────────

  async checkLicense(key: string): Promise<LicenseCheckResult> {
    this.ensureInitialized();
    const result = await this.license.check(key);
    this.events.send({ name: SDK_EVENTS.LICENSE_VALIDATED, data: { valid: result.valid, key } });
    return result;
  }

  async activateLicense(payload: LicenseActivationPayload): Promise<License> {
    this.ensureInitialized();
    return this.license.activate(payload);
  }

  async deactivateLicense(key: string, deviceId: string): Promise<void> {
    this.ensureInitialized();
    return this.license.deactivate(key, deviceId);
  }

  async validateLicense(
    key: string,
    options?: { expectedWorkspaceId?: string; expectedDeviceId?: string },
  ): Promise<LicenseValidationResult> {
    this.ensureInitialized();
    await this.hookManager.trigger('beforeLicenseValidation', { key });
    const result = await this.license.validate(key, options);
    await this.hookManager.trigger('afterLicenseValidation', { key, result });
    return result;
  }

  // ─── Configuration ──────────────────────────────────────────

  async downloadConfiguration(): Promise<Configuration> {
    this.ensureInitialized();
    const config = await this.configuration.download();
    this.events.send({ name: 'configuration.download', data: { version: config.version } });
    return config;
  }

  async refreshConfiguration(): Promise<ConfigurationRefreshResult> {
    this.ensureInitialized();
    return this.configuration.refresh();
  }

  async mergeConfiguration(patch: Record<string, unknown>): Promise<ConfigurationMergeResult> {
    this.ensureInitialized();
    return this.configuration.merge(patch);
  }

  async rollbackConfiguration(): Promise<Configuration | null> {
    this.ensureInitialized();
    return this.configuration.rollback();
  }

  async publishConfiguration(): Promise<ConfigurationPublishResult> {
    this.ensureInitialized();
    return this.configuration.publish();
  }

  // ─── Metadata ───────────────────────────────────────────────

  async syncMetadata(): Promise<MetadataSyncResult> {
    this.ensureInitialized();
    const result = await this.metadata.sync();
    this.events.send({ name: 'metadata.sync', data: { version: result.metadata.version } });
    this.lastSyncTimestamp = Date.now();
    return result;
  }

  getMetadataVersion(): number | null {
    return this.metadata.getVersion();
  }

  getModules() {
    return this.metadata.getModules();
  }

  getMenus() {
    return this.metadata.getMenus();
  }

  getFeatures() {
    return this.metadata.getFeatures();
  }

  hasFeature(feature: string): boolean {
    return this.metadata.hasFeature(feature);
  }

  getPermissions() {
    return this.metadata.getPermissions();
  }

  getLimits() {
    return this.metadata.getLimits();
  }

  // ─── Events ─────────────────────────────────────────────────

  async sendEvent(event: SDKEvent): Promise<void> {
    this.ensureInitialized();
    await this.hookManager.trigger('beforeEvent', { event });
    await this.events.send(event);
    this.lastEventTimestamp = Date.now();
    await this.hookManager.trigger('afterEvent', { event });
  }

  async flushEvents(): Promise<void> {
    this.ensureInitialized();
    return this.events.flush();
  }

  // ─── Device (legacy API — preserved) ────────────────────────

  async registerDevice(
    payload: DeviceRegistrationPayload | DeviceRegistrationInput,
  ): Promise<Device> {
    this.ensureInitialized();
    const device = await this.deviceManager.register(payload);
    this.events.send({ name: SDK_EVENTS.DEVICE_REGISTERED, data: { deviceId: device.id } });
    return device;
  }

  async sendHeartbeat(metadata?: Record<string, unknown>): Promise<void> {
    this.ensureInitialized();
    return this.deviceManager.heartbeat(metadata);
  }

  getCurrentDevice(): Device | null {
    return this.deviceManager.getCurrentDevice();
  }

  // ─── Workspace ──────────────────────────────────────────────

  async getWorkspace(): Promise<Workspace> {
    this.ensureInitialized();
    return this.workspace.current();
  }

  async refreshWorkspace(): Promise<Workspace> {
    this.ensureInitialized();
    return this.workspace.refresh();
  }

  // ─── Device API (v1.1 namespaced) ───────────────────────────

  get device(): DeviceApi {
    this.ensureInitialized();
    return {
      register: (input: DeviceRegistrationInput) => this.registerDevice(input),
      current: () => this.deviceManager.current(),
      verify: () => this.deviceManager.verify(),
      heartbeat: (metadata?: Record<string, unknown>) => this.deviceManager.heartbeat(metadata),
      replace: (input: DeviceRegistrationInput) => this.deviceManager.replace(input),
      deactivate: () => this.deviceManager.deactivate(),
      checkDuplicate: (known: DuplicateCheckInput) => this.deviceManager.checkDuplicate(known),
      checkRisk: (overrides?: Partial<FraudAssessmentInput>) => this.deviceManager.checkRisk(overrides),
      getHistory: () => this.deviceManager.getHistory(),
    };
  }

  // ─── Security API ───────────────────────────────────────────

  get security(): SecurityApi {
    this.ensureInitialized();
    return {
      validate: (sig, replay, token, lic) => this.securityModule.validate(sig, replay, token, lic),
      validateSignature: (input) => this.securityModule.validateSignature(input),
      validateReplay: (input) => this.securityModule.validateReplay(input),
      validateToken: (input) => this.securityModule.validateToken(input),
      validateLicense: (input) => this.securityModule.validateLicense(input),
      encrypt: (data, key) => this.securityModule.encryptAES(data, key),
      decrypt: (data, key) => this.securityModule.decryptAES(data, key),
      createJWT: (payload, secret, expiresInSec) => this.securityModule.createJWT(payload, secret, expiresInSec),
      verifyJWT: (token, secret) => this.securityModule.verifyJWT(token, secret),
      checksum: (data) => this.securityModule.checksum(data),
      generateNonce: (length) => this.securityModule.generateNonce(length),
    };
  }

  // ─── Logger API ─────────────────────────────────────────────

  get logger(): LoggerApi {
    return {
      info: (msg, ...args) => this.loggerInstance.info(msg, ...args),
      warn: (msg, ...args) => this.loggerInstance.warning(msg, ...args),
      error: (msg, ...args) => this.loggerInstance.error(msg, ...args),
      debug: (msg, ...args) => this.loggerInstance.debug(msg, ...args),
    };
  }

  // ─── Plugin API ─────────────────────────────────────────────

  async registerPlugin(plugin: SDKPlugin): Promise<PluginRegistryResult> {
    this.ensureInitialized();
    return this.pluginManager.register(plugin);
  }

  async unregisterPlugin(name: string): Promise<boolean> {
    this.ensureInitialized();
    return this.pluginManager.unregister(name);
  }

  listPlugins(): SDKPlugin[] {
    return this.pluginManager.list();
  }

  // ─── Hook API ───────────────────────────────────────────────

  on(hook: HookName, handler: HookHandler) {
    return this.hookManager.on(hook, handler);
  }

  // ─── Sync API ───────────────────────────────────────────────

  async syncAll(): Promise<void> {
    this.ensureInitialized();
    await this.syncManager.syncAll();
  }

  getSyncState(): SyncStateSnapshot {
    return this.syncManager.getSnapshot();
  }

  setOnline(): void {
    this.syncManager.setOnline();
    this.events.setOnline();
  }

  setOffline(): void {
    this.syncManager.setOffline();
    this.events.setOffline();
  }

  // ─── Telemetry API ──────────────────────────────────────────

  getTelemetry(): TelemetrySnapshot {
    return this.telemetryManager.collect();
  }

  async ping(): Promise<number | null> {
    this.ensureInitialized();
    return this.telemetryManager.ping();
  }

  // ─── Update API ─────────────────────────────────────────────

  checkUpdate(type: 'sdk' | 'metadata' | 'configuration', latestVersion: number): UpdateCheckResult {
    return this.updateManager.checkUpdate(type, latestVersion);
  }

  async rollbackUpdate(type: 'sdk' | 'metadata' | 'configuration') {
    return this.updateManager.rollback(type);
  }

  // ─── Cache API ──────────────────────────────────────────────

  async clearCache(domain?: 'metadata' | 'configuration' | 'license' | 'device'): Promise<void> {
    if (domain) {
      await this.cacheManager.invalidateDomain(domain);
    } else {
      await this.cacheManager.clearAll();
    }
  }

  // ─── Platform Adapter ───────────────────────────────────────

  setPlatformAdapter(adapter: PlatformAdapter): void {
    this.platformAdapter = adapter;
  }

  async getFingerprint(): Promise<string> {
    return this.platformAdapter.getFingerprint();
  }

  async getPlatformInfo() {
    return this.platformAdapter.getPlatformInfo();
  }

  // ─── Misc ───────────────────────────────────────────────────

  isInitialized(): boolean {
    return this.initialized;
  }

  isReady(): boolean {
    return this.sdkReady;
  }

  isAuthenticated(): boolean {
    return this.auth.isAuthenticated();
  }

  getLogger(): Logger {
    return this.loggerInstance;
  }

  setLogLevel(level: LogLevel): void {
    this.loggerInstance.setLevel(level);
  }

  /** Tear down all background timers and services. */
  dispose(): void {
    this.deviceManager.stopHeartbeat();
    this.heartbeatService?.stop();
    this.events.stopAutoFlush();
    this.syncManager.stopScheduler();
    this.telemetryManager.stopAutoReport();
    this.cacheManager.dispose();
    this.loggerInstance.dispose();
    this.loggerInstance.debug('SDK disposed');
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('KaSandra SDK not initialized. Call Kasandra.initialize() first.');
    }
  }
}

// ─── Namespaced API interfaces ────────────────────────────────

interface DeviceApi {
  register(input: DeviceRegistrationInput): Promise<Device>;
  current(): DeviceProfile | null;
  verify(): Promise<DeviceVerifyResult>;
  heartbeat(metadata?: Record<string, unknown>): Promise<void>;
  replace(input: DeviceRegistrationInput): Promise<DeviceReplaceResult>;
  deactivate(): Promise<DeviceDeactivateResult>;
  checkDuplicate(known: DuplicateCheckInput): DuplicateCheckResult;
  checkRisk(overrides?: Partial<FraudAssessmentInput>): RiskAssessment;
  getHistory(): import('./types/index.js').DeviceHistoryEntry[];
}

interface SecurityApi {
  validate(sig: SignatureValidationInput, replay: ReplayProtectionInput, token: TokenValidationInput, lic: LicenseValidationInput): SecurityValidationResult;
  validateSignature(input: SignatureValidationInput): import('./types/index.js').SecurityCheckResult;
  validateReplay(input: ReplayProtectionInput): import('./types/index.js').SecurityCheckResult;
  validateToken(input: TokenValidationInput): import('./types/index.js').SecurityCheckResult;
  validateLicense(input: LicenseValidationInput): import('./types/index.js').SecurityCheckResult;
  encrypt(data: string, key: string): string;
  decrypt(data: string, key: string): string;
  createJWT(payload: Record<string, unknown>, secret: string, expiresInSec?: number): string;
  verifyJWT(token: string, secret: string): Record<string, unknown> | null;
  checksum(data: string): string;
  generateNonce(length?: number): string;
}

interface LoggerApi {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

// Re-export public surface
export * from './types/index.js';
export * from './core/index.js';
export * from './http/index.js';
export * from './storage/index.js';
export * from './utils/index.js';
export * from './fraud/index.js';
export * from './security/index.js';
export * from './plugins/index.js';
export * from './adapters/index.js';
export * from './cache/index.js';
export * from './sync/index.js';
export * from './telemetry/index.js';
export * from './update/index.js';
export * from './hooks/index.js';
export { AuthManager } from './auth/auth-manager.js';
export { ConfigurationManager } from './configuration/configuration-manager.js';
export { DeviceManager } from './device/device-manager.js';
export { HeartbeatService } from './device/heartbeat-service.js';
export { EventManager } from './events/event-manager.js';
export { LicenseManager } from './license/license-manager.js';
export { MetadataManager } from './metadata/metadata-manager.js';
export { WorkspaceManager } from './workspace/workspace-manager.js';
export { SecurityModule } from './security/security-module.js';
export { PluginManager } from './plugins/plugin-manager.js';
export { HookManager } from './hooks/hook-manager.js';
export { CacheManager } from './cache/cache-manager.js';
export { SyncManager } from './sync/sync-manager.js';
export { TelemetryManager } from './telemetry/telemetry-manager.js';
export { UpdateManager } from './update/update-manager.js';
export {
  NodePlatformAdapter,
  BrowserPlatformAdapter,
  ElectronPlatformAdapter,
  ReactNativePlatformAdapter,
  resolvePlatformAdapter,
} from './adapters/platform-adapters.js';
