import { describe, it, expect } from 'vitest';
import {
  NodePlatformAdapter,
  BrowserPlatformAdapter,
  ElectronPlatformAdapter,
  ReactNativePlatformAdapter,
  resolvePlatformAdapter,
} from './platform-adapters.js';

describe('Platform Adapters', () => {
  it('NodePlatformAdapter collects fingerprint and info', async () => {
    const adapter = new NodePlatformAdapter();
    const fp = await adapter.getFingerprint();
    expect(fp).toMatch(/^fp_/);
    expect(fp.length).toBeGreaterThan(5);

    const info = await adapter.getPlatformInfo();
    expect(info.platform).toBe('node');
    expect(info.os).toBeDefined();
    expect(info.sdkVersion).toBe('1.1.0');
  });

  it('BrowserPlatformAdapter collects fingerprint', async () => {
    const adapter = new BrowserPlatformAdapter();
    const fp = await adapter.getFingerprint();
    expect(fp).toMatch(/^fp_/);

    const info = await adapter.getPlatformInfo();
    expect(info.platform).toBe('browser');
  });

  it('ElectronPlatformAdapter collects fingerprint', async () => {
    const adapter = new ElectronPlatformAdapter();
    const fp = await adapter.getFingerprint();
    expect(fp).toMatch(/^fp_/);
  });

  it('ReactNativePlatformAdapter collects fingerprint', async () => {
    const adapter = new ReactNativePlatformAdapter();
    const fp = await adapter.getFingerprint();
    expect(fp).toMatch(/^fp_/);
  });

  it('resolvePlatformAdapter returns correct adapter', () => {
    expect(resolvePlatformAdapter('node')).toBeInstanceOf(NodePlatformAdapter);
    expect(resolvePlatformAdapter('browser')).toBeInstanceOf(BrowserPlatformAdapter);
    expect(resolvePlatformAdapter('electron')).toBeInstanceOf(ElectronPlatformAdapter);
    expect(resolvePlatformAdapter('react-native')).toBeInstanceOf(ReactNativePlatformAdapter);
  });
});
