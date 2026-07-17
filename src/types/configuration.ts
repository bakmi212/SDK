/** A downloadable runtime configuration document. */
export interface Configuration {
  applicationId: string;
  version: number;
  data: Record<string, unknown>;
  updatedAt: string;
  checksum?: string;
}

/** Result of a configuration refresh. */
export interface ConfigurationRefreshResult {
  configuration: Configuration;
  updated: boolean;
}

/** A saved configuration snapshot for rollback. */
export interface ConfigurationSnapshot {
  version: number;
  data: Record<string, unknown>;
  checksum?: string;
  takenAt: number;
}

/** Result of a configuration merge. */
export interface ConfigurationMergeResult {
  configuration: Configuration;
  mergedKeys: string[];
}

/** Result of a configuration publish. */
export interface ConfigurationPublishResult {
  published: boolean;
  version: number;
}
