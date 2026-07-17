/** Result of a logout operation. */
export interface LogoutResult {
  success: boolean;
}

/** Persistent auth state stored by the storage adapter. */
export interface StoredAuthState {
  session: AuthSessionLike | null;
}

/** Minimal session shape persisted to storage (avoids circular type imports). */
export interface AuthSessionLike {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
}
