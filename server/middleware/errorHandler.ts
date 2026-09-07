import { Request, Response, NextFunction } from 'express';
import { GovernanceError } from '../services/governanceError';
import { PersistenceError } from '../utils/atomicPersistence';
import { logger } from '../utils/logger';
import { ZodError } from 'zod';

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  const correlationId = req.correlationId || `corr_${Date.now()}`;
  const timestamp = new Date().toISOString();

  // 1. JSON parsing / payload syntax errors
  if (err instanceof SyntaxError && 'status' in err && (err as any).status === 400 && 'body' in err) {
    logger.warn('Malformed JSON request body received', 'ErrorHandler', { error: err.message }, correlationId);
    return res.status(400).json({
      success: false,
      error: 'Malformed JSON payload. Please verify request syntax.',
      code: 'MALFORMED_JSON_PAYLOAD',
      correlationId,
      timestamp,
    });
  }

  // 2. Request size limit exceeded
  if (err.type === 'entity.too.large' || err.status === 413) {
    logger.warn('Request payload exceeded maximum size limit', 'ErrorHandler', { limit: err.limit }, correlationId);
    return res.status(413).json({
      success: false,
      error: 'Request entity too large. Payload exceeds permitted maximum size.',
      code: 'PAYLOAD_TOO_LARGE',
      correlationId,
      timestamp,
    });
  }

  // 3. Domain Governance Errors
  if (err instanceof GovernanceError) {
    logger.warn(`Governance error: [${err.code}] ${err.error}`, 'ErrorHandler', { statusCode: err.statusCode }, correlationId);
    return res.status(err.statusCode).json({
      success: false,
      error: err.error,
      code: err.code,
      correlationId,
      timestamp,
    });
  }

  // 4. Persistence Errors
  if (err instanceof PersistenceError) {
    logger.error(`Persistence error occurred: ${err.message}`, 'ErrorHandler', {}, correlationId);
    return res.status(500).json({
      success: false,
      error: 'A storage persistence error occurred. Data could not be saved safely.',
      code: 'PERSISTENCE_FAILURE',
      correlationId,
      timestamp,
    });
  }

  // 5. Zod Validation Errors
  if (err instanceof ZodError) {
    logger.warn('Payload validation failed', 'ErrorHandler', { issues: err.issues }, correlationId);
    return res.status(400).json({
      success: false,
      error: 'Validation failed for request parameters.',
      code: 'VALIDATION_ERROR',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      correlationId,
      timestamp,
    });
  }

  // 6. Generic unhandled errors
  const statusCode = typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 600
    ? err.statusCode
    : typeof err.status === 'number' && err.status >= 400 && err.status < 600
      ? err.status
      : 500;

  const safeMessage = statusCode === 500
    ? 'An internal server error occurred. Please contact system administration with the correlation ID.'
    : (err.message || 'An error occurred processing the request');

  const safeCode = err.code || (statusCode === 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR');

  logger.error(`Unhandled error: ${err.message || 'Unknown error'}`, 'ErrorHandler', {
    name: err.name,
    code: safeCode,
    statusCode,
  }, correlationId);

  return res.status(statusCode).json({
    success: false,
    error: safeMessage,
    code: safeCode,
    correlationId,
    timestamp,
  });
}
