export type LogLevel = 'info' | 'warning' | 'error' | 'debug';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warning: 30,
  error: 40,
};

const LEVEL_PREFIX: Record<LogLevel, string> = {
  debug: '[KaSandra:DEBUG]',
  info: '[KaSandra:INFO]',
  warning: '[KaSandra:WARN]',
  error: '[KaSandra:ERROR]',
};

/** A captured log entry for remote logging. */
export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: number;
  args?: unknown[];
}

interface RemoteLoggerDeps {
  send: (entries: LogEntry[]) => Promise<void>;
  flushInterval: number;
  batchSize: number;
}

/**
 * Internal SDK logger with leveled output, remote log batching,
 * and SDK-specific log channels.
 */
export class Logger {
  private level: LogLevel;
  private enabled: boolean;
  private remoteBuffer: LogEntry[] = [];
  private remoteDeps: RemoteLoggerDeps | null = null;
  private remoteTimer: ReturnType<typeof setInterval> | null = null;

  constructor(level: LogLevel = 'info', enabled = true) {
    this.level = level;
    this.enabled = enabled;
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /** Enable remote logging with batched flush. */
  enableRemoteLogging(deps: RemoteLoggerDeps): void {
    this.remoteDeps = deps;
    this.startRemoteFlush();
  }

  /** Disable remote logging. */
  disableRemoteLogging(): void {
    this.remoteDeps = null;
    if (this.remoteTimer) {
      clearInterval(this.remoteTimer);
      this.remoteTimer = null;
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return this.enabled && LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[this.level];
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog('debug')) {
      console.debug(LEVEL_PREFIX.debug, message, ...args);
    }
    this.captureRemote('debug', message, args);
  }

  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog('info')) {
      console.info(LEVEL_PREFIX.info, message, ...args);
    }
    this.captureRemote('info', message, args);
  }

  warning(message: string, ...args: unknown[]): void {
    if (this.shouldLog('warning')) {
      console.warn(LEVEL_PREFIX.warning, message, ...args);
    }
    this.captureRemote('warning', message, args);
  }

  /** Alias for warning() — matches the public `logger.warn()` API. */
  warn(message: string, ...args: unknown[]): void {
    this.warning(message, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    if (this.shouldLog('error')) {
      console.error(LEVEL_PREFIX.error, message, ...args);
    }
    this.captureRemote('error', message, args);
  }

  /** SDK-specific log channel — always captured for remote, printed only if enabled. */
  sdk(message: string, ...args: unknown[]): void {
    if (this.shouldLog('info')) {
      console.info('[KaSandra:SDK]', message, ...args);
    }
    this.captureRemote('info', message, args);
  }

  private captureRemote(level: LogLevel, message: string, args: unknown[]): void {
    if (!this.remoteDeps) return;
    this.remoteBuffer.push({
      level,
      message,
      timestamp: Date.now(),
      args: args.length > 0 ? args : undefined,
    });
    if (this.remoteBuffer.length >= this.remoteDeps.batchSize) {
      void this.flushRemote();
    }
  }

  async flushRemote(): Promise<void> {
    if (!this.remoteDeps || this.remoteBuffer.length === 0) return;
    const batch = this.remoteBuffer.splice(0, this.remoteDeps.batchSize);
    try {
      await this.remoteDeps.send(batch);
    } catch {
      // Re-queue on failure
      this.remoteBuffer.unshift(...batch);
    }
  }

  private startRemoteFlush(): void {
    if (!this.remoteDeps) return;
    this.remoteTimer = setInterval(() => {
      void this.flushRemote().catch(() => {});
    }, this.remoteDeps.flushInterval);
  }

  dispose(): void {
    this.disableRemoteLogging();
  }
}
