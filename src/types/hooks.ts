/** SDK lifecycle hook names. */
export type HookName =
  | 'beforeInit'
  | 'afterInit'
  | 'beforeSync'
  | 'afterSync'
  | 'beforeEvent'
  | 'afterEvent'
  | 'beforeLicenseValidation'
  | 'afterLicenseValidation';

/** Hook handler function. */
export type HookHandler = (context: HookContext) => void | Promise<void>;

/** Context passed to hook handlers. */
export interface HookContext {
  /** The hook name that triggered. */
  hook: HookName;
  /** Mutable payload relevant to the hook. */
  data?: Record<string, unknown>;
  /** Abort the operation if set to true. */
  abort?: boolean;
}

/** Registration returned by the hook system. */
export interface HookRegistration {
  hook: HookName;
  handler: HookHandler;
  /** Remove this hook registration. */
  remove: () => void;
}
