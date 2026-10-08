export const MongoAccountSecuritySchema = {
  requiredFields: ["user_id", "status", "email_verified_at", "updated_at"] as const
};
