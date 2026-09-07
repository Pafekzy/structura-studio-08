import { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitRecord>();

export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  keyPrefix?: string;
  skipInTest?: boolean;
}

export function createRateLimiter(options: RateLimitOptions) {
  const { windowMs, maxRequests, keyPrefix = 'rl', skipInTest = true } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    if (skipInTest && (process.env.NODE_ENV === 'test' || process.env.DISABLE_RATE_LIMIT === 'true')) {
      return next();
    }

    const clientIp = req.ip || req.socket.remoteAddress || 'unknown-client';
    const key = `${keyPrefix}:${clientIp}`;
    const now = Date.now();

    let record = rateLimitStore.get(key);
    if (!record || now > record.resetTime) {
      record = {
        count: 1,
        resetTime: now + windowMs,
      };
      rateLimitStore.set(key, record);
    } else {
      record.count += 1;
    }

    const remaining = Math.max(0, maxRequests - record.count);
    const retryAfterSeconds = Math.ceil((record.resetTime - now) / 1000);

    res.setHeader('X-RateLimit-Limit', maxRequests.toString());
    res.setHeader('X-RateLimit-Remaining', remaining.toString());
    res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000).toString());

    if (record.count > maxRequests) {
      res.setHeader('Retry-After', retryAfterSeconds.toString());
      return res.status(429).json({
        success: false,
        error: `Too many requests. Rate limit exceeded. Please retry in ${retryAfterSeconds} seconds.`,
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: retryAfterSeconds,
        correlationId: req.correlationId,
        timestamp: new Date().toISOString(),
      });
    }

    return next();
  };
}

// Pre-configured rate limiters for sensitive surfaces
export const authRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 30,
  keyPrefix: 'auth',
});

export const aiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 20,
  keyPrefix: 'ai',
});

export const financialRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 40,
  keyPrefix: 'fin',
});

export const webhookRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 60,
  keyPrefix: 'webhook',
});
