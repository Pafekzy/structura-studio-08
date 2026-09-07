import fs from 'fs';
import path from 'path';
import { logger } from './logger';

export class PersistenceError extends Error {
  filePath: string;
  causeError?: any;

  constructor(message: string, filePath: string, causeError?: any) {
    super(`PersistenceError at [${filePath}]: ${message}`);
    this.name = 'PersistenceError';
    this.filePath = filePath;
    this.causeError = causeError;
    Object.setPrototypeOf(this, PersistenceError.prototype);
  }
}

export function ensureDirectoryExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    try {
      fs.mkdirSync(dirPath, { recursive: true });
    } catch (e: any) {
      if (e.code !== 'EEXIST') {
        logger.error(`Failed to create directory ${dirPath}`, 'Persistence', { error: e.message });
        throw new PersistenceError(`Failed to create directory: ${e.message}`, dirPath, e);
      }
    }
  }
}

export function safeReadJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    if (!raw.trim()) {
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch (error: any) {
    logger.warn(`Failed to parse JSON from file [${filePath}], using fallback.`, 'Persistence', { error: error.message });
    return fallback;
  }
}

export function safeAtomicWriteJsonFile<T>(filePath: string, data: T): void {
  const dirPath = path.dirname(filePath);
  ensureDirectoryExists(dirPath);

  const serialized = JSON.stringify(data, null, 2);
  const tempFilePath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;

  let fd: number | null = null;
  try {
    // Open, write and fsync the temp file
    fd = fs.openSync(tempFilePath, 'w');
    fs.writeFileSync(fd, serialized, 'utf-8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;

    // Atomically replace target file
    fs.renameSync(tempFilePath, filePath);
  } catch (error: any) {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        // Ignore close error
      }
    }
    if (fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch {
        // Ignore unlink error
      }
    }
    logger.error(`Failed atomic write to [${filePath}]:`, 'Persistence', { error: error.message });
    throw new PersistenceError(`Atomic write failed: ${error.message}`, filePath, error);
  }
}
