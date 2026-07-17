/** Syncable metadata document from the Membership Server. */
export interface Metadata {
  applicationId: string;
  version: number;
  entries: Record<string, unknown>;
  updatedAt: string;
  /** Application modules available to this workspace. */
  modules?: MetadataModule[];
  /** Navigation menus for the application. */
  menus?: MetadataMenu[];
  /** Feature flags enabled for this application. */
  features?: string[];
  /** Role-based permissions. */
  permissions?: MetadataPermission[];
  /** Workspace limits. */
  limits?: MetadataLimits;
  /** Server-defined event subscriptions. */
  events?: MetadataEventBinding[];
}

export interface MetadataModule {
  id: string;
  name: string;
  enabled: boolean;
  route?: string;
  icon?: string;
}

export interface MetadataMenu {
  id: string;
  label: string;
  route: string;
  parentId?: string;
  order: number;
  permission?: string;
}

export interface MetadataPermission {
  role: string;
  actions: string[];
  resource: string;
}

export interface MetadataLimits {
  maxUsers: number;
  maxDevices: number;
  maxApplications: number;
  storageMb: number;
  apiRateLimit: number;
}

export interface MetadataEventBinding {
  name: string;
  webhook?: string;
  retryable: boolean;
}

/** Result of a metadata sync. */
export interface MetadataSyncResult {
  metadata: Metadata;
  updated: boolean;
  previousVersion?: number;
}
