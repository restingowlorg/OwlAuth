
import { UserRepository } from '../contracts';
import { UserModel } from './models';

export const MongoUserRepo: UserRepository = {
  create(email: string, passwordHash: string) {
    return UserModel.create({ email, passwordHash });
  },
  findByEmail(email: string) {
    return UserModel.findOne({ email });
  },
  findById(id: string) {
    return UserModel.findById(id).select('-passwordHash');
  }
};
