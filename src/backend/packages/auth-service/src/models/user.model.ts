/**
 * @fileoverview Enhanced Mongoose user model with comprehensive security features
 * Implements secure password handling, MFA support, and advanced validation
 * @version 1.0.0
 */

import mongoose, { Schema, Model, Document } from 'mongoose'; // v7.4.0
import bcrypt from 'bcrypt'; // v5.1.0
import { User, UserRole } from '@projectx/common/interfaces';
import { PASSWORD_CONFIG } from '../config';

/**
 * Extended User document interface with security methods
 */
interface UserDocument extends User, Document {
  password: string;
  mfaSecret?: string;
  mfaEnabled: boolean;
  backupCodes: string[];
  loginAttempts: number;
  accountLockUntil?: Date;
  passwordHistory: string[];
  lastLogin?: Date;
  isActive: boolean;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

/**
 * Enhanced User model interface with static methods
 */
interface UserModel extends Model<UserDocument> {
  hashPassword(password: string): Promise<string>;
}

/**
 * Comprehensive address sub-schema with validation
 */
const addressSchema = new Schema({
  street1: { type: String, required: true },
  street2: { type: String },
  city: { type: String, required: true },
  state: { type: String, required: true },
  zipCode: { type: String, required: true },
  country: { type: String, required: true, default: 'US' }
}, { _id: false });

/**
 * Enhanced User schema with comprehensive security features
 */
const userSchema = new Schema<UserDocument>({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
    validate: {
      validator: (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
      message: 'Invalid email format'
    }
  },
  password: {
    type: String,
    required: true,
    select: false,
    minlength: PASSWORD_CONFIG.minLength,
    validate: {
      validator: (password: string) => {
        const hasUpperCase = /[A-Z]/.test(password);
        const hasLowerCase = /[a-z]/.test(password);
        const hasNumbers = /\d/.test(password);
        const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
        return hasUpperCase && hasLowerCase && hasNumbers && hasSpecialChar;
      },
      message: 'Password must contain uppercase, lowercase, numbers and special characters'
    }
  },
  role: {
    type: String,
    enum: Object.values(UserRole),
    default: UserRole.RENTER,
    required: true,
    index: true
  },
  profile: {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    phone: {
      type: String,
      validate: {
        validator: (phone: string) => /^\+?1?\d{10,14}$/.test(phone),
        message: 'Invalid phone number format'
      }
    },
    avatarUrl: {
      type: String,
      validate: {
        validator: (url: string) => /^https?:\/\/.+/.test(url),
        message: 'Invalid avatar URL'
      }
    },
    address: { type: addressSchema, required: true }
  },
  mfaSecret: {
    type: String,
    select: false,
    sparse: true
  },
  mfaEnabled: {
    type: Boolean,
    default: false
  },
  backupCodes: {
    type: [String],
    select: false,
    validate: {
      validator: (codes: string[]) => codes.length <= 10,
      message: 'Maximum 10 backup codes allowed'
    }
  },
  loginAttempts: {
    type: Number,
    default: 0,
    min: 0,
    max: PASSWORD_CONFIG.maxAttempts
  },
  accountLockUntil: {
    type: Date,
    select: false,
    sparse: true
  },
  passwordHistory: {
    type: [String],
    select: false,
    validate: {
      validator: (history: string[]) => history.length <= 5,
      message: 'Maximum 5 password history entries allowed'
    }
  },
  lastLogin: {
    type: Date,
    select: false
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  }
}, {
  timestamps: true,
  collection: 'users',
  toJSON: {
    transform: (_, ret) => {
      delete ret.password;
      delete ret.mfaSecret;
      delete ret.backupCodes;
      delete ret.passwordHistory;
      return ret;
    }
  }
});

/**
 * Enhanced password hashing middleware
 */
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();

  try {
    // Check password history
    if (this.passwordHistory?.includes(this.password)) {
      throw new Error('Password has been used recently');
    }

    // Generate salt and hash password
    const salt = await bcrypt.genSalt(PASSWORD_CONFIG.saltRounds);
    const hash = await bcrypt.hash(this.password, salt);

    // Update password and history
    this.password = hash;
    if (!this.passwordHistory) {
      this.passwordHistory = [];
    }
    this.passwordHistory.unshift(hash);
    if (this.passwordHistory.length > 5) {
      this.passwordHistory.pop();
    }

    next();
  } catch (error) {
    next(error as Error);
  }
});

/**
 * Enhanced password comparison with progressive delays
 */
userSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  try {
    // Check account lock
    if (this.accountLockUntil && this.accountLockUntil > new Date()) {
      throw new Error('Account is temporarily locked');
    }

    // Progressive delay based on login attempts
    const delay = Math.min(100 * Math.pow(2, this.loginAttempts), 3000);
    await new Promise(resolve => setTimeout(resolve, delay));

    // Compare passwords
    const isMatch = await bcrypt.compare(candidatePassword, this.password);

    // Update login attempts and lock status
    if (!isMatch) {
      this.loginAttempts += 1;
      if (this.loginAttempts >= PASSWORD_CONFIG.maxAttempts) {
        this.accountLockUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
      }
      await this.save();
    } else {
      if (this.loginAttempts > 0) {
        this.loginAttempts = 0;
        this.accountLockUntil = undefined;
        await this.save();
      }
    }

    return isMatch;
  } catch (error) {
    throw new Error(`Password comparison failed: ${(error as Error).message}`);
  }
};

/**
 * Static method for password hashing
 */
userSchema.statics.hashPassword = async function(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(PASSWORD_CONFIG.saltRounds);
  return bcrypt.hash(password, salt);
};

// Create and export the User model
export const UserModel = mongoose.model<UserDocument, UserModel>('User', userSchema);