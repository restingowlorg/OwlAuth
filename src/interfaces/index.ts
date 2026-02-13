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

export interface IAuthManager {
  signup: (
    email: string,
    username: string,
    password: string,
  ) => Promise<AuthResult>;
  login: (email: string, password: string) => Promise<AuthResult>;
  changePassword: (
    userId: any,
    currentPassword: string,
    newPassword: string,
  ) => Promise<AuthResult>;
  requestMagicLink?: (email: string) => Promise<AuthResult>;
  consumeMagicLink?: (token: string) => Promise<AuthResult>;
}
