/**
 * @fileoverview Password utility functions with enterprise-grade security features
 * Implements secure password hashing, verification and validation using Argon2id
 * @version 1.0.0
 */

import { BadRequestError } from '@projectx/common';
import argon2 from 'argon2'; // v0.31.0
import zxcvbn from 'zxcvbn'; // v4.4.2
import crypto from 'crypto';

// Secure Argon2id configuration based on OWASP recommendations
const ARGON2_CONFIG = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MB
  timeCost: 3,
  parallelism: 4,
  saltLength: 16,
  hashLength: 32
} as const;

// Password validation configuration
const PASSWORD_CONFIG = {
  minLength: 12,
  minScore: 3,
  maxLength: 128,
  // Common password patterns to check against
  patterns: [
    /^(?=.*[a-z])/, // lowercase
    /^(?=.*[A-Z])/, // uppercase
    /^(?=.*[0-9])/, // numbers
    /^(?=.*[!@#$%^&*])/ // symbols
  ]
} as const;

/**
 * Securely hashes a password using Argon2id with enhanced parameters
 * @param password - Plain text password to hash
 * @returns Promise resolving to base64 encoded hash
 * @throws BadRequestError if password is invalid
 */
export async function hashPassword(password: string): Promise<string> {
  if (!password || typeof password !== 'string') {
    throw new BadRequestError('Invalid password provided');
  }

  const validationResult = validatePasswordStrength(password);
  if (!validationResult.isValid) {
    throw new BadRequestError('Password does not meet security requirements', {
      details: validationResult.feedback
    });
  }

  try {
    return await argon2.hash(password, ARGON2_CONFIG);
  } catch (error) {
    throw new BadRequestError('Password hashing failed', { 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Verifies a password against a stored hash using constant-time comparison
 * @param password - Plain text password to verify
 * @param hashedPassword - Stored password hash to compare against
 * @returns Promise resolving to boolean indicating match
 * @throws BadRequestError if inputs are invalid
 */
export async function verifyPassword(
  password: string,
  hashedPassword: string
): Promise<boolean> {
  if (!password || !hashedPassword) {
    throw new BadRequestError('Password and hash are required');
  }

  try {
    return await argon2.verify(hashedPassword, password, {
      type: ARGON2_CONFIG.type
    });
  } catch (error) {
    throw new BadRequestError('Password verification failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Validates password strength using multiple criteria
 * @param password - Password to validate
 * @returns Validation result with detailed feedback
 */
export function validatePasswordStrength(password: string): {
  isValid: boolean;
  score: number;
  feedback: {
    warning: string;
    suggestions: string[];
    requirements: {
      length: boolean;
      lowercase: boolean;
      uppercase: boolean;
      numbers: boolean;
      symbols: boolean;
      score: boolean;
    };
  };
} {
  if (!password || typeof password !== 'string') {
    return {
      isValid: false,
      score: 0,
      feedback: {
        warning: 'Invalid password provided',
        suggestions: ['Please provide a valid password'],
        requirements: {
          length: false,
          lowercase: false,
          uppercase: false,
          numbers: false,
          symbols: false,
          score: false
        }
      }
    };
  }

  // Check basic requirements
  const requirements = {
    length: password.length >= PASSWORD_CONFIG.minLength && 
            password.length <= PASSWORD_CONFIG.maxLength,
    lowercase: PASSWORD_CONFIG.patterns[0].test(password),
    uppercase: PASSWORD_CONFIG.patterns[1].test(password),
    numbers: PASSWORD_CONFIG.patterns[2].test(password),
    symbols: PASSWORD_CONFIG.patterns[3].test(password),
    score: false
  };

  // Analyze password strength
  const analysis = zxcvbn(password);
  requirements.score = analysis.score >= PASSWORD_CONFIG.minScore;

  const isValid = Object.values(requirements).every(Boolean);

  return {
    isValid,
    score: analysis.score,
    feedback: {
      warning: analysis.feedback.warning || '',
      suggestions: analysis.feedback.suggestions || [],
      requirements
    }
  };
}

/**
 * Generates a cryptographically secure random password
 * @param length - Desired password length (minimum 12)
 * @returns Secure random password string
 * @throws BadRequestError if length is invalid
 */
export function generateSecurePassword(length: number = 16): string {
  if (length < PASSWORD_CONFIG.minLength) {
    throw new BadRequestError(`Password length must be at least ${PASSWORD_CONFIG.minLength} characters`);
  }

  const charset = {
    lowercase: 'abcdefghijklmnopqrstuvwxyz',
    uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    numbers: '0123456789',
    symbols: '!@#$%^&*'
  };

  // Ensure at least one character from each required set
  let password = '';
  Object.values(charset).forEach(set => {
    password += set[crypto.randomInt(set.length)];
  });

  // Fill remaining length with random characters from all sets
  const allChars = Object.values(charset).join('');
  while (password.length < length) {
    password += allChars[crypto.randomInt(allChars.length)];
  }

  // Shuffle the password
  return password
    .split('')
    .sort(() => crypto.randomInt(3) - 1)
    .join('');
}