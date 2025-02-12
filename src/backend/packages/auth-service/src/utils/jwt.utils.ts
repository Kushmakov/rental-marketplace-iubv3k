/**
 * @fileoverview Secure JWT token management module implementing OAuth 2.0 standards
 * with asymmetric encryption, claims-based authorization, and comprehensive token lifecycle management
 * @version 1.0.0
 */

import { sign, verify, JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken'; // ^9.0.0
import { randomBytes } from 'crypto';
import { createLogger } from 'winston'; // ^3.8.0
import { User, UserRole } from '../../../common/src/interfaces';
import { config } from '../config';

// Configure logger for security events
const logger = createLogger({
  level: 'info',
  defaultMeta: { service: 'jwt-utils' }
});

/**
 * Interface defining the structure of JWT token payload with standard and custom claims
 */
export interface TokenPayload {
  /** Subject (user ID) */
  sub: string;
  /** Token issuer */
  iss: string;
  /** Expiration timestamp */
  exp: number;
  /** Issued at timestamp */
  iat: number;
  /** Intended audience */
  aud: string;
  /** Unique token identifier */
  jti: string;
  /** User email */
  email: string;
  /** User role */
  role: UserRole;
  /** Token version for revocation */
  tokenVersion: string;
}

/**
 * Generates a secure JWT access token with comprehensive claims and RS256 signing
 * @param user - User object containing ID, email, and role
 * @returns Promise resolving to signed JWT access token
 */
export const generateAccessToken = async (user: User): Promise<string> => {
  try {
    // Generate unique token ID
    const tokenId = randomBytes(32).toString('hex');

    const payload: TokenPayload = {
      sub: user.id,
      iss: config.jwt.issuer,
      aud: 'project-x-api',
      exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 24 hours
      iat: Math.floor(Date.now() / 1000),
      jti: tokenId,
      email: user.email,
      role: user.role,
      tokenVersion: 'v1'
    };

    const token = sign(payload, config.jwt.privateKey, {
      algorithm: 'RS256',
      keyid: 'current'
    });

    logger.info('Access token generated', {
      userId: user.id,
      tokenId,
      role: user.role
    });

    return token;
  } catch (error) {
    logger.error('Failed to generate access token', { error, userId: user.id });
    throw new Error('Token generation failed');
  }
};

/**
 * Generates a secure JWT refresh token with minimal claims and extended expiry
 * @param user - User object containing ID
 * @returns Promise resolving to signed JWT refresh token
 */
export const generateRefreshToken = async (user: User): Promise<string> => {
  try {
    const tokenId = randomBytes(32).toString('hex');

    const payload = {
      sub: user.id,
      jti: tokenId,
      iss: config.jwt.issuer,
      aud: 'project-x-api',
      exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7 days
      iat: Math.floor(Date.now() / 1000),
      tokenVersion: 'v1'
    };

    const token = sign(payload, config.jwt.privateKey, {
      algorithm: 'RS256',
      keyid: 'current'
    });

    logger.info('Refresh token generated', {
      userId: user.id,
      tokenId
    });

    return token;
  } catch (error) {
    logger.error('Failed to generate refresh token', { error, userId: user.id });
    throw new Error('Refresh token generation failed');
  }
};

/**
 * Comprehensively verifies and decodes a JWT token with enhanced security checks
 * @param token - JWT token string to verify
 * @returns Promise resolving to decoded and validated token payload
 * @throws Error if token is invalid or verification fails
 */
export const verifyToken = async (token: string): Promise<TokenPayload> => {
  try {
    const decoded = verify(token, config.jwt.publicKey, {
      algorithms: ['RS256'],
      issuer: config.jwt.issuer,
      audience: 'project-x-api',
      clockTolerance: 30 // 30 seconds clock skew tolerance
    }) as TokenPayload;

    // Additional security checks
    if (!decoded.jti || !decoded.sub || !decoded.tokenVersion) {
      throw new JsonWebTokenError('Invalid token claims');
    }

    logger.info('Token verified successfully', {
      tokenId: decoded.jti,
      userId: decoded.sub
    });

    return decoded;
  } catch (error) {
    if (error instanceof TokenExpiredError) {
      logger.warn('Token expired', { error });
      throw new Error('Token has expired');
    }
    logger.error('Token verification failed', { error });
    throw new Error('Invalid token');
  }
};

/**
 * Securely extracts and validates JWT token from Authorization header
 * @param authHeader - Authorization header string
 * @returns Extracted token or null if invalid
 */
export const extractTokenFromHeader = (authHeader: string): string | null => {
  try {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.split(' ')[1];

    // Basic token format validation
    if (!token || token.split('.').length !== 3) {
      return null;
    }

    logger.debug('Token extracted from header');
    return token;
  } catch (error) {
    logger.error('Failed to extract token from header', { error });
    return null;
  }
};