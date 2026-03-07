import { SessionRepository } from "../contracts";
import { Session, UserId } from "../../types";
import { SessionModel } from "./models";
import { Types } from "mongoose";

export const MongoSessionRepo: SessionRepository = {
  async create(userId: UserId, expiresAt: Date): Promise<Session> {
    // Convert string/number to ObjectId
    const mongoId =
      typeof userId === "string" || typeof userId === "number"
        ? new Types.ObjectId(userId.toString())
        : userId;

    const doc = await SessionModel.create({ userId: mongoId, expiresAt });

    const obj = doc.toObject();
    return {
      id: obj._id.toString(),
      userId: obj.userId.toString(),
      expiresAt: obj.expiresAt,
      createdAt: obj.createdAt
    };
  },

  async findById(id: string): Promise<Session | null> {
    const doc = await SessionModel.findById(id).exec();
    if (!doc) return null;

    const obj = doc.toObject();
    return {
      id: obj._id.toString(),
      userId: obj.userId.toString(),
      expiresAt: obj.expiresAt,
      createdAt: obj.createdAt
    };
  },

  async delete(id: string): Promise<void> {
    await SessionModel.findByIdAndDelete(id).exec();
  }
};
