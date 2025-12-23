import { SessionRepository } from "../contracts";
import { SessionModel } from "./models";

export const MongoSessionRepo: SessionRepository = {
  create(userId: string, expiresAt: Date) {
    return SessionModel.create({ userId, expiresAt });
  },
  findById(id: string) {
    return SessionModel.findById(id);
  },
  delete: async (id: string) => {
    await SessionModel.findByIdAndDelete(id);
  },
};
