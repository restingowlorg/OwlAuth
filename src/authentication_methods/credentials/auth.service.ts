import { UserRepository } from '../../repositories/contracts';
import { hashPassword, verifyPassword } from '../../infra/crypto/crypto';

export const AuthService = {
  async signup(email: string, password: string , UserRepo: UserRepository) {
    const passwordHash = await hashPassword(password);
    return UserRepo.create(email, passwordHash);
  },
  async login(email: string, password: string , UserRepo: UserRepository) {
    const user = await UserRepo.findByEmail(email);
    if (!user) return null;
    const valid = await verifyPassword(password, user.password);
    return valid ? user : null;
  }
};
