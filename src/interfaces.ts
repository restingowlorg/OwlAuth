// src/interfaces.ts
import { AuthResult } from "./types";

/// Main interface for the AuthManager, defining available methods based on configured auth types
export interface IAuthManager {
  signup: (email: string, username: string, password: string) => Promise<AuthResult>;
  login: (email: string, password: string) => Promise<AuthResult>;
  changePassword: (
    userId: string | number,
    currentPassword: string,
    newPassword: string
  ) => Promise<AuthResult>;
  requestMagicLink?: (email: string) => Promise<AuthResult>;
  consumeMagicLink?: (token: string) => Promise<AuthResult>;
}
