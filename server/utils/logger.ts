export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const REDACTED_KEYS = new Set([
  'password',
  'token',
  'secret',
  'key',
  'privatekey',
  'private_key',
  'clientsecret',
  'client_secret',
  'authorization',
  'cookie',
  'apikey',
  'api_key',
  'gemini_api_key',
  'firebase_private_key',
]);

export function redactSensitiveData(data: any): any {
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;

  if (Array.isArray(data)) {
    return data.map(item => redactSensitiveData(item));
  }

  const sanitized: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    const lowerKey = k.toLowerCase().replace(/[-_]/g, '');
    let isSensitive = false;
    for (const secretKey of REDACTED_KEYS) {
      if (lowerKey.includes(secretKey.replace(/[-_]/g, ''))) {
        isSensitive = true;
        break;
      }
    }

    if (isSensitive) {
      sanitized[k] = '[REDACTED]';
    } else if (typeof v === 'object' && v !== null) {
      sanitized[k] = redactSensitiveData(v);
    } else {
      sanitized[k] = v;
    }
  }
  return sanitized;
}

export interface StructuredLogPayload {
  level: LogLevel;
  message: string;
  correlationId?: string;
  context?: string;
  data?: Record<string, any>;
  timestamp: string;
}

class SafeLogger {
  private formatLog(level: LogLevel, message: string, context?: string, data?: Record<string, any>, correlationId?: string): string {
    const payload: StructuredLogPayload = {
      level,
      message,
      correlationId,
      context,
      data: data ? redactSensitiveData(data) : undefined,
      timestamp: new Date().toISOString(),
    };
    return JSON.stringify(payload);
  }

  debug(message: string, context?: string, data?: Record<string, any>, correlationId?: string): void {
    if (process.env.NODE_ENV !== 'production' || process.env.DEBUG === 'true') {
      console.debug(this.formatLog('debug', message, context, data, correlationId));
    }
  }

  info(message: string, context?: string, data?: Record<string, any>, correlationId?: string): void {
    console.info(this.formatLog('info', message, context, data, correlationId));
  }

  warn(message: string, context?: string, data?: Record<string, any>, correlationId?: string): void {
    console.warn(this.formatLog('warn', message, context, data, correlationId));
  }

  error(message: string, context?: string, data?: Record<string, any>, correlationId?: string): void {
    console.error(this.formatLog('error', message, context, data, correlationId));
  }
}

export const logger = new SafeLogger();
