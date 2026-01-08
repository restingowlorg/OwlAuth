import { UserRepository, CreateUserInput } from "../contracts";
import { UserModel } from "./models";

export const MongoUserRepo: UserRepository = {
  create(input: CreateUserInput) {
    const { email, username, passwordHash } = input;

    return UserModel.create({
      email,
      username,
      password: passwordHash,
    });
  },

  findByEmail(email: string) {
    return UserModel.findOne({ email });
  },

  findById(id: string) {
    return UserModel.findById(id).select("-password");
  },

  findByUsername(username: string) {
    return UserModel.findOne({ username });
  },

  async updatePassword(userId: string, passwordHash: string) {
    await UserModel.updateOne(
      { _id: userId },
      { $set: { password: passwordHash } }
    );
  },
};
