// ------------------------------
// Supported Authentication Methods

import { MagicLinkService } from "../authentication_methods/magic-links/magic-link.service";

// ------------------------------
export type AuthType = "credentials" | "magic-link";

// ------------------------------
// PostgreSQL & MongoDB DB options
// ------------------------------
export type InitPostgresOptions = {
  postgresUrl: string;
  magicLinkTableName?: string; // Optional, default will be "magic_links"
  userTableName: string;
};

export type InitMongoOptions = {
  mongoUri: string;
  magicLinkCollectionName?: string; // Optional, default will be "magic_links"
  userCollectionName: string;
};

// ------------------------------
// Type-safe options for AuthManager.init()
// ------------------------------
export type BaseAuthOptions = {
  authTypes?: AuthType[];
  blockedPasswords?: string[];
  magicLinkService?: MagicLinkService;
  magicLinkBaseUrl?: string;
};

export type AuthOptions =
  | (BaseAuthOptions & {
      dbType: "postgres";
      dbOptions: InitPostgresOptions;
    })
  | (BaseAuthOptions & {
      dbType: "mongo";
      dbOptions: InitMongoOptions;
    });

export type AuthLogLevel = "info" | "warn" | "error";