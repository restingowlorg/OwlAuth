export const PostgresUserSchema = {
  requiredColumns: ["id", "email", "username", "password", "updated_at"] as const
};

export const PostgresAccountSecuritySchema = {
  requiredColumns: ["id", "user_id", "status", "email_verified_at", "updated_at"] as const
};

export const PostgresMagicLinkSchema = {
  requiredColumns: [
    "id",
    "user_id",
    "lookup_key",
    "token_hash",
    "expires_at",
    "used_at",
    "created_at"
  ] as const
};
