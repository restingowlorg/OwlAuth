import { ObjectId } from "mongodb";

export interface IMongoMagicLinkDoc {
  _id?: ObjectId;
  user_id: ObjectId;
  token: string;
  expires_at: Date;
  used_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface IMongoUserDoc {
  _id?: ObjectId; // MongoDB ObjectId (optional when inserting)
  email: string;
  username: string;
  password: string;
  created_at?: Date; // optional timestamps
  updated_at?: Date;
}

export type InitMongoOptions = {
  mongoUri: string;
  magicLinkCollectionName?: string;
  userCollectionName: string;
};
