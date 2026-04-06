import { PostgresUserSchema } from "./schema";

export type MagicLinkRow = {
  id: number | string;
  user_id: number | string;
  token: string;
  expires_at: Date;
  used_at: Date | null;
  created_at: Date;
};

export type TableColumn = {
  column_name: string;
  is_nullable?: "YES" | "NO";
  data_type?: string;
};

export type ColumnRow = {
  column_name: string;
};

export interface FKRow {
  referenced_table: string;
  referenced_column: string;
}

export interface TableExistsRow {
  exists: boolean;
}

export interface ColumnInfoRow {
  column_name: string;
  is_nullable: "YES" | "NO";
}

export interface PrimaryKeyRow {
  column_name: string;
  data_type: string;
}

export type UserColumn = (typeof PostgresUserSchema.requiredColumns)[number];

export interface InitPostgresOptions {
  postgresUrl: string;
  userTableName: string;
  userSchema?: string;
  magicLinkTableName?: string;
  magicLinkSchema?: string;
}
