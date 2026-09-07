import { Request, Response, NextFunction } from 'express';

declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
      startTime?: number;
    }
  }
}

export function correlationMiddleware(req: Request, res: Response, next: NextFunction) {
  const incomingId = (req.headers['x-correlation-id'] || req.headers['x-request-id']) as string | undefined;
  const correlationId = incomingId && incomingId.trim().length > 0
    ? incomingId.trim()
    : `corr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  req.correlationId = correlationId;
  req.startTime = Date.now();
  res.setHeader('X-Correlation-ID', correlationId);

  next();
}
