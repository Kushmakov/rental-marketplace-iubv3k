/**
 * @fileoverview Enhanced authentication middleware for API Gateway
 * Implements robust JWT token validation, role-based access control,
 * security event logging, and comprehensive error handling
 * @version 1.0.0
 */

import { Request, Response, NextFunction } from 'express'; // ^4.18.2
import winston from 'winston'; // ^3.8.2
import { UnauthorizedError, ForbiddenError } from '@projectx/common';
import { verifyToken } from '@projectx/auth-service';
import { UserRole } from '@projectx/common';

// Configure security event logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'api-gateway-auth' },
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'auth-events.log' })
  ]
});

/**
 * Extended Request interface to include authenticated user context
 */
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: UserRole;
    tokenVersion: string;
  };
  requestId: string;
  startTime: number;
}

/**
 * Enhanced authentication middleware that validates JWT tokens and attaches user context
 * @throws UnauthorizedError for invalid or missing tokens
 */
export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Generate unique request ID for tracing
    req.requestId = crypto.randomUUID();
    req.startTime = Date.now();

    // Extract and validate Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or invalid authorization header');
    }

    // Extract token
    const token = authHeader.split(' ')[1];
    if (!token) {
      throw new UnauthorizedError('No token provided');
    }

    // Log authentication attempt
    logger.info('Authentication attempt', {
      requestId: req.requestId,
      path: req.path,
      method: req.method,
      ip: req.ip
    });

    // Verify token with enhanced security checks
    const decoded = await verifyToken(token);

    // Validate token claims
    if (!decoded.sub || !decoded.email || !decoded.role) {
      throw new UnauthorizedError('Invalid token claims');
    }

    // Attach user context to request
    req.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role,
      tokenVersion: decoded.tokenVersion
    };

    // Log successful authentication
    logger.info('Authentication successful', {
      requestId: req.requestId,
      userId: decoded.sub,
      role: decoded.role,
      path: req.path
    });

    next();
  } catch (error) {
    // Enhanced error logging
    logger.error('Authentication failed', {
      requestId: req.requestId,
      path: req.path,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - req.startTime
    });

    if (error instanceof UnauthorizedError) {
      next(error);
    } else {
      next(new UnauthorizedError('Authentication failed'));
    }
  }
};

/**
 * Role hierarchy for authorization checks
 */
const ROLE_HIERARCHY: Record<UserRole, UserRole[]> = {
  [UserRole.ADMIN]: [UserRole.ADMIN, UserRole.PROPERTY_MANAGER, UserRole.AGENT, UserRole.RENTER],
  [UserRole.PROPERTY_MANAGER]: [UserRole.PROPERTY_MANAGER, UserRole.AGENT, UserRole.RENTER],
  [UserRole.AGENT]: [UserRole.AGENT, UserRole.RENTER],
  [UserRole.RENTER]: [UserRole.RENTER]
};

/**
 * Enhanced authorization middleware factory for role-based access control
 * @param allowedRoles - Array of roles allowed to access the resource
 * @throws ForbiddenError for insufficient permissions
 */
export const authorize = (allowedRoles: UserRole[]) => {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      // Validate user context
      if (!req.user?.role) {
        throw new ForbiddenError('User context not found');
      }

      const userRole = req.user.role;
      const hasPermission = allowedRoles.some(role => 
        ROLE_HIERARCHY[userRole].includes(role)
      );

      // Log authorization attempt
      logger.info('Authorization attempt', {
        requestId: req.requestId,
        userId: req.user.id,
        userRole,
        requiredRoles: allowedRoles,
        path: req.path,
        granted: hasPermission
      });

      if (!hasPermission) {
        throw new ForbiddenError('Insufficient permissions', {
          requiredRoles: allowedRoles,
          userRole
        });
      }

      next();
    } catch (error) {
      // Enhanced error logging
      logger.error('Authorization failed', {
        requestId: req.requestId,
        userId: req.user?.id,
        path: req.path,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - req.startTime
      });

      if (error instanceof ForbiddenError) {
        next(error);
      } else {
        next(new ForbiddenError('Authorization failed'));
      }
    }
  };
};
```

This implementation provides:

1. Enhanced JWT token validation with comprehensive security checks
2. Role-based access control with role hierarchy support
3. Detailed security event logging with request tracking
4. Comprehensive error handling with context preservation
5. Request tracing with unique identifiers
6. Performance monitoring with request duration tracking
7. Type safety with TypeScript interfaces
8. Production-ready security controls
9. Extensive logging for security auditing
10. Clean separation of authentication and authorization concerns

The middleware can be used in API routes like:

```typescript
router.get('/properties', 
  authenticate, 
  authorize([UserRole.PROPERTY_MANAGER, UserRole.AGENT]), 
  propertyController.list
);