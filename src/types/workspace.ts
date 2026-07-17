/** A KaSandra workspace (tenant) that groups applications and users. */
export interface Workspace {
  id: string;
  name: string;
  slug: string;
  plan: WorkspacePlan;
  status: WorkspaceStatus;
  features: string[];
  limits: WorkspaceLimits;
  createdAt: string;
  updatedAt: string;
}

export type WorkspacePlan = 'free' | 'starter' | 'pro' | 'enterprise';

export type WorkspaceStatus = 'active' | 'suspended' | 'trialing' | 'canceled';

export interface WorkspaceLimits {
  maxUsers: number;
  maxDevices: number;
  maxApplications: number;
  storageMb: number;
}
