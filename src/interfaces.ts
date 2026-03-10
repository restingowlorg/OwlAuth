// src/interfaces.ts
import { AuthResult } from "./types";
export interface AuthenticatedRequest {
  user?: { id: string };
  session?: { sessionToken?: string };
}

export interface IAuthManager {
  signup: (email: string, username: string, password: string) => Promise<AuthResult>;
  login: (email: string, password: string) => Promise<AuthResult>;
  logout: (sessionId: string) => Promise<AuthResult>;
  me: (sessionId: string) => Promise<AuthResult>;
  changePassword?: (
    req: AuthenticatedRequest,
    currentPassword: string,
    newPassword: string
  ) => Promise<AuthResult>;
  requestMagicLink?: (email: string) => Promise<AuthResult>;
  consumeMagicLink?: (token: string) => Promise<AuthResult>;
}
