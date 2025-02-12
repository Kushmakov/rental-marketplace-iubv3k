// @package zod@3.22.0
// @package crypto-js@4.1.1
import { z } from 'zod';
import { AES, enc } from 'crypto-js';
import type { AuthTokens } from '../types/auth';

// Storage keys and configuration
const AUTH_TOKEN_KEY = 'projectx_auth_tokens';
const USER_PREFERENCES_KEY = 'projectx_user_preferences';
const STORAGE_PREFIX = 'projectx_';
const STORAGE_VERSION = '1.0';
const MAX_STORAGE_SIZE = 5 * 1024 * 1024; // 5MB storage limit
const ENCRYPTION_KEY = process.env.NEXT_PUBLIC_STORAGE_ENCRYPTION_KEY || 'default-key';

// Zod schema for auth tokens validation
const authTokenSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresIn: z.number().positive(),
  timestamp: z.number(),
  version: z.string()
});

// Zod schema for user preferences validation
const userPreferencesSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).default('system'),
  language: z.string().default('en'),
  notifications: z.boolean().default(true),
  version: z.string(),
  timestamp: z.number()
});

/**
 * Encrypts data using AES encryption
 * @param data - Data to encrypt
 * @returns Encrypted string
 */
const encryptData = (data: unknown): string => {
  return AES.encrypt(JSON.stringify(data), ENCRYPTION_KEY).toString();
};

/**
 * Decrypts AES encrypted data
 * @param encryptedData - Encrypted data string
 * @returns Decrypted data or null if invalid
 */
const decryptData = <T>(encryptedData: string): T | null => {
  try {
    const decrypted = AES.decrypt(encryptedData, ENCRYPTION_KEY).toString(enc.Utf8);
    return JSON.parse(decrypted) as T;
  } catch (error) {
    console.error('Failed to decrypt data:', error);
    return null;
  }
};

/**
 * Checks if storage quota is available
 * @param data - Data to be stored
 * @returns Boolean indicating if storage is available
 */
const checkStorageQuota = (data: string): boolean => {
  try {
    const totalSize = new Blob([data]).size;
    return totalSize <= MAX_STORAGE_SIZE;
  } catch (error) {
    console.error('Storage quota check failed:', error);
    return false;
  }
};

/**
 * Securely stores authentication tokens
 * @param tokens - Authentication tokens to store
 * @param persist - Whether to persist in localStorage
 */
export const setAuthTokens = async (tokens: AuthTokens, persist: boolean): Promise<void> => {
  try {
    // Validate tokens
    authTokenSchema.parse({
      ...tokens,
      timestamp: Date.now(),
      version: STORAGE_VERSION
    });

    const storage = persist ? localStorage : sessionStorage;
    const encryptedData = encryptData({
      ...tokens,
      timestamp: Date.now(),
      version: STORAGE_VERSION
    });

    if (!checkStorageQuota(encryptedData)) {
      throw new Error('Storage quota exceeded');
    }

    storage.setItem(AUTH_TOKEN_KEY, encryptedData);
    window.dispatchEvent(new Event('storage'));
  } catch (error) {
    console.error('Failed to store auth tokens:', error);
    throw error;
  }
};

/**
 * Retrieves and validates stored authentication tokens
 * @returns Decrypted AuthTokens or null
 */
export const getAuthTokens = async (): Promise<AuthTokens | null> => {
  try {
    const sessionData = sessionStorage.getItem(AUTH_TOKEN_KEY);
    const localData = localStorage.getItem(AUTH_TOKEN_KEY);
    const encryptedData = sessionData || localData;

    if (!encryptedData) return null;

    const decryptedData = decryptData<AuthTokens & { timestamp: number; version: string }>(encryptedData);
    if (!decryptedData) return null;

    // Validate decrypted data
    const validatedData = authTokenSchema.parse(decryptedData);

    // Check token expiration
    const isExpired = Date.now() >= validatedData.timestamp + validatedData.expiresIn * 1000;
    if (isExpired) {
      clearStorage();
      return null;
    }

    return {
      accessToken: validatedData.accessToken,
      refreshToken: validatedData.refreshToken,
      expiresIn: validatedData.expiresIn
    };
  } catch (error) {
    console.error('Failed to retrieve auth tokens:', error);
    return null;
  }
};

/**
 * Stores user preferences with cross-tab synchronization
 * @param preferences - User preferences object
 */
export const setUserPreferences = async (preferences: Record<string, unknown>): Promise<void> => {
  try {
    const validatedPrefs = userPreferencesSchema.parse({
      ...preferences,
      timestamp: Date.now(),
      version: STORAGE_VERSION
    });

    const encryptedData = encryptData(validatedPrefs);
    if (!checkStorageQuota(encryptedData)) {
      throw new Error('Storage quota exceeded');
    }

    localStorage.setItem(USER_PREFERENCES_KEY, encryptedData);
    window.dispatchEvent(new Event('storage'));
  } catch (error) {
    console.error('Failed to store user preferences:', error);
    throw error;
  }
};

/**
 * Retrieves and validates user preferences
 * @returns Validated user preferences object
 */
export const getUserPreferences = async (): Promise<Record<string, unknown>> => {
  try {
    const encryptedData = localStorage.getItem(USER_PREFERENCES_KEY);
    if (!encryptedData) return userPreferencesSchema.parse({}).default();

    const decryptedData = decryptData<Record<string, unknown>>(encryptedData);
    if (!decryptedData) return userPreferencesSchema.parse({}).default();

    return userPreferencesSchema.parse(decryptedData);
  } catch (error) {
    console.error('Failed to retrieve user preferences:', error);
    return userPreferencesSchema.parse({}).default();
  }
};

/**
 * Clears all application storage data
 */
export const clearStorage = (): void => {
  try {
    // Clear auth tokens
    localStorage.removeItem(AUTH_TOKEN_KEY);
    sessionStorage.removeItem(AUTH_TOKEN_KEY);

    // Clear all items with storage prefix
    Object.keys(localStorage)
      .filter(key => key.startsWith(STORAGE_PREFIX))
      .forEach(key => localStorage.removeItem(key));

    Object.keys(sessionStorage)
      .filter(key => key.startsWith(STORAGE_PREFIX))
      .forEach(key => sessionStorage.removeItem(key));

    window.dispatchEvent(new Event('storage'));
  } catch (error) {
    console.error('Failed to clear storage:', error);
    throw error;
  }
};

/**
 * Initializes storage event listeners for cross-tab synchronization
 */
export const initStorageListener = (): void => {
  window.addEventListener('storage', async (event) => {
    try {
      // Handle auth token changes
      if (event.key === AUTH_TOKEN_KEY) {
        // Notify authentication state observers
        window.dispatchEvent(new CustomEvent('authStateChange', {
          detail: await getAuthTokens()
        }));
      }

      // Handle user preferences changes
      if (event.key === USER_PREFERENCES_KEY) {
        // Notify preferences observers
        window.dispatchEvent(new CustomEvent('preferencesChange', {
          detail: await getUserPreferences()
        }));
      }
    } catch (error) {
      console.error('Storage event handling failed:', error);
    }
  });
};