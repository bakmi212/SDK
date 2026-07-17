/** Severity level for events sent to the platform. */
export type EventLevel = 'info' | 'warning' | 'error' | 'debug';

/** Event priority for queue ordering. */
export type EventPriority = 'low' | 'normal' | 'high' | 'critical';

/** A single event dispatched to the KaSandra event pipeline. */
export interface SDKEvent {
  /** Application-defined event name, e.g. `pos.sale.completed`. */
  name: string;
  level?: EventLevel;
  /** Optional category for grouping. */
  category?: string;
  /** Event payload — must be JSON-serializable. */
  data?: Record<string, unknown>;
  /** Unix epoch (ms) when the event occurred. */
  timestamp?: number;
  /** Optional correlation id for tracing. */
  correlationId?: string;
  /** Priority for queue ordering. Defaults to 'normal'. */
  priority?: EventPriority;
}

/** Internal event enriched with guaranteed metadata before dispatch. */
export interface EnrichedEvent extends SDKEvent {
  applicationId: string;
  timestamp: number;
  priority: EventPriority;
}

/** Batch of events sent in a single request. */
export interface EventBatch {
  events: EnrichedEvent[];
  batchId: string;
  compressed?: boolean;
}

/** Offline queue entry for events that failed to send. */
export interface EventOfflineEntry {
  id: string;
  event: EnrichedEvent;
  timestamp: number;
  attempts: number;
}
