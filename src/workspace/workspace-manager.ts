import { SDKError } from '../core/errors.js';
import type { HttpClient } from '../http/http-client.js';
import type { Logger } from '../utils/logger.js';
import type { StorageAdapter } from '../storage/types.js';
import type { Workspace } from '../types/index.js';

const STORAGE_KEY = 'kasandra:workspace';

interface WorkspaceManagerDeps {
  http: HttpClient;
  storage: StorageAdapter;
  logger: Logger;
}

/**
 * Tracks the current workspace (tenant) for the authenticated user.
 */
export class WorkspaceManager {
  private deps: WorkspaceManagerDeps;
  private workspace: Workspace | null = null;

  constructor(deps: WorkspaceManagerDeps) {
    this.deps = deps;
  }

  async current(): Promise<Workspace> {
    const response = await this.deps.http.get<Workspace>('/workspace');
    if (!response.ok) {
      throw new SDKError(
        'Failed to load workspace',
        'NETWORK_ERROR',
        response.status,
        response.data,
      );
    }
    this.workspace = response.data;
    await this.persist(response.data);
    this.deps.logger.debug(`Workspace loaded: ${response.data.name}`);
    return response.data;
  }

  async refresh(): Promise<Workspace> {
    return this.current();
  }

  getCached(): Workspace | null {
    return this.workspace;
  }

  async restore(): Promise<void> {
    const raw = await this.deps.storage.get(STORAGE_KEY);
    if (!raw) return;
    try {
      this.workspace = JSON.parse(raw) as Workspace;
    } catch {
      await this.deps.storage.remove(STORAGE_KEY);
    }
  }

  async clear(): Promise<void> {
    this.workspace = null;
    await this.deps.storage.remove(STORAGE_KEY);
  }

  private async persist(workspace: Workspace): Promise<void> {
    await this.deps.storage.set(STORAGE_KEY, JSON.stringify(workspace));
  }
}
