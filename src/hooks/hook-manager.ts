import type { HookContext, HookHandler, HookName, HookRegistration } from '../types/index.js';

interface HookManagerDeps {
  logger: {
    debug(message: string, ...args: unknown[]): void;
  };
}

/**
 * Lifecycle hook system. Developers can register custom logic at key SDK
 * lifecycle points without modifying the SDK core.
 */
export class HookManager {
  private deps: HookManagerDeps;
  private hooks = new Map<HookName, Set<HookHandler>>();

  constructor(deps: HookManagerDeps) {
    this.deps = deps;
  }

  /** Register a handler for a lifecycle hook. Returns a removal function. */
  on(hook: HookName, handler: HookHandler): HookRegistration {
    let set = this.hooks.get(hook);
    if (!set) {
      set = new Set();
      this.hooks.set(hook, set);
    }
    set.add(handler);

    const registration: HookRegistration = {
      hook,
      handler,
      remove: () => {
        set?.delete(handler);
      },
    };
    return registration;
  }

  /** Trigger all handlers for a hook. Stops if any handler aborts. */
  async trigger(hook: HookName, data?: Record<string, unknown>): Promise<boolean> {
    const set = this.hooks.get(hook);
    if (!set || set.size === 0) return true;

    const context: HookContext = { hook, data: data ?? {} };

    for (const handler of set) {
      try {
        await handler(context);
      } catch (error) {
        this.deps.logger.debug(`Hook ${hook} handler error:`, error);
      }
      if (context.abort) {
        this.deps.logger.debug(`Hook ${hook} aborted by handler`);
        return false;
      }
    }
    return true;
  }

  /** Remove all handlers for a hook, or all hooks if no hook specified. */
  clear(hook?: HookName): void {
    if (hook) {
      this.hooks.delete(hook);
    } else {
      this.hooks.clear();
    }
  }

  /** List registered hook names. */
  listHooks(): HookName[] {
    return Array.from(this.hooks.keys());
  }
}
