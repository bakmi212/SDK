import { describe, it, expect, beforeEach } from 'vitest';
import { TelemetryManager } from './telemetry-manager.js';
import { Logger } from '../utils/logger.js';
import { HttpClient } from '../http/http-client.js';

describe('TelemetryManager', () => {
  let logger: Logger;
  let http: HttpClient;

  beforeEach(() => {
    logger = new Logger('error', false);
    http = new HttpClient({
      baseUrl: 'https://api.example.com',
      timeout: 5000,
      maxRetries: 0,
      logger,
    });
  });

  it('collects a telemetry snapshot', () => {
    const tm = new TelemetryManager({
      http,
      logger,
      endpoints: { telemetryReport: '/telemetry' } as never,
      enabled: true,
      reportIntervalMs: 300000,
    });

    const snapshot = tm.collect();
    expect(snapshot.sdkVersion).toBeDefined();
    expect(snapshot.platform).toBeDefined();
    expect(snapshot.memoryUsage.rss).toBeGreaterThan(0);
    expect(snapshot.timestamp).toBeGreaterThan(0);
  });

  it('records request durations', () => {
    const tm = new TelemetryManager({
      http,
      logger,
      endpoints: { telemetryReport: '/telemetry' } as never,
      enabled: true,
      reportIntervalMs: 300000,
    });

    tm.recordRequestDuration({
      url: '/test',
      method: 'GET',
      durationMs: 150,
      status: 200,
      timestamp: Date.now(),
    });

    expect(tm.getAverageRequestDuration()).toBe(150);
  });

  it('records crashes', () => {
    const tm = new TelemetryManager({
      http,
      logger,
      endpoints: { telemetryReport: '/telemetry' } as never,
      enabled: true,
      reportIntervalMs: 300000,
    });

    tm.recordCrash({
      message: 'Test crash',
      stack: 'Error: Test',
      timestamp: Date.now(),
      sdkVersion: '1.2.0',
    });

    expect(tm.getCrashes()).toHaveLength(1);
    expect(tm.getCrashes()[0].message).toBe('Test crash');
  });

  it('does not report when disabled', async () => {
    const tm = new TelemetryManager({
      http,
      logger,
      endpoints: { telemetryReport: '/telemetry' } as never,
      enabled: false,
      reportIntervalMs: 300000,
    });

    // Should not throw and should be a no-op
    await tm.report();
  });
});
