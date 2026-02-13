// ------------------------------
// Authenticated User Interface
// ------------------------------
export interface AuthUser {
  id: string;
  email: string;
  username?: string;
}

// ------------------------------
// Repository Interface
// ------------------------------
export interface AuthDB {
  userRepo: any;
  magicLinkRepo?: any;
}

// ------------------------------
// Magic Link Token Type
// ------------------------------
export interface MagicLinkToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date;
}

// ------------------------------
// Standard Auth Result
// ------------------------------
export interface AuthResult<T = any> {
  success: boolean;
  data?: T;
  httpCode: number;
  message: string;
}
