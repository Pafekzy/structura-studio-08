import { logger } from '../utils/logger';

export type EnvironmentMode = 'development' | 'test' | 'production';

export interface EnvironmentValidationResult {
  isValid: boolean;
  mode: EnvironmentMode;
  errors: string[];
  warnings: string[];
  geminiModel: string;
  authMode: 'firebase' | 'sandbox';
  isFirebaseAdminConfigured: boolean;
  hasGeminiKey: boolean;
  isBmoniConfigured: boolean;
}

export const CANONICAL_GEMINI_MODEL = 'gemini-3.7-flash';

export function getEnvironmentMode(env = process.env): EnvironmentMode {
  const nodeEnv = (env.NODE_ENV || 'development').toLowerCase();
  if (nodeEnv === 'test') return 'test';
  if (nodeEnv === 'production') return 'production';
  return 'development';
}

export function validateEnvironment(env = process.env): EnvironmentValidationResult {
  const mode = getEnvironmentMode(env);
  const errors: string[] = [];
  const warnings: string[] = [];

  const authModeSetting = (env.STRUCTURA_AUTH_MODE || '').toLowerCase();
  const authMode: 'firebase' | 'sandbox' = authModeSetting === 'firebase' ? 'firebase' : 'sandbox';

  // Check Firebase configuration
  const hasFirebaseServiceAccount = Boolean(
    env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY
  );
  const hasFirebaseGcpDefault = Boolean(
    env.FIREBASE_PROJECT_ID && (env.GOOGLE_APPLICATION_CREDENTIALS || env.K_SERVICE)
  );
  const isFirebaseAdminConfigured = hasFirebaseServiceAccount || hasFirebaseGcpDefault;

  // In production mode, require valid configuration
  if (mode === 'production') {
    if (authMode === 'firebase' && !isFirebaseAdminConfigured) {
      errors.push('STRUCTURA_AUTH_MODE is set to "firebase" but Firebase Admin credentials (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY) are missing or incomplete.');
    }
  } else if (authMode === 'firebase' && !isFirebaseAdminConfigured) {
    warnings.push('STRUCTURA_AUTH_MODE is "firebase" but Firebase credentials are not provided. Authentication will require valid credentials.');
  }

  // Gemini Key check (Optional integration - degrades gracefully)
  const hasGeminiKey = Boolean(env.GEMINI_API_KEY && env.GEMINI_API_KEY.trim().length > 0);
  if (!hasGeminiKey) {
    warnings.push('GEMINI_API_KEY is not configured. AI capabilities will operate in truthful advisory fallback / unavailable mode.');
  }

  // Financial Provider check (BMONI - external provider boundary)
  const isBmoniConfigured = Boolean(env.BMONI_API_KEY && env.BMONI_API_SECRET);
  if (!isBmoniConfigured) {
    warnings.push('BMONI credentials are not configured. Financial execution boundary will truthfully report UNAVAILABLE / NOT_CONNECTED.');
  }

  const isValid = errors.length === 0;

  if (!isValid) {
    logger.error('Environment validation failed with errors:', 'EnvironmentValidator', { errors, warnings, mode });
  } else if (warnings.length > 0) {
    logger.info('Environment validation succeeded with operational notices:', 'EnvironmentValidator', { warnings, mode });
  }

  return {
    isValid,
    mode,
    errors,
    warnings,
    geminiModel: CANONICAL_GEMINI_MODEL,
    authMode,
    isFirebaseAdminConfigured,
    hasGeminiKey,
    isBmoniConfigured,
  };
}
