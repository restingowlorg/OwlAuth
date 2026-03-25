export const PostgresUserSchema = {
  requiredColumns: ["id", "email", "username", "password"] as const
};

export const PostgresMagicLinkSchema = {
  requiredColumns: ["id", "user_id", "token", "expires_at", "used_at", "created_at"] as const
};
