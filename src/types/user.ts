/** A KaSandra platform user. */
export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  role: UserRole;
  workspaceId?: string;
  createdAt: string;
  updatedAt: string;
}

/** Known user roles across the KaSandra ecosystem. */
export type UserRole =
  | 'owner'
  | 'admin'
  | 'manager'
  | 'staff'
  | 'member'
  | 'affiliate'
  | 'developer';

/** Login credentials. */
export interface LoginCredentials {
  email: string;
  password: string;
}

/** Result of a successful login or token refresh. */
export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: User;
}
