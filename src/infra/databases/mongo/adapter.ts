import { BaseAuthOptions } from "../../../core/types";
import { AuthDB } from "../../../repositories/contracts";
import { IDatabaseAdapter } from "../types";
import { connectMongo } from "./db";
import { InitMongoOptions } from "./types";

export class MongoAdapter implements IDatabaseAdapter {
  constructor(private readonly config: InitMongoOptions) {}

  async connect(options: BaseAuthOptions): Promise<AuthDB> {
    const { mongoUri, userCollectionName, magicLinkCollectionName } = this.config;
    const { authTypes } = options;

    if (!mongoUri) throw new Error("[Auth:MongoAdapter] mongoUri is required for MongoAdapter");
    if (!userCollectionName)
      throw new Error("[Auth:MongoAdapter] userCollectionName is required for MongoAdapter");

    return await connectMongo({
      mongoUri,
      userCollectionName,
      magicLinkCollectionName,
      authTypes
    });
  }
}
