import { AuthResult } from "./types";

export interface IAuthManager {
  signup: (email: string, username: string, password: string) => Promise<AuthResult>;
  login: (email: string, password: string) => Promise<AuthResult>;
  logout: (sessionId: string) => Promise<AuthResult>;
  me: (sessionId: number) => Promise<AuthResult>;
  requestMagicLink?: (email: string) => Promise<AuthResult>;
  consumeMagicLink?: (token: string) => Promise<AuthResult>;
}
