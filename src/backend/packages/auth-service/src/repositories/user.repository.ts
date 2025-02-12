/**
 * @fileoverview Enhanced user repository with comprehensive security features and caching
 * Implements secure user data access with field-level encryption and Redis caching
 * @version 1.0.0
 */

import { Model } from 'mongoose'; // v7.4.0
import { createClient } from 'redis'; // v4.6.7
import { promisify } from 'util';
import { User, UserRole } from '@projectx/common/interfaces';
import { UserModel } from '../models/user.model';
import { DatabaseError } from '@projectx/database/config';
import { CACHE_TTL, HTTP_STATUS } from '@projectx/common/constants';

/**
 * Enhanced authentication result interface
 */
interface AuthResult {
  user: User | null;
  status: 'success' | 'failed' | 'locked' | 'mfa_required';
  message: string;
  remainingAttempts?: number;
  lockoutTime?: Date;
}

/**
 * Enhanced user repository with comprehensive security features
 */
export class UserRepository {
  private readonly userModel: Model<User>;
  private readonly cacheClient: ReturnType<typeof createClient>;
  private readonly cachePrefix = 'user:';

  constructor() {
    this.userModel = UserModel;
    this.cacheClient = createClient({
      url: process.env.REDIS_URL,
      socket: {
        reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
      },
    });

    // Initialize cache connection
    this.initializeCache();
  }

  /**
   * Initializes Redis cache connection with error handling
   */
  private async initializeCache(): Promise<void> {
    try {
      await this.cacheClient.connect();

      this.cacheClient.on('error', (error) => {
        console.error('Redis cache error:', error);
      });

      this.cacheClient.on('reconnecting', () => {
        console.warn('Redis cache reconnecting...');
      });
    } catch (error) {
      console.error('Failed to initialize Redis cache:', error);
      // Continue without cache if Redis is unavailable
    }
  }

  /**
   * Retrieves a user by ID with caching
   * @param id - User ID
   * @returns User object or null if not found
   */
  async findById(id: string): Promise<User | null> {
    try {
      // Check cache first
      const cachedUser = await this.cacheClient.get(`${this.cachePrefix}${id}`);
      if (cachedUser) {
        return JSON.parse(cachedUser);
      }

      // Query database if cache miss
      const user = await this.userModel.findById(id)
        .select('-password -mfaSecret -backupCodes -passwordHistory')
        .lean();

      if (user) {
        // Cache user data
        await this.cacheClient.setEx(
          `${this.cachePrefix}${id}`,
          CACHE_TTL.USER,
          JSON.stringify(user)
        );
      }

      return user;
    } catch (error) {
      throw new DatabaseError(
        `Error finding user: ${(error as Error).message}`,
        'USER_FIND_ERROR'
      );
    }
  }

  /**
   * Enhanced credential validation with security features
   * @param email - User email
   * @param password - User password
   * @param mfaToken - Optional MFA token
   * @returns Authentication result
   */
  async validateCredentials(
    email: string,
    password: string,
    mfaToken?: string
  ): Promise<AuthResult> {
    try {
      const user = await this.userModel.findOne({ email })
        .select('+password +mfaSecret +loginAttempts +accountLockUntil');

      if (!user) {
        return {
          user: null,
          status: 'failed',
          message: 'Invalid credentials',
        };
      }

      // Check account lock
      if (user.accountLockUntil && user.accountLockUntil > new Date()) {
        return {
          user: null,
          status: 'locked',
          message: 'Account is temporarily locked',
          lockoutTime: user.accountLockUntil,
        };
      }

      // Validate password
      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        const remainingAttempts = 5 - (user.loginAttempts + 1);
        return {
          user: null,
          status: 'failed',
          message: `Invalid credentials. ${remainingAttempts} attempts remaining`,
          remainingAttempts,
        };
      }

      // Check MFA requirement
      if (user.mfaEnabled) {
        if (!mfaToken) {
          return {
            user: null,
            status: 'mfa_required',
            message: 'MFA verification required',
          };
        }

        const isMfaValid = await UserModel.validateMFA(user.mfaSecret, mfaToken);
        if (!isMfaValid) {
          return {
            user: null,
            status: 'failed',
            message: 'Invalid MFA token',
          };
        }
      }

      // Reset login attempts on successful authentication
      if (user.loginAttempts > 0) {
        user.loginAttempts = 0;
        user.accountLockUntil = undefined;
        await user.save();
      }

      // Update last login timestamp
      await this.userModel.updateOne(
        { _id: user._id },
        { $set: { lastLogin: new Date() } }
      );

      // Invalidate cache
      await this.cacheClient.del(`${this.cachePrefix}${user._id}`);

      return {
        user,
        status: 'success',
        message: 'Authentication successful',
      };
    } catch (error) {
      throw new DatabaseError(
        `Authentication error: ${(error as Error).message}`,
        'AUTH_ERROR',
        HTTP_STATUS.UNAUTHORIZED
      );
    }
  }

  /**
   * Secure password update with history validation
   * @param id - User ID
   * @param newPassword - New password
   */
  async updatePassword(id: string, newPassword: string): Promise<void> {
    try {
      const user = await this.userModel.findById(id)
        .select('+password +passwordHistory');

      if (!user) {
        throw new DatabaseError('User not found', 'USER_NOT_FOUND', HTTP_STATUS.NOT_FOUND);
      }

      // Check password history
      const hashedPassword = await UserModel.hashPassword(newPassword);
      const isInHistory = user.passwordHistory?.some(async (oldHash) => {
        return await UserModel.comparePassword(newPassword, oldHash);
      });

      if (isInHistory) {
        throw new DatabaseError(
          'Password has been used recently',
          'PASSWORD_HISTORY_CONFLICT',
          HTTP_STATUS.CONFLICT
        );
      }

      // Update password and history
      user.password = hashedPassword;
      if (!user.passwordHistory) {
        user.passwordHistory = [];
      }
      user.passwordHistory.unshift(hashedPassword);
      if (user.passwordHistory.length > 5) {
        user.passwordHistory.pop();
      }

      await user.save();

      // Invalidate cache
      await this.cacheClient.del(`${this.cachePrefix}${id}`);
    } catch (error) {
      throw new DatabaseError(
        `Password update error: ${(error as Error).message}`,
        'PASSWORD_UPDATE_ERROR'
      );
    }
  }
}