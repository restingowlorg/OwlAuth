import { Schema, model, Types } from 'mongoose';

const UserSchema = new Schema({
  email: { type: String, unique: true, index: true },
  password: { type: String, required: true }
}, { timestamps: true });

const SessionSchema = new Schema({
  userId: { type: Types.ObjectId, ref: 'User', required: true },
  expiresAt: { type: Date, index: { expires: 0 } }
});

const MagicLinkSchema = new Schema({
  userId: { type: String, required: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date }
});

export const UserModel = model('User', UserSchema);
export const SessionModel = model('Session', SessionSchema);
export const MagicLinkModel = model('MagicLink', MagicLinkSchema);
