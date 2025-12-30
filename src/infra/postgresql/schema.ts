export const PostgresUserSchema = {
  requiredColumns: ['id', 'email', 'username', 'password'] as const,
};