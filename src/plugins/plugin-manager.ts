import { SDKError } from '../core/errors.js';
import type {
  PluginContext,
  PluginRegistryResult,
  SDKPlugin,
} from '../types/index.js';

interface PluginManagerDeps {
  applicationId: string;
  logger: {
    info(message: string, ...args: unknown[]): void;
    warning(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
    debug(message: string, ...args: unknown[]): void;
  };
  sendEvent: (event: {
    name: string;
    data?: Record<string, unknown>;
    level?: 'info' | 'warning' | 'error' | 'debug';
  }) => Promise<void>;
}

/**
 * Plugin registry. Allows external packages (Cloudflare, Firebase, Supabase,
 * Resend, OneSignal, Midtrans) to extend the SDK without modifying core code.
 */
export class PluginManager {
  private deps: PluginManagerDeps;
  private plugins = new Map<string, SDKPlugin>();

  constructor(deps: PluginManagerDeps) {
    this.deps = deps;
  }

  async register(plugin: SDKPlugin): Promise<PluginRegistryResult> {
    if (this.plugins.has(plugin.name)) {
      throw new SDKError(
        `Plugin "${plugin.name}" is already registered`,
        'VALIDATION_ERROR',
      );
    }

    const context: PluginContext = {
      applicationId: this.deps.applicationId,
      logger: this.deps.logger,
      sendEvent: this.deps.sendEvent,
    };

    try {
      if (plugin.install) {
        await plugin.install(context);
      }
      this.plugins.set(plugin.name, plugin);
      this.deps.logger.info(`Plugin registered: ${plugin.name} v${plugin.version}`);
      return { name: plugin.name, installed: true };
    } catch (error) {
      throw new SDKError(
        `Failed to install plugin "${plugin.name}": ${(error as Error).message}`,
        'PLUGIN_ERROR',
      );
    }
  }

  async unregister(name: string): Promise<boolean> {
    const plugin = this.plugins.get(name);
    if (!plugin) return false;
    try {
      if (plugin.uninstall) {
        await plugin.uninstall();
      }
    } catch (error) {
      this.deps.logger.warning(
        `Plugin "${name}" uninstall error: ${(error as Error).message}`,
      );
    }
    this.plugins.delete(name);
    this.deps.logger.info(`Plugin unregistered: ${name}`);
    return true;
  }

  get(name: string): SDKPlugin | undefined {
    return this.plugins.get(name);
  }

  list(): SDKPlugin[] {
    return Array.from(this.plugins.values());
  }

  isRegistered(name: string): boolean {
    return this.plugins.has(name);
  }

  async unregisterAll(): Promise<void> {
    const names = Array.from(this.plugins.keys());
    for (const name of names) {
      await this.unregister(name);
    }
  }
}
