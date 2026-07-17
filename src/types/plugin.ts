/** A plugin that extends SDK behavior without modifying core code. */
export interface SDKPlugin {
  /** Unique plugin name. */
  name: string;
  /** Semantic version of the plugin. */
  version: string;
  /** Called once when the plugin is registered. */
  install?(context: PluginContext): void | Promise<void>;
  /** Called when the plugin is removed. */
  uninstall?(): void | Promise<void>;
}

/** Context handed to a plugin during installation. */
export interface PluginContext {
  applicationId: string;
  logger: {
    info(message: string, ...args: unknown[]): void;
    warning(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
    debug(message: string, ...args: unknown[]): void;
  };
  /** Send an event through the SDK event pipeline. */
  sendEvent(event: {
    name: string;
    data?: Record<string, unknown>;
    level?: 'info' | 'warning' | 'error' | 'debug';
  }): Promise<void>;
}

/** Registry result. */
export interface PluginRegistryResult {
  name: string;
  installed: boolean;
}
