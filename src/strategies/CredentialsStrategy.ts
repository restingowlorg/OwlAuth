import { BcryptAdapter } from "../adapters/BcryptAdapter";
import { AuthService } from "../services/auth.service";
import { AuthDB, AuthOptions, IAuthManager, IAuthStrategy, Mutable } from "../types";

export class CredentialsAuthStrategy implements IAuthStrategy {
  register(target: Mutable<Partial<IAuthManager>>, db: AuthDB, options: AuthOptions): void {
    const cryptoAdapter = options.cryptoAdapter ?? new BcryptAdapter();
    const service = new AuthService(db.userRepo, cryptoAdapter);

    target.credentials = {
      signup: (email: string, username: string, password: string) =>
        service.signup(email, username, password, options.blockedPasswords),

      login: (email: string, password: string) => service.login(email, password),

      changePassword: (userId: string | number, currentPass: string, newPass: string) =>
        service.changePassword(userId, currentPass, newPass, options.blockedPasswords)
    };
  }
}
