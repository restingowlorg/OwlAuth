import { UserRepository } from "../contracts";
import { User } from "../../types";
import { UserModel } from "./models";

export const MongoUserRepo: UserRepository = {
  async create(email: string, passwordHash: string): Promise<User> {
    const doc = await UserModel.create({ email, password: passwordHash });

    // ensure email and createdAt exist for the User interface
    return {
      id: doc._id.toString(),
      email: doc.email || "", // map null/undefined to empty string if needed
      password: doc.password,
      createdAt: doc.createdAt
    };
  },

  async findByEmail(email: string): Promise<User | null> {
    const doc = await UserModel.findOne({ email }).exec();
    if (!doc) return null;
    return {
      id: doc._id.toString(),
      email: doc.email || "",
      password: doc.password,
      createdAt: doc.createdAt
    };
  },

  async findById(id: string): Promise<User | null> {
    const doc = await UserModel.findById(id).select("-password").exec();
    if (!doc) return null;
    return {
      id: doc._id.toString(),
      email: doc.email || "",
      password: "", // password excluded by select
      createdAt: doc.createdAt
    };
  }
};
