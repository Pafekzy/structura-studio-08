import { Request, Response, NextFunction } from 'express';
import { verifyFirebaseToken, isFirebaseAdminAvailable } from '../auth/firebaseAdmin';
import { userService } from '../services/userService';
import { UserProfile, PrimaryRole } from '../repositories/userRepository';

export interface AuthenticatedUser {
  uid: string;
  email: string;
  authProvider: 'firebase' | 'sandbox';
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      userProfile?: UserProfile | null;
    }
  }
}

// In-memory token session cache for server sandbox development mode
export interface SandboxSession {
  uid: string;
  email: string;
  createdAt: number;
  expiresAt: number; // 24-hour expiry
}

export const sandboxSessionStore = new Map<string, SandboxSession>();

// Pre-seed canonical development sandbox sessions for the four demo roles
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
sandboxSessionStore.set('demo_sess_owner', {
  uid: 'usr_demo_owner',
  email: 'owner@structura.build',
  createdAt: Date.now(),
  expiresAt: Date.now() + ONE_YEAR_MS,
});
sandboxSessionStore.set('demo_sess_director', {
  uid: 'usr_demo_director',
  email: 'director@structura.build',
  createdAt: Date.now(),
  expiresAt: Date.now() + ONE_YEAR_MS,
});
sandboxSessionStore.set('demo_sess_contractor', {
  uid: 'usr_demo_contractor',
  email: 'contractor@structura.build',
  createdAt: Date.now(),
  expiresAt: Date.now() + ONE_YEAR_MS,
});
sandboxSessionStore.set('demo_sess_qaqc', {
  uid: 'usr_demo_qaqc',
  email: 'auditor@structura.build',
  createdAt: Date.now(),
  expiresAt: Date.now() + ONE_YEAR_MS,
});

export function getAuthMode(): 'firebase' | 'sandbox' {
  if (process.env.STRUCTURA_AUTH_MODE === 'firebase') return 'firebase';
  if (process.env.STRUCTURA_AUTH_MODE === 'sandbox') return 'sandbox';
  if (process.env.NODE_ENV === 'production') return 'firebase';
  return isFirebaseAdminAvailable() ? 'firebase' : 'sandbox';
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Missing or invalid Authorization header. Expected Bearer token.',
      code: 'AUTH_REQUIRED',
      correlationId: req.correlationId,
      timestamp: new Date().toISOString(),
    });
  }

  const token = authHeader.split('Bearer ')[1]?.trim();
  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Empty Bearer token provided.',
      code: 'INVALID_TOKEN',
      correlationId: req.correlationId,
      timestamp: new Date().toISOString(),
    });
  }

  const mode = getAuthMode();

  // If in production or STRUCTURA_AUTH_MODE is 'firebase', reject sandbox tokens unconditionally
  if (mode === 'firebase' && (token.startsWith('sb_sess_') || token.startsWith('demo_sess_'))) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Sandbox session tokens are strictly forbidden when STRUCTURA_AUTH_MODE=firebase or running in production.',
      code: process.env.NODE_ENV === 'production' ? 'SANDBOX_DISABLED_IN_PRODUCTION' : 'SANDBOX_DISABLED_IN_FIREBASE_MODE',
      correlationId: req.correlationId,
      timestamp: new Date().toISOString(),
    });
  }

  // 1. If in Sandbox mode and token is a Developer Sandbox session token
  if (mode === 'sandbox' && (token.startsWith('sb_sess_') || token.startsWith('demo_sess_'))) {
    const session = sandboxSessionStore.get(token);
    if (session) {
      // Check session expiration
      if (Date.now() > session.expiresAt) {
        sandboxSessionStore.delete(token);
        return res.status(401).json({
          success: false,
          error: 'Unauthorized: Developer sandbox session has expired. Please log in again.',
          code: 'SESSION_EXPIRED',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString(),
        });
      }

      req.user = {
        uid: session.uid,
        email: session.email,
        authProvider: 'sandbox',
      };
      try {
        req.userProfile = await userService.getProfileByAuthUserId(session.uid);
      } catch {
        req.userProfile = null;
      }
      return next();
    } else {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Developer sandbox session not found or revoked.',
        code: 'INVALID_SANDBOX_SESSION',
        correlationId: req.correlationId,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // 2. If Firebase Mode is active but Firebase Admin is unconfigured
  if (mode === 'firebase' && !isFirebaseAdminAvailable()) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Production authentication service is not configured (Firebase Admin credentials missing).',
      code: 'FIREBASE_ADMIN_UNAVAILABLE',
      correlationId: req.correlationId,
      timestamp: new Date().toISOString(),
    });
  }

  // 3. If Firebase Admin is available, attempt cryptographic verification of Firebase ID token
  if (isFirebaseAdminAvailable()) {
    try {
      const decoded = await verifyFirebaseToken(token);
      if (decoded) {
        req.user = {
          uid: decoded.uid,
          email: decoded.email || '',
          authProvider: 'firebase',
        };
        req.userProfile = await userService.getProfileByAuthUserId(decoded.uid);
        return next();
      }
    } catch (e) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Invalid Firebase authentication token.',
        code: 'FIREBASE_TOKEN_INVALID',
        correlationId: req.correlationId,
        timestamp: new Date().toISOString(),
      });
    }
  }

  return res.status(401).json({
    success: false,
    error: 'Unauthorized: Provided token could not be verified.',
    code: 'TOKEN_VERIFICATION_FAILED',
    correlationId: req.correlationId,
    timestamp: new Date().toISOString(),
  });
}

// Role-based authorization middleware foundation
export function requireRole(allowedRoles: PrimaryRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
    }

    if (!req.userProfile) {
      return res.status(403).json({ 
        error: 'Forbidden: Structura user profile has not been initialized for this account',
        code: 'PROFILE_NOT_FOUND' 
      });
    }

    if (!allowedRoles.includes(req.userProfile.primaryRole)) {
      return res.status(403).json({
        error: `Forbidden: Required role [${allowedRoles.join(', ')}], current role is [${req.userProfile.primaryRole}]`,
        code: 'INSUFFICIENT_ROLE_PERMISSIONS',
      });
    }

    return next();
  };
}
