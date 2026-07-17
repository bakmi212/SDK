/** Update check result. */
export interface UpdateCheckResult {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion?: string;
  downloadUrl?: string;
  changelog?: string;
}

/** Snapshot of a versioned resource. */
export interface VersionSnapshot<T = unknown> {
  version: number;
  data: T;
  takenAt: number;
}

/** Rollback result. */
export interface RollbackResult<T = unknown> {
  success: boolean;
  restoredVersion: number;
  data?: T;
}

/** Update checker type. */
export type UpdateResourceType = 'sdk' | 'metadata' | 'configuration';
