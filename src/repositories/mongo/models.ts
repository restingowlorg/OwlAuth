import { Schema, model, Types } from "mongoose";

/* -------------------- USER -------------------- */
const UserSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      index: true,
      lowercase: true,
      trim: true,
    },

    username: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },

    password: {
      type: String,
      required: true,
      select: false,
    },
  },
  { timestamps: true }
);

/* -------------------- SESSION -------------------- */
const SessionSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    expiresAt: { type: Date, required: true, index: true },
    lastUsedAt: { type: Date, required: true, index: true },
    revokedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

/* -------------------- MAGIC LINK -------------------- */
const MagicLinkSchema = new Schema(
  {
    userId: {
      type: Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    tokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },

    usedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

/* -------------------- MODELS -------------------- */
export const UserModel = model("User", UserSchema);
export const SessionModel = model("Session", SessionSchema);
export const MagicLinkModel = model("MagicLink", MagicLinkSchema);
