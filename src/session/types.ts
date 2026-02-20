export interface SessionData {
  token: string;
  publicKey: string;
  userId: string;
  authProvider: 'google' | 'apple' | 'manual';
  createdAt: number;
  expiresAt: number;
}

export interface AuthResponse {
  token: string;
  publicKey: string;
  userId: string;
}
