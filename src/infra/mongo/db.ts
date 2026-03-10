import mongoose from "mongoose";
import { MongoMagicLinkRepo } from "../../repositories/mongo/magicLink.repo";
import { MongoUserRepo } from "../../repositories/mongo/user.repo";
import { AuthDB } from "../../types";

export async function connectMongo(uri: string): Promise<AuthDB> {
  await mongoose.connect(uri);
  return {
    userRepo: MongoUserRepo,
    magicLinkRepo: MongoMagicLinkRepo
  };
}
